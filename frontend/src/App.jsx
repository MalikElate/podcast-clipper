import { lazy, Suspense, useEffect, useState } from "react";
import { OAuthConsent } from "@clerk/react";
import { useAuth } from "./AuthContext.jsx";
import Auth from "./components/Auth.jsx";
import Landing from "./components/Landing.jsx";
import LegalPage from "./components/LegalPage.jsx";
import Pricing from "./components/Pricing.jsx";
import PlatformUseCasePage from "./components/PlatformUseCasePage.jsx";
import MarketingPage from "./components/MarketingPage.jsx";
import AdSignupFunnel from "./components/AdSignupFunnel.jsx";
import ContactPage from "./components/ContactPage.jsx";
import DevelopersPage from "./components/DevelopersPage.jsx";
import { findMarketingPage } from "./marketing/generalPages.js";
import TikTokRoast from "./tools/TikTokRoast.jsx";
import NotFound from "./components/NotFound.jsx";
import { PAID_PLANS as PLANS, checkoutExpectation } from "./pricing.js";
import { usePricingQuote } from "./pricingQuote.js";
import { api, localPreview } from "./bridge/BridgeApi.js";
import { isDashboardPath } from "./bridge/dashboardRoutes.js";
import { appHref, isLocalMarketingPreview, marketingHref, siteSurface } from "./siteUrls.js";
import { captureMetaRegistration } from "./metaPixel.js";
import { captureProductEvent } from "./productAnalytics.js";
import { cleanSignupCallbackReferrer, queueGoogleSignup } from "./googleAnalytics.js";
import { getPlatformUseCaseBySlug } from "./platformUseCases.js";
import { findFreeToolPage } from "./tools/freeToolsCatalog.js";
import { legacyToolsPath } from "../../backend/src/bridge/shared/publicToolRoutes.js";
import { authContinuation } from "./authRedirects.js";
const loadBridgeApp = () => import("./bridge/BridgeApp.jsx");
const BridgeApp = lazy(loadBridgeApp);
const FreeToolsPage = lazy(() => import("./tools/FreeToolsPage.jsx"));

