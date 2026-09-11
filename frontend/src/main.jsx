import React from "react";
import ReactDOM from "react-dom/client";
import { ClerkProvider, useUser } from "@clerk/react";
import { PostHogProvider, usePostHog } from "posthog-js/react";
import App from "./App.jsx";
import { AuthProvider } from "./AuthContext.jsx";
import "./index.css";
import "./meadow.css";

const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
const posthogKey = import.meta.env.VITE_POSTHOG_KEY;

if (!clerkPublishableKey) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY.");
}

function PostHogIdentity() {
  const { isLoaded, user } = useUser();
  const posthog = usePostHog();

  React.useEffect(() => {
    if (!isLoaded) return;
    if (!user) {
      posthog.reset();
      return;
    }

    posthog.identify(user.id, {
      email: user.primaryEmailAddress?.emailAddress,
      name: user.fullName || undefined,
    });
  }, [isLoaded, posthog, user]);

  return null;
}

function Application() {
  const app = (
    <AuthProvider>
      <App />
    </AuthProvider>
  );

  if (!posthogKey) return app;

  return (
    <PostHogProvider
      apiKey={posthogKey}
      options={{
        api_host: import.meta.env.VITE_POSTHOG_HOST || "https://us.i.posthog.com",
        defaults: "2026-05-30",
        person_profiles: "identified_only",
        capture_pageview: true,
        capture_pageleave: true,
      }}
    >
      <PostHogIdentity />
      {app}
    </PostHogProvider>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ClerkProvider publishableKey={clerkPublishableKey}>
      <Application />
    </ClerkProvider>
  </React.StrictMode>
);
