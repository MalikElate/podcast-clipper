import { useEffect, useState } from "react";
import { googleAnalyticsAvailable, googleAnalyticsChoice, setGoogleAnalyticsConsent } from "../googleAnalytics.js";
import { analyticsEnabled, browserPrivacyOptOut } from "../productAnalytics.js";
import { marketingHref } from "../siteUrls.js";
import "./google-analytics-consent.css";

export default function GoogleAnalyticsConsent() {
  const [choice, setChoice] = useState(() => googleAnalyticsChoice());
  const [usageEnabled, setUsageEnabled] = useState(() => analyticsEnabled());
  const [browserOptOut, setBrowserOptOut] = useState(() => browserPrivacyOptOut());

  useEffect(() => {
    const update = () => {
      setChoice(googleAnalyticsChoice());
      setUsageEnabled(analyticsEnabled());
      setBrowserOptOut(browserPrivacyOptOut());
    };
    update();
    window.addEventListener("meadow:analytics-preference", update);
    window.addEventListener("storage", update);
    const timer = window.setInterval(update, 1000);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("meadow:analytics-preference", update);
      window.removeEventListener("storage", update);
    };
  }, []);

  if (!googleAnalyticsAvailable() || choice !== null || !usageEnabled || browserOptOut) return null;

  const choose = (enabled) => {
    setGoogleAnalyticsConsent(enabled);
    setChoice(googleAnalyticsChoice());
  };

  return (
    <aside className="google-analytics-consent" aria-label="Google Analytics choice">
      <p>Allow Google Analytics to measure Meadow page visits and key actions? Google receives browser and page information. It stays off unless you agree. See our <a href={marketingHref("/privacy")}>Privacy policy</a> to learn more or change your choice.</p>
      <div className="google-analytics-consent-actions">
        <button type="button" className="google-analytics-consent-decline" onClick={() => choose(false)}>Decline</button>
        <button type="button" className="google-analytics-consent-accept" onClick={() => choose(true)}>Accept Google Analytics</button>
      </div>
    </aside>
  );
}
