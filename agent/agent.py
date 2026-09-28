"""Headlocks salon voice receptionist.

LiveKit Agents worker: Sarvam STT -> OpenAI LLM (with Supabase tools) -> Sarvam TTS.

Run locally:
    python agent.py download-files   # once, fetches VAD / turn-detector models
    python agent.py console          # talk to it in your terminal
    python agent.py dev              # connect to your LiveKit project
"""

from __future__ import annotations

import asyncio
import json
import re
import time as _time
import logging
import os
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from dotenv import load_dotenv
from livekit import agents, rtc
from livekit.agents import (
    Agent,
    room_io,
    AgentServer,
    AgentSession,
    JobContext,
    JobProcess,
    RunContext,
    ToolError,
    TurnHandlingOptions,
    function_tool,
    get_job_context,
    inference,
)
from livekit.plugins import openai, sarvam, silero
from openai import AsyncOpenAI

import db
from prompts import build_instructions

load_dotenv(".env.local")
load_dotenv()

logger = logging.getLogger("headlocks-agent")
# Silence very chatty network libraries (they flood the console in debug mode).
for _noisy in ("hpack", "httpx", "httpcore", "h2", "hpack.hpack", "hpack.table"):
    logging.getLogger(_noisy).setLevel(logging.WARNING)

WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
TTS_LANGUAGES = {"bn-IN", "en-IN", "gu-IN", "hi-IN", "kn-IN", "ml-IN", "mr-IN", "od-IN", "pa-IN", "ta-IN", "te-IN"}
ROLE_LABELS = {
    "senior_creative_stylist": "Senior Creative Stylist (ladies' and gents' hair, colour, treatments, makeup)",
    "senior_stylist": "Senior Stylist (ladies' hair, colour, treatments, men's grooming, facials, nails)",
    "hair_dresser": "Barber (gents' haircut, beard, shave, men's colour and grooming)",
    "beautician": "Beautician (ladies' waxing, threading, facials, massage, nails, makeup)",
}


# ---------------------------------------------------------------- call state

@dataclass
class CallState:
    tz: ZoneInfo
    channel: str = "web"                     # 'web' or 'phone'
    phone: str | None = None
    customer_id: str | None = None
    customer_name: str | None = None
    call_log_id: str | None = None
    language: str = "en-IN"
    agent_id: str | None = None
    allowed_languages: set[str] = field(default_factory=lambda: set(TTS_LANGUAGES))
    auto_switch_language: bool = True
    allow_booking: bool = True
    allow_changes: bool = True
    staff: list[dict] = field(default_factory=list)
    # Short references handed to the LLM instead of raw UUIDs.
    services: dict[str, dict] = field(default_factory=dict)   # S1 -> service row
    slots: dict[str, dict] = field(default_factory=dict)      # T1 -> slot
    appointments: dict[str, dict] = field(default_factory=dict)  # A1 -> appointment row
    outcome: str | None = None
    appointment_id: str | None = None
    lead_id: str | None = None
    # Live view (website "Live Actions" panel + admin live-calls screen)
    room: object | None = None
    live: dict = field(default_factory=dict)
    transcript: list[dict] = field(default_factory=list)
    dirty: bool = False

    def emit(self, kind: str, **data: object) -> None:
        """Push a live event to everyone in the call room (website panel, admin listener)."""
        if kind == "state":
            self.live.update({k: v for k, v in data.items() if v is not None})
        payload = {"type": kind, "ts": _time.time(), **data}
        if kind == "state":
            payload["state"] = dict(self.live)
        self.dirty = True
        room = self.room
        if room is None:
            return
        try:
            asyncio.get_running_loop().create_task(_publish(room, payload))
        except RuntimeError:
            pass

    def local(self, iso: str) -> datetime:
        return datetime.fromisoformat(iso).astimezone(self.tz)

    def say_time(self, dt: datetime) -> str:
        return dt.strftime("%A %d %B, %I:%M %p").replace(" 0", " ")

    def staff_by_name(self, name: str | None) -> dict | None:
        if not name:
            return None
        n = name.strip().lower()
        for s in self.staff:
            if s["name"].lower() == n or s["name"].lower().startswith(n) or n.startswith(s["name"].lower()):
                return s
        return None


# ---------------------------------------------------------------- the agent

