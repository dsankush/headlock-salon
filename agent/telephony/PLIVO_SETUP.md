# Connect your Plivo number to Riya (inbound calls)

When a customer calls your Plivo number, Plivo forwards the call over SIP to LiveKit, and LiveKit starts
a private room (`call-…`) with Riya in it. The agent reads the caller's number from caller ID, greets
returning customers by name, and uses 8 kHz phone audio automatically. Every phone call appears on the
admin **Live calls** screen (with listen-in) and in **Call logs**.

You do **not** need to share your Plivo Auth ID / Auth Token with anyone for this. The whole setup
happens in the Plivo console and with the `lk` command you already use.

## 1. Find your LiveKit SIP address
LiveKit Cloud → your project (salon-agent) → **Settings** → **SIP URI**.
It looks like `sip:abcd1234.sip.livekit.cloud`. You need the part after `sip:`.

> **India numbers:** LiveKit requires **region pinning** for Indian telephony. In the same Settings
> page, pin the project's SIP region to **India** (or the closest region offered) before going live.

## 2. Plivo console: create an inbound trunk
1. Plivo console → **Zentrunk (SIP Trunking)** → **Inbound Trunks** → **Create New Inbound Trunk**.
2. Name: `LiveKit Headlocks`.
3. **Primary URI**: `abcd1234.sip.livekit.cloud;transport=tcp` (your SIP address from step 1).
4. Choose your Indian phone number under **Phone numbers** (or attach it later from
   **Phone Numbers → Your number → Application type: Zentrunk → this trunk**).
5. Save.

## 3. LiveKit: accept calls for that number
In `inbound-trunk.json`, replace `+91XXXXXXXXXX` with your Plivo number in +91 format, then:

```bash
cd ~/Downloads/headlocks-agent/telephony
lk sip inbound create inbound-trunk.json
```
It prints a trunk ID like `ST_xxxxxxxx`.

## 4. LiveKit: send those calls to Riya
Put that trunk ID into `dispatch-rule.json` (replace `ST_REPLACE_WITH_TRUNK_ID`), then:

```bash
lk sip dispatch create dispatch-rule.json
```

`"agent": "riya"` in the metadata picks which agent (from Admin → Agent settings) answers the phone.
To use a different agent for phone calls, change it here and run
`lk sip dispatch update` (or delete and recreate the rule).

## 5. Test
Call the number from your mobile. You should hear Riya within a second or two, and the call shows up
on **Admin → Live calls** straight away.

Useful commands:
```bash
lk sip inbound list
lk sip dispatch list
lk agent logs        # watch the agent while you call
```

## Troubleshooting
| Symptom | Check |
|---|---|
| Call rings then drops | Primary URI in Plivo must match your LiveKit SIP address exactly, with `;transport=tcp`. |
| "Number not configured" | The number in `inbound-trunk.json` must be exactly the +91 number Plivo delivers. |
| Silence after answering | `lk agent status` shows the agent **Running**; `AGENT_NAME` in the dispatch rule must be `headlocks-receptionist`. |
| Caller number missing | Plivo passes caller ID by default; check the call in Plivo's debug logs. |
