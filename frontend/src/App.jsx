import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useAuth } from "./AuthContext.jsx";
import Auth from "./components/Auth.jsx";
import Landing from "./components/Landing.jsx";
import LegalPage from "./components/LegalPage.jsx";
import Pricing from "./components/Pricing.jsx";
import NotFound from "./components/NotFound.jsx";
import { PLANS } from "./pricing.js";
import { api, localPreview } from "./bridge/BridgeApi.js";
const BridgeApp = lazy(() => import("./bridge/BridgeApp.jsx"));

export default function App() {
  const pathname = window.location.pathname.replace(/\/+$/, "") || "/";
  const isTermsPage = pathname === "/terms" || pathname === "/terms-of-service";
  const isPrivacyPage = pathname === "/privacy" || pathname === "/privacy-policy";
  if (isTermsPage || isPrivacyPage) {
    return <LegalPage kind={isPrivacyPage ? "privacy" : "terms"} />;
  }
  if (pathname === "/pricing") return <PricingSurface />;
  if (pathname !== "/") return <NotFound />;

  return <AppSurface />;
}

function PricingSurface() {
  const { user } = useAuth();
  const params = new URLSearchParams(window.location.search);
  const requestedCheckout = params.get("checkout") || "";
  const checkoutPlan = PLANS.some(plan => plan.id === requestedCheckout) ? requestedCheckout : "";
  const checkoutCycle = params.get("cycle") === "monthly" ? "monthly" : "yearly";
  const [showAuth, setShowAuth] = useState(Boolean(checkoutPlan));
  const [pending, setPending] = useState(checkoutPlan ? { planId: checkoutPlan, cycle: checkoutCycle } : null);
  const [busyPlan, setBusyPlan] = useState("");
  const [error, setError] = useState("");
  const started = useRef(false);

  async function beginCheckout(planId, cycle) {
    setError("");
    if (localPreview) { setError("Stripe checkout is unavailable in local preview."); return; }
    if (!user) {
      const next = { planId, cycle };
      setPending(next); setShowAuth(true);
      window.history.replaceState({}, "", `/pricing?checkout=${encodeURIComponent(planId)}&cycle=${encodeURIComponent(cycle)}`);
      return;
    }
    setBusyPlan(planId);
    try {
      const { url } = await api.createCheckout(planId, cycle);
      window.location.assign(url);
    } catch (checkoutError) {
      started.current = false;
      setBusyPlan(""); setError(checkoutError.message);
    }
  }

  useEffect(() => {
    if (!user || !pending || started.current) return;
    started.current = true;
    beginCheckout(pending.planId, pending.cycle);
  }, [user, pending]);

  if (showAuth && !user && !localPreview) {
    const redirectUrl = pending ? `/pricing?checkout=${encodeURIComponent(pending.planId)}&cycle=${encodeURIComponent(pending.cycle)}` : "/";
    return <div className="app"><div className="app-glow app-glow-a" /><div className="app-glow app-glow-b" /><div className="centered-shell"><Auth redirectUrl={redirectUrl} /></div></div>;
  }

  return <div className="app"><div className="app-glow app-glow-a" /><div className="app-glow app-glow-b" /><div className="centered-shell landing-shell"><Pricing onSignIn={() => { if (user || localPreview) window.location.assign("/"); else setShowAuth(true); }} onChoosePlan={beginCheckout} busyPlan={busyPlan} error={error} cancelled={requestedCheckout === "cancelled"} /></div></div>;
}

function AppSurface() {
  const { user } = useAuth();
  const [showAuth, setShowAuth] = useState(false);

  if (user || localPreview) return <Suspense fallback={<PublicLanding onGetStarted={() => setShowAuth(true)} />}><BridgeApp /></Suspense>;

  if (showAuth) {
    return (
      <div className="app">
        <div className="app-glow app-glow-a" />
        <div className="app-glow app-glow-b" />
        <div className="centered-shell">
          <Auth />
        </div>
      </div>
    );
  }

  return <PublicLanding onGetStarted={() => setShowAuth(true)} />;
}

export function PublicLanding({ onGetStarted }) {
  return (
    <div className="app">
      <div className="app-glow app-glow-a" />
      <div className="app-glow app-glow-b" />
      <div className="centered-shell landing-shell">
        <Landing onGetStarted={onGetStarted} />
      </div>
    </div>
  );
}