class Receptionist(Agent):
    def __init__(self, instructions: str) -> None:
        super().__init__(instructions=instructions)

    # ---- catalogue -------------------------------------------------------

    @function_tool()
    async def search_services(
        self, context: RunContext[CallState], query: str, client_gender: str | None = None
    ) -> dict:
        """Look up services and prices on the Headlocks menu.

        Args:
            query: What the caller asked for, in English, e.g. "haircut", "beard", "keratin", "full legs wax", "bridal makeup".
            client_gender: Who the service is for: "female", "male" or "kids". Leave empty if not known yet.
        """
        st = context.userdata
        st.emit("tool", name="search_services", label="Searching the menu", detail=query, status="running")
        rows = await db.search_services(query, client_gender)
        results = []
        for r in rows:
            if r["score"] < 0.2 and results:
                continue
            ref = next((k for k, v in st.services.items() if v["service_id"] == r["service_id"]), None)
            if ref is None:
                ref = f"S{len(st.services) + 1}"
                st.services[ref] = r
            results.append({
                "service_ref": ref,
                "name": r["name"],
                "for": r["gender"],
                "category": f"{r['section']} / {r['category']}",
                "price_rupees": r["price"],
                "price_type": r["price_type"],
                "duration_minutes": r["duration_min"],
                "requires_consultation": r["requires_consultation"],
            })
        st.emit("tool", name="search_services", label="Searched the menu", detail=f"{query}: {len(results)} found", status="done")
        if client_gender:
            st.emit("state", client=client_gender)
        if not results:
            return {"results": [], "note": "Nothing matched. Ask the caller to describe it differently."}
        return {"results": results}

    @function_tool()
    async def get_salon_info(self, context: RunContext[CallState]) -> dict:
        """Salon address, phone numbers, opening hours, team and cancellation policy."""
        settings = await db.get_settings()
        hours = await db.get_business_hours()
        return {
            "name": settings["name"],
            "address": settings["address"],
            "phones": settings["phones"],
            "hours": _hours_text(hours),
            "cancellation_policy": settings["cancellation_policy"],
            "prices_include_tax": True,
            "team": [{"name": s["name"], "does": ROLE_LABELS.get(s["role"], s["role"])} for s in context.userdata.staff],
        }

    # ---- availability & booking -----------------------------------------

    @function_tool()
    async def check_availability(
        self,
        context: RunContext[CallState],
        date_iso: str,
        service_refs: list[str] | None = None,
        client_gender: str | None = None,
        preferred_time: str | None = None,
        stylist_name: str | None = None,
        appointment_ref: str | None = None,
    ) -> dict:
        """Find open appointment times.

        For a new booking pass service_refs and client_gender.
        For rescheduling pass appointment_ref instead (its services and client are reused).

        Args:
            date_iso: The day in YYYY-MM-DD format. Work out "tomorrow", "Saturday" etc. from today's date.
            service_refs: Service refs from search_services, e.g. ["S1", "S3"], booked back-to-back.
            client_gender: "female", "male" or "kids".
            preferred_time: Caller's preferred time in 24h HH:MM, e.g. "17:30". Optional.
            stylist_name: First name of a stylist the caller asked for. Optional.
            appointment_ref: Appointment ref from find_my_appointments when rescheduling.
        """
        st = context.userdata
        try:
            day = date.fromisoformat(date_iso)
        except ValueError:
            raise ToolError("Invalid date. Use YYYY-MM-DD.")

        exclude_id = None
        if appointment_ref:
            appt = st.appointments.get(appointment_ref)
            if not appt:
                raise ToolError("Unknown appointment_ref. Call find_my_appointments first.")
            service_ids = appt["service_ids"]
            client_gender = appt.get("client_gender") or client_gender
            exclude_id = appt["appointment_id"]
        else:
            if not service_refs:
                raise ToolError("Pass service_refs from search_services.")
            service_ids = []
            for r in service_refs:
                if r in st.services:
                    service_ids.append(st.services[r]["service_id"])
                    continue
                # Not a known ref: the model may have passed a guessed ref or a service name.
                # Resolve it by searching, but only accept a confident, unambiguous match.
                if re.fullmatch(r"S\d+", r.strip()):
                    raise ToolError(f"Unknown service ref {r}. Call search_services first to get real refs.")
                matches = await db.search_services(r, None if client_gender == "kids" else client_gender, 3)
                if not matches or matches[0]["score"] < 0.6:
                    raise ToolError(f"Could not find the service '{r}'. Call search_services first.")
                top = matches[0]
                if len(matches) > 1 and matches[1]["score"] >= top["score"] and matches[1]["price"] != top["price"]:
                    raise ToolError(f"'{r}' matches several services with different prices. Call search_services and let the caller choose.")
                st.services.setdefault(f"S{len(st.services) + 1}", top)
                service_ids.append(top["service_id"])

        st.emit("tool", name="check_availability", label="Checking availability", detail=date_iso, status="running")
        st.emit("state", status="Checking availability",
                services=", ".join(v["name"] for v in st.services.values() if v["service_id"] in service_ids) or None,
                stylist=stylist_name or None, client=client_gender or None)
        kids = client_gender == "kids"
        gender_for_staff = None if kids else client_gender

        staff = st.staff_by_name(stylist_name)
        if stylist_name and not staff:
            return {"slots": [], "note": f"There is no stylist called {stylist_name}. Team: " + ", ".join(s["name"] for s in st.staff)}

        try:
            rows = await db.available_slots(day, service_ids, staff["id"] if staff else None, gender_for_staff, exclude_id)
        except Exception as e:  # noqa: BLE001
            raise ToolError(f"Could not check availability ({db.db_error_code(e)}).")

        if not rows:
            reason = "fully booked or closed that day"
            if staff:
                reason = f"{staff['name']} has no free time that day for this, or doesn't do this service"
            return {"slots": [], "note": f"No availability on {day.strftime('%A %d %B')}: {reason}. Offer another day or another stylist."}

        chosen = _pick_slots(rows, st.tz, preferred_time)
        st.emit("tool", name="check_availability", label="Checked availability",
                detail=f"{day.strftime('%a %d %b')}: {len(chosen)} options", status="done")
        out = []
        for r in chosen:
            ref = f"T{len(st.slots) + 1}"
            start = st.local(r["slot_start"])
            st.slots[ref] = {
                "staff_id": r["staff_id"],
                "staff_name": r["staff_name"],
                "starts_at": start,
                "service_ids": service_ids,
                "client_gender": gender_for_staff,
                "appointment_id": exclude_id,
            }
            out.append({"slot_ref": ref, "time": start.strftime("%I:%M %p").lstrip("0"), "stylist": r["staff_name"]})
        return {"date": day.strftime("%A %d %B %Y"), "slots": out}

    @function_tool()
    async def book_appointment(
        self,
        context: RunContext[CallState],
        slot_ref: str,
        customer_name: str,
        phone: str | None = None,
        notes: str | None = None,
    ) -> dict:
        """Book the appointment. Only call after reading back the details and the caller clearly said yes.

        Args:
            slot_ref: The slot ref from check_availability, e.g. "T2".
            customer_name: Caller's name.
            phone: Caller's 10-digit mobile number. Can be omitted if already known for this call.
            notes: Anything the stylist should know (optional).
        """
        st = context.userdata
        if not st.allow_booking:
            raise ToolError("Bookings are switched off. Take a callback request instead.")
        slot = st.slots.get(slot_ref)
        if not slot or slot.get("appointment_id"):
            raise ToolError("Unknown slot_ref for a new booking. Call check_availability again.")
        phone_n = db.normalize_phone(phone) or st.phone
        if not phone_n:
            raise ToolError("Need the caller's mobile number before booking.")

        context.disallow_interruptions()
        try:
            appt_id = await db.book(
                phone_n, customer_name, slot["client_gender"], slot["service_ids"], slot["staff_id"],
                slot["starts_at"], "voice_phone" if st.channel == "phone" else "voice_web", notes,
            )
        except Exception as e:  # noqa: BLE001
            code = db.db_error_code(e)
            if code == "slot_unavailable":
                raise ToolError("That time was just taken. Apologise and check availability again.")
            logger.exception("booking failed")
            raise ToolError("Booking failed due to a system problem. Offer to take a callback request instead.")

        st.phone, st.customer_name = phone_n, customer_name
        st.outcome, st.appointment_id = "booked", appt_id
        cust = await db.get_customer(phone_n)
        if cust:
            st.customer_id = cust["id"]
            await db.update_customer(cust["id"], preferred_language=st.language)
        services = [v["name"] for v in st.services.values() if v["service_id"] in slot["service_ids"]]
        total = sum((v["price"] or 0) for v in st.services.values() if v["service_id"] in slot["service_ids"])
        ref = await db.get_appointment_reference(appt_id)
        st.emit("state", status="Booked", appointment=st.say_time(slot["starts_at"]), stylist=slot["staff_name"],
                services=", ".join(services), reference=ref, customer=customer_name)
        st.emit("tool", name="book_appointment", label="Appointment booked", detail=ref, status="done")
        return {
            "status": "confirmed",
            "reference": ref,
            "services": services,
            "stylist": slot["staff_name"],
            "when": st.say_time(slot["starts_at"]),
            "estimated_total_rupees": total,
        }

    # ---- existing appointments ------------------------------------------

    @function_tool()
    async def find_my_appointments(self, context: RunContext[CallState], phone: str | None = None) -> dict:
        """Find the caller's upcoming appointments.

        Args:
            phone: Caller's 10-digit mobile number. Can be omitted if already known for this call.
        """
        st = context.userdata
        phone_n = db.normalize_phone(phone) or st.phone
        if not phone_n:
            raise ToolError("Ask for the mobile number the booking was made with.")
        st.phone = phone_n
        rows = await db.upcoming_appointments(phone_n)
        st.emit("tool", name="find_my_appointments", label="Looked up bookings", detail=f"{len(rows)} upcoming", status="done")
        if not rows:
            return {"appointments": [], "note": "No upcoming appointments for this number."}
        out = []
        for r in rows:
            ref = f"A{len(st.appointments) + 1}"
            st.appointments[ref] = r
            out.append({
                "appointment_ref": ref,
                "when": st.say_time(st.local(r["starts_at"])),
                "services": r["services"],
                "stylist": r["staff_name"],
                "estimated_total_rupees": r["estimated_total"],
            })
        return {"appointments": out}

    @function_tool()
    async def reschedule_appointment(self, context: RunContext[CallState], appointment_ref: str, slot_ref: str) -> dict:
        """Move an existing appointment to a new slot. Only after the caller confirmed.

        Args:
            appointment_ref: From find_my_appointments, e.g. "A1".
            slot_ref: From check_availability called with that appointment_ref.
        """
        st = context.userdata
        if not st.allow_changes:
            raise ToolError("Rescheduling is switched off. Take a callback request instead.")
        appt, slot = st.appointments.get(appointment_ref), st.slots.get(slot_ref)
        if not appt or not slot or slot.get("appointment_id") != appt["appointment_id"]:
            raise ToolError("Refs don't match. Call check_availability with this appointment_ref first.")
        context.disallow_interruptions()
        try:
            await db.reschedule(appt["appointment_id"], st.phone, slot["starts_at"], slot["staff_id"])
        except Exception as e:  # noqa: BLE001
            code = db.db_error_code(e)
            if code == "slot_unavailable":
                raise ToolError("That time was just taken. Check availability again.")
            raise ToolError(f"Could not reschedule ({code}).")
        st.outcome, st.appointment_id = "rescheduled", appt["appointment_id"]
        st.emit("state", status="Rescheduled", appointment=st.say_time(slot["starts_at"]), stylist=slot["staff_name"])
        st.emit("tool", name="reschedule_appointment", label="Appointment rescheduled", detail=st.say_time(slot["starts_at"]), status="done")
        return {"status": "rescheduled", "new_time": st.say_time(slot["starts_at"]), "stylist": slot["staff_name"]}

    @function_tool()
    async def cancel_appointment(self, context: RunContext[CallState], appointment_ref: str, reason: str | None = None) -> dict:
        """Cancel an appointment. Only after the caller confirmed.

        Args:
            appointment_ref: From find_my_appointments, e.g. "A1".
            reason: Why they are cancelling, if they said.
        """
        st = context.userdata
        if not st.allow_changes:
            raise ToolError("Cancelling is switched off. Take a callback request instead.")
        appt = st.appointments.get(appointment_ref)
        if not appt:
            raise ToolError("Unknown appointment_ref. Call find_my_appointments first.")
        try:
            await db.cancel(appt["appointment_id"], st.phone, reason)
        except Exception as e:  # noqa: BLE001
            raise ToolError(f"Could not cancel ({db.db_error_code(e)}).")
        st.outcome, st.appointment_id = "cancelled", appt["appointment_id"]
        st.emit("state", status="Cancelled")
        st.emit("tool", name="cancel_appointment", label="Appointment cancelled", detail=appt.get("services"), status="done")
        return {"status": "cancelled"}

    # ---- callback / consultation ----------------------------------------

    @function_tool()
    async def request_callback(
        self,
        context: RunContext[CallState],
        customer_name: str,
        reason: str,
        phone: str | None = None,
        lead_type: str = "callback",
        service_ref: str | None = None,
        event_type: str | None = None,
        event_date_iso: str | None = None,
    ) -> dict:
        """Ask the salon team to call the customer back (bridal/celebrity makeup, celebrity haircut, complaints, speak to a person).

        Args:
            customer_name: Caller's name.
            reason: Short summary of what they need.
            phone: Caller's 10-digit mobile number. Can be omitted if already known.
            lead_type: "bridal_makeup", "consultation" or "callback".
            service_ref: Related service ref from search_services, if any.
            event_type: For makeup: "wedding", "reception", "engagement", "party", etc.
            event_date_iso: Event date as YYYY-MM-DD, if known.
        """
        st = context.userdata
        phone_n = db.normalize_phone(phone) or st.phone
        if not phone_n:
            raise ToolError("Need the caller's mobile number for the callback.")
        if lead_type not in ("bridal_makeup", "consultation", "callback"):
            lead_type = "callback"
        service_id = st.services[service_ref]["service_id"] if service_ref in st.services else None
        lead_id = await db.create_callback(phone_n, customer_name, lead_type, service_id, event_type, event_date_iso, reason)
        st.phone, st.customer_name = phone_n, customer_name
        st.lead_id = lead_id
        st.outcome = st.outcome or "lead_created"
        st.emit("state", status="Callback requested", customer=customer_name)
        st.emit("tool", name="request_callback", label="Callback requested", detail=reason, status="done")
        return {"status": "callback_requested"}

    # ---- call control ----------------------------------------------------

    @function_tool()
    async def set_language(self, context: RunContext[CallState], language_code: str) -> dict:
        """Switch the speaking voice to another language when the caller asks for it.

        Args:
            language_code: One of en-IN, hi-IN, bn-IN, gu-IN, kn-IN, ml-IN, mr-IN, od-IN, pa-IN, ta-IN, te-IN.
        """
        if language_code not in context.userdata.allowed_languages:
            raise ToolError("That language is not enabled for this agent. Apologise and continue in the current language.")
        _apply_language(context.session, context.userdata, language_code)
        return {"status": "ok", "now_speaking": language_code}

    @function_tool()
    async def end_call(self, context: RunContext[CallState]) -> None:
        """Hang up after you have said goodbye."""
        await context.wait_for_playout()
        get_job_context().shutdown(reason="agent ended call")


