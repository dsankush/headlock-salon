import { useState } from "react";
import { PageHead } from "./AdminLayout";
import { useQuery, must } from "../lib/data";
import { supabase } from "../lib/supabase";
import { dateOnly, dateTime, langName } from "../lib/format";

type Cust = {
  id: string; name: string | null; phone: string; preferred_language: string | null; created_at: string; notes: string | null;
  appointments: { starts_at: string; status: string }[];
};

export default function Customers() {
  const [search, setSearch] = useState("");
  const q = useQuery(async () => {
    let query = supabase.from("customers")
      .select("id,name,phone,preferred_language,created_at,notes,appointments(starts_at,status)")
      .order("created_at", { ascending: false }).limit(300);
    const s = search.trim();
    if (s) query = /\d/.test(s) ? query.ilike("phone", `%${s.replace(/\D/g, "")}%`) : query.ilike("name", `%${s}%`);
    return (await must(query)) as Cust[];
  }, [search]);

  return (
    <div>
      <PageHead title="Customers" sub="Everyone who has booked or asked for a callback." />
      <div className="filters">
        <input className="input" placeholder="Search name or phone" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      {q.error && <div className="error-box">{q.error}</div>}
      <div className="card table-wrap">
        <table className="table">
          <thead><tr><th>Name</th><th>Phone</th><th>Language</th><th>Visits</th><th>Next / last</th><th>Since</th></tr></thead>
          <tbody>
            {(q.data ?? []).map((c) => {
              const active = c.appointments.filter((a) => a.status !== "cancelled");
              const upcoming = active.filter((a) => new Date(a.starts_at) > new Date()).sort((a, b) => a.starts_at.localeCompare(b.starts_at))[0];
              const last = active.filter((a) => new Date(a.starts_at) <= new Date()).sort((a, b) => b.starts_at.localeCompare(a.starts_at))[0];
              return (
                <tr key={c.id}>
                  <td style={{ fontWeight: 600 }}>{c.name ?? "—"}</td>
                  <td><a href={`tel:${c.phone}`}>{c.phone}</a></td>
                  <td>{langName(c.preferred_language)}</td>
                  <td>{active.length}</td>
                  <td>{upcoming ? <span className="pill pill-green">Next: {dateTime(upcoming.starts_at)}</span> : last ? <span className="faint">Last: {dateTime(last.starts_at)}</span> : "—"}</td>
                  <td className="faint">{dateOnly(c.created_at)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!q.loading && (q.data ?? []).length === 0 && <div className="empty">No customers yet.</div>}
      </div>
    </div>
  );
}
