import { useEffect, useRef, useState } from 'react';
import { Field } from './freeToolUi.jsx';
import { decodeAudio, drawContained, editedDuration, encodeWav, exportAudioContext, loadVideo, recordVideo, safeFileName, trimFrames, validateMediaFile, videoGeometry, wrapCanvasText } from './mediaProcessing.js';
import './mediaTools.css';

const AUDIO_TYPES = '.mp3,.wav,.m4a,.aac,.ogg,.oga,.webm,audio/*';
const VIDEO_TYPES = '.mp4,.mov,.webm,.m4v,video/*';
const IMAGE_TYPES = 'image/jpeg,image/png,image/webp';
const seconds = value => `${value.toFixed(2)} seconds`;

function useMedia(kind) {
  const [media, setMedia] = useState(null), [error, setError] = useState(''), [loading, setLoading] = useState(false);
  const request = useRef(0), lease = useRef(null), pending = useRef(null);
  useEffect(() => () => { request.current++; pending.current?.abort(); if (lease.current) URL.revokeObjectURL(lease.current); }, []);
  async function load(file) {
    const sequence = ++request.current; pending.current?.abort(); const controller = new AbortController(); pending.current = controller;
    if (lease.current) URL.revokeObjectURL(lease.current); lease.current = null;
    setMedia(null); setError(''); setLoading(false);
    if (!file) return;
    let url;
    try {
      const image = ['mixed', 'image'].includes(kind) && ['image/jpeg', 'image/png', 'image/webp'].includes(file.type);
      if (kind === 'image' && !image) throw new Error('Choose a JPG, PNG, or WebP cover image.');
      if (image) { if (file.size > 20 * 1024 * 1024) throw new Error('Choose an image smaller than 20 MB.'); }
      else validateMediaFile(file, kind === 'audio' ? 'audio' : 'video');
      setLoading(true); url = URL.createObjectURL(file);
      let buffer, width, height, duration;
      if (kind === 'audio') { buffer = await decodeAudio(file); duration = buffer.duration; }
      else if (image) {
        const element = new Image(); element.src = url; await element.decode(); width = element.naturalWidth; height = element.naturalHeight;
        if (!width || width * height > 40_000_000) throw new Error('Choose an image with no more than 40 megapixels.');
      } else {
        const video = await loadVideo(url, controller.signal);
        width = video.videoWidth; height = video.videoHeight; duration = video.duration;
        video.removeAttribute('src'); video.load();
        if (kind !== 'mixed') editedDuration(duration, 1);
      }
      if (sequence !== request.current) { URL.revokeObjectURL(url); return; }
      lease.current = url; setMedia({ url, file, name: file.name, buffer, width, height, duration, image });
    } catch (failure) { if (url) URL.revokeObjectURL(url); if (sequence === request.current && failure.name !== 'AbortError') setError(failure.message || 'This file could not be read. Try another supported file.'); }
    finally { if (sequence === request.current) setLoading(false); }
  }
  return { media, error, loading, load };
}

function useOutput() {
  const [result, setResult] = useState(null), [preview, setPreview] = useState(null);
  useEffect(() => {
    if (!result) { setPreview(null); return; }
    const url = URL.createObjectURL(result.blob); setPreview({ result, url }); return () => URL.revokeObjectURL(url);
  }, [result]);
  // Never expose a revoked or previous result's URL during the effect transition.
  return { result, url: preview?.result === result ? preview?.url || '' : '', setResult };
}

function ExportResult({ output, audio = false }) {
  return output.url ? <div className="ft-media-output"><h3>Your download is ready</h3>{audio ? <audio src={output.url} controls aria-label="Trimmed audio preview" /> : <video src={output.url} controls playsInline aria-label="Exported video preview" />}<a className="ft-button" href={output.url} download={output.result.name}>Download {audio ? 'WAV clip' : output.result.name.endsWith('.mp4') ? 'MP4 video' : 'WebM video'}</a><p className="ft-hint">{(output.result.blob.size / 1024 / 1024).toFixed(2)} MB · Review the downloaded file before publishing.</p></div> : null;
}

