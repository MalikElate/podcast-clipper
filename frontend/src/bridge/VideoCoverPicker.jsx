import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Alert, Field, Modal } from "./ui.jsx";
import { coverTime, selectedCover } from "./videoCover.js";

function CoverFrame({ video, timestampMs, onReady }) {
  const ref = useRef(null), [error, setError] = useState("");
  const readyCallback = useRef(onReady); readyCallback.current = onReady;
  function seek() {
    const element = ref.current;
    if (element?.error) { readyCallback.current?.(false, true); return; }
    if (!element || element.readyState < 2) return;
    if (Math.abs(element.currentTime - timestampMs / 1000) > .001) element.currentTime = timestampMs / 1000;
    else if (!element.seeking) readyCallback.current?.(true);
  }
  useEffect(() => { readyCallback.current?.(false); seek(); }, [timestampMs]);
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (!ref.current || ref.current.readyState < 2) { setError("The video preview could not load. Close the picker and try again."); readyCallback.current?.(false, true); }
    }, 30000);
    return () => clearTimeout(timeout);
  }, []);
  return <div className="bridge-cover-frame">
    <video ref={ref} src={video.url} preload="auto" muted playsInline aria-label={`Cover frame at ${coverTime(timestampMs)}`} onLoadedData={() => { setError(""); seek(); }}
      onSeeking={() => readyCallback.current?.(false)} onSeeked={seek}
      onError={() => { setError("This browser cannot preview this video. Try an MP4 video with H.264 encoding."); readyCallback.current?.(false, true); }}/>
    {error && <Alert message={error}/>}
  </div>;
}

export function CoverDialog({ video, initialTimestamp = 0, accountLabel, onClose, onSave }) {
  const max = Math.max(0, Math.floor((video.durationSec * 1000 - 100) / 100) * 100);
  const [timestamp, setTimestamp] = useState(Math.min(initialTimestamp, max)), [previewStatus, setPreviewStatus] = useState("loading");
  const ready = previewStatus === "ready";
  return <Modal title="Choose video cover" onClose={onClose} className="bridge-cover-modal">
    <p className="bridge-small">Choose the frame viewers will see for {accountLabel}.</p>
    <CoverFrame video={video} timestampMs={timestamp} onReady={(loaded, failed) => setPreviewStatus(failed ? "error" : loaded ? "ready" : "loading")}/>
    <Field label={`Cover frame · ${coverTime(timestamp)}`}><input type="range" min="0" max={max} step="100" value={timestamp} aria-label="Cover frame" aria-valuetext={coverTime(timestamp)} onChange={event => { setPreviewStatus("loading"); setTimestamp(Number(event.target.value)); }}/></Field>
    <p className="bridge-small" aria-live="polite">{ready ? "Preview ready" : previewStatus === "error" ? "Preview unavailable" : "Loading cover preview…"}</p>
    <div className="bridge-modal-actions"><button type="button" className="bridge-button secondary" onClick={onClose}>Cancel</button><button type="button" className="bridge-button" disabled={!ready} onClick={() => onSave({ mediaId: video.id, timestampMs: timestamp })}>Use this cover</button></div>
  </Modal>;
}

export default function VideoCoverPicker({ account, video, settings = {}, onChange }) {
  const [open, setOpen] = useState(false), cover = selectedCover(settings, video);
  const container = useRef(null);
  function save(videoCover) {
    const next = { ...settings, videoCover }; delete next.thumbnailMediaId;
    onChange(next); setOpen(false);
  }
  function clear() { const next = { ...settings }; delete next.videoCover; onChange(next); }
  return <div ref={container} className="bridge-video-cover">
    <strong>Video cover</strong>
    {cover && <CoverFrame key={`${video.id}:${cover.timestampMs}`} video={video} timestampMs={cover.timestampMs}/>}
    <p className="bridge-small">{cover ? `Selected frame at ${coverTime(cover.timestampMs)}` : "The platform will choose a cover unless you select a frame."}</p>
    {account.platform === "youtube" && <p className="bridge-small">Your YouTube channel must allow custom thumbnails.</p>}
    <div className="bridge-inline-actions"><button type="button" className="bridge-button secondary small" onClick={() => setOpen(true)}>{cover ? "Change cover" : "Choose cover"}</button>{cover && <button type="button" className="bridge-text-button" onClick={clear}>Use automatic cover</button>}</div>
    {open && createPortal(<CoverDialog key={video.id} video={video} initialTimestamp={cover?.timestampMs || 0} accountLabel={account.label} onClose={() => setOpen(false)} onSave={save}/>, container.current.closest(".bridge") || document.body)}
  </div>;
}
