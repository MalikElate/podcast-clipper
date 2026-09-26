import React from "react";
import ReactDOM from "react-dom/client";
import { ClerkProvider } from "@clerk/react";
import App from "./App.jsx";
import { AuthProvider } from "./AuthContext.jsx";
import "./index.css";
import "./meadow.css";
import "./borderless.css";
import "./platformUseCases.css";
import "./marketingPages.css";
import "./tools/freeTools.css";
import { initProductAnalytics } from "./productAnalytics.js";

const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY || globalThis.__MEADOW_CONFIG__?.clerkPublishableKey;
const localPreview = import.meta.env.VITE_BRIDGE_LOCAL_PREVIEW === "true";

if (!clerkPublishableKey && !localPreview) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY.");
}

function Application() {
  return <AuthProvider><App /></AuthProvider>;
}

void initProductAnalytics();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {localPreview ? <Application /> : <ClerkProvider publishableKey={clerkPublishableKey}><Application /></ClerkProvider>}
  </React.StrictMode>
);