# ---------------------------------------------------------------- helpers

EVENTS_TOPIC = "agent-events"


async def _publish(room: rtc.Room, payload: dict) -> None:
    try:
        await room.local_participant.publish_data(json.dumps(payload, default=str), reliable=True, topic=EVENTS_TOPIC)
    except Exception:  # noqa: BLE001
        logger.debug("could not publish live event", exc_info=True)


def _hours_text(hours: list[dict]) -> str:
    parts = []
    for h in hours:
        day = WEEKDAYS[h["weekday"]]
        if h["is_closed"]:
            parts.append(f"{day} closed")
        else:
            o = datetime.strptime(h["open_time"], "%H:%M:%S").strftime("%I %p").lstrip("0")
            c = datetime.strptime(h["close_time"], "%H:%M:%S").strftime("%I %p").lstrip("0")
            parts.append(f"{day} {o} to {c}")
    # Collapse "every day same hours"
    if len({p.split(" ", 1)[1] for p in parts}) == 1:
        return "Every day " + parts[0].split(" ", 1)[1]
    return "; ".join(parts)


def _pick_slots(rows: list[dict], tz: ZoneInfo, preferred: str | None, limit: int = 6) -> list[dict]:
    """Choose a handful of varied options instead of dumping 100 slots on the LLM."""
    def start(r: dict) -> datetime:
        return datetime.fromisoformat(r["slot_start"]).astimezone(tz)

    if preferred:
        try:
            t = time.fromisoformat(preferred)
            target = start(rows[0]).replace(hour=t.hour, minute=t.minute)
            rows = sorted(rows, key=lambda r: abs((start(r) - target).total_seconds()))
        except ValueError:
            pass
    else:
        # Spread across the day: take slots at least 90 min apart.
        spread, last = [], None
        for r in rows:
            s = start(r)
            if last is None or s - last >= timedelta(minutes=90):
                spread.append(r)
                last = s
        rows = spread + [r for r in rows if r not in spread]

    picked, seen = [], set()
    for r in rows:
        key = (r["slot_start"], r["staff_id"])
        # Prefer distinct times first
        if r["slot_start"] in {p["slot_start"] for p in picked} and len(picked) < limit // 2:
            continue
        if key not in seen:
            picked.append(r)
            seen.add(key)
        if len(picked) >= limit:
            break
    return sorted(picked, key=start)


