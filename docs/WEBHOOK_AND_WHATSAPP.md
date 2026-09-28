# Webhook + WhatsApp templates

Turn on in **Admin → Webhook & WhatsApp**: paste your HTTPS URL, pick events, Save, then **Send test**.
Webhooks are sent by the database itself, so they fire for every booking — made by Riya on the phone or
website, or changed by staff in the admin panel.

## Request format
`POST <your URL>` with JSON body and headers:

| Header | Value |
|---|---|
| `Content-Type` | `application/json` |
| `X-Headlocks-Event` | e.g. `appointment.booked` |
| `X-Headlocks-Signature` | `sha256=<hex HMAC-SHA256 of the raw body, keyed with your signing secret>` |

Reply with any `2xx` within 8 seconds. Delivery results show in the admin log.

### Events
| Event | When |
|---|---|
| `appointment.booked` | New booking (agent, website or staff) |
| `appointment.rescheduled` | Time or stylist changed (includes `previous_date_text` / `previous_time_text`) |
| `appointment.cancelled` | Cancelled by customer or salon |
| `appointment.completed` | Staff marked it done |
| `appointment.reminder` | N hours before (set in admin; checked every 10 minutes) |
| `callback.requested` | Bridal / consultation / "call me back" request |
| `call.ended` | Every call or chat, with outcome and AI summary |

### Example: `appointment.booked`
```json
{
  "event": "appointment.booked",
  "sent_at": "2026-09-28T16:05:01.2+00:00",
  "data": {
    "appointment_id": "075e5ae1-943e-400b-8759-66e04d7aeff8",
    "reference": "HL-GUYEK",
    "status": "booked",
    "source": "voice_web",
    "starts_at": "2026-09-30T04:30:00+00:00",
    "ends_at": "2026-09-30T04:50:00+00:00",
    "date_text": "Wed, 30 Sep 2026",
    "time_text": "10:00 AM",
    "estimated_total": 350,
    "services": [{ "name": "Beard", "price": 350, "price_type": "fixed", "duration_min": 20 }],
    "services_text": "Beard",
    "stylist": "Javed",
    "customer": { "id": "…", "name": "Ravi", "phone": "+919876543210", "whatsapp_number": "919876543210" },
    "cancel_reason": null,
    "notes": null,
    "salon": { "name": "Headlocks Luxury Salon", "address": "…", "phones": ["0124-3504190", "8826836444"] }
  }
}
```
`customer.whatsapp_number` is already in the format the WhatsApp Cloud API expects (country code, no `+`).

### Verify the signature (Node.js / Express)
```js
import crypto from "node:crypto";
app.post("/headlocks/webhook", express.raw({ type: "application/json" }), (req, res) => {
  const expected = "sha256=" + crypto.createHmac("sha256", process.env.HEADLOCKS_SECRET).update(req.body).digest("hex");
  const got = req.get("X-Headlocks-Signature") || "";
  if (got.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(got), Buffer.from(expected))) return res.sendStatus(401);
  const { event, data } = JSON.parse(req.body.toString("utf8"));
  // … send the WhatsApp template for `event` using `data`
  res.sendStatus(200);
});
```

### Verify the signature (Python / FastAPI)
```python
import hmac, hashlib, os
from fastapi import Request, HTTPException

@app.post("/headlocks/webhook")
async def headlocks(req: Request):
    raw = await req.body()
    expected = "sha256=" + hmac.new(os.environ["HEADLOCKS_SECRET"].encode(), raw, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, req.headers.get("X-Headlocks-Signature", "")):
        raise HTTPException(401)
    payload = await req.json()
    ...
```

---

# WhatsApp templates to submit in Meta

Meta → WhatsApp Manager → **Message templates → Create template**. Language: **English** (add
**Hindi** as a second language of the same template if you want). Meta rules: a template can't start or
end with a variable, and every variable needs a sample value, which is given below.

## 1. `headlocks_booking_confirmed` · Category: **Utility**
**Body**
```
Hi {{1}}, your appointment at Headlocks Luxury Salon is confirmed ✅

📅 {{2}} at {{3}}
💇 {{4}}
✂️ Stylist: {{5}}
🔖 Booking ref: {{6}}

Need to change it? Just reply here or call us on 8826836444. Please tell us at least 2 hours before if you can't make it.
```
**Buttons (optional):** Quick reply `Reschedule`, Quick reply `Cancel booking`

| Var | Webhook field | Sample |
|---|---|---|
| {{1}} | `data.customer.name` | Ravi |
| {{2}} | `data.date_text` | Wed, 30 Sep 2026 |
| {{3}} | `data.time_text` | 10:00 AM |
| {{4}} | `data.services_text` | Hair Cut – Hair Dresser |
| {{5}} | `data.stylist` | Javed |
| {{6}} | `data.reference` | HL-GUYEK |

## 2. `headlocks_booking_rescheduled` · Utility
```
Hi {{1}}, your Headlocks appointment has been moved ✅

New time: {{2}} at {{3}}
Service: {{4}} with {{5}}
Booking ref: {{6}}

See you soon! Reply here if you need anything.
```
Fields: `customer.name`, `date_text`, `time_text`, `services_text`, `stylist`, `reference` (event `appointment.rescheduled`).

## 3. `headlocks_booking_cancelled` · Utility
```
Hi {{1}}, your appointment on {{2}} at {{3}} (ref {{4}}) has been cancelled.

We'd love to see you another time. Reply here or call 8826836444 to book again.
```
Fields: `customer.name`, `date_text`, `time_text`, `reference` (event `appointment.cancelled`).

## 4. `headlocks_appointment_reminder` · Utility
```
Hi {{1}}, a quick reminder of your appointment today at {{2}} for {{3}} with {{4}}.

📍 Headlocks Luxury Salon, DLF Phase-1, Golf Course Road, Gurugram
Booking ref: {{5}}

Running late or need to change? Reply here.
```
Fields: `customer.name`, `time_text`, `services_text`, `stylist`, `reference` (event `appointment.reminder`).
**Button (optional):** Visit website / Call phone number.

## 5. `headlocks_callback_received` · Utility
```
Hi {{1}}, thank you for contacting Headlocks Luxury Salon. We've received your request for {{2}} and our team will call you back shortly.

For anything urgent, call us on 8826836444.
```
Fields: `data.customer.name`, `data.service` (or `data.lead_type`, e.g. "bridal makeup") (event `callback.requested`).

## 6. `headlocks_visit_feedback` · Category: **Marketing** (Meta treats feedback requests as marketing)
```
Hi {{1}}, thank you for visiting Headlocks today! ✨

How was your {{2}} with {{3}}? Reply with a rating from 1 to 5, we read every message.
```
Fields: `customer.name`, `services_text`, `stylist` (event `appointment.completed`).
Only send to customers who have opted in to marketing messages.

### Tips for quick approval
- Keep the salon name in the text; don't use only variables in a line.
- Use the exact sample values above.
- Utility templates must be about an existing booking, so don't add offers to them. Put offers in a separate Marketing template.
