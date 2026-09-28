import { Fragment, useEffect, useState } from "react";
import { PageHead } from "./AdminLayout";
import Icon from "../components/Icon";
import { useQuery, must } from "../lib/data";
import { supabase } from "../lib/supabase";
import { dateTime } from "../lib/format";

type Integration = {
  webhook_enabled: boolean; webhook_url: string | null; webhook_secret: string; webhook_events: string[]; reminder_hours_before: number;
};
type Delivery = { id: number; event: string; created_at: string; status_code: number | null; error: string | null; payload: unknown };

const EVENTS: [string, string][] = [
  ["appointment.booked", "Appointment booked"],
  ["appointment.rescheduled", "Appointment rescheduled"],
  ["appointment.cancelled", "Appointment cancelled"],
  ["appointment.completed", "Appointment completed"],
  ["appointment.reminder", "Reminder before appointment"],
  ["callback.requested", "Callback requested"],
  ["call.ended", "Call ended (summary)"],
];

export default function Integrations() {
  const cfg = useQuery(async () => (await must(supabase.from("integrations").select("*").eq("id", 1).single())) as Integration);
  const log = useQuery(async () => (await must(supabase.rpc("webhook_log", { p_limit: 30 }))) as Delivery[]);
  const [f, setF] = useState<Integration | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [showSecret, setShowSecret] = useState(false);
  const [openRow, setOpenRow] = useState<number | null>(null);
  useEffect(() => { if (cfg.data) setF(cfg.data); }, [cfg.data]);

  const save = async (patch?: Partial<Integration>) => {
    if (!f) return;
    const next = { ...f, ...patch };
    const { error } = await supabase.from("integrations").update({
      webhook_enabled: next.webhook_enabled, webhook_url: next.webhook_url?.trim() || null,
      webhook_events: next.webhook_events, reminder_hours_before: next.reminder_hours_before,
      ...(patch?.webhook_secret ? { webhook_secret: patch.webhook_secret } : {}),
    }).eq("id", 1);
    setMsg(error ? { ok: false, text: error.message } : { ok: true, text: "Saved." });
    if (!error) cfg.reload();
  };

  const test = async () => {
    const { error } = await supabase.rpc("send_test_webhook");
    setMsg(error ? { ok: false, text: error.message } : { ok: true, text: "Test sent. It appears in the log below within a few seconds." });
    window.setTimeout(log.reload, 3000);
  };

  const rotate = () => {
    if (!window.confirm("Generate a new secret? Your receiver must be updated to use it.")) return;
    const bytes = crypto.getRandomValues(new Uint8Array(24));
    void save({ webhook_secret: Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("") });
  };

  return (
    <div className="stack" style={{ gap: 18 }}>
      <PageHead title="Webhook & WhatsApp" sub="Send bookings, reminders and call summaries to your own system (e.g. to trigger WhatsApp messages)." />
      {cfg.error && <div className="error-box">{cfg.error}</div>}
      {f && (
        <div className="card card-pad stack" style={{ gap: 16 }}>
          <label className="check"><input type="checkbox" checked={f.webhook_enabled} onChange={(e) => setF({ ...f, webhook_enabled: e.target.checked })} /> <b>Send webhooks</b></label>
          <label className="field"><span>Webhook URL (https)</span>
            <input className="input" value={f.webhook_url ?? ""} onChange={(e) => setF({ ...f, webhook_url: e.target.value })} placeholder="https://your-server.com/headlocks/webhook" /></label>
          <div className="field"><span>Events</span>
            <div className="row wrap" style={{ gap: 16 }}>
              {EVENTS.map(([k, label]) => (
                <label key={k} className="check">
                  <input type="checkbox" checked={f.webhook_events.includes(k)}
                    onChange={(e) => setF({ ...f, webhook_events: e.target.checked ? [...f.webhook_events, k] : f.webhook_events.filter((x) => x !== k) })} />
                  {label}
                </label>
              ))}
            </div>
          </div>
          <label className="field" style={{ maxWidth: 260 }}><span>Send reminder this many hours before</span>
            <input className="input" type="number" min={1} max={48} value={f.reminder_hours_before} onChange={(e) => setF({ ...f, reminder_hours_before: Number(e.target.value) })} /></label>
          <div className="field"><span>Signing secret</span>
            <div className="secret">{showSecret ? f.webhook_secret : "•".repeat(24)}</div>
            <div className="row">
              <button className="btn btn-sm" onClick={() => setShowSecret((s) => !s)}>{showSecret ? "Hide" : "Show"}</button>
              <button className="btn btn-sm" onClick={() => navigator.clipboard.writeText(f.webhook_secret)}><Icon name="copy" size={14} /> Copy</button>
              <button className="btn btn-sm" onClick={rotate}>Regenerate</button>
            </div>
            <small>Every request has header <span className="kbd">X-Headlocks-Signature: sha256=…</span>: an HMAC-SHA256 of the raw body with this secret.</small>
          </div>
          {msg && <div className={msg.ok ? "ok-box" : "error-box"}>{msg.text}</div>}
          <div className="row">
            <button className="btn btn-primary" onClick={() => save()}>Save</button>
            <button className="btn" onClick={test} disabled={!f.webhook_enabled || !f.webhook_url}>Send test</button>
          </div>
        </div>
      )}

      <div className="card card-pad">
        <div className="row" style={{ marginBottom: 10 }}>
          <div className="card-title">Recent deliveries</div>
          <button className="btn btn-sm right" onClick={log.reload}><Icon name="reset" size={14} /> Refresh</button>
        </div>
        {log.error && <div className="error-box">{log.error}</div>}
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>When</th><th>Event</th><th>Result</th><th></th></tr></thead>
            <tbody>
              {(log.data ?? []).map((d) => (
                <Fragment key={d.id}>
                  <tr>
                    <td>{dateTime(d.created_at)}</td>
                    <td className="mono">{d.event}</td>
                    <td>{d.status_code ? <span className={`pill ${d.status_code < 300 ? "pill-green" : "pill-red"}`}>{d.status_code}</span> : <span className="pill pill-amber">{d.error ?? "pending"}</span>}</td>
                    <td><button className="btn btn-sm" onClick={() => setOpenRow(openRow === d.id ? null : d.id)}>{openRow === d.id ? "Hide" : "Payload"}</button></td>
                  </tr>
                  {openRow === d.id && <tr><td colSpan={4}><pre className="code">{JSON.stringify(d.payload, null, 2)}</pre></td></tr>}
                </Fragment>
              ))}
            </tbody>
          </table>
          {!log.loading && (log.data ?? []).length === 0 && <div className="empty">No webhooks sent yet.</div>}
        </div>
      </div>
    </div>
  );
}
