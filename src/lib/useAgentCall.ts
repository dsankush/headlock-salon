import { useCallback, useEffect, useRef, useState } from "react";
import {
  ConnectionState,
  ParticipantKind,
  Room,
  RoomEvent,
  Track,
  type RemoteParticipant,
  type RemoteTrack,
} from "livekit-client";

/** Messages shown as live captions. */
export type Caption = { id: string; role: "user" | "agent"; text: string; final: boolean; ts: number };

/** Tool activity pushed by the agent ("Checked availability", "Appointment booked", ...). */
export type ToolEvent = { id: string; name: string; label: string; detail?: string; status: "running" | "done"; ts: number };

/** Live state pushed by the agent (status, language, services, stylist, appointment, reference ...). */
export type LiveState = Partial<Record<
  "status" | "language" | "services" | "stylist" | "appointment" | "reference" | "customer" | "client" | "agent" | "mode" | "channel",
  string
>>;

export type CallStatus = "idle" | "connecting" | "connected" | "ended" | "error";
export type AgentState = "initializing" | "idle" | "listening" | "thinking" | "speaking";

type Credentials = { serverUrl: string; token: string; roomName?: string };

type Options = {
  /** "caller" publishes the microphone; "monitor" only listens (admin live view). */
  role?: "caller" | "monitor";
};

const EVENTS_TOPIC = "agent-events";

