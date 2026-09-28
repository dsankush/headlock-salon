import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Icon from "../components/Icon";
import { Captions, LiveActions, Orb, Wave } from "../components/CallParts";
import { useCallBadge } from "../components/PublicLayout";
import { useAgentCall } from "../lib/useAgentCall";
import { getCallToken } from "../lib/api";
import { LANGUAGES, langName } from "../lib/format";

const SUGGESTIONS = [
  "I want a haircut tomorrow evening",
  "मुझे शनिवार को फेशियल करवाना है",
  "What are your timings and prices for keratin?",
  "I want to cancel my appointment",
];

export default function Talk() {
  const [params] = useSearchParams();
  const agentSlug = params.get("agent") ?? undefined;
  const [mode, setMode] = useState<"voice" | "chat">("voice");
  const [language, setLanguage] = useState<string>("auto");
  const [draft, setDraft] = useState("");
  const call = useAgentCall({ role: "caller" });
  const { setBadge } = useCallBadge();

  const inCall = call.status === "connected" || call.status === "connecting";
  const agentName = call.live.agent ?? "Riya";

  useEffect(() => {
    setBadge({ active: call.status === "connected", startedAt: call.startedAt });
    return () => setBadge({ active: false, startedAt: null });
  }, [call.status, call.startedAt, setBadge]);

  const start = (m = mode) =>
    call.connect(
      () => getCallToken({ mode: m, language: language === "auto" ? undefined : language, agent: agentSlug }),
      { withMic: m === "voice" },
    );

  const reset = async () => {
    await call.disconnect();
    setDraft("");
  };

  const trySuggestion = async (text: string) => {
    if (mode === "chat") {
      if (!inCall) {
        await start("chat");
        setDraft(text);
      } else {
        await call.sendText(text);
      }
    } else if (!inCall) {
      await start("voice");
    }
  };

  const headline =
    call.status === "connecting" ? "Connecting…"
      : call.status === "connected" ? (call.agentState === "speaking" ? `${agentName} is speaking` : call.agentState === "thinking" ? "Thinking…" : "Listening…")
      : call.status === "ended" ? "Call ended. Thank you!"
      : "Ready when you are.";

  return (
    <div className="talk-shell">
      <div className="container">
        <div className="talk-handle" />
        <div className="card talk-toolbar">
          <span className="faint hide-sm">Salon</span>
          <span className="chip"><Icon name="scissors" size={16} /> Headlocks Luxury Salon</span>
          <span className="faint hide-sm">Language</span>
          <label className="chip" style={{ paddingRight: 6 }}>
            <Icon name="globe" size={16} />
            <select className="select" style={{ border: 0, padding: "2px 4px", background: "transparent", width: "auto" }}
              value={language} disabled={inCall} onChange={(e) => setLanguage(e.target.value)} aria-label="Language">
              <option value="auto">Auto Detect</option>
              {Object.entries(LANGUAGES).map(([code, name]) => <option key={code} value={code}>{name}</option>)}
            </select>
          </label>
          <div className="right row">
            <div className="segmented" role="group" aria-label="Mode">
              <button aria-pressed={mode === "voice"} disabled={inCall} onClick={() => setMode("voice")}><Icon name="phone" size={16} /> Voice</button>
              <button aria-pressed={mode === "chat"} disabled={inCall} onClick={() => setMode("chat")}><Icon name="chat" size={16} /> Chat</button>
            </div>
            <button className="btn" onClick={reset}><Icon name="reset" size={16} /> Reset</button>
          </div>
        </div>

        <div className="talk-grid">
          {/* Left: who you're talking to */}
          <aside className="card card-pad stack" style={{ gap: 16 }}>
            <div className="row">
              <div className="card-title">AI Receptionist</div>
              <span className={`pill right ${inCall ? "pill-green" : "pill-green"}`}><span className="dot" /> Online</span>
            </div>
            <div className="card-soft row" style={{ padding: 16, gap: 14 }}>
              <div className="la-icon" style={{ width: 52, height: 52 }}><Icon name="scissors" size={22} /></div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 17 }}>Headlocks Luxury Salon</div>
                <div className="muted">Virtual Receptionist</div>
                <div className="faint" style={{ fontSize: 13 }}>Golf Course Road · real-time availability</div>
              </div>
            </div>
            <div className="card-soft agent-mini">
              <div className="avatar-orb" />
              <div className="grow">
                <div style={{ fontWeight: 700, fontSize: 17 }}>{agentName}</div>
                <div className="muted">AI Receptionist</div>
              </div>
              <Wave level={call.levels.agent} />
            </div>
            <div>
              <div className="row" style={{ fontWeight: 700, marginBottom: 10 }}><Icon name="globe" size={16} /> Languages supported</div>
              <div className="row wrap" style={{ gap: 8 }}>
                {Object.values(LANGUAGES).map((l) => <span key={l} className="chip">{l}</span>)}
              </div>
            </div>
            <button className="card-soft row" style={{ padding: 14, cursor: "pointer", textAlign: "left", background: "var(--accent-soft)" }}
              onClick={() => !inCall && start()} disabled={inCall}>
              <span className="la-icon" style={{ background: "var(--accent-deep)", color: "var(--bg)" }}><Icon name="sparkle" /></span>
              <span className="grow"><b>Try it now</b><br /><span className="muted" style={{ fontSize: 14 }}>Start a real {mode === "voice" ? "voice call" : "chat"}</span></span>
              <Icon name="chevronRight" />
            </button>
            <div className="card-soft row" style={{ padding: 14, alignItems: "flex-start", marginTop: "auto" }}>
              <Icon name="shield" />
              <p className="muted" style={{ fontSize: 14 }}>Books against real stylist schedules. Never double-books, reads details back before confirming, and hands special requests to our team.</p>
            </div>
          </aside>

          {/* Center: the conversation */}
          <section className="card talk-center">
            <div className="row" style={{ padding: "18px 20px 0" }}>
              <span className={`dot ${call.status === "connected" ? "dot-live" : ""}`} style={{ color: "var(--accent)" }} />
              <div className="card-title">Live Conversation</div>
              {call.status === "connected" && mode === "voice" && (
                <button className="btn btn-sm right" onClick={call.toggleMic}>
                  <Icon name={call.micOn ? "mic" : "micOff"} size={15} /> {call.micOn ? "Mute" : "Unmute"}
                </button>
              )}
            </div>

            {call.captions.length === 0 ? (
              <div className="talk-stage">
                <Orb level={Math.max(call.levels.agent, call.levels.user * 0.6)} state={call.agentState} />
                <h2>{headline}</h2>
                <p className="muted">
                  {call.status === "idle" || call.status === "ended"
                    ? mode === "voice" ? "Tap “Start Voice Call” and speak in any Indian language." : "Start a chat and type in any Indian language."
                    : "Say hello to get started."}
                </p>
                {call.error && <div className="error-box">{call.error}</div>}
              </div>
            ) : (
              <>
                <div className="row" style={{ justifyContent: "center", padding: "10px 0 0" }}>
                  <div style={{ transform: "scale(.45)", margin: "-54px 0" }}><Orb level={call.levels.agent} state={call.agentState} /></div>
                </div>
                <p className="faint" style={{ textAlign: "center", fontSize: 13 }}>{headline}</p>
                <Captions items={call.captions} agentName={agentName} />
              </>
            )}

            <div className="talk-footer">
              {mode === "chat" && call.status === "connected" ? (
                <form className="chat-input" onSubmit={(e) => { e.preventDefault(); void call.sendText(draft); setDraft(""); }}>
                  <input className="input" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Type your message…" autoFocus />
                  <button className="btn btn-accent" type="submit" aria-label="Send"><Icon name="send" /></button>
                  <button className="btn" type="button" onClick={reset}>End</button>
                </form>
              ) : inCall ? (
                <button className="call-btn end" onClick={reset}><Icon name="phoneOff" /> End call</button>
              ) : (
                <button className="call-btn" onClick={() => start()} disabled={call.status === "connecting"}>
                  <Icon name={mode === "voice" ? "phone" : "chat"} /> {mode === "voice" ? "Start Voice Call" : "Start Chat"}
                </button>
              )}
              <p className="faint" style={{ textAlign: "center", fontSize: 13 }}>
                {mode === "voice" ? "Uses your microphone. " : ""}Conversations are recorded as text to help us serve you better.
              </p>
            </div>
          </section>

          {/* Right: what the agent is doing */}
          <aside className="card card-pad stack" style={{ gap: 8 }}>
            <div className="row">
              <div className="card-title"><Icon name="pulse" /> Live Actions</div>
              <span className="pill pill-green right">{call.status === "connected" ? "Live" : "Ready"}</span>
            </div>
            <LiveActions live={call.live} tools={call.tools} fallbackLanguage={language === "auto" ? "en-IN" : language} />
            <div className="card-soft stack" style={{ padding: 14, gap: 8, marginTop: 8 }}>
              <div className="row" style={{ fontWeight: 700 }}><Icon name="bulb" size={16} /> Need something to try?</div>
              {SUGGESTIONS.map((s) => <button key={s} className="suggest" onClick={() => trySuggestion(s)}>“{s}”</button>)}
            </div>
            {call.live.language && <p className="faint" style={{ fontSize: 12 }}>Speaking {langName(call.live.language)}</p>}
          </aside>
        </div>
      </div>
    </div>
  );
}
