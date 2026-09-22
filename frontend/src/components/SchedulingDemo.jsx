import { useEffect, useRef, useState } from "react";

const ASSET = "/marketing/meadow-scheduling-demo-v1";

export default function SchedulingDemo() {
  const videoRef = useRef(null);
  const wantsPlayback = useRef(true);
  const visible = useRef(true);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => {
      if (wantsPlayback.current && visible.current && !document.hidden) video.play().catch(() => setPlaying(false));
      else video.pause();
    };
    const motionChanged = () => {
      wantsPlayback.current = !preference.matches;
      sync();
    };
    motionChanged();
    preference.addEventListener("change", motionChanged);
    document.addEventListener("visibilitychange", sync);
    const observer = new IntersectionObserver(([entry]) => {
      visible.current = entry.isIntersecting;
      sync();
    }, { threshold: 0.2 });
    observer.observe(video);
    return () => {
      observer.disconnect();
      preference.removeEventListener("change", motionChanged);
      document.removeEventListener("visibilitychange", sync);
      video.pause();
    };
  }, []);

  function togglePlayback() {
    const video = videoRef.current;
    wantsPlayback.current = video.paused;
    if (video.paused) video.play().catch(() => setPlaying(false));
    else video.pause();
  }

  return (
    <figure className="scheduling-demo">
      <video
        ref={videoRef}
        className="scheduling-demo-video"
        width="1200"
        height="900"
        muted
        loop
        playsInline
        preload="metadata"
        poster={`${ASSET}.webp`}
        aria-label="Meadow calendar scheduling walkthrough"
        aria-describedby="scheduling-demo-description"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onError={() => { setPlaying(false); setFailed(true); }}
      >
        <source src={`${ASSET}.webm`} type="video/webm" />
        <source src={`${ASSET}.mp4`} type="video/mp4" />
        <p>Schedule a campaign through Meadow&apos;s publishing calendar.</p>
      </video>
      {!failed && <button type="button" className="scheduling-demo-toggle" onClick={togglePlayback} aria-label={playing ? "Pause scheduling demo" : "Play scheduling demo"}>
        {playing ? <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 3v10M11 3v10" stroke="currentColor" strokeWidth="2.5" /></svg> : <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m5 2 9 6-9 6z" fill="currentColor" /></svg>}
      </button>}
      {failed && <a className="scheduling-demo-download" href={`${ASSET}.mp4`}>Watch scheduling demo</a>}
      <p id="scheduling-demo-description" className="sr-only">A silent Meadow walkthrough opens the publishing calendar, selects September 24, creates a launch post for Instagram, TikTok, and LinkedIn, schedules it for 9:30 AM, reviews all three destinations, and confirms the campaign on the calendar. The interface shown uses illustrative sample content.</p>
    </figure>
  );
}
