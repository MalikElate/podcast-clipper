import React from "react";
import { renderToString } from "react-dom/server";
import Landing from "./components/Landing.jsx";
import LegalPage from "./components/LegalPage.jsx";
import Pricing from "./components/Pricing.jsx";
import PlatformUseCasePage from "./components/PlatformUseCasePage.jsx";
import MarketingPage from "./components/MarketingPage.jsx";
import TikTokRoast from "./tools/TikTokRoast.jsx";
import NotFound from "./components/NotFound.jsx";
import { findMarketingPage } from "./marketing/generalPages.js";
import { getPlatformUseCaseById } from "./platformUseCases.js";

export function render(kind, platformId) {
  if (kind === "tiktok-roast") return renderToString(<TikTokRoast />);
  if (kind === "marketing") {
    const page = findMarketingPage(platformId);
    if (!page) throw new Error(`Unknown marketing page: ${platformId}`);
    return renderToString(<div className="app"><div className="app-glow app-glow-a" /><div className="app-glow app-glow-b" /><div className="centered-shell landing-shell"><MarketingPage page={page} /></div></div>);
  }

  if (kind === "platform") {
    const platform = getPlatformUseCaseById(platformId);
    if (!platform) throw new Error(`Unknown platform use case: ${platformId}`);
    return renderToString(<div className="app"><div className="app-glow app-glow-a" /><div className="app-glow app-glow-b" /><div className="centered-shell landing-shell"><PlatformUseCasePage platform={platform} /></div></div>);
  }

  return renderToString(kind
    ? kind === "pricing" ? <div className="app"><div className="app-glow app-glow-a" /><div className="app-glow app-glow-b" /><div className="centered-shell landing-shell"><Pricing /></div></div> : kind === "not-found" ? <NotFound /> : <LegalPage kind={kind} />
    : <div className="app"><div className="app-glow app-glow-a" /><div className="app-glow app-glow-b" /><div className="centered-shell landing-shell"><Landing /></div></div>);
}
