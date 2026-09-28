import { Link } from "react-router-dom";
import Icon from "../components/Icon";
import { useSalon, WEEKDAYS, hourText } from "../lib/data";

export default function Contact() {
  const salon = useSalon();
  const today = new Date().getDay();
  const s = salon.data;
  return (
    <div className="container section">
      <div className="section-head">
        <div>
          <span className="eyebrow">We'd love to see you</span>
          <h2>Contact</h2>
        </div>
      </div>
      {salon.error && <div className="error-box">{salon.error}</div>}
      {s && (
        <div className="grid-2">
          <div className="card card-pad stack" style={{ gap: 16 }}>
            <div className="card-title"><Icon name="map" /> {s.name}</div>
            <p className="muted">{s.address}</p>
            <div className="row wrap">
              {s.phones.map((p) => <a key={p} className="btn" href={`tel:${p.replace(/[^\d+]/g, "")}`}><Icon name="phone" size={16} /> {p}</a>)}
            </div>
            <a className="btn" style={{ alignSelf: "flex-start" }} target="_blank" rel="noreferrer"
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s.address ?? s.name)}`}>Get directions</a>
            {s.cancellation_policy && <p className="faint" style={{ fontSize: 14 }}><b>Cancellations:</b> {s.cancellation_policy}</p>}
            <Link to="/talk" className="call-btn" style={{ textDecoration: "none", height: 56 }}><Icon name="phone" /> Book with Riya</Link>
          </div>
          <div className="card card-pad">
            <div className="card-title" style={{ marginBottom: 10 }}><Icon name="clock" /> Opening hours</div>
            {s.hours.map((h) => (
              <div key={h.weekday} className={`hours-row${h.weekday === today ? " today" : ""}`}>
                <span>{WEEKDAYS[h.weekday]}</span>
                <span>{h.is_closed ? "Closed" : `${hourText(h.open_time)} – ${hourText(h.close_time)}`}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