def _apply_language(session: AgentSession, st: CallState, code: str) -> None:
    if code == st.language or code not in TTS_LANGUAGES or code not in st.allowed_languages:
        return
    logger.info("switching TTS language %s -> %s", st.language, code)
    st.language = code
    st.emit("state", language=code)
    if isinstance(session.tts, sarvam.TTS):
        session.tts.update_options(target_language_code=code)


def _caller_context(st: CallState, customer: dict | None, last: dict | None, upcoming: list[dict]) -> str:
    if st.channel == "phone" and st.phone:
        base = f"Calling from {st.phone} (already known, do not ask for their number unless they want a different one)."
    else:
        base = "Web visitor. Their phone number is not known yet; ask for it when you need to book, look up or call back."
    if not customer:
        return base + " New customer, not in our records."
    lines = [base, f"Returning customer: {customer.get('name') or 'name unknown'}."]
    if last:
        svcs = ", ".join(s["services"]["name"] for s in last.get("appointment_services", []))
        lines.append(f"Last visit: {svcs} with {last['staff']['name']} on {st.local(last['starts_at']).strftime('%d %B')}.")
    for r in upcoming[:3]:
        lines.append(f"Upcoming: {r['services']} with {r['staff_name']} on {st.say_time(st.local(r['starts_at']))}.")
    return " ".join(lines)


