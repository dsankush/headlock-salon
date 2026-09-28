// Vercel serverless function: POST /api/token
// Creates a private LiveKit room for one website visitor and dispatches the voice agent into it.
// LIVEKIT_API_SECRET never leaves the server.
import { AccessToken, RoomAgentDispatch, RoomConfiguration } from "livekit-server-sdk";

type Req = { method?: string; body?: unknown; headers: Record<string, string | string[] | undefined> };
type Res = { status: (c: number) => Res; json: (b: unknown) => void; setHeader: (k: string, v: string) => void };

const LANGS = new Set(["en-IN", "hi-IN", "bn-IN", "gu-IN", "kn-IN", "ml-IN", "mr-IN", "od-IN", "pa-IN", "ta-IN", "te-IN"]);
const rand = (n = 8) => Math.random().toString(36).slice(2, 2 + n);

export default async function handler(req: Req, res: Res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });

  const { LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET } = process.env;
  const agentName = process.env.AGENT_NAME || "headlocks-receptionist";
  if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
    return res.status(500).json({ error: "Server is missing LiveKit settings (LIVEKIT_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET)." });
  }

  const body = (typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body ?? {}) as Record<string, unknown>;
  const mode = body.mode === "chat" ? "chat" : "voice";
  const language = typeof body.language === "string" && LANGS.has(body.language) ? body.language : undefined;
  const agent = typeof body.agent === "string" && /^[a-z0-9-]{2,40}$/.test(body.agent) ? body.agent : undefined;

  const roomName = `web-${Date.now().toString(36)}-${rand(6)}`;
  const identity = `visitor-${rand(10)}`;

  const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, { identity, name: "Website visitor", ttl: "15m" });
  at.addGrant({ roomJoin: true, room: roomName, canPublish: mode === "voice", canSubscribe: true, canPublishData: true });
  // Dispatch the agent when the room is created. The agent reads this metadata (which agent, mode, language).
  at.roomConfig = new RoomConfiguration({
    agents: [new RoomAgentDispatch({ agentName, metadata: JSON.stringify({ agent, mode, language }) })],
  });

  return res.status(200).json({ serverUrl: LIVEKIT_URL, token: await at.toJwt(), roomName });
}
