import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { PageHead } from "./AdminLayout";
import { useQuery } from "../lib/data";
import { supabase } from "../lib/supabase";
import { OUTCOME_LABEL, duration, inr, langName, ymd } from "../lib/format";

type Overview = {
  totals: Record<string, number>;
  calls_by_day: { day: string; calls: number; bookings: number }[];
  outcomes: Record<string, number>;
  languages: Record<string, number>;
  channels: Record<string, number>;
  calls_by_hour: { hour: number; calls: number }[];
  top_services: { name: string; bookings: number; value: number }[];
  by_stylist: { name: string; appointments: number; value: number }[];
  visits_by_weekday: { weekday: number; appointments: number }[];
};

const RANGES = [7, 30, 90] as const;
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const axis = { stroke: "var(--text-3)", fontSize: 12, tickLine: false, axisLine: false } as const;
const tooltip = { contentStyle: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, color: "var(--text)" } };

function Kpi({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="card kpi">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  );
}

function BarList({ data, format = (v: number) => String(v) }: { data: [string, number][]; format?: (v: number) => string }) {
  const max = Math.max(1, ...data.map(([, v]) => v));
  if (!data.length) return <p className="faint">No data yet.</p>;
  return (
    <div className="bar-list">
      {data.map(([k, v]) => (
        <div key={k} className="bar-row">
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{k}</span>
          <div className="bar-track"><div className="bar-fill" style={{ width: `${(v / max) * 100}%` }} /></div>
          <span style={{ textAlign: "right", fontWeight: 600 }}>{format(v)}</span>
        </div>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const [days, setDays] = useState<(typeof RANGES)[number]>(30);
  const to = new Date();
  const from = new Date(Date.now() - (days - 1) * 86400000);
  const q = useQuery<Overview>(async () => {
    const { data, error } = await supabase.rpc("analytics_overview", { p_from: ymd(from), p_to: ymd(to) });
    if (error) throw new Error(error.message);
    return data as Overview;
  }, [days]);
  const d = q.data;
  const t = d?.totals ?? {};

  return (
    <div>
      <PageHead title="Dashboard" sub="How Riya and the salon are doing.">
        <div className="segmented">
          {RANGES.map((r) => <button key={r} aria-pressed={days === r} onClick={() => setDays(r)}>{r} days</button>)}
        </div>
      </PageHead>
      {q.error && <div className="error-box">{q.error}</div>}
      {q.loading && !d && <div className="kpis">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton" style={{ height: 96 }} />)}</div>}
      {d && (
        <>
          <div className="kpis">
            <Kpi label="Conversations" value={t.calls} sub={`${t.voice_calls} voice · ${t.chats} chat · ${t.phone_calls} phone`} />
            <Kpi label="Bookings" value={t.bookings} sub={`${t.bookings_by_agent} by the agent`} />
            <Kpi label="Conversion" value={`${t.conversion_pct}%`} sub="calls that ended in a booking" />
            <Kpi label="Booked value" value={inr(t.booked_value)} sub="estimated, incl. taxes" />
            <Kpi label="Avg call length" value={duration(t.avg_call_sec)} sub={`${t.total_call_min} min total`} />
            <Kpi label="Callbacks" value={t.callbacks} sub={`${t.cancellations} cancellations`} />
            <Kpi label="New customers" value={t.new_customers} />
          </div>

          <div className="charts">
            <div className="card chart-card wide">
              <h3>Conversations and bookings per day</h3>
              <div style={{ height: 260 }}>
                <ResponsiveContainer>
                  <LineChart data={d.calls_by_day.map((r) => ({ ...r, label: r.day.slice(5) }))}>
                    <CartesianGrid stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="label" {...axis} />
                    <YAxis allowDecimals={false} {...axis} width={32} />
                    <Tooltip {...tooltip} />
                    <Legend />
                    <Line type="monotone" dataKey="calls" name="Conversations" stroke="var(--info)" strokeWidth={2.5} dot={false} />
                    <Line type="monotone" dataKey="bookings" name="Bookings" stroke="var(--accent)" strokeWidth={2.5} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="card chart-card">
              <h3>When people call (hour of day)</h3>
              <div style={{ height: 220 }}>
                <ResponsiveContainer>
                  <BarChart data={d.calls_by_hour.filter((h) => h.hour >= 7 && h.hour <= 23)}>
                    <CartesianGrid stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="hour" {...axis} tickFormatter={(h) => `${h % 12 || 12}${h < 12 ? "a" : "p"}`} />
                    <YAxis allowDecimals={false} {...axis} width={28} />
                    <Tooltip {...tooltip} labelFormatter={(h) => `${h}:00`} />
                    <Bar dataKey="calls" name="Conversations" fill="var(--accent)" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="card chart-card">
              <h3>Busiest days (appointments)</h3>
              <div style={{ height: 220 }}>
                <ResponsiveContainer>
                  <BarChart data={d.visits_by_weekday.map((w) => ({ ...w, day: DOW[w.weekday] }))}>
                    <CartesianGrid stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="day" {...axis} />
                    <YAxis allowDecimals={false} {...axis} width={28} />
                    <Tooltip {...tooltip} />
                    <Bar dataKey="appointments" name="Appointments" fill="var(--info)" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="card chart-card">
              <h3>Call outcomes</h3>
              <BarList data={Object.entries(d.outcomes).map(([k, v]) => [OUTCOME_LABEL[k] ?? k, v] as [string, number]).sort((a, b) => b[1] - a[1])} />
            </div>

            <div className="card chart-card">
              <h3>Languages spoken</h3>
              <BarList data={Object.entries(d.languages).map(([k, v]) => [langName(k), v] as [string, number]).sort((a, b) => b[1] - a[1])} />
            </div>

            <div className="card chart-card">
              <h3>Top services booked</h3>
              <BarList data={d.top_services.map((s) => [s.name, s.bookings] as [string, number])} />
            </div>

            <div className="card chart-card">
              <h3>Stylists by appointments</h3>
              <BarList data={d.by_stylist.map((s) => [s.name, s.appointments] as [string, number])} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