function Waveform({ buffer, start, end }) {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current, context = canvas.getContext('2d'); context.clearRect(0, 0, 800, 120);
    if (!buffer) return;
    const samples = buffer.getChannelData(0), stride = Math.max(1, Math.floor(samples.length / 800));
    context.fillStyle = '#e4edda'; context.fillRect(Number(start) / buffer.duration * 800, 0, (Number(end) - Number(start)) / buffer.duration * 800, 120);
    context.strokeStyle = '#385447'; context.beginPath();
    for (let x = 0; x < 800; x++) {
      let peak = 0; const step = Math.max(1, Math.floor(stride / 100));
      for (let i = x * stride; i < Math.min(samples.length, (x + 1) * stride); i += step) peak = Math.max(peak, Math.abs(samples[i]));
      context.moveTo(x, 60 - peak * 54); context.lineTo(x, 60 + peak * 54);
    }
    context.stroke();
  }, [buffer, start, end]);
  return <canvas ref={ref} width="800" height="120" className="ft-waveform" aria-label="Audio waveform with selected range highlighted" />;
}

export function AudioTrimmer() {
  const input = useMedia('audio'), output = useOutput();
  const [start, setStart] = useState('0'), [end, setEnd] = useState('0'), [error, setError] = useState(''), [playing, setPlaying] = useState(false);
  const selection = useRef(null), original = useRef(null);
  function stop(update = true) { if (selection.current) { const { source, context } = selection.current; source.onended = null; try { source.stop(); } catch { /* Already stopped. */ } void context.close(); selection.current = null; } if (update) setPlaying(false); }
  useEffect(() => { stop(); setStart('0'); setEnd(input.media?.duration.toFixed(6) || '0'); output.setResult(null); setError(''); }, [input.media]);
  useEffect(() => () => stop(false), []);
  const update = setter => event => { stop(); setter(event.target.value); output.setResult(null); setError(''); };
  async function preview() {
    try {
      trimFrames(input.media.buffer, start, end); stop(); original.current?.pause();
      const Audio = window.AudioContext || window.webkitAudioContext, context = new Audio(), source = context.createBufferSource();
      selection.current = { context, source }; source.buffer = input.media.buffer; source.connect(context.destination); await context.resume();
      if (selection.current?.source !== source) return;
      source.onended = () => stop(); source.start(0, Number(start), Number(end) - Number(start)); setPlaying(true); setError('');
    } catch (failure) { stop(); setError(failure.message); }
  }
  function trim() {
    stop(); original.current?.pause(); setError('');
    try { output.setResult({ blob: new Blob([encodeWav(input.media.buffer, start, end)], { type: 'audio/wav' }), name: `${safeFileName(input.media.name)}-trimmed.wav` }); }
    catch (failure) { setError(failure.message); }
  }
  return <div className="ft-workbench"><div className="ft-controls"><Field label="Choose audio" type="file" accept={AUDIO_TYPES} onChange={event => { stop(); void input.load(event.target.files[0]); }} hint="Up to 100 MB and ten minutes. Files stay on your device." />{input.loading && <p role="status">Reading audio…</p>}{input.media && <><audio ref={original} src={input.media.url} controls aria-label="Original audio" onPlay={() => stop()} /><p className="ft-hint">Original duration: {seconds(input.media.duration)}</p></>}
    <div className="ft-two-fields"><Field label="Start (seconds)" type="number" min="0" max={input.media?.duration} step="0.01" value={start} onChange={update(setStart)} disabled={!input.media} /><Field label="End (seconds)" type="number" min="0" max={input.media?.duration} step="0.01" value={end} onChange={update(setEnd)} disabled={!input.media} /></div>
    <button className="ft-button secondary" disabled={!input.media} onClick={() => playing ? stop() : void preview()}>{playing ? 'Stop selection' : 'Preview selection'}</button><button className="ft-button" disabled={!input.media} onClick={trim}>Create WAV clip</button>{(input.error || error) && <p role="alert" className="ft-error">{input.error || error}</p>}</div>
    <div className="ft-result"><h2>Your audio selection</h2>{input.media ? <><Waveform buffer={input.media.buffer} start={start} end={end} /><p>Selected duration: {seconds(Math.max(0, Number(end) - Number(start)))}</p></> : <p className="ft-hint">Choose audio to see its waveform and select a clip.</p>}<ExportResult output={output} audio /></div></div>;
}

