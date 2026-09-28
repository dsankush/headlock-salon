import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import Icon from "./Icon";
import { useTheme } from "../lib/theme";
import { duration } from "../lib/format";
import "./layout.css";

type CallBadge = { active: boolean; startedAt: number | null };
const CallBadgeCtx = createContext<{ badge: CallBadge; setBadge: (b: CallBadge) => void }>({
  badge: { active: false, startedAt: null },
  setBadge: () => undefined,
});
export const useCallBadge = () => useContext(CallBadgeCtx);

export function LiveTimer({ since }: { since: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);
  return <>{duration((now - since) / 1000)}</>;
}

export function Wordmark() {
  return (
    <Link to="/" className="wordmark" aria-label="Headlocks home">
      head<span className="wordmark-accent">locks</span>
    </Link>
  );
}

export default function PublicLayout({ children }: { children?: ReactNode }) {
  const { theme, toggle } = useTheme();
  const [open, setOpen] = useState(false);
  const [badge, setBadge] = useState<CallBadge>({ active: false, startedAt: null });

  const links = [
    ["/services", "Services & Prices"],
    ["/team", "Our Team"],
    ["/talk", "Talk to Riya"],
    ["/contact", "Contact"],
  ];

  return (
    <CallBadgeCtx.Provider value={{ badge, setBadge }}>
      <header className="site-header">
        <div className="container site-header-inner">
          <Wordmark />
          {badge.active && badge.startedAt ? (
            <div className="call-badge mono"><span className="dot dot-live" /> CALL IN PROGRESS · <LiveTimer since={badge.startedAt} /></div>
          ) : (
            <nav className="site-nav hide-sm">
              {links.map(([to, label]) => <NavLink key={to} to={to}>{label}</NavLink>)}
            </nav>
          )}
          <div className="row">
            <button className="btn btn-icon" onClick={toggle} aria-label="Toggle dark mode">
              <Icon name={theme === "dark" ? "sun" : "moon"} />
            </button>
            <Link to="/talk" className="btn btn-primary hide-sm">Book now</Link>
            <button className="btn btn-ghost menu-btn" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
              <span className="hide-sm" style={{ fontWeight: 700, letterSpacing: ".04em" }}>MENU</span>
              <Icon name={open ? "close" : "menu"} />
            </button>
          </div>
        </div>
        {open && (
          <div className="menu-panel">
            <div className="container stack" style={{ padding: "16px" }}>
              {links.map(([to, label]) => (
                <NavLink key={to} to={to} onClick={() => setOpen(false)} className="menu-link">{label}</NavLink>
              ))}
              <NavLink to="/admin" onClick={() => setOpen(false)} className="menu-link faint">Staff login</NavLink>
            </div>
          </div>
        )}
      </header>
      <main>{children ?? <Outlet />}</main>
      <footer className="site-footer">
        <div className="container row wrap" style={{ justifyContent: "space-between", gap: 16 }}>
          <div>
            <Wordmark />
            <p className="faint" style={{ marginTop: 6 }}>Luxury salon · DLF Phase-1, Golf Course Road, Gurugram</p>
          </div>
          <div className="row wrap" style={{ gap: 18 }}>
            {links.map(([to, label]) => <Link key={to} to={to} className="faint">{label}</Link>)}
            <Link to="/admin" className="faint">Staff login</Link>
          </div>
        </div>
      </footer>
    </CallBadgeCtx.Provider>
  );
}
