import React from "react";
import { renderToString } from "react-dom/server";
import Landing from "./components/Landing.jsx";
import LegalPage from "./components/LegalPage.jsx";

export function render(kind) {
  return renderToString(kind
    ? <LegalPage kind={kind} />
    : <div className="app"><div className="app-glow app-glow-a" /><div className="app-glow app-glow-b" /><div className="centered-shell landing-shell"><Landing /></div></div>);
}