function useExport() {
  const [busy, setBusy] = useState(false), [progress, setProgress] = useState(0), [error, setError] = useState('');
  const controller = useRef(null); useEffect(() => () => { controller.current?.abort(); controller.current = null; }, []);
  async function run(task) {
    const current = new AbortController(); controller.current = current; setBusy(true); setProgress(0); setError('');
    try { await task(current.signal, setProgress); }
    catch (failure) { if (controller.current === current) setError(failure.name === 'AbortError' ? 'Export cancelled. No partial file was saved.' : failure.message || 'Export could not finish. Try another file.'); }
    finally { if (controller.current === current) { setBusy(false); controller.current = null; } }
  }
  return { busy, progress, error, run, cancel: () => controller.current?.abort() };
}

function ExportProgress({ job }) {
  return <>{job.busy && <div className="ft-export-progress"><label>Exporting {Math.round(job.progress * 100)}%<progress value={job.progress} max="1" /></label><button type="button" className="ft-button secondary" onClick={job.cancel}>Cancel export</button><p className="ft-hint" role="status">Keep this tab visible and your device awake. Export runs in real time.</p></div>}{job.error && <p className="ft-error" role="alert">{job.error}</p>}</>;
}

export function VideoEditor({ rotate = false }) {
  const input = useMedia('video'), output = useOutput(), job = useExport();
  const [rotation, setRotation] = useState(90), [speed, setSpeed] = useState(1), [mute, setMute] = useState(false);
  const preview = useRef(null);
  useEffect(() => { output.setResult(null); if (preview.current) preview.current.playbackRate = speed; }, [input.media, rotation, speed, mute]);
  let geometry, duration, settingsError;
  if (input.media) try { geometry = videoGeometry(input.media.width, input.media.height, rotate ? rotation : 0); duration = editedDuration(input.media.duration, speed); } catch (error) { settingsError = error.message; }
  function exportClip() {
    output.setResult(null); preview.current?.pause();
    void job.run(async (signal, onProgress) => {
      let video, context;
      try {
        context = exportAudioContext();
        video = await loadVideo(input.media.url, signal);
        const canvas = document.createElement('canvas'); canvas.width = geometry.width; canvas.height = geometry.height;
        const draw = () => drawRotated(canvas, video, geometry, rotate ? rotation : 0);
        const result = await recordVideo({ canvas, draw, video, speed, mute, signal, context, onProgress });
        signal.throwIfAborted();
        output.setResult({ blob: result.blob, name: `${safeFileName(input.media.name)}-${rotate ? `rotated-${rotation}` : `speed-${speed}x`}.${result.extension}` });
      } finally { if (video) { video.removeAttribute('src'); video.load(); } if (context && context.state !== 'closed') await context.close(); }
    });
  }
  return <div className="ft-workbench"><div><fieldset className="ft-controls" disabled={job.busy}><Field label="Choose video" type="file" accept={VIDEO_TYPES} onChange={event => void input.load(event.target.files[0])} hint="MP4, MOV or WebM your browser can play. Up to 300 MB and ten minutes." />{input.loading && <p role="status">Reading video…</p>}
    {rotate ? <Field label="Rotation">{id => <select id={id} value={rotation} onChange={event => setRotation(Number(event.target.value))}>{[0,90,180,270].map(value => <option key={value} value={value}>{value}° clockwise</option>)}</select>}</Field> : <Field label="Playback speed">{id => <select id={id} value={speed} onChange={event => setSpeed(Number(event.target.value))}>{[.25,.5,.75,1,1.25,1.5,2,3,4].map(value => <option key={value} value={value}>{value}×{value === 1 ? ' (original)' : ''}</option>)}</select>}</Field>}
    <label className="ft-checkbox"><input type="checkbox" checked={mute} onChange={event => setMute(event.target.checked)} />Mute exported audio</label>{input.media && <p className="ft-hint">Output: {geometry?.width} × {geometry?.height} · {duration ? seconds(duration) : 'Choose a faster speed'}</p>}
    <button className="ft-button" onClick={exportClip} disabled={!input.media || Boolean(settingsError)}>Export {rotate ? 'rotated video' : 'video'}</button>{(input.error || settingsError) && <p role="alert" className="ft-error">{input.error || settingsError}</p>}<p className="ft-hint">Export format depends on your browser. Clips are re-encoded at up to a 1920-pixel longest side.</p></fieldset><div className="ft-media-job"><ExportProgress job={job} /></div></div>
    <div className="ft-result"><h2>{rotate ? 'Orientation preview' : 'Speed preview'}</h2>{input.media && geometry ? <VideoPreview key={input.media.url} media={input.media} geometry={geometry} rotation={rotate ? rotation : 0} speed={speed} mute={mute} videoRef={preview} disabled={job.busy} /> : <p className="ft-hint">Choose a clip to preview your edit.</p>}<ExportResult output={output} /></div></div>;
}

