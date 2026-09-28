import { useState } from "react";
import { PageHead } from "./AdminLayout";
import Icon from "../components/Icon";
import { useQuery, must } from "../lib/data";
import { supabase, type CallLog } from "../lib/supabase";
import { OUTCOME_LABEL, dateTime, duration, langName, outcomeTone, secondsBetween } from "../lib/format";

type Row = CallLog & { appointments: { reference: string } | null; agents: { display_name: string } | null };

export default function CallLogs() {
  const [outcome, setOutcome] = useState("");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<Row | null>(null);

  const q = useQuery(async () => {
    let query = supabase.from("call_logs")
      .select("*, appointments(reference), agents(display_name)")
      .order("started_at", { ascending: false }).limit(200);
    if (outcome) query = query.eq("outcome", outcome);
    if (search.trim()) query = query.ilike("caller_phone", `%${search.trim().replace(/\D/g, "")}%`);
    return (await must(query)) as Row[];
  }, [outcome, search]);

  return (
    <div>
      <PageHead title="Call logs" sub="Every call and chat, with transcript and summary." />
      <div className="filters">
        <select className="select" value={outcome} onChange={(e) => setOutcome(e.target.value)}>
          <option value="">All outcomes</option>
          {Object.entries(OUTCOME_LABEL).filter(([k]) => k !== "in_progress").map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <input className="input" placeholder="Search phone number" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      {q.error && <div className="error-box">{q.error}</div>}
      <div className="card table-wrap">
        <table className="table">
          <thead><tr><th>When</th><th>Caller</th><th>Channel</th><th>Language</th><th>Length</th><th>Outcome</th><th>Summary</th></tr></thead>
          <tbody>
            {(q.data ?? []).map((c) => (
              <tr key={c.id} className="clickable" onClick={() => setOpen(c)}>
                <td style={{ whiteSpace: "nowrap" }}>{dateTime(c.started_at)}</td>
                <td>{c.caller_phone ?? <span className="faint">unknown</span>}</td>
                <td><span className="pill">{c.channel === "phone" ? "Phone" : "Web"} · {c.mode}</span></td>
                <td>{langName(c.language)}</td>
                <td className="mono">{c.ended_at ? duration(secondsBetween(c.started_at, c.ended_at)) : <span className="pill pill-green">live</span>}</td>
                <td><span className={`pill ${outcomeTone(c.outcome)}`}>{OUTCOME_LABEL[c.outcome ?? "in_progress"] ?? c.outcome}</span></td>
                <td className="muted" style={{ maxWidth: 380 }}>{c.summary ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!q.loading && (q.data ?? []).length === 0 && <div className="empty">No calls yet.</div>}
      </div>

      {open && (
        <>
          <div className="drawer-backdrop" onClick={() => setOpen(null)} />
          <div className="drawer stack" role="dialog" aria-label="Call details">
            <div className="row">
              <h2 style={{ fontSize: 22 }}>{open.caller_phone ?? "Website visitor"}</h2>
              <button className="btn btn-icon right" onClick={() => setOpen(null)} aria-label="Close"><Icon name="close" /></button>
            </div>
            <div className="row wrap">
              <span className={`pill ${outcomeTone(open.outcome)}`}>{OUTCOME_LABEL[open.outcome ?? "in_progress"]}</span>
              <span className="pill">{open.channel} · {open.mode}</span>
              <span className="pill pill-blue">{langName(open.language)}</span>
              {open.agents && <span className="pill">{open.agents.display_name}</span>}
              {open.appointments && <span className="pill pill-green">{open.appointments.reference}</span>}
            </div>
            <p className="faint">{dateTime(open.started_at)}{open.ended_at ? ` · ${duration(secondsBetween(open.started_at, open.ended_at))}` : ""}</p>
            {open.summary && <div className="card-soft" style={{ padding: 14 }}><b>Summary</b><p className="muted">{open.summary}</p></div>}
            <div className="card-title" style={{ fontSize: 15 }}>Transcript</div>
            <div className="transcript">
              {(open.transcript ?? []).map((m, i) => (
                <div key={i} className={`bubble ${m.role === "assistant" ? "agent" : "user"}`}>
                  <div className="bubble-who">{m.role === "assistant" ? open.agents?.display_name ?? "Agent" : "Caller"}</div>
                  {m.text}
                </div>
              ))}
              {(open.transcript ?? []).length === 0 && <p className="faint">No transcript.</p>}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
