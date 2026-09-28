"""Thin async wrapper around the Supabase functions the agent uses.

All booking rules (skills, stylist tier, same-gender staff, overlaps, hours)
live in the database functions, so this layer only passes data through.
"""

from __future__ import annotations

import asyncio
import logging
import os
import re
from datetime import date, datetime
from typing import Any, Awaitable, Callable

import httpx
from supabase import AsyncClient, acreate_client

logger = logging.getLogger("headlocks-agent.db")

_client: AsyncClient | None = None

# Network hiccups we retry on (dropped Wi-Fi, stale HTTP/2 connection, slow TLS handshake).
_RETRYABLE = (
    httpx.ConnectError,
    httpx.ReadError,
    httpx.WriteError,
    httpx.RemoteProtocolError,
    httpx.ConnectTimeout,
    httpx.ReadTimeout,
    httpx.PoolTimeout,
)


async def client() -> AsyncClient:
    global _client
    if _client is None:
        _client = await acreate_client(
            os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"]
        )
    return _client


async def _reset_client() -> None:
    global _client
    _client = None


# For writes we only retry when the request certainly never reached the server,
# so a booking can't be created twice.
_RETRYABLE_WRITE = (httpx.ConnectError, httpx.ConnectTimeout, httpx.PoolTimeout)


async def _run(op: Callable[[AsyncClient], Awaitable[Any]], attempts: int = 3, write: bool = False) -> Any:
    """Run a Supabase call, retrying with a fresh connection on network errors."""
    retry_on = _RETRYABLE_WRITE if write else _RETRYABLE
    for attempt in range(1, attempts + 1):
        try:
            return await op(await client())
        except retry_on as e:
            if attempt == attempts:
                raise
            logger.warning("Supabase network error (%s), retrying %d/%d", type(e).__name__, attempt, attempts - 1)
            await _reset_client()
            await asyncio.sleep(0.4 * attempt)


def normalize_phone(raw: str | None) -> str | None:
    """Turn '98765 43210', '09876543210', '+91-98765-43210' into '+919876543210'."""
    if not raw:
        return None
    digits = re.sub(r"\D", "", raw)
    if len(digits) == 11 and digits.startswith("0"):
        digits = digits[1:]
    if len(digits) == 10:
        return "+91" + digits
    if len(digits) == 12 and digits.startswith("91"):
        return "+" + digits
    if len(digits) >= 8:
        return "+" + digits
    return None


def db_error_code(exc: Exception) -> str:
    """Pull our own error codes ('slot_unavailable', ...) out of a PostgREST error."""
    text = str(getattr(exc, "message", "") or exc)
    for code in ("slot_unavailable", "appointment_not_found", "invalid_service_ids", "not_authorized"):
        if code in text:
            return code
    return "unknown_error"


async def rpc(name: str, params: dict[str, Any], write: bool = False) -> Any:
    res = await _run(lambda c: c.rpc(name, params).execute(), write=write)
    return res.data


# ---------- reads ----------

async def get_settings() -> dict:
    res = await _run(lambda c: c.table("salon_settings").select("*").eq("id", 1).single().execute())
    return res.data


async def get_agent_config(slug: str | None) -> dict | None:
    """The agent's settings (edited in the admin panel). Falls back to the default agent."""
    if slug:
        res = await _run(lambda c: c.table("agents").select("*").eq("slug", slug).eq("is_active", True).limit(1).execute())
        if res.data:
            return res.data[0]
    res = await _run(lambda c: c.table("agents").select("*").eq("is_active", True)
                     .order("is_default", desc=True).order("created_at").limit(1).execute())
    return res.data[0] if res.data else None


async def get_business_hours() -> list[dict]:
    res = await _run(lambda c: c.table("business_hours").select("*").order("weekday").execute())
    return res.data


async def get_staff() -> list[dict]:
    res = await _run(lambda c: c.table("staff").select("id,name,role,gender").eq("is_active", True).order("sort_order").execute())
    return res.data


async def get_customer(phone: str) -> dict | None:
    res = await _run(lambda c: c.table("customers").select("id,name,phone,preferred_language,notes").eq("phone", phone).limit(1).execute())
    return res.data[0] if res.data else None