export default function App() {
  const pathname = window.location.pathname.replace(/\/+$/, "") || "/";
  const toolsRedirect = legacyToolsPath(window.location.href);
  if (toolsRedirect) return <DomainRedirect href={toolsRedirect} />;
  const surface = siteSurface(window.location);
  const localMarketingPreview = isLocalMarketingPreview(window.location, import.meta.env.DEV);
  const isTermsPage = pathname === "/terms" || pathname === "/terms-of-service";
  const isPrivacyPage = pathname === "/privacy" || pathname === "/privacy-policy";
  if (isTermsPage || isPrivacyPage) {
    return <LegalPage kind={isPrivacyPage ? "privacy" : "terms"} />;
  }
  if (pathname === "/start") {
    if (surface === "app") return <DomainRedirect href={marketingHref(`${window.location.pathname}${window.location.search}`)} />;
    return <PublicAdFunnel />;
  }
  if (pathname === "/sign-up") {
    if (surface === "marketing") return <DomainRedirect href={appHref(`${window.location.pathname}${window.location.search}`)} />;
    return <SignupSurface />;
  }
  if (pathname === "/sign-in") {
    if (surface === "marketing") return <DomainRedirect href={appHref(`${window.location.pathname}${window.location.search}`)} />;
    return <SigninSurface />;
  }
  if (pathname === "/oauth-consent") {
    if (surface === "marketing") return <DomainRedirect href={appHref(`${window.location.pathname}${window.location.search}`)} />;
    return <OAuthConsentSurface />;
  }
  if (pathname === "/sign-up/complete") return <SignupComplete />;
  if (pathname === "/tools/tiktok-roast") return <TikTokRoast />;
  if (pathname === "/developers") return <PublicDevelopersPage onGetStarted={() => window.location.assign(appHref("/dashboard"))} />;
  if (pathname === "/contact") return <PublicContactPage onGetStarted={() => window.location.assign(appHref("/dashboard"))} />;
  const freeToolPage = findFreeToolPage(pathname);
  if (freeToolPage) return <Suspense fallback={<OpeningMeadow />}><FreeToolsPage page={freeToolPage} /></Suspense>;
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

// Clerk may return to Meadow's consent page or its own OAuth continuation endpoint.
const returnPath = () => authContinuation();

function SignupSurface() {
  const { user, loading } = useAuth();
  const returnTo = returnPath();
  useEffect(() => {
    if (user || loading || localPreview) return;
    try { sessionStorage.setItem("meadow.signup.pending", "1"); } catch { /* Sign-up still works without storage. */ }
  }, [user, loading]);

  if (loading && !localPreview) return <OpeningMeadow />;
  if (user || localPreview) return <DomainRedirect href={returnTo || "/dashboard"} />;
  const completeUrl = returnTo ? `/sign-up/complete?redirect_url=${encodeURIComponent(returnTo)}` : undefined;
  return <div className="app"><div className="app-glow app-glow-a" /><div className="app-glow app-glow-b" /><div className="centered-shell"><Auth mode="sign-up" redirectUrl={completeUrl} /></div></div>;
}

function SigninSurface() {
  const { user, loading } = useAuth();
  const returnTo = returnPath();
  if (loading && !localPreview) return <OpeningMeadow />;
  if (user || localPreview) return <DomainRedirect href={returnTo || "/dashboard"} />;
  return <div className="app"><div className="app-glow app-glow-a" /><div className="app-glow app-glow-b" /><div className="centered-shell"><Auth redirectUrl={returnTo || undefined} /></div></div>;
}

function OAuthConsentSurface() {
  const { user, loading } = useAuth();
  if (localPreview) return <OpeningMeadow />;
  if (loading) return <OpeningMeadow />;
  if (!user) {
    const redirectUrl = `${window.location.pathname}${window.location.search}`;
    return <div className="app"><div className="app-glow app-glow-a" /><div className="app-glow app-glow-b" /><div className="centered-shell"><Auth redirectUrl={redirectUrl} /></div></div>;
  }
  return <div className="app"><div className="app-glow app-glow-a" /><div className="app-glow app-glow-b" /><div className="centered-shell"><OAuthConsent /></div></div>;
}

function SignupComplete() {
  const { user, loading } = useAuth();
  useEffect(() => {
    if (loading) return;
    if (!user) { window.location.replace("/sign-up"); return; }
    let pending = false;
    try { pending = sessionStorage.getItem("meadow.signup.pending") === "1"; sessionStorage.removeItem("meadow.signup.pending"); } catch { /* No conversion marker available. */ }
    const justCreated = Number.isFinite(user.createdAt) && Date.now() - user.createdAt < 10 * 60 * 1000;
    if (pending && justCreated) {
      captureMetaRegistration();
      captureProductEvent("meadow_signup_completed");
      queueGoogleSignup();
    }
    // Read the return page before the callback parameters are removed.
    const next = returnPath() || "/dashboard";
    // Remove Clerk callback parameters before the next document is loaded.
    // The dashboard can then use this safe URL as its GA4 referrer.
    cleanSignupCallbackReferrer();
    window.location.replace(next);
  }, [user, loading]);
  return <OpeningMeadow />;
}

function PricingSurface({ marketing = false }) {
  const { user, loading } = useAuth();
  const pricingQuoteState = usePricingQuote();
  const { quote, retry: retryPricing } = pricingQuoteState;
  const params = new URLSearchParams(window.location.search);
  const requestedCheckout = params.get("checkout") || "";
  const checkoutPlan = PLANS.some(plan => plan.id === requestedCheckout) ? requestedCheckout : "";
  const checkoutCycle = params.get("cycle") === "monthly" ? "monthly" : "yearly";
  const [showAuth, setShowAuth] = useState(false);
  const [busyPlan, setBusyPlan] = useState("");
  const [error, setError] = useState("");

  async function beginCheckout(planId, cycle) {
    setError("");
    if (localPreview) { setError("Stripe checkout is unavailable in local preview."); return; }
    if (!quote) { setError("Local prices are still loading. Please try again in a moment."); return; }
    if (!user) {
      setShowAuth(true);
      window.history.replaceState({}, "", `/pricing?checkout=${encodeURIComponent(planId)}&cycle=${encodeURIComponent(cycle)}`);
      return;
    }
    setBusyPlan(planId);
    try {
      const { url } = await api.createCheckout(planId, cycle, checkoutExpectation(quote, planId, cycle));
      window.location.assign(url);
    } catch (checkoutError) {
      if (checkoutError.code === "subscription_exists") {
        try { const { url } = await api.createBillingPortal(); window.location.assign(url); return; }
        catch (portalError) { checkoutError = portalError; }
      }
      if (checkoutError.code === "pricing_changed") {
        retryPricing();
        setError("We couldn't verify your local price. Review the refreshed prices and choose a plan again.");
      } else setError(checkoutError.message);
      setBusyPlan("");
    }
  }

  if (marketing && checkoutPlan) {
    return <DomainRedirect href={appHref(`/pricing?checkout=${encodeURIComponent(checkoutPlan)}&cycle=${encodeURIComponent(checkoutCycle)}`)} />;
  }

  if (marketing) {
    return <div className="app"><div className="app-glow app-glow-a" /><div className="app-glow app-glow-b" /><div className="centered-shell landing-shell"><Pricing onSignIn={() => window.location.assign(appHref("/dashboard"))} onChoosePlan={(planId, cycle) => window.location.assign(appHref(`/pricing?checkout=${encodeURIComponent(planId)}&cycle=${encodeURIComponent(cycle)}`))} cancelled={requestedCheckout === "cancelled"} pricingQuoteState={pricingQuoteState} /></div></div>;
  }

  if (loading && showAuth && !localPreview) return <OpeningMeadow />;

  if (showAuth && !user && !localPreview) {
    const redirectUrl = checkoutPlan ? `/pricing?checkout=${encodeURIComponent(checkoutPlan)}&cycle=${encodeURIComponent(checkoutCycle)}` : "/";
    return <div className="app"><div className="app-glow app-glow-a" /><div className="app-glow app-glow-b" /><div className="centered-shell"><Auth redirectUrl={redirectUrl} /></div></div>;
  }

  return <div className="app"><div className="app-glow app-glow-a" /><div className="app-glow app-glow-b" /><div className="centered-shell landing-shell"><Pricing onSignIn={() => { if (user || localPreview) window.location.assign("/"); else setShowAuth(true); }} onChoosePlan={beginCheckout} busyPlan={busyPlan} error={error} cancelled={requestedCheckout === "cancelled"} pricingQuoteState={pricingQuoteState} initialYearly={checkoutCycle === "yearly"} checkoutPrompt={checkoutPlan ? "Review the prices for your location, then choose a plan to continue." : ""} /></div></div>;
}

function AppSurface({ appOnly = false }) {
  const { user, loading } = useAuth();
  const [showAuth, setShowAuth] = useState(false);
  const dashboardPath = isDashboardPath(window.location.pathname);
  // Download the workspace while Clerk restores the session, rather than after it.
  useEffect(() => { if (dashboardPath || appOnly) void loadBridgeApp(); }, [dashboardPath, appOnly]);

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

// A blank page in the app background while sign-in state or code loads, so nothing flashes before the real screen.
function OpeningMeadow() {
  return <div className="app" aria-busy="true" />;
}

export function PublicLanding({ onGetStarted }) {
  return (
    <div className="app marketing-home-app">
      <div className="centered-shell landing-shell">
        <Landing onGetStarted={onGetStarted} />
      </div>
    </div>
  );
}

function PublicAdFunnel() {
  return <div className="app ad-funnel-app"><div className="centered-shell landing-shell"><AdSignupFunnel /></div></div>;
}

function PublicDevelopersPage({ onGetStarted }) {
  return (
    <div className="app">
      <div className="app-glow app-glow-a" />
      <div className="app-glow app-glow-b" />
      <div className="centered-shell landing-shell">
        <DevelopersPage onGetStarted={onGetStarted} />
      </div>
    </div>
  );
}

function PublicContactPage({ onGetStarted }) {
  return (
    <div className="app">
      <div className="app-glow app-glow-a" />
      <div className="app-glow app-glow-b" />
      <div className="centered-shell landing-shell">
        <ContactPage onGetStarted={onGetStarted} />
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
