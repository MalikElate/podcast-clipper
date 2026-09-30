import { useEffect, useState } from "react";
import { analyticsEnabled, browserPrivacyOptOut, setAnalyticsEnabled } from "../productAnalytics.js";
import "./google-analytics-consent.css";

export default function AnalyticsPreference() {
  const [enabled, setEnabled] = useState(() => analyticsEnabled());
  const [browserOptOut, setBrowserOptOut] = useState(() => browserPrivacyOptOut());
  useEffect(() => {
    const update = () => {
      setEnabled(analyticsEnabled());
      setBrowserOptOut(browserPrivacyOptOut());
    };
    update();
    window.addEventListener("meadow:analytics-preference", update);
    window.addEventListener("storage", update);
    const timer = window.setInterval(update, 1000);
    return () => { window.clearInterval(timer); window.removeEventListener("meadow:analytics-preference", update); window.removeEventListener("storage", update); };
  }, []);

  return <span className="analytics-preferences">
    <span className="analytics-preference-line">
      Usage analytics: {browserOptOut ? "off because of your browser’s privacy setting" : enabled ? "on" : "off"}.
      {!browserOptOut && <button type="button" onClick={() => setAnalyticsEnabled(!enabled)}>{enabled ? "Turn off usage analytics" : "Turn on usage analytics"}</button>}
    </span>
  </span>;
}
