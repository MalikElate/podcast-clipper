import { useEffect, useState } from "react";
import { analyticsEnabled, browserPrivacyOptOut, setAnalyticsEnabled } from "../productAnalytics.js";

export default function AnalyticsPreference() {
  const [enabled, setEnabled] = useState(true);
  const [browserOptOut, setBrowserOptOut] = useState(false);
  useEffect(() => {
    const update = () => { setEnabled(analyticsEnabled()); setBrowserOptOut(browserPrivacyOptOut()); };
    update();
    window.addEventListener("meadow:analytics-preference", update);
    window.addEventListener("storage", update);
    return () => { window.removeEventListener("meadow:analytics-preference", update); window.removeEventListener("storage", update); };
  }, []);
  if (browserOptOut) return <span>Usage analytics is off because of your browser’s privacy setting.</span>;
  return <button type="button" onClick={() => setAnalyticsEnabled(!enabled)} style={{ color: "inherit", font: "inherit", textDecoration: "underline", background: "none", border: 0, padding: 0, cursor: "pointer" }}>{enabled ? "Turn off usage analytics" : "Turn on usage analytics"}</button>;
}
