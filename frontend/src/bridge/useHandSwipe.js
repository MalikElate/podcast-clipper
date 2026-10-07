import { useEffect, useRef, useState } from "react";
import wasmLoaderPath from "@mediapipe/tasks-vision/vision_wasm_internal.js?url";
import wasmBinaryPath from "@mediapipe/tasks-vision/vision_wasm_internal.wasm?url";
import { createSwipeDetector, handBox, handTone, palmCenter, pickTrackedHand } from "./swipeGesture.js";

// Hand-swipe control for Swipe or Push. MediaPipe's hand landmarker runs in
// the browser, so camera frames never leave the device. The WebAssembly
// runtime is served from Meadow; the model comes from Google's model store.
const MODEL_URL = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";
const PUSH_COLOR = "#22c55e";
const SKIP_COLOR = "#ef4444";

let landmarkerPromise = null;
function loadHandLandmarker() {
  landmarkerPromise ||= (async () => {
    const { HandLandmarker } = await import("@mediapipe/tasks-vision");
    const options = delegate => ({ baseOptions: { modelAssetPath: MODEL_URL, delegate }, runningMode: "VIDEO", numHands: 2, minHandDetectionConfidence: 0.6, minHandPresenceConfidence: 0.6, minTrackingConfidence: 0.5 });
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
function drawHands(canvas, video, hands, tracked, offset, minDistance) {
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
  hands.forEach((hand, index) => {
    const { push, strength } = handTone({ box: hand.box, tracked: index === tracked, offset, minDistance });
    const color = push ? PUSH_COLOR : SKIP_COLOR;
    const x = left + hand.box.x0 * shownWidth, y = top + hand.box.y0 * shownHeight;
    const w = (hand.box.x1 - hand.box.x0) * shownWidth, h = (hand.box.y1 - hand.box.y0) * shownHeight;
    context.fillStyle = `${color}${Math.round((0.12 + strength * 0.2) * 255).toString(16).padStart(2, "0")}`;
    context.fillRect(x, y, w, h);
    context.lineWidth = 3 + strength * 5;
    context.strokeStyle = color;
    context.strokeRect(x, y, w, h);
    const label = push ? "PUSH →" : "← SKIP";
    context.font = "700 15px system-ui, -apple-system, sans-serif";
    const labelWidth = context.measureText(label).width + 16;
    const labelY = y >= 26 ? y - 26 : y + h;
    context.fillStyle = color;
    context.fillRect(x - context.lineWidth / 2, labelY, labelWidth, 26);
    context.fillStyle = "#fff";
    context.fillText(label, x + 8 - context.lineWidth / 2, labelY + 18);
  });
}

const coarse = value => Math.round(value * 20) / 20;

/** Streams the camera into `videoRef`, draws hand boxes on `overlayRef`, and
 * calls `onGesture("left" | "right")`. */
export function useHandSwipe({ enabled, onGesture }) {
  const videoRef = useRef(null);
  const overlayRef = useRef(null);
  const gestureRef = useRef(onGesture);
  gestureRef.current = onGesture;
  const [state, setState] = useState({ status: "off", error: "", handVisible: false, offset: 0 });
  const detectorRef = useRef(createSwipeDetector());

  useEffect(() => {
    if (!enabled) { setState({ status: "off", error: "", handVisible: false, offset: 0 }); return undefined; }
    if (!navigator.mediaDevices?.getUserMedia) { setState({ status: "error", error: "This browser cannot use the camera.", handVisible: false, offset: 0 }); return undefined; }
    let cancelled = false, stream = null, frame = 0, lastTime = -1, previous = null;
    const detector = detectorRef.current;
    detector.reset();
    (async () => {
      try {
        setState({ status: "starting", error: "", handVisible: false, offset: 0 });
        stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } } });
        if (cancelled) return;
        const video = videoRef.current;
        video.srcObject = stream;
        await video.play();
        setState(current => ({ ...current, status: "loading" }));
        const landmarker = await loadHandLandmarker();
        if (cancelled) return;
        setState(current => ({ ...current, status: "ready" }));
        const loop = () => {
          if (cancelled) return;
          const source = videoRef.current;
          if (source && source.readyState >= 2 && source.currentTime !== lastTime) {
            lastTime = source.currentTime;
            const now = performance.now();
            const hands = (landmarker.detectForVideo(source, now).landmarks || []).map(landmarks => ({ palm: palmCenter(landmarks), box: handBox(landmarks) })).filter(hand => hand.palm);
            const tracked = pickTrackedHand(hands, previous);
            previous = tracked >= 0 ? hands[tracked].palm : null;
            const { gesture, offset } = detector.update(now, previous);
            if (overlayRef.current) drawHands(overlayRef.current, source, hands, tracked, offset, detector.minDistance);
            const next = { handVisible: hands.length > 0, offset: coarse(offset) };
            setState(current => current.handVisible === next.handVisible && current.offset === next.offset ? current : { ...current, ...next });
            if (gesture) gestureRef.current(gesture);
          }
          frame = requestAnimationFrame(loop);
        };
        frame = requestAnimationFrame(loop);
      } catch (error) {
        if (!cancelled) setState({ status: "error", error: cameraError(error), handVisible: false, offset: 0 });
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

  return { videoRef, overlayRef, minDistance: detectorRef.current.minDistance, ...state };
}