def _participant_phone(p: rtc.RemoteParticipant | None) -> tuple[str, str | None]:
    """Return (channel, phone) from a SIP caller or a web participant's attributes/metadata.

    Defensive on purpose: console mode passes a stand-in participant with no real data.
    """
    def as_str(v: object) -> str | None:
        return v if isinstance(v, str) and v.strip() else None

    try:
        attrs = p.attributes if p is not None and isinstance(p.attributes, dict) else {}
        if p is not None and p.kind == rtc.ParticipantKind.PARTICIPANT_KIND_SIP:
            return "phone", db.normalize_phone(as_str(attrs.get("sip.phoneNumber")))
        phone = as_str(attrs.get("phone"))
        metadata = as_str(getattr(p, "metadata", None))
        if not phone and metadata:
            try:
                phone = as_str(json.loads(metadata).get("phone"))
            except (ValueError, AttributeError):
                phone = None
        return "web", db.normalize_phone(phone)
    except Exception:  # noqa: BLE001
        logger.warning("could not read caller details; treating as web visitor")
        return "web", None


async def _summarise(transcript: list[dict]) -> str | None:
    if not transcript:
        return None
    text = "\n".join(f"{m['role']}: {m['text']}" for m in transcript)
    try:
        res = await AsyncOpenAI().chat.completions.create(
            model=os.getenv("OPENAI_SUMMARY_MODEL", os.getenv("OPENAI_MODEL", "gpt-4.1-mini")),
            messages=[
                {"role": "system", "content": "Summarise this salon receptionist call in 1-2 English sentences for the salon manager. Include what the customer wanted and what was done."},
                {"role": "user", "content": text[:12000]},
            ],
        )
        return res.choices[0].message.content
    except Exception:  # noqa: BLE001
        logger.exception("summary failed")
        return None


