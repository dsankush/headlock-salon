import { useEffect, useState } from "react";
import { PageHead } from "./AdminLayout";
import Icon from "../components/Icon";
import { useQuery, must } from "../lib/data";
import { supabase, type AgentConfig } from "../lib/supabase";
import { LANGUAGES, dateTime } from "../lib/format";
import "../components/call.css";

type Voice = { speaker: string; gender: "female" | "male" };

const MODELS = ["gpt-4.1-mini", "gpt-4.1", "gpt-4o-mini", "gpt-4o"];

const BLANK: Omit<AgentConfig, "id" | "updated_at"> = {
  slug: "", display_name: "", is_active: true, is_default: false,
  greeting: "Greet the caller warmly from Headlocks salon with a Namaste and ask how you can help. One or two short sentences.",
  extra_instructions: "", llm_model: "gpt-4.1-mini", llm_temperature: 0.4, tts_speaker: "priya", tts_pace: 1, tts_temperature: 0.6,
  default_language: "en-IN", auto_switch_language: true, allowed_languages: Object.keys(LANGUAGES),
  allow_booking: true, allow_reschedule_cancel: true, max_call_minutes: 15,
};

function Editor({ initial, voices, onSaved, onCancel }: {
  initial: AgentConfig | null; voices: Voice[]; onSaved: () => void; onCancel: () => void;
}) {
  const [f, setF] = useState<Omit<AgentConfig, "id" | "updated_at">>(initial ?? BLANK);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => { setF(initial ?? BLANK); setMsg(null); }, [initial]);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));

  const save = async () => {
    setSaving(true);
    setMsg(null);
    const payload = { ...f, slug: f.slug.trim().toLowerCase(), display_name: f.display_name.trim() };
    if (!payload.allowed_languages.includes(payload.default_language)) payload.allowed_languages = [payload.default_language, ...payload.allowed_languages];
    try {
      if (payload.is_default) {
        // only one default agent
        await must(supabase.from("agents").update({ is_default: false }).neq("slug", payload.slug).eq("is_default", true));
      }
      if (initial) await must(supabase.from("agents").update(payload).eq("id", initial.id));
      else await must(supabase.from("agents").insert(payload));
      setMsg({ ok: true, text: "Saved. The next call uses these settings." });
      onSaved();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setSaving(false);
    }
  };

  const female = voices.filter((v) => v.gender === "female");
  const male = voices.filter((v) => v.gender === "male");

  return (
    <div className="card card-pad stack" style={{ gap: 18 }}>
      <div className="row">
        <div className="card-title">{initial ? `Edit ${initial.display_name}` : "New agent"}</div>
        <div className="right row">
          {initial && <a className="btn btn-sm" href={`/talk?agent=${initial.slug}`} target="_blank" rel="noreferrer"><Icon name="phone" size={14} /> Test</a>}
          <button className="btn btn-sm" onClick={onCancel}>Close</button>
        </div>
      </div>

      <div className="eyebrow">Identity</div>
      <div className="grid-2">
        <label className="field"><span>Name the agent introduces itself with</span>
          <input className="input" value={f.display_name} onChange={(e) => set("display_name", e.target.value)} placeholder="Riya" maxLength={40} /></label>
        <label className="field"><span>ID (letters, numbers, dashes)</span>
          <input className="input" value={f.slug} disabled={Boolean(initial)} onChange={(e) => set("slug", e.target.value)} placeholder="riya" />
          <small>Used in links: /talk?agent={f.slug || "riya"}</small></label>
      </div>
      <label className="field"><span>Greeting instruction</span>
        <textarea className="textarea" value={f.greeting} onChange={(e) => set("greeting", e.target.value)} maxLength={600} />
        <small>Tell the agent how to open the call. It writes the actual words in the caller's language.</small></label>
      <label className="field"><span>Extra instructions</span>
        <textarea className="textarea" value={f.extra_instructions} onChange={(e) => set("extra_instructions", e.target.value)} maxLength={4000}
          placeholder="e.g. Mention our Diwali offer: 20% off hair spa until 5 November." />
        <small>Offers, policies, tone. Added on top of the built-in booking rules.</small></label>

      <div className="eyebrow">Voice</div>
      <div className="grid-2">
        <label className="field"><span>Voice</span>
          <select className="select" value={f.tts_speaker} onChange={(e) => set("tts_speaker", e.target.value)}>
            <optgroup label="Female">{female.map((v) => <option key={v.speaker} value={v.speaker}>{v.speaker}</option>)}</optgroup>
            <optgroup label="Male">{male.map((v) => <option key={v.speaker} value={v.speaker}>{v.speaker}</option>)}</optgroup>
          </select></label>
        <label className="field"><span>Speaking speed: {Number(f.tts_pace).toFixed(2)}×</span>
          <input type="range" min={0.5} max={2} step={0.05} value={f.tts_pace} onChange={(e) => set("tts_pace", Number(e.target.value))} /></label>
        <label className="field"><span>Expressiveness: {Number(f.tts_temperature).toFixed(2)}</span>
          <input type="range" min={0.1} max={1.2} step={0.05} value={f.tts_temperature} onChange={(e) => set("tts_temperature", Number(e.target.value))} />
          <small>Lower is steadier, higher is livelier.</small></label>
      </div>

      <div className="eyebrow">Languages</div>
      <div className="grid-2">
        <label className="field"><span>Starts in</span>
          <select className="select" value={f.default_language} onChange={(e) => set("default_language", e.target.value)}>
            {Object.entries(LANGUAGES).map(([c, n]) => <option key={c} value={c}>{n}</option>)}
          </select></label>
        <label className="check" style={{ alignSelf: "end", paddingBottom: 10 }}>
          <input type="checkbox" checked={f.auto_switch_language} onChange={(e) => set("auto_switch_language", e.target.checked)} />
          Switch automatically to the caller's language</label>
      </div>
      <div className="row wrap" style={{ gap: 14 }}>
        {Object.entries(LANGUAGES).map(([c, n]) => (
          <label key={c} className="check">
            <input type="checkbox" checked={f.allowed_languages.includes(c)}
              onChange={(e) => set("allowed_languages", e.target.checked ? [...f.allowed_languages, c] : f.allowed_languages.filter((x) => x !== c))} />
            {n}
          </label>
        ))}
      </div>

      <div className="eyebrow">What it may do</div>
      <div className="row wrap" style={{ gap: 20 }}>
        <label className="check"><input type="checkbox" checked={f.allow_booking} onChange={(e) => set("allow_booking", e.target.checked)} /> Book appointments</label>
        <label className="check"><input type="checkbox" checked={f.allow_reschedule_cancel} onChange={(e) => set("allow_reschedule_cancel", e.target.checked)} /> Reschedule &amp; cancel</label>
        <label className="check"><input type="checkbox" checked={f.is_active} onChange={(e) => set("is_active", e.target.checked)} /> Active</label>
        <label className="check"><input type="checkbox" checked={f.is_default} onChange={(e) => set("is_default", e.target.checked)} /> Default agent (website &amp; phone)</label>
      </div>
      <div className="grid-2">
        <label className="field"><span>Max call length (minutes)</span>
          <input className="input" type="number" min={2} max={60} value={f.max_call_minutes} onChange={(e) => set("max_call_minutes", Number(e.target.value))} /></label>
      </div>

      <div className="eyebrow">AI model</div>
      <div className="grid-2">
        <label className="field"><span>OpenAI model</span>
          <input className="input" list="models" value={f.llm_model} onChange={(e) => set("llm_model", e.target.value)} />
          <datalist id="models">{MODELS.map((m) => <option key={m} value={m} />)}</datalist></label>
        <label className="field"><span>Creativity: {Number(f.llm_temperature).toFixed(2)}</span>
          <input type="range" min={0} max={1} step={0.05} value={f.llm_temperature} onChange={(e) => set("llm_temperature", Number(e.target.value))} />
          <small>Keep low (0.2–0.5) for reliable bookings.</small></label>
      </div>

      {msg && <div className={msg.ok ? "ok-box" : "error-box"}>{msg.text}</div>}
      <div className="row">
        <button className="btn btn-primary" disabled={saving || !f.display_name.trim() || !/^[a-z0-9-]{2,40}$/.test(f.slug.trim().toLowerCase())} onClick={save}>
          {saving ? "Saving…" : "Save settings"}
        </button>
        <span className="faint" style={{ fontSize: 13 }}>No redeploy needed: changes apply from the next call.</span>
      </div>
    </div>
  );
}