async def get_last_visit(customer_id: str) -> dict | None:
    res = await _run(lambda c: (
        c.table("appointments")
        .select("starts_at,staff:staff_id(name),appointment_services(services(name))")
        .eq("customer_id", customer_id)
        .eq("status", "completed")
        .order("starts_at", desc=True)
        .limit(1)
        .execute()
    ))
    return res.data[0] if res.data else None


async def search_services(query: str, client_gender: str | None, limit: int = 8) -> list[dict]:
    return await rpc("search_services", {"p_query": query, "p_client_gender": client_gender, "p_limit": limit})


async def available_slots(
    day: date,
    service_ids: list[str],
    staff_id: str | None,
    client_gender: str | None,
    exclude_appointment_id: str | None = None,
) -> list[dict]:
    return await rpc(
        "get_available_slots",
        {
            "p_date": day.isoformat(),
            "p_service_ids": service_ids,
            "p_staff_id": staff_id,
            "p_client_gender": client_gender,
            "p_exclude_appointment_id": exclude_appointment_id,
        },
    )


async def upcoming_appointments(phone: str) -> list[dict]:
    return await rpc("get_upcoming_appointments", {"p_phone": phone})


# ---------- writes ----------

async def book(
    phone: str, name: str | None, client_gender: str | None, service_ids: list[str],
    staff_id: str, starts_at: datetime, source: str, notes: str | None,
) -> str:
    return await rpc(
        "book_appointment",
        {
            "p_phone": phone,
            "p_name": name,
            "p_client_gender": client_gender,
            "p_service_ids": service_ids,
            "p_staff_id": staff_id,
            "p_starts_at": starts_at.isoformat(),
            "p_source": source,
            "p_notes": notes,
        },
    write=True)


async def reschedule(appointment_id: str, phone: str, new_start: datetime, new_staff_id: str | None) -> str:
    return await rpc(
        "reschedule_appointment",
        {
            "p_appointment_id": appointment_id,
            "p_phone": phone,
            "p_new_starts_at": new_start.isoformat(),
            "p_new_staff_id": new_staff_id,
        },
    write=True)


async def cancel(appointment_id: str, phone: str, reason: str | None) -> str:
    return await rpc("cancel_appointment", {"p_appointment_id": appointment_id, "p_phone": phone, "p_reason": reason}, write=True)


async def create_callback(
    phone: str, name: str | None, lead_type: str, service_id: str | None,
    event_type: str | None, event_date: str | None, details: str | None,
) -> str:
    return await rpc(
        "create_callback_request",
        {
            "p_phone": phone,
            "p_name": name,
            "p_lead_type": lead_type,
            "p_service_id": service_id,
            "p_event_type": event_type,
            "p_event_date": event_date,
            "p_details": details,
        },
    write=True)


async def update_customer(customer_id: str, **fields: Any) -> None:
    fields = {k: v for k, v in fields.items() if v is not None}
    if fields:
        await _run(lambda c: c.table("customers").update(fields).eq("id", customer_id).execute())


async def start_call_log(
    room_name: str, channel: str, caller_phone: str | None, agent_id: str | None = None, mode: str = "voice",
) -> str:
    res = await _run(lambda c: c.table("call_logs").insert(
        {"room_name": room_name, "channel": channel, "caller_phone": caller_phone, "agent_id": agent_id, "mode": mode}
    ).execute(), write=True)
    return res.data[0]["id"]


async def finish_call_log(call_log_id: str, **fields: Any) -> None:
    await _run(lambda c: c.table("call_logs").update(fields).eq("id", call_log_id).execute())


async def update_live_call(call_log_id: str, **fields: Any) -> None:
    """Keeps the admin live-calls screen up to date while the call is running."""
    fields["last_activity_at"] = datetime.now().astimezone().isoformat()
    await _run(lambda c: c.table("call_logs").update(fields).eq("id", call_log_id).execute(), attempts=2)


async def get_appointment_reference(appointment_id: str) -> str | None:
    res = await _run(lambda c: c.table("appointments").select("reference").eq("id", appointment_id).limit(1).execute())
    return res.data[0]["reference"] if res.data else None
