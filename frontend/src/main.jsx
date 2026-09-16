import React from "react";
import ReactDOM from "react-dom/client";
import { ClerkProvider } from "@clerk/react";
import App from "./App.jsx";
import { AuthProvider } from "./AuthContext.jsx";
import "./index.css";
import "./meadow.css";
import "./borderless.css";
import "./platformUseCases.css";

const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
const posthogKey = import.meta.env.VITE_POSTHOG_KEY;
const localPreview = import.meta.env.VITE_BRIDGE_LOCAL_PREVIEW === "true";

if (!clerkPublishableKey && !localPreview) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY.");
}

function Application() {
  return <AuthProvider><App /></AuthProvider>;
}

// Product tracking is disabled. Remove the old deployment's browser identifier.
if (posthogKey) {
  const key = `ph_${posthogKey}_posthog`;
  try { localStorage.removeItem(key); sessionStorage.removeItem(key); } catch { /* Browser storage may be disabled. */ }
  document.cookie = `${key}=; Max-Age=0; Path=/; SameSite=Lax`;
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {localPreview ? <Application /> : <ClerkProvider publishableKey={clerkPublishableKey}><Application /></ClerkProvider>}
  </React.StrictMode>
);
