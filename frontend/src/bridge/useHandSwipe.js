import { useEffect, useRef, useState } from "react";
import wasmLoaderPath from "@mediapipe/tasks-vision/vision_wasm_internal.js?url";
import wasmBinaryPath from "@mediapipe/tasks-vision/vision_wasm_internal.wasm?url";
import { createHandSwipeTracker, handBox, handKeys, handTone, isFist, palmCenter } from "./swipeGesture.js";

// Hand-swipe control for Swipe or Push. MediaPipe's hand landmarker runs in
// the browser, so camera frames never leave the device. The WebAssembly
// runtime (about 3 MB compressed) is served from Meadow; the model (about
// 8 MB) comes from Google's model store and is kept in Cache Storage, so only
// the first visit downloads it.
const MODEL_URL = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";
const MODEL_CACHE = "meadow-hand-tracking-v1";
const PUSH_COLOR = "#22c55e";
const SKIP_COLOR = "#ef4444";
const FIST_COLOR = "#f59e0b";
const PAUSED_COLOR = "#94a3b8";

// Download progress of the model, shared with any camera stage showing it.
let modelProgress = 0;
const progressListeners = new Set();
function setModelProgress(value) {
  modelProgress = value;
  progressListeners.forEach(listener => listener(value));
}

async function download(url, onProgress) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Download failed (${response.status})`);
  const total = Number(response.headers.get("content-length")) || 0;
  if (!response.body || !total) return new Uint8Array(await response.arrayBuffer());
  const reader = response.body.getReader(), chunks = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.byteLength;
    onProgress(Math.min(1, loaded / total));
  }
  const bytes = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

async function loadModel() {
  let cache = null;
  try {
    cache = await caches.open(MODEL_CACHE);
    const saved = await cache.match(MODEL_URL);
    if (saved) { setModelProgress(1); return new Uint8Array(await saved.arrayBuffer()); }
  } catch { cache = null; }
  const bytes = await download(MODEL_URL, setModelProgress);
  setModelProgress(1);
  try { await cache?.put(MODEL_URL, new Response(bytes)); } catch { /* Storage is full or blocked; this visit still works. */ }
  return bytes;
}

/** Starts downloading hand tracking (the code, the WebAssembly runtime and
 * the model, all at once) without turning anything on. Safe to call often. */
let downloadPromise = null;
export function prefetchHandTracking() {
  downloadPromise ||= Promise.all([
    import("@mediapipe/tasks-vision"),
    loadModel(),
    // Read in full so the runtime is in the browser cache when MediaPipe asks for it.
    fetch(wasmBinaryPath).then(response => { if (!response.ok) throw new Error(`Download failed (${response.status})`); return response.arrayBuffer(); }),
  ]).then(([vision, model]) => ({ HandLandmarker: vision.HandLandmarker, model }));
  downloadPromise.catch(() => { downloadPromise = null; setModelProgress(0); });
  return downloadPromise;
}

let landmarkerPromise = null;
function loadHandLandmarker() {
  landmarkerPromise ||= (async () => {
    const { HandLandmarker, model } = await prefetchHandTracking();
    const options = delegate => ({ baseOptions: { modelAssetBuffer: model, delegate }, runningMode: "VIDEO", numHands: 2, minHandDetectionConfidence: 0.6, minHandPresenceConfidence: 0.6, minTrackingConfidence: 0.5 });
    const fileset = { wasmLoaderPath, wasmBinaryPath };
    try { return await HandLandmarker.createFromOptions(fileset, options("GPU")); }
    catch { return HandLandmarker.createFromOptions(fileset, options("CPU")); }
  })();
  landmarkerPromise.catch(() => { landmarkerPromise = null; });
  return landmarkerPromise;
}

function cameraError(error) {
  if (error?.name === "NotAllowedError" || error?.name === "SecurityError") return "Camera access is blocked. Allow the camera for app.findmeadow.com in your browser's site settings, then try again.";
  if (error?.name === "NotFoundError" || error?.name === "OverconstrainedError") return "No camera was found on this device.";
  if (error?.name === "NotReadableError") return "Another app is using the camera. Close it and try again.";
  return "Hand tracking could not start. Refresh the page and try again.";
}

/** Draw a red or green box over each hand on the overlay canvas. The video is
 * shown with object-fit: cover, so frame coordinates are mapped through the
 * same crop. */
function drawHands(canvas, video, hands, minDistance, paused) {
  const width = canvas.clientWidth, height = canvas.clientHeight, ratio = window.devicePixelRatio || 1;
  if (!width || !height) return;
  if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
  }
  const context = canvas.getContext("2d");
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, width, height);
  if (!video.videoWidth || !video.videoHeight) return;
  const scale = Math.max(width / video.videoWidth, height / video.videoHeight);
  const shownWidth = video.videoWidth * scale, shownHeight = video.videoHeight * scale;
  const left = (width - shownWidth) / 2, top = (height - shownHeight) / 2;
  hands.forEach(hand => {
    const tone = handTone({ box: hand.box, active: hand.active, offset: hand.offset, minDistance });
    const fist = hand.fist && hand.active;
    const strength = fist || paused ? 0 : tone.strength;
    const color = fist ? FIST_COLOR : paused ? PAUSED_COLOR : tone.push ? PUSH_COLOR : SKIP_COLOR;
    // A lowered hand (resting, or holding a phone) is drawn faintly: it cannot swipe.
    context.globalAlpha = hand.active ? 1 : 0.45;
    const x = left + hand.box.x0 * shownWidth, y = top + hand.box.y0 * shownHeight;
    const w = (hand.box.x1 - hand.box.x0) * shownWidth, h = (hand.box.y1 - hand.box.y0) * shownHeight;
    context.fillStyle = `${color}${Math.round((0.12 + strength * 0.2) * 255).toString(16).padStart(2, "0")}`;
    context.fillRect(x, y, w, h);
    context.lineWidth = 3 + strength * 5;
    context.strokeStyle = color;
    context.strokeRect(x, y, w, h);
    const label = !hand.active ? "raise to swipe" : fist ? (paused ? "✊ RESUME" : "✊ PAUSE") : paused ? "PAUSED" : tone.push ? "PUSH →" : "← SKIP";
    context.font = "700 15px system-ui, -apple-system, sans-serif";
    const labelWidth = context.measureText(label).width + 16;
    const labelY = y >= 26 ? y - 26 : y + h;
    context.fillStyle = color;
    context.fillRect(x - context.lineWidth / 2, labelY, labelWidth, 26);
    context.fillStyle = "#fff";
    context.fillText(label, x + 8 - context.lineWidth / 2, labelY + 18);
    context.globalAlpha = 1;
  });
}

const coarse = value => Math.round(value * 20) / 20;

/** Streams the camera into `videoRef`, draws hand boxes on `overlayRef`, and
 * calls `onGesture("left" | "right" | "fist")`. */
export function useHandSwipe({ enabled, paused = false, onGesture }) {
  const videoRef = useRef(null);
  const overlayRef = useRef(null);
  const gestureRef = useRef(onGesture);
  gestureRef.current = onGesture;
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const [state, setState] = useState({ status: "off", error: "", handVisible: false, offset: 0, fist: false });
  const trackerRef = useRef(createHandSwipeTracker());
  const [progress, setProgress] = useState(modelProgress);

  useEffect(() => {
    if (!enabled) return undefined;
    // Whole percents are enough for the loading bar.
    const listener = value => setProgress(Math.floor(value * 100) / 100);
    progressListeners.add(listener);
    listener(modelProgress);
    return () => progressListeners.delete(listener);
  }, [enabled]);

  useEffect(() => {
    if (!enabled) { setState({ status: "off", error: "", handVisible: false, offset: 0, fist: false }); return undefined; }
    if (!navigator.mediaDevices?.getUserMedia) { setState({ status: "error", error: "This browser cannot use the camera.", handVisible: false, offset: 0, fist: false }); return undefined; }
    let cancelled = false, stream = null, frame = 0, lastTime = -1;
    const tracker = trackerRef.current;
    tracker.reset();
    // Hand tracking downloads while the camera starts, not after it.
    const landmarkerReady = loadHandLandmarker();
    landmarkerReady.catch(() => {});
    (async () => {
      try {
        setState({ status: "starting", error: "", handVisible: false, offset: 0, fist: false });
        stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } } });
        if (cancelled) return;
        const video = videoRef.current;
        video.srcObject = stream;
        await video.play();
        setState(current => ({ ...current, status: "loading" }));
        const landmarker = await landmarkerReady;
        if (cancelled) return;
        setState(current => ({ ...current, status: "ready" }));
        const loop = () => {
          if (cancelled) return;
          const source = videoRef.current;
          if (source && source.readyState >= 2 && source.currentTime !== lastTime) {
            lastTime = source.currentTime;
            const now = performance.now();
            const result = landmarker.detectForVideo(source, now);
            const landmarkSets = result.landmarks || [];
            const keys = handKeys(landmarkSets.map((_, index) => result.handedness?.[index]?.[0]?.categoryName));
            // World landmarks are 3D, so a fist reads the same at any angle.
            const found = landmarkSets.map((landmarks, index) => ({ key: keys[index], palm: palmCenter(landmarks), box: handBox(landmarks), fist: isFist(result.worldLandmarks?.[index] || landmarks) })).filter(hand => hand.palm);
            // Every raised hand is tracked on its own; a fist pauses or resumes.
            const { gesture, offset, hands } = tracker.update(now, found);
            if (overlayRef.current) drawHands(overlayRef.current, source, hands, tracker.minDistance, pausedRef.current);
            const next = { handVisible: hands.some(hand => hand.active), offset: coarse(offset), fist: hands.some(hand => hand.active && hand.fist) };
            setState(current => current.handVisible === next.handVisible && current.offset === next.offset && current.fist === next.fist ? current : { ...current, ...next });
            if (gesture) gestureRef.current(gesture);
          }
          frame = requestAnimationFrame(loop);
        };
        frame = requestAnimationFrame(loop);
      } catch (error) {
        if (!cancelled) setState({ status: "error", error: cameraError(error), handVisible: false, offset: 0, fist: false });
      }
    })();
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach(track => track.stop());
      if (videoRef.current) videoRef.current.srcObject = null;
      const canvas = overlayRef.current;
      canvas?.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    };
  }, [enabled]);

  return { videoRef, overlayRef, minDistance: trackerRef.current.minDistance, progress, ...state };
}
