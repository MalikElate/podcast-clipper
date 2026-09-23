import { useEffect, useRef, useState } from "react";
import { PlatformIcon } from "../bridge/ui.jsx";
import "./agentPublishingDemo.css";

const CHANNELS = [
  { id: "linkedin", name: "LinkedIn" },
  { id: "threads", name: "Threads" },
  { id: "bluesky", name: "Bluesky" },
];
const DURATIONS = [2200, 3800, 2200, 1000, 1000, 1000, 4200];

function AssistantMark() {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="4" y="7" width="16" height="13" rx="5" /><path d="M12 3v4M2 12v3m20-3v3M9 16h6" /><circle cx="9" cy="12" r=".7" /><circle cx="15" cy="12" r=".7" /></svg>;
}

function Check() {
  return <svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m3 8 3 3 7-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

export default function AgentPublishingDemo() {
  const demoRef = useRef(null);
  // A complete, readable example is also available before hydration and with reduced motion.
  const [step, setStep] = useState(6);
  const [playing, setPlaying] = useState(false);
  const [visible, setVisible] = useState(false);
  const [pageVisible, setPageVisible] = useState(true);

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncMotion = () => {
      setPlaying(!preference.matches);
      setStep(preference.matches ? 6 : 0);
    };
    const syncVisibility = () => setPageVisible(!document.hidden);
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0.25 });
    observer.observe(demoRef.current);
    syncMotion();
    syncVisibility();
    preference.addEventListener("change", syncMotion);
    document.addEventListener("visibilitychange", syncVisibility);
    return () => {
      observer.disconnect();
      preference.removeEventListener("change", syncMotion);
      document.removeEventListener("visibilitychange", syncVisibility);
    };
  }, []);

  useEffect(() => {
    if (!playing || !visible || !pageVisible) return;
    const timer = window.setTimeout(() => setStep(current => (current + 1) % DURATIONS.length), DURATIONS[step]);
    return () => window.clearTimeout(timer);
  }, [step, playing, visible, pageVisible]);

  return (
    <figure className="agent-demo" ref={demoRef} aria-label="Publishing through an AI assistant" aria-describedby="agent-demo-description">
      <div className="agent-demo-header">
        <span className="agent-demo-avatar"><AssistantMark /></span>
        <div><strong>AI assistant</strong><span className="agent-demo-connection"><i />Meadow connected</span></div>
        <button type="button" className="agent-demo-toggle" onClick={() => setPlaying(current => !current)} aria-label={playing ? "Pause AI publishing demo" : "Play AI publishing demo"}>
          {playing ? <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 3v10M11 3v10" stroke="currentColor" strokeWidth="2" /></svg> : <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m5 2 9 6-9 6z" fill="currentColor" /></svg>}
        </button>
      </div>

      <div className="agent-demo-conversation" aria-hidden="true" data-step={step} data-playing={playing}>
        <div className="agent-demo-user">Share our studio launch on LinkedIn, Threads, and Bluesky.</div>
        <div className="agent-demo-response">
          <span className="agent-demo-avatar agent-demo-avatar-small"><AssistantMark /></span>
          <div className="agent-demo-answer">
            <p>{step === 0 ? <>Preparing your posts<span className="agent-demo-thinking">…</span></> : "Three posts prepared. Ready for your review."}</p>
            <div className={`agent-demo-preview ${step >= 1 ? "is-visible" : ""}`}>
              <div className="agent-demo-post"><span>STUDIO LAUNCH</span><strong>A little more room to create.</strong><p>Our new studio is open. Come make something good.</p></div>
              <div className="agent-demo-channels">
                {CHANNELS.map((channel, index) => {
                  const published = step >= index + 4;
                  const publishing = step >= 3 && !published;
                  return <div className="agent-demo-channel" key={channel.id}>
                    <PlatformIcon platform={channel.id} size={16} /><span>{channel.name}</span>
                    <span className={`agent-demo-delivery ${published ? "is-published" : ""}`}>{published ? <><Check />Published</> : publishing ? <><svg className="agent-demo-spinner" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="5" stroke="currentColor" strokeWidth="1.5" strokeDasharray="24 8" /></svg>Publishing</> : "Ready"}</span>
                  </div>;
                })}
              </div>
            </div>
          </div>
        </div>
        <div className={`agent-demo-user agent-demo-confirm ${step >= 2 ? "is-visible" : ""}`}>Looks good. Publish all three.</div>
        <div className={`agent-demo-success ${step >= 6 ? "is-visible" : ""}`}><span><Check /></span>You’re live on all 3 channels.</div>
      </div>

      <div className="agent-demo-composer" aria-hidden="true"><span>Ask your assistant…</span><span className="agent-demo-send"><svg viewBox="0 0 16 16" fill="none"><path d="M8 12V4m-4 4 4-4 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg></span></div>
      <figcaption id="agent-demo-description" className="sr-only">Illustrative sample conversation: ask a generic AI assistant connected to Meadow to share a studio launch on LinkedIn, Threads, and Bluesky. The assistant prepares the posts for review, waits for your approval, and then shows each channel as published. No real posts are created by this demo.</figcaption>
    </figure>
  );
}