export default function Agents() {
  const agents = useQuery(async () => (await must(supabase.from("agents").select("*").order("created_at"))) as AgentConfig[]);
  const voices = useQuery(async () => (await must(supabase.from("tts_voices").select("speaker,gender").order("speaker"))) as Voice[]);
  const [editing, setEditing] = useState<AgentConfig | null | "new">(null);

  useEffect(() => {
    if (editing === null && agents.data?.length) setEditing(agents.data.find((a) => a.is_default) ?? agents.data[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agents.data]);

  return (
    <div>
      <PageHead title="Agent settings" sub="Name, voice, languages, instructions and permissions for your voice agents.">
        <button className="btn btn-primary" onClick={() => setEditing("new")}><Icon name="sparkle" size={16} /> New agent</button>
      </PageHead>
      {agents.error && <div className="error-box">{agents.error}</div>}
      <div className="row wrap" style={{ gap: 12, marginBottom: 16 }}>
        {(agents.data ?? []).map((a) => (
          <button key={a.id} className="live-call-card" style={{ width: 240 }}
            aria-current={editing !== "new" && editing?.id === a.id} onClick={() => setEditing(a)}>
            <div className="row"><div className="avatar-orb" style={{ width: 36, height: 36 }} /><b>{a.display_name}</b>
              {a.is_default && <span className="pill pill-green right">default</span>}</div>
            <div className="faint" style={{ fontSize: 13, marginTop: 6 }}>{a.tts_speaker} · {a.tts_pace}× · {a.is_active ? "active" : "off"}</div>
            <div className="faint" style={{ fontSize: 12 }}>Updated {dateTime(a.updated_at)}</div>
          </button>
        ))}
      </div>
      {editing && (
        <Editor initial={editing === "new" ? null : editing} voices={voices.data ?? []}
          onSaved={() => agents.reload()} onCancel={() => setEditing(null)} />
      )}
    </div>
  );
}
