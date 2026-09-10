import { SignIn, SignUp } from "@clerk/react";
import { useState } from "react";
import Waveform from "./Waveform.jsx";

const clerkAppearance = {
  variables: {
    colorPrimary: "#8b5cf6",
    colorBackground: "transparent",
    colorText: "#f5f3ff",
    colorTextSecondary: "#a7a2b8",
    colorInputBackground: "#17131f",
    colorInputText: "#f5f3ff",
    borderRadius: "0.65rem",
  },
  elements: {
    rootBox: { width: "100%" },
    cardBox: { width: "100%", boxShadow: "none" },
    card: { width: "100%", padding: 0, border: 0, boxShadow: "none" },
    header: { display: "none" },
    footer: { display: "none" },
  },
};

export default function Auth({ onBack }) {
  const [mode, setMode] = useState("signin"); // "signin" | "signup"

  function switchMode(next) {
    if (next === mode) return;
    setMode(next);
  }

  return (
    <div className="card hero-card auth-card">
      {onBack && (
        <button type="button" className="auth-back" onClick={onBack}>
          ← Back
        </button>
      )}
      <Waveform className="hero-waveform" bars={30} />

      <div className="auth-tabs">
        <button
          type="button"
          className={`auth-tab ${mode === "signin" ? "active" : ""}`}
          onClick={() => switchMode("signin")}
        >
          Sign in
        </button>
        <button
          type="button"
          className={`auth-tab ${mode === "signup" ? "active" : ""}`}
          onClick={() => switchMode("signup")}
        >
          Sign up
        </button>
      </div>

      <div className="clerk-auth-shell">
        {mode === "signin" ? (
          <SignIn routing="virtual" forceRedirectUrl="/" appearance={clerkAppearance} />
        ) : (
          <SignUp routing="virtual" forceRedirectUrl="/" appearance={clerkAppearance} />
        )}
      </div>
    </div>
  );
}
