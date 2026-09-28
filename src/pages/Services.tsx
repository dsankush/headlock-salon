import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Icon from "../components/Icon";
import { useMenu } from "../lib/data";
import { rupees } from "../lib/format";

const TABS = [
  { key: "female", label: "Women" },
  { key: "male", label: "Men" },
  { key: "unisex", label: "Beauty & Spa" },
  { key: "kids", label: "Kids" },
] as const;

export default function Services() {
  const menu = useMenu();
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("female");
  const [q, setQ] = useState("");

  const groups = useMemo(() => {
    if (!menu.data) return [];
    const needle = q.trim().toLowerCase();
    return menu.data.categories
      .filter((c) => needle || c.gender === tab)
      .map((c) => ({
        cat: c,
        items: menu.data!.services.filter((s) => s.category_id === c.id && (!needle || s.name.toLowerCase().includes(needle) || c.name.toLowerCase().includes(needle))),
      }))
      .filter((g) => g.items.length);
  }, [menu.data, tab, q]);

  return (
    <div className="container section">
      <div className="section-head">
        <div>
          <span className="eyebrow">Rate card</span>
          <h2>Services &amp; Prices</h2>
          <p className="muted">All prices include taxes. “From” prices depend on hair length and are confirmed by your stylist.</p>
        </div>
        <Link to="/talk" className="btn btn-primary"><Icon name="phone" /> Book with Riya</Link>
      </div>

      <div className="row wrap" style={{ marginBottom: 18 }}>
        <div className="segmented" role="tablist">
          {TABS.map((t) => (
            <button key={t.key} aria-pressed={!q && tab === t.key} onClick={() => { setTab(t.key); setQ(""); }}>{t.label}</button>
          ))}
        </div>
        <input className="input right" style={{ maxWidth: 280 }} placeholder="Search e.g. keratin" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {menu.loading && <div className="menu-grid">{[1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 220 }} />)}</div>}
      {menu.error && <div className="error-box">Couldn't load the menu: {menu.error}</div>}

      <div className="menu-grid">
        {groups.map(({ cat, items }) => (
          <div key={cat.id} className="card card-pad menu-cat">
            <span className="eyebrow">{cat.section}</span>
            <h3>{cat.name}</h3>
            <div>
              {items.map((s) => (
                <div key={s.id} className="menu-item">
                  <div>
                    <div style={{ fontWeight: 600 }}>{s.name}</div>
                    <div className="faint" style={{ fontSize: 13 }}>
                      ~{s.duration_min} min{s.requires_consultation ? " · consultation first" : ""}
                    </div>
                  </div>
                  <div style={{ fontWeight: 700, whiteSpace: "nowrap" }}>{rupees(s.price, s.price_type)}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      {!menu.loading && groups.length === 0 && <div className="empty">No services match “{q}”.</div>}
    </div>
  );
}
