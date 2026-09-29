import { useEffect, useRef, useState } from "react";

const ASSET = "/marketing/meadow-publishing-demo-v2";

export default function HeroDemo({ recording }) {
  const asset = recording?.asset || ASSET;
  const width = recording?.width || 1280;
  const height = recording?.height || 650;
  const videoRef = useRef(null);
  const wantsPlayback = useRef(true);
  const visible = useRef(true);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    // Narrated recordings use native controls and start only when requested.
    if (recording) return;
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
  }, [recording]);

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
        width={width}
        height={height}
        style={{ aspectRatio: `${width} / ${height}` }}
        muted={!recording}
        loop={!recording}
        controls={Boolean(recording)}
        playsInline
        preload="metadata"
        poster={`${asset}.webp`}
        aria-label="Meadow publishing walkthrough"
        aria-describedby="hero-demo-description"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onError={() => { setPlaying(false); setFailed(true); }}
      >
        {!recording && <source src={`${asset}.webm`} type="video/webm" />}
        <source src={`${asset}.mp4`} type="video/mp4" />
        <p>Create, preview, and publish directly in Meadow or through a connected chatbot.</p>
      </video>
      {!recording && !failed && <button type="button" className="hero-demo-toggle" onClick={togglePlayback} aria-label={playing ? "Pause Meadow demo" : "Play Meadow demo"}>
        {playing ? <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 3v10M11 3v10" stroke="currentColor" strokeWidth="2.5" /></svg> : <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m5 2 9 6-9 6z" fill="currentColor" /></svg>}
      </button>}
      {failed && <a className="hero-demo-download" href={`${asset}.mp4`}>Watch demo</a>}
      <p id="hero-demo-description" className="sr-only">{recording?.description || "An illustrative walkthrough with sample content: create and preview a studio launch post in Meadow, click Publish now, and see LinkedIn, Threads, and Bluesky marked Published. Then ask a custom chatbot connected to the Meadow publishing API to post the studio launch, review its preview, confirm publication, and see all three channels marked Published. The video has no audio."}</p>
    </figure>
  );
}
