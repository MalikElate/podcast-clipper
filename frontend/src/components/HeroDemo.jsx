import { useEffect, useRef, useState } from "react";

const ASSET = "/marketing/meadow-publishing-demo-v1";

export default function HeroDemo() {
  const videoRef = useRef(null);
  const wantsPlayback = useRef(true);
  const visible = useRef(true);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => {
      if (wantsPlayback.current && visible.current && !document.hidden) {
        video.play().catch(() => setPlaying(false));
      } else video.pause();
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
    }, { threshold: 0.15 });
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
    <figure className="hero-demo">
      <video
        ref={videoRef}
        className="hero-demo-video"
        width="1280"
        height="800"
        muted
        loop
        playsInline
        preload="metadata"
        poster={`${ASSET}.webp`}
        aria-label="Meadow publishing walkthrough"
        aria-describedby="hero-demo-description"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onError={() => { setPlaying(false); setFailed(true); }}
      >
        <source src={`${ASSET}.webm`} type="video/webm" />
        <source src={`${ASSET}.mp4`} type="video/mp4" />
        <p>Choose connected accounts, write and preview a post, then schedule it in Meadow.</p>
      </video>
      <figcaption className="hero-demo-caption">
        <span><strong>From idea to scheduled.</strong><span className="hero-demo-duration">22-second walkthrough</span></span>
        {!failed && <button type="button" className="hero-demo-toggle" onClick={togglePlayback} aria-label={playing ? "Pause Meadow demo" : "Play Meadow demo"}>
          {playing ? <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 3v10M11 3v10" stroke="currentColor" strokeWidth="2.5" /></svg> : <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m5 2 9 6-9 6z" fill="currentColor" /></svg>}
          {playing ? "Pause" : "Play"}
        </button>}
        {failed && <a className="hero-demo-download" href={`${ASSET}.mp4`}>Watch demo</a>}
      </figcaption>
      <p id="hero-demo-description" className="sr-only">An illustrative walkthrough with sample content: select connected LinkedIn, Threads, and Bluesky accounts; write a studio launch post with an image; preview it; choose Friday at 10:30 AM; and see all three destinations marked Scheduled. The video has no audio.</p>
    </figure>
  );
}