# ---------------------------------------------------------------- server

server = AgentServer()


def prewarm(proc: JobProcess) -> None:
    proc.userdata["vad"] = silero.VAD.load()


server.setup_fnc = prewarm


def _job_metadata(ctx: JobContext) -> dict:
    """Dispatch metadata set by the website's token endpoint, e.g. {"agent": "riya", "phone": "98765..."}."""
    try:
        raw = ctx.job.metadata
        data = json.loads(raw) if isinstance(raw, str) and raw.strip() else {}
        return data if isinstance(data, dict) else {}
    except (ValueError, AttributeError):
        return {}


def _config_from_env() -> dict:
    """Used only if the agents table is empty or unreachable, so a call never fails for lack of settings."""
    return {
        "id": None,
        "display_name": "Riya",
        "greeting": "Greet the caller warmly as Riya from Headlocks salon with a Namaste and ask how you can help. One or two short sentences.",
        "extra_instructions": "",
        "llm_model": os.getenv("OPENAI_MODEL", "gpt-4.1-mini"),
        "llm_temperature": 0.4,
        "tts_speaker": os.getenv("SARVAM_TTS_SPEAKER", "priya"),
        "tts_pace": float(os.getenv("SARVAM_TTS_PACE", "1.0")),
        "tts_temperature": 0.6,
        "default_language": "en-IN",
        "auto_switch_language": True,
        "allowed_languages": sorted(TTS_LANGUAGES),
        "allow_booking": True,
        "allow_reschedule_cancel": True,
        "max_call_minutes": 15,
    }