export function useAgentCall({ role = "caller" }: Options = {}) {
  const roomRef = useRef<Room | null>(null);
  const audioEls = useRef<HTMLMediaElement[]>([]);
  const [status, setStatus] = useState<CallStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [captions, setCaptions] = useState<Caption[]>([]);
  const [tools, setTools] = useState<ToolEvent[]>([]);
  const [live, setLive] = useState<LiveState>({});
  const [agentState, setAgentState] = useState<AgentState>("initializing");
  const [micOn, setMicOn] = useState(true);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [levels, setLevels] = useState({ agent: 0, user: 0 });
  const [roomName, setRoomName] = useState<string | null>(null);

  const isAgent = (identity: string, room: Room) => {
    const p = room.remoteParticipants.get(identity);
    return p?.kind === ParticipantKind.AGENT || identity.startsWith("agent");
  };

  const upsertCaption = useCallback((c: Caption) => {
    setCaptions((prev) => {
      const i = prev.findIndex((p) => p.id === c.id);
      if (i === -1) return [...prev, c];
      const next = prev.slice();
      next[i] = { ...next[i], ...c, ts: next[i].ts };
      return next;
    });
  }, []);

  const cleanupAudio = () => {
    audioEls.current.forEach((el) => el.remove());
    audioEls.current = [];
  };

  const disconnect = useCallback(async () => {
    const room = roomRef.current;
    roomRef.current = null;
    if (room) await room.disconnect();
    cleanupAudio();
    setStatus((s) => (s === "idle" ? "idle" : "ended"));
  }, []);

  const connect = useCallback(
    async (getCredentials: () => Promise<Credentials>, opts: { withMic?: boolean } = {}) => {
      await disconnect();
      setError(null);
      setCaptions([]);
      setTools([]);
      setLive({});
      setAgentState("initializing");
      setStatus("connecting");

      try {
        const creds = await getCredentials();
        setRoomName(creds.roomName ?? null);
        const room = new Room({ adaptiveStream: true, dynacast: true });
        roomRef.current = room;

        // Live captions: the agent streams both sides of the conversation on "lk.transcription".
        room.registerTextStreamHandler("lk.transcription", async (reader, participantInfo) => {
          const attrs = reader.info.attributes ?? {};
          const segment = attrs["lk.segment_id"] ?? reader.info.id;
          const speaker = participantInfo.identity;
          const who: Caption["role"] =
            role === "caller" && speaker === room.localParticipant.identity ? "user"
              : isAgent(speaker, room) ? "agent" : "user";
          const id = `${who}:${segment}`;
          let text = "";
          for await (const chunk of reader) {
            text += chunk;
            upsertCaption({ id, role: who, text, final: false, ts: Date.now() });
          }
          // A stream closing means that piece of text is complete.
          upsertCaption({ id, role: who, text, final: true, ts: Date.now() });
        });

        // Live actions / tool activity from the agent.
        room.on(RoomEvent.DataReceived, (payload, _p, _k, topic) => {
          if (topic !== EVENTS_TOPIC) return;
          try {
            const ev = JSON.parse(new TextDecoder().decode(payload));
            if (ev.type === "state" && ev.state) setLive(ev.state);
            else if (ev.type === "agent_state") setAgentState(ev.value);
            else if (ev.type === "tool") {
              setTools((prev) => {
                const running = prev.findIndex((t) => t.name === ev.name && t.status === "running");
                const item: ToolEvent = {
                  id: `${ev.name}-${ev.ts}`, name: ev.name, label: ev.label, detail: ev.detail, status: ev.status, ts: ev.ts * 1000,
                };
                if (ev.status === "done" && running !== -1) {
                  const next = prev.slice();
                  next[running] = item;
                  return next;
                }
                return [...prev, item];
              });
            }
          } catch {
            /* ignore malformed events */
          }
        });

        // Agent state is also exposed as a participant attribute.
        room.on(RoomEvent.ParticipantAttributesChanged, (_changed, participant) => {
          const s = participant.attributes?.["lk.agent.state"];
          if (s && participant.kind === ParticipantKind.AGENT) setAgentState(s as AgentState);
        });

        room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
          if (track.kind === Track.Kind.Audio) {
            const el = track.attach();
            el.style.display = "none";
            document.body.appendChild(el);
            audioEls.current.push(el);
          }
        });
        room.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
          track.detach().forEach((el) => el.remove());
        });
        room.on(RoomEvent.Disconnected, () => {
          cleanupAudio();
          setStatus("ended");
        });
        room.on(RoomEvent.ParticipantDisconnected, (p: RemoteParticipant) => {
          // In the caller view the call ends when the agent leaves.
          if (role === "caller" && p.kind === ParticipantKind.AGENT) void room.disconnect();
        });

        await room.connect(creds.serverUrl, creds.token);
        if (role === "caller" && opts.withMic) {
          await room.localParticipant.setMicrophoneEnabled(true);
          setMicOn(true);
        }
        await room.startAudio().catch(() => undefined);
        setStartedAt(Date.now());
        setStatus(room.state === ConnectionState.Connected ? "connected" : "connecting");

        // If no agent joins, say so instead of showing "Listening…" forever.
        if (role === "caller") {
          window.setTimeout(() => {
            if (roomRef.current !== room) return;
            const agentHere = Array.from(room.remoteParticipants.values()).some((p) => p.kind === ParticipantKind.AGENT);
            if (!agentHere) {
              setError("The receptionist didn't join the call. Please try again in a minute — if it keeps happening, the agent may be offline.");
              void room.disconnect();
            }
          }, 20000);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setStatus("error");
        await disconnect();
        setStatus("error");
      }
    },
    [disconnect, role, upsertCaption],
  );

  const sendText = useCallback(async (text: string) => {
    const room = roomRef.current;
    if (!room || !text.trim()) return;
    upsertCaption({ id: `typed:${Date.now()}`, role: "user", text: text.trim(), final: true, ts: Date.now() });
    await room.localParticipant.sendText(text.trim(), { topic: "lk.chat" });
  }, [upsertCaption]);

  const toggleMic = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    const next = !room.localParticipant.isMicrophoneEnabled;
    await room.localParticipant.setMicrophoneEnabled(next);
    setMicOn(next);
  }, []);

  // Audio levels drive the orb animation.
  useEffect(() => {
    if (status !== "connected") return;
    const t = window.setInterval(() => {
      const room = roomRef.current;
      if (!room) return;
      let agent = 0;
      let user = role === "caller" ? room.localParticipant.audioLevel : 0;
      room.remoteParticipants.forEach((p) => {
        if (p.kind === ParticipantKind.AGENT) agent = Math.max(agent, p.audioLevel);
        else if (role === "monitor") user = Math.max(user, p.audioLevel);
      });
      setLevels({ agent, user });
    }, 90);
    return () => window.clearInterval(t);
  }, [status, role]);

  useEffect(() => () => { void disconnect(); }, [disconnect]);

  return {
    status, error, captions, tools, live, agentState, micOn, startedAt, levels, roomName,
    connect, disconnect, sendText, toggleMic,
  };
}
