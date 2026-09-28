# Headlocks salon: website, admin & voice agent

This repo has two parts:
- **Root:** the React website + admin + Vercel API functions (deploy this folder to Vercel).
- **`agent/`:** the Python LiveKit voice agent (deploy with `cd agent && lk agent deploy`). See `agent/README.md`.

## Website + admin

React (Vite) site for Headlocks Luxury Salon with:

- **Public pages:** Home, Services & Prices (live from Supabase), Our Team, Contact, and **Talk to Riya**:
  voice or chat with the AI receptionist, with live captions and a live-actions panel (status, language,
  service, stylist, appointment, booking reference, tool activity).
- **Admin (`/admin`):** Dashboard analytics, **Live calls** (watch and listen in silently), Call logs with
  transcripts, Appointments, Customers, Callbacks, **Agent settings** (voice, languages, instructions,
  permissions: no redeploy needed), **Webhook & WhatsApp**.
- **Serverless API (Vercel):** `api/token.ts` starts a call and dispatches the agent;
  `api/monitor-token.ts` gives admins a hidden listen-only pass.

## Run locally
```bash
npm install
cp .env.example .env.local     # fill in the LiveKit values
npx vercel dev                 # runs the site AND the /api functions (plain `npm run dev` has no /api)
```

## Deploy (GitHub → Vercel)
1. Create an empty GitHub repo (e.g. `headlocks-web`), then in this folder:
   ```bash
   git init && git add . && git commit -m "Headlocks website"
   git branch -M main
   git remote add origin https://github.com/<you>/headlocks-web.git
   git push -u origin main
   ```
2. vercel.com → **Add New → Project** → import the repo. Framework: Vite (auto-detected).
3. **Environment Variables** (Production + Preview):

| Name | Value | Where from |
|---|---|---|
| `VITE_SUPABASE_URL` | `https://lqbwewoxovfreytutgvn.supabase.co` | already filled in `.env.example` |
| `VITE_SUPABASE_ANON_KEY` | `sb_publishable_…` | already filled in `.env.example` (public key) |
| `LIVEKIT_URL` | `wss://…livekit.cloud` | LiveKit Cloud → Settings → Keys |
| `LIVEKIT_API_KEY` | `API…` | same |
| `LIVEKIT_API_SECRET` | secret | same, **server only**, never prefix with `VITE_` |
| `AGENT_NAME` | `headlocks-receptionist` | must match the deployed agent |

4. Deploy, open the site, and go to **Talk to Riya → Start Voice Call**.

## Admin login
Create the user in Supabase → Authentication → Users, then make them an admin:
```sql
insert into public.admin_users (user_id, display_name, role)
select id, 'Owner', 'owner' from auth.users where email = 'you@example.com';
```
Recommended: Supabase → Authentication → Sign In / Providers → turn **off** "Allow new users to sign up"
(admins are added by you; the site never needs public sign-ups).

## Docs
- `docs/WEBHOOK_AND_WHATSAPP.md`: webhook payloads, signature check, and 6 WhatsApp templates ready for Meta.
- Phone number with Plivo: `agent/telephony/PLIVO_SETUP.md`.