function drawRotated(canvas, video, geometry, rotation) {
  const context = canvas.getContext('2d'); context.fillStyle = '#000'; context.fillRect(0, 0, canvas.width, canvas.height);
  context.save(); context.translate(canvas.width / 2, canvas.height / 2); context.rotate(rotation * Math.PI / 180);
  context.drawImage(video, -geometry.drawWidth / 2, -geometry.drawHeight / 2, geometry.drawWidth, geometry.drawHeight); context.restore();
}

function VideoPreview({ media, geometry, rotation, speed, mute, videoRef, disabled }) {
  const canvas = useRef(null);
  const [ready, setReady] = useState(false), [playing, setPlaying] = useState(false), [position, setPosition] = useState(0), [error, setError] = useState('');
  useEffect(() => {
    if (!ready) return;
    let frame;
    const video = videoRef.current; video.playbackRate = speed;
    const draw = () => { if (video.readyState >= 2 && canvas.current) drawRotated(canvas.current, video, geometry, rotation); frame = requestAnimationFrame(draw); };
    draw(); return () => cancelAnimationFrame(frame);
  }, [ready, geometry.width, geometry.height, rotation, speed]);
  useEffect(() => () => videoRef.current?.pause(), []);
  return <div><video hidden ref={videoRef} src={media.url} playsInline muted={mute} onLoadedData={() => setReady(true)} onTimeUpdate={event => setPosition(event.currentTarget.currentTime)} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} />
    <canvas ref={canvas} width={geometry.width} height={geometry.height} className="ft-media-canvas" aria-label="Edited video preview" />
    <div className="ft-preview-controls"><button className="ft-button secondary" disabled={!ready || disabled} onClick={() => { setError(''); if (playing) videoRef.current.pause(); else void videoRef.current.play().catch(() => setError('The browser blocked playback. Try again.')); }}>{playing ? 'Pause preview' : 'Play preview'}</button>
    <Field label="Preview position" type="range" min="0" max={media.duration} step="0.01" value={position} disabled={!ready || disabled} onChange={event => { videoRef.current.currentTime = Number(event.target.value); setPosition(Number(event.target.value)); }} /><span className="ft-hint">{position.toFixed(1)} / {media.duration.toFixed(1)}s</span></div>{error && <p role="alert" className="ft-error">{error}</p>}</div>;
}

export function AudioToVideo() {
  const input = useMedia('audio'), cover = useMedia('image'), output = useOutput(), job = useExport();
  const [shape, setShape] = useState('portrait'), [title, setTitle] = useState(''), [color, setColor] = useState('#233b31');
  const canvas = useRef(null), original = useRef(null), coverImage = useRef(null);
  const [coverReady, setCoverReady] = useState(false);
  const [width, height] = shape === 'portrait' ? [720,1280] : shape === 'square' ? [720,720] : [1280,720];
  function draw() {
    const element = canvas.current; if (!element) return;
    const context = element.getContext('2d'); context.fillStyle = color; context.fillRect(0, 0, element.width, element.height);
    if (coverReady && coverImage.current) drawContained(context, coverImage.current, width, height);
    if (title.trim()) {
      context.font = '600 44px system-ui'; const lines = wrapCanvasText(context, title, width - 80);
      const top = height - lines.length * 54 - 64;
      context.fillStyle = '#233b31e6'; context.fillRect(0, Math.max(0, top - 24), width, height - top + 24);
      context.fillStyle = '#fff'; context.textAlign = 'center'; lines.forEach((line, index) => context.fillText(line, width / 2, top + index * 54 + 44)); context.textAlign = 'left';
    }
  }
  useEffect(() => { output.setResult(null); draw(); }, [input.media, cover.media, coverReady, shape, title, color]);
  function exportClip() {
    output.setResult(null); original.current?.pause();
    void job.run(async (signal, onProgress) => {
      const result = await recordVideo({ canvas: canvas.current, draw, audio: input.media.buffer, signal, onProgress });
      signal.throwIfAborted();
      output.setResult({ blob: result.blob, name: `${safeFileName(input.media.name)}-video.${result.extension}` });
    });
  }
  return <div className="ft-workbench"><div><fieldset className="ft-controls" disabled={job.busy}><Field label="Choose audio" type="file" accept={AUDIO_TYPES} onChange={event => void input.load(event.target.files[0])} hint="Up to 100 MB and ten minutes. Processed locally." />{input.loading && <p role="status">Reading audio…</p>}{input.media && <><audio ref={original} src={input.media.url} controls aria-label="Original audio" /><p className="ft-hint">Video duration: {seconds(input.media.duration)}</p></>}
    <Field label="Cover image (optional)" type="file" accept={IMAGE_TYPES} onChange={event => { setCoverReady(false); void cover.load(event.target.files[0]); }} /><Field label="Video shape">{id => <select id={id} value={shape} onChange={event => setShape(event.target.value)}><option value="portrait">Portrait · 720 × 1280</option><option value="square">Square · 720 × 720</option><option value="landscape">Landscape · 1280 × 720</option></select>}</Field><Field label="Title (optional)" value={title} onChange={event => setTitle(event.target.value)} maxLength={120} placeholder="A thought worth sharing" /><Field label="Background color" type="color" value={color} onChange={event => setColor(event.target.value)} />
    <button className="ft-button" onClick={exportClip} disabled={!input.media || cover.loading || (cover.media && !coverReady)}>Create video</button>{(input.error || cover.error) && <p className="ft-error" role="alert">{input.error || cover.error}</p>}<p className="ft-hint">No subtitles or generated footage are added. Export format depends on your browser.</p></fieldset><div className="ft-media-job"><ExportProgress job={job} /></div></div>
    <div className="ft-result"><h2>Your video canvas</h2>{cover.media?.image && <img hidden ref={coverImage} src={cover.media.url} onLoad={() => setCoverReady(true)} alt="" />}<canvas ref={canvas} width={width} height={height} className="ft-media-canvas" aria-label="Audio video cover and title preview" /><ExportResult output={output} /></div></div>;
}

