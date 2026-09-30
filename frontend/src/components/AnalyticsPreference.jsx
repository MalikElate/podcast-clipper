import { useEffect, useState } from "react";
import { analyticsEnabled, browserPrivacyOptOut, setAnalyticsEnabled } from "../productAnalytics.js";
import { googleAnalyticsChoice, googleAnalyticsEnabled, setGoogleAnalyticsConsent } from "../googleAnalytics.js";
import "./google-analytics-consent.css";

export default function AnalyticsPreference() {
  const [enabled, setEnabled] = useState(() => analyticsEnabled());
  const [browserOptOut, setBrowserOptOut] = useState(() => browserPrivacyOptOut());
  const [googleChoice, setGoogleChoice] = useState(() => googleAnalyticsChoice());
  const [googleEnabled, setGoogleEnabled] = useState(() => googleAnalyticsEnabled());
  useEffect(() => {
    const update = () => {
      setEnabled(analyticsEnabled());
      setBrowserOptOut(browserPrivacyOptOut());
      setGoogleChoice(googleAnalyticsChoice());
      setGoogleEnabled(googleAnalyticsEnabled());
    };
    update();
    window.addEventListener("meadow:analytics-preference", update);
    window.addEventListener("storage", update);
    return () => { window.removeEventListener("meadow:analytics-preference", update); window.removeEventListener("storage", update); };
  }, []);

  return <span className="analytics-preferences">
    <span className="analytics-preference-line">
      Usage analytics: {browserOptOut ? "off because of your browser’s privacy setting" : enabled ? "on" : "off"}.
      {!browserOptOut && <button type="button" onClick={() => setAnalyticsEnabled(!enabled)}>{enabled ? "Turn off usage analytics" : "Turn on usage analytics"}</button>}
    </span>
    <span className="analytics-preference-line">
      Google Analytics: {browserOptOut ? "off because of your browser’s privacy setting" : googleEnabled ? "on" : googleChoice === "on" && !enabled ? "off while usage analytics is off" : googleChoice === "on" ? "allowed, but currently off" : "off"}.
      {!browserOptOut && (enabled || googleChoice === "on") && <button type="button" onClick={() => setGoogleAnalyticsConsent(googleChoice !== "on")}>{googleChoice === "on" ? "Turn off Google Analytics" : "Turn on Google Analytics"}</button>}
      {!browserOptOut && !enabled && googleChoice !== "on" && <span> Turn on usage analytics to change this choice.</span>}
    </span>
  </span>;
}
