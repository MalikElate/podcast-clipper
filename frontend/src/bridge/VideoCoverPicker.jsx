import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Alert, Field, Modal } from "./ui.jsx";
import { coverTime, selectedCover, selectedCoverImage, coverImageError } from "./videoCover.js";
import UploadProgress from "./UploadProgress.jsx";

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

export default function VideoCoverPicker({ account, video, settings = {}, media = [], onChange, onUpload, onBusyChange, disabled = false }) {
  const [open, setOpen] = useState(false), cover = selectedCover(settings, video);
  const [uploading, setUploading] = useState(false), [progress, setProgress] = useState(null), [error, setError] = useState("");
  const image = selectedCoverImage(settings, video, media);
  const container = useRef(null), fileInput = useRef(null), controller = useRef(null), busy = useRef(false), alive = useRef(true);
  const latest = useRef({ settings, onChange, onBusyChange }); latest.current = { settings, onChange, onBusyChange };
  function finishBusy() { if (busy.current) { busy.current = false; latest.current.onBusyChange?.(-1); } }
  useEffect(() => { alive.current = true; return () => { alive.current = false; controller.current?.abort(); finishBusy(); }; }, []);
  function save(videoCover) {
    const next = { ...settings, videoCover }; delete next.thumbnailMediaId; delete next.thumbnailVideoId;
    onChange(next); setOpen(false);
  }
  function clear() { const next = { ...settings }; delete next.videoCover; delete next.thumbnailMediaId; delete next.thumbnailVideoId; onChange(next); setError(""); }
  async function upload(file) {
    if (busy.current || disabled || !onUpload) return;
    const invalid = coverImageError(file); setError(invalid); if (invalid) return;
    const request = new AbortController(); controller.current = request;
    busy.current = true; latest.current.onBusyChange?.(1); setUploading(true); setProgress(null);
    let uploadError = "";
    try {
      const uploaded = await onUpload([file], event => { uploadError = event.error || uploadError; if (alive.current) setProgress(event); }, { signal: request.signal });
      if (!alive.current || request.signal.aborted) return;
      const item = uploaded[0];
      if (!item) throw new Error(uploadError || "The cover could not be uploaded. Please try again.");
      if (item.kind !== "image" || item.status !== "ready") throw new Error("Choose a ready cover image.");
      const invalidImage = coverImageError({ type: item.mime, size: item.bytes });
      if (invalidImage) throw new Error(invalidImage);
      const next = { ...latest.current.settings, thumbnailMediaId: item.id, thumbnailVideoId: video.id }; delete next.videoCover;
      latest.current.onChange(next);
    } catch (failure) { if (alive.current && !request.signal.aborted) setError(failure.message); }
    finally { finishBusy(); controller.current = null; if (alive.current) { setUploading(false); setProgress(null); } }
  }
  return <div ref={container} className="bridge-video-cover">
    <strong>Video cover</strong>
    {image ? <img className="bridge-cover-image" src={image.url} alt={`Custom video cover for ${account.label}`}/> : cover && <CoverFrame key={`${video.id}:${cover.timestampMs}`} video={video} timestampMs={cover.timestampMs}/>}
    <p className="bridge-small">{image ? image.filename : cover ? `Selected frame at ${coverTime(cover.timestampMs)}` : "The platform will choose a cover unless you select a frame or upload an image."}</p>
    {onUpload && <p className="bridge-small">Cover images: JPG, PNG, or WebP, up to 10 MB.</p>}
    {account.platform === "tiktok" && onUpload && <p className="bridge-small">For TikTok, an uploaded cover may briefly appear as the first frame of the video.</p>}
    {account.platform === "youtube" && <p className="bridge-small">Your YouTube channel must allow custom thumbnails.</p>}
    <input ref={fileInput} type="file" hidden accept="image/jpeg,image/png,image/webp" aria-label={`Upload cover image for ${account.label}`} onChange={event => { const file = event.target.files[0]; event.target.value = ""; if (file) upload(file); }}/>
    <Alert message={error}/>
    {uploading && <UploadProgress progress={progress} onCancel={() => controller.current?.abort()}/>}
    <div className="bridge-inline-actions"><button type="button" className="bridge-button secondary small" disabled={disabled || uploading} onClick={() => setOpen(true)}>{cover || image ? "Change cover" : "Choose cover"}</button>{onUpload && <button type="button" className="bridge-button secondary small" disabled={disabled || uploading} onClick={() => fileInput.current?.click()}>Upload cover image</button>}{(cover || image) && <button type="button" className="bridge-text-button" disabled={disabled || uploading} onClick={clear}>Use automatic cover</button>}</div>
    {open && createPortal(<CoverDialog key={video.id} video={video} initialTimestamp={cover?.timestampMs || 0} accountLabel={account.label} onClose={() => setOpen(false)} onSave={save}/>, container.current.closest(".bridge") || document.body)}
  </div>;
}