const SAFE_GUIDES = { TikTok: { top: 10, bottom: 24, left: 6, right: 18 }, 'Instagram Reels': { top: 10, bottom: 22, left: 6, right: 16 }, 'YouTube Shorts': { top: 10, bottom: 22, left: 6, right: 16 } };
export function SafeZoneChecker() {
  const input = useMedia('mixed');
  const [platform, setPlatform] = useState('TikTok'), [margins, setMargins] = useState(SAFE_GUIDES.TikTok), [show, setShow] = useState(true);
  return <div className="ft-workbench"><div className="ft-controls"><Field label="Choose a video or image" type="file" accept={`${VIDEO_TYPES},${IMAGE_TYPES}`} onChange={event => void input.load(event.target.files[0])} hint="Videos up to 300 MB; JPG, PNG, or WebP up to 20 MB. No uploads." /><Field label="Guide starting point">{id => <select id={id} value={platform} onChange={event => { setPlatform(event.target.value); setMargins(SAFE_GUIDES[event.target.value]); }}>{Object.keys(SAFE_GUIDES).map(name => <option key={name}>{name}</option>)}</select>}</Field>
    <div className="ft-two-fields">{Object.keys(margins).map(side => <Field key={side} label={`${side[0].toUpperCase() + side.slice(1)} margin (%)`} type="number" min="0" max="40" step="1" value={margins[side]} onChange={event => setMargins({ ...margins, [side]: Math.max(0, Math.min(40, Number(event.target.value))) })} />)}</div><label className="ft-checkbox"><input type="checkbox" checked={show} onChange={event => setShow(event.target.checked)} />Show safe-zone guide</label><p className="ft-hint">Illustrative guides, not official dimensions. App controls and caption length vary. Adjust the margins and check the platform preview.</p>{input.loading && <p role="status">Reading media…</p>}{input.error && <p role="alert" className="ft-error">{input.error}</p>}</div>
    <div className="ft-result"><h2>{platform} composition preview</h2><div className="ft-safe-preview">{input.media ? input.media.image ? <img src={input.media.url} alt="Your composition" /> : <video src={input.media.url} controls playsInline aria-label="Safe-zone video preview" /> : <div className="ft-safe-placeholder"><p>Your video or image</p><span>9:16 preview canvas</span></div>}{show && <div className="ft-safe-guide" style={{ top: `${margins.top}%`, bottom: `${margins.bottom}%`, left: `${margins.left}%`, right: `${margins.right}%` }}><span>Keep important details here</span></div>}</div><p className="ft-hint">The source is fitted into a portrait canvas. Guides do not crop, move, or change the original.</p></div></div>;
}
