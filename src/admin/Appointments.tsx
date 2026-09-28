import { useState } from "react";
import { PageHead } from "./AdminLayout";
import { useQuery, must } from "../lib/data";
import { supabase } from "../lib/supabase";
import { dateTime, inr } from "../lib/format";

type Appt = {
  id: string; reference: string; starts_at: string; ends_at: string; status: string; source: string;
  estimated_total: number | null; notes: string | null; client_gender: string | null;
  customers: { name: string | null; phone: string } | null;
  staff: { name: string } | null;
  appointment_services: { position: number; services: { name: string } | null }[];
};

const VIEWS = { today: "Today", upcoming: "Upcoming", past: "Past", all: "All" } as const;
const STATUS_TONE: Record<string, string> = {
  booked: "pill-blue", confirmed: "pill-green", in_progress: "pill-amber", completed: "pill-green", cancelled: "pill-red", no_show: "pill-red",
};

function dayBounds() {
  const now = new Date();
  const ist = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const offset = now.getTime() - ist.getTime();
  const start = new Date(ist.getFullYear(), ist.getMonth(), ist.getDate()).getTime() + offset;
  return [new Date(start).toISOString(), new Date(start + 86400000).toISOString()];
}

export default function Appointments() {
  const [view, setView] = useState<keyof typeof VIEWS>("upcoming");
  const [busy, setBusy] = useState<string | null>(null);

  const q = useQuery(async () => {
    let query = supabase.from("appointments")
      .select("id,reference,starts_at,ends_at,status,source,estimated_total,notes,client_gender,customers(name,phone),staff(name),appointment_services(position,services(name))");
    const nowIso = new Date().toISOString();
    if (view === "today") { const [a, b] = dayBounds(); query = query.gte("starts_at", a).lt("starts_at", b).order("starts_at"); }
    else if (view === "upcoming") query = query.gte("starts_at", nowIso).order("starts_at");
    else if (view === "past") query = query.lt("starts_at", nowIso).order("starts_at", { ascending: false });
    else query = query.order("starts_at", { ascending: false });
    return (await must(query.limit(300))) as unknown as Appt[];
  }, [view]);

  const setStatus = async (a: Appt, status: string) => {
    if (status === "cancelled" && !window.confirm(`Cancel ${a.reference}?`)) return;
    setBusy(a.id);
    const { error } = await supabase.from("appointments")
      .update({ status, ...(status === "cancelled" ? { cancel_reason: "Cancelled by salon" } : {}) }).eq("id", a.id);
    setBusy(null);
    if (error) window.alert(error.message); else q.reload();
  };

  return (
    <div>
      <PageHead title="Appointments" sub="Bookings from the agent, the website and the front desk.">
        <div className="segmented">
          {Object.entries(VIEWS).map(([k, v]) => <button key={k} aria-pressed={view === k} onClick={() => setView(k as keyof typeof VIEWS)}>{v}</button>)}
        </div>
      </PageHead>
      {q.error && <div className="error-box">{q.error}</div>}
      <div className="card table-wrap">
        <table className="table">
          <thead><tr><th>Ref</th><th>When</th><th>Customer</th><th>Services</th><th>Stylist</th><th>Total</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {(q.data ?? []).map((a) => (
              <tr key={a.id}>
                <td className="mono">{a.reference}</td>
                <td style={{ whiteSpace: "nowrap" }}>{dateTime(a.starts_at)}</td>
                <td>{a.customers?.name ?? "—"}<div className="faint" style={{ fontSize: 13 }}>{a.customers?.phone}</div></td>
                <td>{a.appointment_services.sort((x, y) => x.position - y.position).map((s) => s.services?.name).join(", ")}</td>
                <td>{a.staff?.name}</td>
                <td>{inr(a.estimated_total)}</td>
                <td><span className={`pill ${STATUS_TONE[a.status] ?? ""}`}>{a.status.replace("_", " ")}</span><div className="faint" style={{ fontSize: 12 }}>{a.source.replace("_", " ")}</div></td>
                <td>
                  {["booked", "confirmed"].includes(a.status) && (
                    <div className="row" style={{ gap: 6 }}>
                      {new Date(a.starts_at) < new Date() ? (
                        <>
                          <button className="btn btn-sm" disabled={busy === a.id} onClick={() => setStatus(a, "completed")}>Done</button>
                          <button className="btn btn-sm" disabled={busy === a.id} onClick={() => setStatus(a, "no_show")}>No-show</button>
                        </>
                      ) : (
                        a.status === "booked" && <button className="btn btn-sm" disabled={busy === a.id} onClick={() => setStatus(a, "confirmed")}>Confirm</button>
                      )}
                      <button className="btn btn-sm" disabled={busy === a.id} onClick={() => setStatus(a, "cancelled")}>Cancel</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!q.loading && (q.data ?? []).length === 0 && <div className="empty">No appointments here.</div>}
      </div>
    </div>
  );
}
