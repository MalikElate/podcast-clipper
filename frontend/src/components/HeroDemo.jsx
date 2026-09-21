import { useEffect, useRef, useState } from "react";

const ASSET = "/marketing/meadow-publishing-demo-v2";

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
        height="650"
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
        <p>Create, preview, and publish directly in Meadow or through a connected chatbot.</p>
      </video>
      {!failed && <button type="button" className="hero-demo-toggle" onClick={togglePlayback} aria-label={playing ? "Pause Meadow demo" : "Play Meadow demo"}>
        {playing ? <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 3v10M11 3v10" stroke="currentColor" strokeWidth="2.5" /></svg> : <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m5 2 9 6-9 6z" fill="currentColor" /></svg>}
      </button>}
      {failed && <a className="hero-demo-download" href={`${ASSET}.mp4`}>Watch demo</a>}
      <p id="hero-demo-description" className="sr-only">An illustrative walkthrough with sample content: create and preview a studio launch post in Meadow, click Publish now, and see LinkedIn, Threads, and Bluesky marked Published. Then ask a custom chatbot connected to the Meadow publishing API to post the studio launch, review its preview, confirm publication, and see all three channels marked Published. The video has no audio.</p>
    </figure>
  );
}
