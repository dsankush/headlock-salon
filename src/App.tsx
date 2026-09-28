import { lazy, Suspense } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import PublicLayout from "./components/PublicLayout";
import Home from "./pages/Home";
import Services from "./pages/Services";
import Team from "./pages/Team";
import Contact from "./pages/Contact";

const Talk = lazy(() => import("./pages/Talk"));
// Admin is loaded only when visited, so the public site stays light.
const AdminLayout = lazy(() => import("./admin/AdminLayout"));
const Dashboard = lazy(() => import("./admin/Dashboard"));
const LiveCalls = lazy(() => import("./admin/LiveCalls"));
const CallLogs = lazy(() => import("./admin/CallLogs"));
const Appointments = lazy(() => import("./admin/Appointments"));
const Customers = lazy(() => import("./admin/Customers"));
const Callbacks = lazy(() => import("./admin/Callbacks"));
const Agents = lazy(() => import("./admin/Agents"));
const Integrations = lazy(() => import("./admin/Integrations"));

function NotFound() {
  return <div className="container empty" style={{ paddingTop: 80 }}><h2>Page not found</h2></div>;
}

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<div className="admin-login"><div className="spinner" /></div>}>
        <Routes>
          <Route element={<PublicLayout />}>
            <Route index element={<Home />} />
            <Route path="services" element={<Services />} />
            <Route path="team" element={<Team />} />
            <Route path="talk" element={<Talk />} />
            <Route path="contact" element={<Contact />} />
            <Route path="*" element={<NotFound />} />
          </Route>
          <Route path="admin" element={<AdminLayout />}>
            <Route index element={<Dashboard />} />
            <Route path="live" element={<LiveCalls />} />
            <Route path="calls" element={<CallLogs />} />
            <Route path="appointments" element={<Appointments />} />
            <Route path="customers" element={<Customers />} />
            <Route path="callbacks" element={<Callbacks />} />
            <Route path="agents" element={<Agents />} />
            <Route path="integrations" element={<Integrations />} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
