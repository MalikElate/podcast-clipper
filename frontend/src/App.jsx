import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useAuth } from "./AuthContext.jsx";
import Auth from "./components/Auth.jsx";
import Landing from "./components/Landing.jsx";
import LegalPage from "./components/LegalPage.jsx";
import Pricing from "./components/Pricing.jsx";
import PlatformUseCasePage from "./components/PlatformUseCasePage.jsx";
import MarketingPage from "./components/MarketingPage.jsx";
import { findMarketingPage } from "./marketing/generalPages.js";
import NotFound from "./components/NotFound.jsx";
import { PAID_PLANS as PLANS } from "./pricing.js";
import { api, localPreview } from "./bridge/BridgeApi.js";
import { isDashboardPath } from "./bridge/dashboardRoutes.js";
import { appHref, isLocalMarketingPreview, siteSurface } from "./siteUrls.js";
import { getPlatformUseCaseBySlug } from "./platformUseCases.js";
const BridgeApp = lazy(() => import("./bridge/BridgeApp.jsx"));

export default function App() {
  const pathname = window.location.pathname.replace(/\/+$/, "") || "/";
  const surface = siteSurface(window.location);
  const localMarketingPreview = isLocalMarketingPreview(window.location, import.meta.env.DEV);
  const isTermsPage = pathname === "/terms" || pathname === "/terms-of-service";
  const isPrivacyPage = pathname === "/privacy" || pathname === "/privacy-policy";
  if (isTermsPage || isPrivacyPage) {
    return <LegalPage kind={isPrivacyPage ? "privacy" : "terms"} />;
  }
  if (pathname === "/pricing") return <PricingSurface marketing={surface === "marketing"} />;
  const platformPage = surface === "app" ? undefined : getPlatformUseCaseBySlug(pathname.slice(1));
  if (platformPage) return <PublicPlatformLanding platform={platformPage} onGetStarted={() => window.location.assign(appHref("/dashboard"))} />;
  const marketingPage = surface === "app" ? null : findMarketingPage(pathname);
  if (marketingPage) return <PublicMarketingPage page={marketingPage} onGetStarted={() => window.location.assign(appHref("/dashboard"))} />;
  if (surface === "marketing" && isDashboardPath(pathname)) return <DomainRedirect href={appHref(`${window.location.pathname}${window.location.search}${window.location.hash}`)} />;
  if (pathname !== "/" && !isDashboardPath(pathname)) return <NotFound />;
  if (surface === "marketing" || localMarketingPreview) return <PublicLanding onGetStarted={() => window.location.assign(appHref("/dashboard"))} />;

  return <AppSurface appOnly={surface === "app"} />;
}

function DomainRedirect({ href }) {
  useEffect(() => { window.location.replace(href); }, [href]);
  return <OpeningMeadow />;
}

function PricingSurface({ marketing = false }) {
  const { user, loading } = useAuth();
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
      if (checkoutError.code === "subscription_exists") {
        try { const { url } = await api.createBillingPortal(); window.location.assign(url); return; }
        catch (portalError) { checkoutError = portalError; }
      }
      started.current = false;
      setBusyPlan(""); setError(checkoutError.message);
    }
  }

  useEffect(() => {
    if (marketing || !user || !pending || started.current) return;
    started.current = true;
    beginCheckout(pending.planId, pending.cycle);
  }, [marketing, user, pending]);

  if (marketing && checkoutPlan) {
    return <DomainRedirect href={appHref(`/pricing?checkout=${encodeURIComponent(checkoutPlan)}&cycle=${encodeURIComponent(checkoutCycle)}`)} />;
  }

  if (marketing) {
    return <div className="app"><div className="app-glow app-glow-a" /><div className="app-glow app-glow-b" /><div className="centered-shell landing-shell"><Pricing onSignIn={() => window.location.assign(appHref("/dashboard"))} onChoosePlan={(planId, cycle) => window.location.assign(appHref(`/pricing?checkout=${encodeURIComponent(planId)}&cycle=${encodeURIComponent(cycle)}`))} cancelled={requestedCheckout === "cancelled"} /></div></div>;
  }

  if (loading && showAuth && !localPreview) return <OpeningMeadow />;

  if (showAuth && !user && !localPreview) {
    const redirectUrl = pending ? `/pricing?checkout=${encodeURIComponent(pending.planId)}&cycle=${encodeURIComponent(pending.cycle)}` : "/";
    return <div className="app"><div className="app-glow app-glow-a" /><div className="app-glow app-glow-b" /><div className="centered-shell"><Auth redirectUrl={redirectUrl} /></div></div>;
  }

  return <div className="app"><div className="app-glow app-glow-a" /><div className="app-glow app-glow-b" /><div className="centered-shell landing-shell"><Pricing onSignIn={() => { if (user || localPreview) window.location.assign("/"); else setShowAuth(true); }} onChoosePlan={beginCheckout} busyPlan={busyPlan} error={error} cancelled={requestedCheckout === "cancelled"} /></div></div>;
}

function AppSurface({ appOnly = false }) {
  const { user, loading } = useAuth();
  const [showAuth, setShowAuth] = useState(false);
  const dashboardPath = isDashboardPath(window.location.pathname);

  if (loading && !localPreview) return <OpeningMeadow />;

  if (user || localPreview) return <Suspense fallback={<OpeningMeadow />}><BridgeApp /></Suspense>;

  if (showAuth || dashboardPath || appOnly) {
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

function OpeningMeadow() {
  return <div className="app"><main className="centered-shell"><p role="status">Opening Meadow…</p></main></div>;
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

function PublicMarketingPage({ page, onGetStarted }) {
  return (
    <div className="app">
      <div className="app-glow app-glow-a" />
      <div className="app-glow app-glow-b" />
      <div className="centered-shell landing-shell">
        <MarketingPage page={page} onGetStarted={onGetStarted} />
      </div>
    </div>
  );
}

function PublicPlatformLanding({ platform, onGetStarted }) {
  return (
    <div className="app">
      <div className="app-glow app-glow-a" />
      <div className="app-glow app-glow-b" />
      <div className="centered-shell landing-shell">
        <PlatformUseCasePage platform={platform} onGetStarted={onGetStarted} />
      </div>
    </div>
  );
}
