import { useEffect, useRef } from "react";
import Icon, { type IconName } from "./Icon";
import type { AgentState, Caption, LiveState, ToolEvent } from "../lib/useAgentCall";
import { langName, timeOnly } from "../lib/format";
import "./call.css";

export function Orb({ level = 0, state }: { level?: number; state?: AgentState }) {
  const scale = 1 + Math.min(level, 1) * 0.18;
  return (
    <div className="orb-wrap">
      <div className="orb-ring" style={{ transform: `scale(${1 + Math.min(level, 1) * 0.08})` }} />
      <div className="orb" data-state={state} style={{ transform: `scale(${scale})` }} />
    </div>
  );
}

export function Wave({ level = 0 }: { level?: number }) {
  const bars = [0.5, 0.9, 0.65, 1, 0.7];
  return (
    <span className="wave" aria-hidden="true">
      {bars.map((b, i) => <i key={i} style={{ height: `${4 + Math.min(level * 3, 1) * 14 * b}px` }} />)}
    </span>
  );
}

export function Captions({ items, agentName = "Riya", callerLabel = "You" }: { items: Caption[]; agentName?: string; callerLabel?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight, behavior: "smooth" });
  }, [items]);
  const visible = items.filter((c) => c.text.trim());
  return (
    <div className="captions" ref={ref} aria-live="polite">
      {visible.map((c) => (
        <div key={c.id} className={`bubble ${c.role}${c.final ? "" : " partial"}`}>
          <div className="bubble-who">{c.role === "agent" ? agentName : callerLabel}</div>
          {c.text}
        </div>
      ))}
    </div>
  );
}

function Row({ icon, label, value }: { icon: IconName; label: string; value?: string | null }) {
  return (
    <div className="la-row">
      <div className="la-icon"><Icon name={icon} /></div>
      <div className="grow">
        <div className="la-label">{label}</div>
        <div className="la-value">{value || "—"}</div>
      </div>
    </div>
  );
}

export function LiveActions({ live, tools, idleText = "Ready for a call", fallbackLanguage }: {
  live: LiveState; tools: ToolEvent[]; idleText?: string; fallbackLanguage?: string;
}) {
  return (
    <div className="stack" style={{ gap: 4 }}>
      <Row icon="pulse" label="Status" value={live.status ?? idleText} />
      <Row icon="globe" label="Language" value={langName(live.language ?? fallbackLanguage ?? "en-IN")} />
      <Row icon="scissors" label="Service" value={live.services} />
      <Row icon="user" label="Stylist" value={live.stylist} />
      <Row icon="calendar" label="Appointment" value={live.appointment} />
      <Row icon="tag" label="Reference" value={live.reference} />
      <div className="card-title" style={{ fontSize: 15, marginTop: 14 }}><Icon name="tag" size={16} /> Tool activity</div>
      {tools.length === 0 ? (
        <p className="faint" style={{ padding: "10px 0" }}>No activity yet. Start a call or chat.</p>
      ) : (
        <div className="tool-list" style={{ paddingTop: 8 }}>
          {tools.slice(-8).map((t) => (
            <div key={t.id} className="tool-item">
              <span className="tick">{t.status === "done" ? <Icon name="check" size={13} /> : <span className="spinner" style={{ width: 12, height: 12 }} />}</span>
              <div className="grow">
                <div style={{ fontWeight: 600 }}>{t.label}</div>
                {t.detail && <div className="faint" style={{ fontSize: 13 }}>{t.detail}</div>}
              </div>
              <span className="faint mono" style={{ fontSize: 11 }}>{timeOnly(new Date(t.ts).toISOString())}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
