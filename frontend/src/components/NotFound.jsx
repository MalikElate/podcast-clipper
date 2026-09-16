import { useEffect } from "react";
import BrandLogo from "./BrandLogo.jsx";
import SiteFooter from "./SiteFooter.jsx";

export default function NotFound() {
  useEffect(() => { document.title = "Page not found · Meadow"; }, []);

  return (
    <div className="not-found-shell">
      <header className="not-found-header">
        <a href="/" aria-label="Meadow home"><BrandLogo /></a>
        <a href="/pricing">View pricing</a>
      </header>
      <main className="not-found-page">
        <h1>404</h1>
        <p>The link may be outdated, or the page may have moved. Head back to Meadow and keep your publishing work in one place.</p>
        <div className="not-found-actions">
          <a className="btn-primary" href="/?view=compose">Back to Dashboard</a>
          <a className="not-found-secondary" href="/">Back to Homepage</a>
          <a className="not-found-secondary" href="mailto:hello@findmeadow.com">Contact Support</a>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
