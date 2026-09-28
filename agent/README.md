# Headlocks voice receptionist

LiveKit Agents worker: **Sarvam STT → OpenAI → Sarvam TTS**, with booking tools that call the `salon_agent` Supabase database.

## Files
| File | What it does |
|---|---|
| `agent.py` | The worker: session setup, the 10 tools, language switching, call logging |
| `prompts.py` | The receptionist's instructions (tone, pricing rules, booking flow) |
| `db.py` | Calls to Supabase (all booking rules live in the database functions) |
| `.env.example` | Keys you need to fill in |

## Setup
```bash
python -m venv .venv && source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env.local        # then fill in the keys
python agent.py download-files    # one time: VAD + turn-detector models
```

## Run
```bash
python agent.py console   # talk to it from your terminal/mic, no website needed
python agent.py dev       # registers with your LiveKit project; test in the Agents Playground
python agent.py start     # production
```
In `dev` mode, open https://agents-playground.livekit.io, connect to your project, and the agent named
`headlocks-receptionist` joins when dispatched (the React site will do this dispatch for you later).

## What the agent can do (tools)
`search_services`, `get_salon_info`, `check_availability`, `book_appointment`, `find_my_appointments`,
`reschedule_appointment`, `cancel_appointment`, `request_callback`, `set_language`, `end_call`.

The LLM never sees database IDs. It gets short refs (`S1` service, `T3` slot, `A1` appointment) that
map to real IDs inside the call, so it can't book a made-up service or time.

## Languages
Sarvam STT runs with `language=unknown`, so it detects the caller's language on each sentence
(English, Hindi, Tamil, Telugu, Kannada, Malayalam, Marathi, Bengali, Gujarati, Punjabi, Odia, …).
The agent replies in the same language, and the TTS voice switches to match automatically.

## Caller phone number
- **Phone calls (LiveKit SIP):** taken from the caller ID automatically.
- **Website:** if the site knows the visitor's number, put it in the participant's attributes as `phone`
  (or metadata `{"phone": "..."}`) when creating the token; otherwise the agent asks for it.

## After each call
A row in `call_logs` gets the full transcript, a one-line summary, the outcome
(booked / rescheduled / cancelled / lead_created / enquiry / dropped), language, and links to the
customer, appointment or callback request.

## Customising the agent (no redeploy)
All agent settings live in the Supabase table `agents` and are read at the start of **every call**:
name, greeting, extra instructions, AI model and temperature, voice (`tts_speaker`), speed (`tts_pace`),
default language, which languages are allowed, auto language switching, whether booking / rescheduling
is allowed, and the maximum call length. Edit them from the admin panel (or Supabase Table Editor) and the
next call uses the new values.

- Several agents can exist; one is marked `is_default`.
- The website picks an agent by putting `{"agent": "<slug>"}` in the dispatch metadata (the token endpoint does this).
- Voice and language dropdowns can read from the `tts_voices` and `agent_languages` tables.
- Each call log records which agent took the call (`call_logs.agent_id`).
- The `.env` voice/model values are now only a fallback if the database can't be reached.