@server.rtc_session(agent_name=os.getenv("AGENT_NAME", "headlocks-receptionist"))
async def entrypoint(ctx: JobContext) -> None:
    await ctx.connect()
    participant = await ctx.wait_for_participant()
    meta = _job_metadata(ctx)

    # Settings edited in the admin panel (agents table). Env vars are only a fallback.
    try:
        cfg = await db.get_agent_config(meta.get("agent") or os.getenv("AGENT_SLUG"))
    except Exception:  # noqa: BLE001
        logger.exception("could not load agent settings; using defaults")
        cfg = None
    cfg = {**_config_from_env(), **(cfg or {})}
    allowed = [c for c in (cfg["allowed_languages"] or []) if c in TTS_LANGUAGES] or ["en-IN"]
    cfg["allowed_languages"] = allowed
    if cfg["default_language"] not in allowed:
        cfg["default_language"] = allowed[0]
    # Language picked on the website ("auto" keeps the agent's default + auto-detect)
    if isinstance(meta.get("language"), str) and meta["language"] in allowed:
        cfg["default_language"] = meta["language"]
    logger.info("agent '%s' voice=%s pace=%s model=%s", cfg["display_name"], cfg["tts_speaker"], cfg["tts_pace"], cfg["llm_model"])

    settings = await db.get_settings()
    tz = ZoneInfo(settings["timezone"])
    mode = "chat" if meta.get("mode") == "chat" else "voice"
    channel, phone = _participant_phone(participant)
    phone = phone or db.normalize_phone(meta.get("phone") if isinstance(meta.get("phone"), str) else None)
    st = CallState(
        tz=tz, channel=channel, phone=phone, staff=await db.get_staff(),
        language=cfg["default_language"], agent_id=cfg["id"],
        allowed_languages=set(allowed),
        auto_switch_language=bool(cfg["auto_switch_language"]) and len(allowed) > 1,
        allow_booking=bool(cfg["allow_booking"]),
        allow_changes=bool(cfg["allow_reschedule_cancel"]),
    )

    customer, last, upcoming = None, None, []
    if phone:
        customer = await db.get_customer(phone)
        if customer:
            st.customer_id, st.customer_name = customer["id"], customer.get("name")
            if customer.get("preferred_language") in st.allowed_languages:
                st.language = customer["preferred_language"]
            last = await db.get_last_visit(customer["id"])
            upcoming = await db.upcoming_appointments(phone)
            for r in upcoming:
                st.appointments[f"A{len(st.appointments) + 1}"] = r

    st.room = ctx.room
    st.call_log_id = await db.start_call_log(ctx.room.name, channel, phone, st.agent_id, mode)
    st.emit("state", status="Connected", agent=cfg["display_name"], language=st.language, mode=mode,
            customer=st.customer_name, channel=channel)

    team_text = "\n".join(f"- {s['name']}: {ROLE_LABELS.get(s['role'], s['role'])}" for s in st.staff)
    instructions = build_instructions(
        datetime.now(tz), settings, _hours_text(await db.get_business_hours()), team_text,
        _caller_context(st, customer, last, upcoming)
        + (" This conversation is a TEXT CHAT on the website, not a voice call: the caller types and reads your replies."
           if mode == "chat" else ""),
        cfg,
    )

    session = AgentSession[CallState](
        userdata=st,
        vad=ctx.proc.userdata["vad"],
        stt=sarvam.STT(
            # auto-detect when several languages are allowed, otherwise lock to the one language
            language=os.getenv("SARVAM_STT_LANGUAGE", "unknown") if len(allowed) > 1 else allowed[0],
            model=os.getenv("SARVAM_STT_MODEL", "saaras:v4"),
            mode="transcribe",
            prompt="Headlocks salon: haircut, beard, keratin, balayage, facial, waxing, threading, pedicure, manicure, "
                   + ", ".join(s["name"] for s in st.staff),
        ),
        llm=openai.LLM(model=cfg["llm_model"], temperature=float(cfg["llm_temperature"])),
        tts=sarvam.TTS(
            target_language_code=st.language,
            model="bulbul:v3",
            speaker=cfg["tts_speaker"],
            pace=float(cfg["tts_pace"]),
            temperature=float(cfg["tts_temperature"]),
            speech_sample_rate=8000 if channel == "phone" else 22050,
        ),
        turn_handling=TurnHandlingOptions(turn_detection=inference.TurnDetector()),
        max_tool_steps=6,
    )

    status_labels = {"listening": "Listening", "thinking": "Thinking", "speaking": "Speaking"}

    @session.on("agent_state_changed")
    def _on_agent_state(ev: agents.AgentStateChangedEvent) -> None:
        if ev.new_state in status_labels and st.live.get("status") not in ("Booked", "Rescheduled", "Cancelled", "Callback requested"):
            st.emit("state", status=status_labels[ev.new_state])
        st.emit("agent_state", value=ev.new_state)

    @session.on("conversation_item_added")
    def _on_item(ev: agents.ConversationItemAddedEvent) -> None:
        item = ev.item
        text = getattr(item, "text_content", None)
        if getattr(item, "role", None) in ("user", "assistant") and text:
            st.transcript.append({"role": item.role, "text": text, "at": datetime.now(tz).isoformat()})
            st.dirty = True

    async def _live_sync() -> None:
        """Mirror the call into call_logs every few seconds for the admin live-calls screen."""
        beat = 0
        while True:
            await asyncio.sleep(3)
            beat += 1
            if not (st.dirty or beat % 5 == 0):
                continue
            st.dirty = False
            try:
                await db.update_live_call(st.call_log_id, transcript=st.transcript[-200:], live_state=st.live,
                                          language=st.language, caller_phone=st.phone, customer_id=st.customer_id)
            except Exception:  # noqa: BLE001
                logger.debug("live sync failed", exc_info=True)

    sync_task = asyncio.create_task(_live_sync())

    @session.on("user_input_transcribed")
    def _on_transcript(ev: agents.UserInputTranscribedEvent) -> None:
        # Follow the caller's language automatically (Sarvam STT reports it per utterance).
        if st.auto_switch_language and ev.is_final and ev.language and len(ev.transcript.split()) >= 2:
            _apply_language(session, st, str(ev.language))

    async def _save_call() -> None:
        sync_task.cancel()
        transcript = []
        for m in session.history.messages():
            if m.role in ("user", "assistant") and m.text_content:
                transcript.append({
                    "role": m.role,
                    "text": m.text_content,
                    "at": datetime.fromtimestamp(m.created_at, tz).isoformat(),
                })
        outcome = st.outcome or ("enquiry" if any(t["role"] == "user" for t in transcript) else "dropped")
        try:
            if not st.customer_id and st.phone:
                st.customer_id = ((await db.get_customer(st.phone)) or {}).get("id")
            await db.finish_call_log(
                st.call_log_id,
                ended_at=datetime.now(tz).isoformat(),
                transcript=transcript,
                summary=await _summarise(transcript),
                outcome=outcome,
                language=st.language,
                caller_phone=st.phone,
                customer_id=st.customer_id,
                appointment_id=st.appointment_id,
                lead_id=st.lead_id,
            )
        except Exception:  # noqa: BLE001
            logger.exception("failed to save call log")

    ctx.add_shutdown_callback(_save_call)

    room_options = room_io.RoomOptions(
        participant_identity=participant.identity if isinstance(getattr(participant, "identity", None), str) else agents.NOT_GIVEN,
        text_input=True,
        text_output=True,
        audio_input=mode == "voice",
        audio_output=mode == "voice",
    )
    await session.start(room=ctx.room, agent=Receptionist(instructions), room_options=room_options)
    await session.generate_reply(instructions=cfg["greeting"])

    # Call time limit set in the admin panel: wrap up politely, then hang up.
    async def _time_limit() -> None:
        await asyncio.sleep(max(60, int(cfg["max_call_minutes"]) * 60 - 45))
        await session.generate_reply(
            instructions="The call time limit is almost reached. Briefly summarise anything agreed, "
                         "offer to take a callback request if something is unfinished, say goodbye, then call end_call."
        )
        await asyncio.sleep(60)
        ctx.shutdown(reason="call time limit")

    limit_task = asyncio.create_task(_time_limit())
    ctx.add_shutdown_callback(lambda: _cancel(limit_task))


async def _cancel(task: asyncio.Task) -> None:
    task.cancel()


if __name__ == "__main__":
    agents.cli.run_app(server)
