import { useEffect } from "react";
import BrandLogo from "./BrandLogo.jsx";
import Waveform from "./Waveform.jsx";

export default function NotFound() {
  useEffect(() => { document.title = "Page not found · Meadow"; }, []);

  return (
    <div className="not-found-shell">
      <header className="not-found-header">
        <a href="/" aria-label="Meadow home"><BrandLogo /></a>
        <a href="/pricing">View pricing</a>
      </header>
      <main className="not-found-page">
        <span className="not-found-code">Page not found</span>
        <Waveform className="not-found-waveform" bars={18} />
        <h1>404</h1>
        <p>The link may be outdated, or the page may have moved. Head back to Meadow and keep your publishing work in one place.</p>
        <div className="not-found-actions">
          <a className="btn-primary" href="/?view=compose">Back to dashboard</a>
          <a className="not-found-secondary" href="/">Back to homepage</a>
          <a className="not-found-support" href="mailto:hello@findmeadow.com">Contact support</a>
        </div>
      </main>
      <footer className="not-found-footer"><span>© {new Date().getFullYear()} Meadow</span><span>404</span></footer>
    </div>
  );
}
