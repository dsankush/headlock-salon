import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import Icon, { type IconName } from "../components/Icon";
import { Wordmark } from "../components/PublicLayout";
import { supabase, supabaseConfigured } from "../lib/supabase";
import { useTheme } from "../lib/theme";
import "./admin.css";

const NAV: [string, string, IconName][] = [
  ["/admin", "Dashboard", "chart"],
  ["/admin/live", "Live calls", "headphones"],
  ["/admin/calls", "Call logs", "list"],
  ["/admin/appointments", "Appointments", "calendar"],
  ["/admin/customers", "Customers", "users"],
  ["/admin/callbacks", "Callbacks", "phone"],
  ["/admin/agents", "Agent settings", "sparkle"],
  ["/admin/integrations", "Webhook & WhatsApp", "webhook"],
];

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="admin-login">
      <form className="card card-pad stack" style={{ width: "100%", maxWidth: 380, gap: 16 }}
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setErr(null);
          const { error } = await supabase.auth.signInWithPassword({ email, password });
          if (error) setErr(error.message);
          setBusy(false);
        }}>
        <Wordmark />
        <div>
          <h2 style={{ fontSize: 22 }}>Staff login</h2>
          <p className="muted">Use the admin account created in Supabase.</p>
        </div>
        {!supabaseConfigured && <div className="error-box">Supabase keys are missing. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.</div>}
        <label className="field"><span>Email</span><input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" /></label>
        <label className="field"><span>Password</span><input className="input" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" /></label>
        {err && <div className="error-box">{err}</div>}
        <button className="btn btn-primary" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
      </form>
    </div>
  );
}

export default function AdminLayout() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [navOpen, setNavOpen] = useState(false);
  const { theme, toggle } = useTheme();
  const loc = useLocation();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) { setIsAdmin(null); return; }
    supabase.rpc("is_admin").then(({ data }) => setIsAdmin(Boolean(data)));
  }, [session]);

  useEffect(() => setNavOpen(false), [loc.pathname]);

  if (session === undefined) return <div className="admin-login"><div className="spinner" /></div>;
  if (!session) return <Login />;
  if (isAdmin === null) return <div className="admin-login"><div className="spinner" /></div>;
  if (!isAdmin)
    return (
      <div className="admin-login">
        <div className="card card-pad stack" style={{ maxWidth: 420 }}>
          <h2 style={{ fontSize: 22 }}>No admin access</h2>
          <p className="muted">{session.user.email} is signed in but isn't an admin yet. Ask the owner to add this account to <span className="kbd">admin_users</span>.</p>
          <button className="btn" onClick={() => supabase.auth.signOut()}>Sign out</button>
        </div>
      </div>
    );

  return (
    <div className="admin-shell">
      <aside className={`admin-side${navOpen ? " open" : ""}`}>
        <div className="row" style={{ padding: "4px 8px 18px" }}>
          <Wordmark />
          <span className="pill right">Admin</span>
        </div>
        <nav className="stack" style={{ gap: 2 }}>
          {NAV.map(([to, label, icon]) => (
            <NavLink key={to} to={to} end={to === "/admin"} className="admin-link"><Icon name={icon} /> {label}</NavLink>
          ))}
        </nav>
        <div className="stack" style={{ marginTop: "auto", gap: 6, paddingTop: 16 }}>
          <NavLink to="/talk" className="admin-link" target="_blank"><Icon name="phone" /> Test the agent</NavLink>
          <button className="admin-link" onClick={toggle}><Icon name={theme === "dark" ? "sun" : "moon"} /> {theme === "dark" ? "Light" : "Dark"} mode</button>
          <button className="admin-link" onClick={() => supabase.auth.signOut()}><Icon name="logout" /> Sign out</button>
          <p className="faint" style={{ fontSize: 12, padding: "0 10px" }}>{session.user.email}</p>
        </div>
      </aside>
      <div className="admin-main">
        <div className="admin-topbar">
          <button className="btn btn-icon admin-burger" onClick={() => setNavOpen((o) => !o)} aria-label="Menu"><Icon name={navOpen ? "close" : "menu"} /></button>
          <Wordmark />
        </div>
        <Outlet />
      </div>
    </div>
  );
}

export function PageHead({ title, sub, children }: { title: string; sub?: string; children?: React.ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {sub && <p className="muted">{sub}</p>}
      </div>
      {children && <div className="row wrap">{children}</div>}
    </div>
  );
}
