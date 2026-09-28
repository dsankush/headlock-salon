// Vercel serverless function: POST /api/monitor-token  { roomName }
// Admin-only. Returns a hidden, listen-only LiveKit token so staff can hear a live call
// and see its captions without the caller or agent knowing.
import { AccessToken } from "livekit-server-sdk";

type Req = { method?: string; body?: unknown; headers: Record<string, string | string[] | undefined> };
type Res = { status: (c: number) => Res; json: (b: unknown) => void; setHeader: (k: string, v: string) => void };

async function isAdmin(jwt: string): Promise<{ ok: boolean; userId?: string }> {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anon) return { ok: false };
  // Ask Supabase, as this user, whether they are an admin (RLS-safe: uses the caller's own JWT).
  const r = await fetch(`${url}/rest/v1/rpc/is_admin`, {
    method: "POST",
    headers: { apikey: anon, Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
    body: "{}",
  });
  if (!r.ok) return { ok: false };
  const ok = (await r.json()) === true;
  const u = await fetch(`${url}/auth/v1/user`, { headers: { apikey: anon, Authorization: `Bearer ${jwt}` } });
  const user = u.ok ? ((await u.json()) as { id?: string }) : {};
  return { ok, userId: user.id };
}

export default async function handler(req: Req, res: Res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });

  const auth = String(req.headers.authorization ?? "");
  const jwt = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!jwt) return res.status(401).json({ error: "Not signed in" });

  const { LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET } = process.env;
  if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) return res.status(500).json({ error: "Server is missing LiveKit settings." });

  const admin = await isAdmin(jwt);
  if (!admin.ok) return res.status(403).json({ error: "Admins only" });

  const body = (typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body ?? {}) as Record<string, unknown>;
  const roomName = typeof body.roomName === "string" ? body.roomName : "";
  if (!/^[\w.-]{1,128}$/.test(roomName)) return res.status(400).json({ error: "Invalid room" });

  const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
    identity: `monitor-${admin.userId ?? "admin"}-${Math.random().toString(36).slice(2, 6)}`,
    name: "Salon monitor",
    ttl: "1h",
  });
  // hidden + no publishing: invisible to the caller and the agent, can only listen.
  at.addGrant({ roomJoin: true, room: roomName, hidden: true, canPublish: false, canPublishData: false, canSubscribe: true });
  return res.status(200).json({ serverUrl: LIVEKIT_URL, token: await at.toJwt(), roomName });
}
