import { useEffect, useRef, useState } from "react";
import { SiClaude } from "react-icons/si";
import OpenAILogo from "./OpenAILogo.jsx";
import { PlatformIcon } from "../bridge/ui.jsx";
import "./agentPublishingDemo.css";

const CHANNELS = [
  { id: "linkedin", name: "LinkedIn" },
  { id: "threads", name: "Threads" },
  { id: "bluesky", name: "Bluesky" },
];
const DURATIONS = [2200, 3800, 2200, 1000, 1000, 1000, 4200];

function HermesLogo() {
  return <img src="/brands/hermes-logo.png" width="22" height="22" alt="" />;
}

const AGENTS = [
  { id: "claude", name: "Claude", Logo: SiClaude },
  { id: "openai", name: "ChatGPT", Logo: OpenAILogo },
  { id: "hermes", name: "Hermes", Logo: HermesLogo },
];

function AssistantMark({ agent, small = false }) {
  return <span className={`agent-demo-avatar is-${agent.id}${small ? " agent-demo-avatar-small" : ""}`} aria-hidden="true"><agent.Logo /></span>;
}

function Check() {
  return <svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m3 8 3 3 7-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

export default function AgentPublishingDemo() {
  const demoRef = useRef(null);
  // A complete, readable example is also available before hydration and with reduced motion.
  const [{ step, agentIndex, transitionId }, setFrame] = useState({ step: 6, agentIndex: 0, transitionId: 0 });
  const agent = AGENTS[agentIndex];
  const [playing, setPlaying] = useState(false);
  const [visible, setVisible] = useState(false);
  const [pageVisible, setPageVisible] = useState(true);

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncMotion = () => {
      setPlaying(!preference.matches);
      setFrame(current => ({ ...current, step: preference.matches ? 6 : 0, transitionId: 0 }));
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
    const timer = window.setTimeout(() => setFrame(current => {
      const nextStep = (current.step + 1) % DURATIONS.length;
      const switchingAgent = nextStep === 0;
      return { step: nextStep, agentIndex: switchingAgent ? (current.agentIndex + 1) % AGENTS.length : current.agentIndex, transitionId: current.transitionId + (switchingAgent ? 1 : 0) };
    }), DURATIONS[step]);
    return () => window.clearTimeout(timer);
  }, [step, playing, visible, pageVisible]);

  return (
    <figure className="agent-demo" ref={demoRef} data-agent={agent.id} aria-label={`Publishing through ${agent.name}`} aria-describedby="agent-demo-description">
      {transitionId > 0 && <div className="agent-demo-flash" key={transitionId} aria-hidden="true" />}
      <div className="agent-demo-header">
        <AssistantMark agent={agent} />
        <strong>{agent.name}</strong>
      </div>

      <div className="agent-demo-conversation" aria-hidden="true" data-step={step} data-playing={playing}>
        <div className="agent-demo-user">Share our studio launch on LinkedIn, Threads, and Bluesky.</div>
        <div className="agent-demo-response">
          <AssistantMark agent={agent} small />
          <div className="agent-demo-answer">
            <p>{step === 0 ? <>Preparing your posts<span className="agent-demo-thinking">…</span></> : "Three posts prepared. Ready for your review."}</p>
            <div className={`agent-demo-preview ${step >= 1 ? "is-visible" : ""}`}>
              <div className="agent-demo-post"><strong>A little more room to create.</strong><p>Our new studio is open. Come make something good.</p></div>
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

      <figcaption id="agent-demo-description" className="sr-only">Illustrative sample conversation: ask an AI assistant connected to Meadow to share a studio launch on LinkedIn, Threads, and Bluesky. The assistant prepares the posts for review, waits for your approval, and then shows each channel as published. Each replay uses Claude, ChatGPT, then Hermes. No real posts are created by this demo.</figcaption>
    </figure>
  );
}
