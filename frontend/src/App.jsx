import { lazy, Suspense, useState } from "react";
import { useAuth } from "./AuthContext.jsx";
import Auth from "./components/Auth.jsx";
import Landing from "./components/Landing.jsx";
import LegalPage from "./components/LegalPage.jsx";
const BridgeApp = lazy(() => import("./bridge/BridgeApp.jsx"));
import { localPreview } from "./bridge/BridgeApi.js";

export default function App() {
  const pathname = window.location.pathname.replace(/\/+$/, "") || "/";
  const isTermsPage = pathname === "/terms" || pathname === "/terms-of-service";
  const isPrivacyPage = pathname === "/privacy" || pathname === "/privacy-policy";
  if (isTermsPage || isPrivacyPage) {
    return <LegalPage kind={isPrivacyPage ? "privacy" : "terms"} />;
  }

  return <AppSurface />;
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
          <Auth onBack={() => setShowAuth(false)} />
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
