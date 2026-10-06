import { useEffect, useRef, useState } from "react";
import wasmLoaderPath from "@mediapipe/tasks-vision/vision_wasm_internal.js?url";
import wasmBinaryPath from "@mediapipe/tasks-vision/vision_wasm_internal.wasm?url";
import { createSwipeDetector, palmCenter } from "./swipeGesture.js";

// Hand-swipe control for Swipe or Push. MediaPipe's hand landmarker runs in
// the browser, so camera frames never leave the device. The WebAssembly
// runtime is served from Meadow; the model comes from Google's model store.
const MODEL_URL = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

let landmarkerPromise = null;
function loadHandLandmarker() {
  landmarkerPromise ||= (async () => {
    const { HandLandmarker } = await import("@mediapipe/tasks-vision");
    const options = delegate => ({ baseOptions: { modelAssetPath: MODEL_URL, delegate }, runningMode: "VIDEO", numHands: 1, minHandDetectionConfidence: 0.6, minHandPresenceConfidence: 0.6, minTrackingConfidence: 0.5 });
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

const round = value => Math.round(value * 100) / 100;

/** Streams the camera into `videoRef` and calls `onGesture("left" | "right")`. */
export function useHandSwipe({ enabled, onGesture }) {
  const videoRef = useRef(null);
  const gestureRef = useRef(onGesture);
  gestureRef.current = onGesture;
  const [state, setState] = useState({ status: "off", error: "", hand: null, offset: 0 });
  const detectorRef = useRef(createSwipeDetector());

  useEffect(() => {
    if (!enabled) { setState({ status: "off", error: "", hand: null, offset: 0 }); return undefined; }
    if (!navigator.mediaDevices?.getUserMedia) { setState({ status: "error", error: "This browser cannot use the camera.", hand: null, offset: 0 }); return undefined; }
    let cancelled = false, stream = null, frame = 0, lastTime = -1;
    const detector = detectorRef.current;
    detector.reset();
    (async () => {
      try {
        setState({ status: "starting", error: "", hand: null, offset: 0 });
        stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } } });
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
            const hand = landmarker.detectForVideo(source, now).landmarks?.[0];
            const point = hand ? palmCenter(hand) : null;
            const { gesture, offset } = detector.update(now, point);
            const next = point ? { x: round(point.x), y: round(point.y) } : null;
            setState(current => current.offset === round(offset) && current.hand?.x === next?.x && current.hand?.y === next?.y ? current : { ...current, hand: next, offset: round(offset) });
            if (gesture) gestureRef.current(gesture);
          }
          frame = requestAnimationFrame(loop);
        };
        frame = requestAnimationFrame(loop);
      } catch (error) {
        if (!cancelled) setState({ status: "error", error: cameraError(error), hand: null, offset: 0 });
      }
    })();
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach(track => track.stop());
      if (videoRef.current) videoRef.current.srcObject = null;
    };
  }, [enabled]);

  return { videoRef, minDistance: detectorRef.current.minDistance, ...state };
}
