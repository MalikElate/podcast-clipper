import { useEffect } from "react";
import Waveform from "./Waveform.jsx";

function Logo() {
  return <div className="brand"><Waveform className="brand-mark" bars={5} /><span className="brand-name">meadow<span className="brand-accent">.</span></span></div>;
}

export default function NotFound() {
  useEffect(() => { document.title = "Page not found · Meadow"; }, []);

  return (
    <div className="not-found-shell">
      <header className="not-found-header">
        <a href="/" aria-label="Meadow home"><Logo /></a>
        <a href="/pricing">View pricing</a>
      </header>
      <main className="not-found-page">
        <span className="not-found-code">404</span>
        <Waveform className="not-found-waveform" bars={18} />
        <h1>This page wandered off.</h1>
        <p>The link may be outdated, or the page may have moved. Head back to Meadow and keep your publishing work in one place.</p>
        <div className="not-found-actions">
          <a className="btn-primary" href="/">Back to Meadow</a>
          <a className="not-found-secondary" href="mailto:hello@findmeadow.com">Report a broken link</a>
        </div>
      </main>
      <footer className="not-found-footer"><span>© {new Date().getFullYear()} Meadow</span><span>Page not found</span></footer>
    </div>
  );
}

