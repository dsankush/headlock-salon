import { Link } from "react-router-dom";
import Icon from "../components/Icon";
import { useTeam } from "../lib/data";
import { ROLE_LABEL } from "../lib/format";

const ROLE_BLURB: Record<string, string> = {
  senior_creative_stylist: "Cuts, colour and treatments for ladies and gents, plus makeup.",
  senior_stylist: "Ladies' cuts, colour, spa, facials and nails.",
  hair_dresser: "Gents' cuts, beard, shave and grooming.",
  beautician: "Waxing, threading, facials, nails and makeup.",
};

export default function Team() {
  const team = useTeam();
  return (
    <div className="container section">
      <div className="section-head">
        <div>
          <span className="eyebrow">The people behind your look</span>
          <h2>Our Team</h2>
        </div>
        <Link to="/talk" className="btn btn-primary"><Icon name="phone" /> Book your favourite</Link>
      </div>
      {team.error && <div className="error-box">{team.error}</div>}
      <div className="team-grid">
        {(team.data ?? []).map((s) => (
          <div key={s.id} className="card team-card">
            <div className="monogram">{s.name[0]}</div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 19 }}>{s.name}</div>
              <div className="pill pill-green" style={{ marginTop: 6 }}>{ROLE_LABEL[s.role] ?? s.role}</div>
            </div>
            <p className="muted" style={{ fontSize: 14 }}>{ROLE_BLURB[s.role] ?? ""}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
