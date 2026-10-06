import React from "react";
import ReactDOM from "react-dom/client";
import { ClerkProvider } from "@clerk/react";
import App from "./App.jsx";
import { AuthProvider } from "./AuthContext.jsx";
import { clerkScriptUrls } from "./clerkScripts.js";
import "./index.css";
import "./meadow.css";
import "./borderless.css";
import "./platformUseCases.css";
import "./marketingPages.css";
import "./adSignupFunnel.css";
import "./tools/freeTools.css";
import "./developerTheme.css";
import { initProductAnalytics } from "./productAnalytics.js";
import { initGoogleAnalytics, migrateLegacyGoogleAnalyticsPreference } from "./googleAnalytics.js";
import { appHref } from "./siteUrls.js";

const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY || globalThis.__MEADOW_CONFIG__?.clerkPublishableKey;
const localPreview = import.meta.env.VITE_BRIDGE_LOCAL_PREVIEW === "true";

if (!clerkPublishableKey && !localPreview) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY.");
}

// The same pinned URLs are preloaded from index.html (see vite.config.js), so both scripts download
// alongside the app bundle instead of one after the other.
const clerkScripts = clerkScriptUrls(clerkPublishableKey);
const clerkScriptProps = clerkScripts ? { __internal_clerkJSUrl: clerkScripts.clerkJS, __internal_clerkUIUrl: clerkScripts.clerkUI } : {};

function Application() {
  return <AuthProvider><App /></AuthProvider>;
}

migrateLegacyGoogleAnalyticsPreference();
void initProductAnalytics();
initGoogleAnalytics({ preview: import.meta.env.DEV || localPreview });

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {localPreview ? <Application /> : <ClerkProvider publishableKey={clerkPublishableKey} signInUrl={appHref("/sign-in")} signUpUrl={appHref("/sign-up")} {...clerkScriptProps}><Application /></ClerkProvider>}
  </React.StrictMode>
);
