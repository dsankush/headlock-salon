import { Link } from "react-router-dom";
import Icon from "../components/Icon";
import { Orb } from "../components/CallParts";
import { useSalon, WEEKDAYS, hourText } from "../lib/data";

const FEATURES = [
  { icon: "phone", title: "Book by voice, 24/7", text: "Talk to Riya on our website or phone. She checks live availability and books instantly." },
  { icon: "globe", title: "Your language", text: "English, Hindi, Tamil, Telugu, Bengali, Marathi, Kannada, Malayalam, Gujarati, Punjabi and Odia." },
  { icon: "users", title: "Expert team", text: "Senior creative stylists, barbers and beauty experts. Ask for your favourite by name." },
  { icon: "shield", title: "No double bookings", text: "Every booking is checked against real schedules and read back to you before confirming." },
] as const;

export default function Home() {
  const salon = useSalon();
  const today = new Date().getDay();
  const todayHours = salon.data?.hours.find((h) => h.weekday === today);

  return (
    <div className="container">
      <section className="hero">
        <div className="stack" style={{ gap: 20 }}>
          <span className="eyebrow">Luxury salon · Golf Course Road, Gurugram</span>
          <h1>Look your best.<br /><em>Book in seconds.</em></h1>
          <p className="muted" style={{ fontSize: 18, maxWidth: 560 }}>
            Hair, colour, spa, beauty, nails and bridal makeup at Headlocks. Talk to Riya, our AI receptionist, in any
            Indian language to find a time that suits you.
          </p>
          <div className="row wrap">
            <Link to="/talk" className="btn btn-primary" style={{ height: 50, padding: "0 24px" }}><Icon name="phone" /> Talk to Riya</Link>
            <Link to="/services" className="btn" style={{ height: 50, padding: "0 24px" }}>See prices</Link>
          </div>
          {todayHours && (
            <p className="faint row"><Icon name="clock" size={16} />
              Today: {todayHours.is_closed ? "Closed" : `${hourText(todayHours.open_time)} – ${hourText(todayHours.close_time)}`}
            </p>
          )}
        </div>
        <div className="card hero-card">
          <Orb level={0.2} />
          <div>
            <div style={{ fontWeight: 800, fontSize: 22 }}>Hi, I'm Riya</div>
            <p className="muted">Ask me about services, prices or open slots, or book, move or cancel an appointment.</p>
          </div>
          <Link to="/talk" className="call-btn" style={{ textDecoration: "none" }}><Icon name="phone" /> Start Voice Call</Link>
        </div>
      </section>

      <section className="section">
        <div className="features">
          {FEATURES.map((f) => (
            <div key={f.title} className="card feature">
              <div className="la-icon"><Icon name={f.icon} /></div>
              <h3>{f.title}</h3>
              <p className="muted">{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      {salon.data && (
        <section className="section">
          <div className="grid-2">
            <div className="card card-pad">
              <div className="card-title" style={{ marginBottom: 10 }}><Icon name="clock" /> Opening hours</div>
              {salon.data.hours.map((h) => (
                <div key={h.weekday} className={`hours-row${h.weekday === today ? " today" : ""}`}>
                  <span>{WEEKDAYS[h.weekday]}</span>
                  <span>{h.is_closed ? "Closed" : `${hourText(h.open_time)} – ${hourText(h.close_time)}`}</span>
                </div>
              ))}
            </div>
            <div className="card card-pad stack">
              <div className="card-title"><Icon name="map" /> Visit us</div>
              <p className="muted">{salon.data.address}</p>
              <div className="row wrap">
                {salon.data.phones.map((p) => <a key={p} className="btn btn-sm" href={`tel:${p.replace(/[^\d+]/g, "")}`}><Icon name="phone" size={15} /> {p}</a>)}
              </div>
              <a className="btn btn-sm" style={{ alignSelf: "flex-start" }} target="_blank" rel="noreferrer"
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(salon.data.address ?? "Headlocks Gurugram")}`}>
                Open in Google Maps
              </a>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
