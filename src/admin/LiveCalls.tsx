import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHead } from "./AdminLayout";
import Icon from "../components/Icon";
import { Captions, LiveActions, Orb } from "../components/CallParts";
import { LiveTimer } from "../components/PublicLayout";
import { supabase, type CallLog } from "../lib/supabase";
import { useAgentCall, type Caption, type LiveState } from "../lib/useAgentCall";
import { getMonitorToken } from "../lib/api";
import { langName } from "../lib/format";

const STALE_MS = 90_000;

export default function LiveCalls() {
  const [calls, setCalls] = useState<CallLog[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const monitor = useAgentCall({ role: "monitor" });

  const load = useCallback(async () => {
    const since = new Date(Date.now() - STALE_MS).toISOString();
    const { data, error } = await supabase
      .from("call_logs")
      .select("*")
      .is("ended_at", null)
      .gte("last_activity_at", since)
      .order("started_at", { ascending: false });
    if (error) setError(error.message);
    else setCalls((data ?? []) as CallLog[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    // Realtime: the agent updates its call row every few seconds.
    const ch = supabase
      .channel("live-calls")
      .on("postgres_changes", { event: "*", schema: "public", table: "call_logs" }, () => void load())
      .subscribe();
    const t = window.setInterval(load, 15_000);
    return () => { void supabase.removeChannel(ch); window.clearInterval(t); };
  }, [load]);

  const selected = useMemo(() => calls.find((c) => c.id === selectedId) ?? calls[0] ?? null, [calls, selectedId]);
  const listening = monitor.status === "connected" && monitor.roomName === selected?.room_name;

  // Leave the room if the call we're listening to has ended.
  useEffect(() => {
    if (monitor.status === "connected" && !calls.some((c) => c.room_name === monitor.roomName)) void monitor.disconnect();
  }, [calls, monitor]);

  const dbCaptions: Caption[] = (selected?.transcript ?? []).map((m, i) => ({
    id: `db-${i}`, role: m.role === "assistant" ? "agent" : "user", text: m.text, final: true, ts: i,
  }));
  const live: LiveState = listening ? monitor.live : (selected?.live_state ?? {});

  return (
    <div>
      <PageHead title="Live calls" sub="Calls happening right now. Listen in silently — the caller and agent can't hear you.">
        <span className="pill pill-green"><span className="dot dot-live" /> {calls.length} live</span>
      </PageHead>
      {error && <div className="error-box">{error}</div>}

      <div className="live-grid">
        <div className="card card-pad stack" style={{ gap: 10 }}>
          <div className="card-title">Now</div>
          {loading && <div className="skeleton" style={{ height: 80 }} />}
          {!loading && calls.length === 0 && <div className="empty">No calls right now. They appear here the moment someone calls or chats.</div>}
          {calls.map((c) => (
            <button key={c.id} className="live-call-card" aria-current={selected?.id === c.id} onClick={() => setSelectedId(c.id)}>
              <div className="row">
                <span className="dot dot-live" />
                <b>{c.live_state?.customer || c.caller_phone || "Website visitor"}</b>
                <span className="mono faint right" style={{ fontSize: 13 }}><LiveTimer since={new Date(c.started_at).getTime()} /></span>
              </div>
              <div className="row wrap" style={{ gap: 6, marginTop: 8 }}>
                <span className="pill">{c.channel === "phone" ? "Phone" : "Website"} · {c.mode}</span>
                <span className="pill pill-blue">{langName(c.language)}</span>
                {c.live_state?.status && <span className="pill pill-green">{c.live_state.status}</span>}
              </div>
              {c.transcript?.length > 0 && (
                <p className="faint" style={{ fontSize: 13, marginTop: 8, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  “{c.transcript[c.transcript.length - 1].text}”
                </p>
              )}
            </button>
          ))}
        </div>

        <section className="card talk-center" style={{ minHeight: 520 }}>
          {!selected ? (
            <div className="talk-stage"><Orb level={0.05} /><h2>Waiting for calls</h2><p className="muted">This page updates by itself.</p></div>
          ) : (
            <>
              <div className="row" style={{ padding: "16px 18px 0" }}>
                <div className="card-title">{selected.live_state?.customer || selected.caller_phone || "Website visitor"}</div>
                <span className="faint mono">{selected.room_name}</span>
                <div className="right row">
                  {listening ? (
                    <button className="btn btn-sm btn-danger" onClick={() => monitor.disconnect()}><Icon name="close" size={14} /> Stop listening</button>
                  ) : (
                    <button className="btn btn-sm btn-accent" disabled={!selected.room_name || monitor.status === "connecting"}
                      onClick={() => monitor.connect(() => getMonitorToken(selected.room_name!))}>
                      <Icon name="headphones" size={15} /> {monitor.status === "connecting" ? "Joining…" : "Listen live"}
                    </button>
                  )}
                </div>
              </div>
              {monitor.error && <div className="error-box" style={{ margin: 12 }}>{monitor.error}</div>}
              {listening && (
                <div className="row" style={{ justifyContent: "center", paddingTop: 6 }}>
                  <div style={{ transform: "scale(.4)", margin: "-58px 0" }}><Orb level={Math.max(monitor.levels.agent, monitor.levels.user)} state={monitor.agentState} /></div>
                </div>
              )}
              <Captions items={listening && monitor.captions.length ? monitor.captions : dbCaptions}
                agentName={selected.live_state?.agent ?? "Agent"} callerLabel="Caller" />
              <p className="faint" style={{ padding: "0 18px 14px", fontSize: 13 }}>
                {listening ? "Live audio and captions." : "Transcript refreshes every few seconds. Press “Listen live” for audio and instant captions."}
              </p>
            </>
          )}
        </section>

        <aside className="card card-pad">
          <div className="card-title" style={{ marginBottom: 8 }}><Icon name="pulse" /> Live actions</div>
          <LiveActions live={live} tools={listening ? monitor.tools : []} idleText="—" fallbackLanguage={selected?.language ?? undefined} />
        </aside>
      </div>
    </div>
  );
}
