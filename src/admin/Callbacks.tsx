import { useState } from "react";
import { PageHead } from "./AdminLayout";
import { useQuery, must } from "../lib/data";
import { supabase } from "../lib/supabase";
import { dateOnly, dateTime } from "../lib/format";

type Lead = {
  id: string; lead_type: string; status: string; details: string | null; event_type: string | null; event_date: string | null; created_at: string;
  customers: { name: string | null; phone: string } | null;
  services: { name: string } | null;
};

const STATUSES = ["new", "contacted", "converted", "closed"] as const;
const TYPE_LABEL: Record<string, string> = { bridal_makeup: "Bridal makeup", consultation: "Consultation", callback: "Callback" };

export default function Callbacks() {
  const [status, setStatus] = useState<string>("new");
  const q = useQuery(async () => {
    let query = supabase.from("leads").select("id,lead_type,status,details,event_type,event_date,created_at,customers(name,phone),services(name)")
      .order("created_at", { ascending: false }).limit(300);
    if (status) query = query.eq("status", status);
    return (await must(query)) as unknown as Lead[];
  }, [status]);

  const update = async (id: string, next: string) => {
    const { error } = await supabase.from("leads").update({ status: next }).eq("id", id);
    if (error) window.alert(error.message); else q.reload();
  };

  return (
    <div>
      <PageHead title="Callbacks" sub="Bridal and consultation requests, and people who asked to speak to the team.">
        <div className="segmented">
          {["", ...STATUSES].map((s) => <button key={s || "all"} aria-pressed={status === s} onClick={() => setStatus(s)}>{s || "all"}</button>)}
        </div>
      </PageHead>
      {q.error && <div className="error-box">{q.error}</div>}
      <div className="card table-wrap">
        <table className="table">
          <thead><tr><th>Requested</th><th>Customer</th><th>Type</th><th>Details</th><th>Event</th><th>Status</th></tr></thead>
          <tbody>
            {(q.data ?? []).map((l) => (
              <tr key={l.id}>
                <td style={{ whiteSpace: "nowrap" }}>{dateTime(l.created_at)}</td>
                <td>{l.customers?.name ?? "—"}<div><a href={`tel:${l.customers?.phone}`} className="faint">{l.customers?.phone}</a></div></td>
                <td><span className="pill pill-amber">{TYPE_LABEL[l.lead_type] ?? l.lead_type}</span>{l.services && <div className="faint" style={{ fontSize: 13 }}>{l.services.name}</div>}</td>
                <td className="muted" style={{ maxWidth: 360 }}>{l.details ?? "—"}</td>
                <td>{l.event_type ?? "—"}{l.event_date && <div className="faint" style={{ fontSize: 13 }}>{dateOnly(l.event_date)}</div>}</td>
                <td>
                  <select className="select" style={{ width: "auto" }} value={l.status} onChange={(e) => update(l.id, e.target.value)}>
                    {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!q.loading && (q.data ?? []).length === 0 && <div className="empty">Nothing here.</div>}
      </div>
    </div>
  );
}
