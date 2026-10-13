export const MAX_AUDIO_BYTES = 100 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 300 * 1024 * 1024;
export const MAX_SECONDS = 600;

export function validateMediaFile(file, kind) {
  const audio = kind === 'audio';
  const extensions = audio ? /\.(mp3|wav|m4a|aac|ogg|oga|webm)$/i : /\.(mp4|mov|webm|m4v)$/i;
  if (!file || !file.size || !(file.type?.startsWith(`${kind}/`) || extensions.test(file.name))) throw new Error(`Choose a supported ${kind} file.`);
  if (file.size > (audio ? MAX_AUDIO_BYTES : MAX_VIDEO_BYTES)) throw new Error(`Choose ${kind} smaller than ${audio ? 100 : 300} MB.`);
}

export function validateAudio(buffer) {
  if (!Number.isFinite(buffer.duration) || buffer.duration <= 0 || buffer.duration > MAX_SECONDS) throw new Error('Choose audio no longer than ten minutes.');
  if (buffer.numberOfChannels > 2) throw new Error('Choose mono or stereo audio.');
  if (buffer.length * buffer.numberOfChannels > 60_000_000) throw new Error('This audio is too large to edit in the browser. Choose a shorter clip.');
}

export function trimFrames(buffer, start, end) {
  start = Number(start); end = Number(end);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end > buffer.duration + .000001 || end <= start) throw new Error('Choose a start before the end, within the audio duration.');
  const first = Math.floor(start * buffer.sampleRate), last = Math.min(buffer.length, Math.ceil(end * buffer.sampleRate));
  if (last <= first) throw new Error('Choose a selection at least one audio sample long.');
  return { first, last, frames: last - first };
}

export function encodeWav(buffer, start, end) {
  const { first, frames } = trimFrames(buffer, start, end);
  const channels = buffer.numberOfChannels, bytes = frames * channels * 2;
  const result = new ArrayBuffer(44 + bytes), view = new DataView(result);
  const text = (offset, value) => [...value].forEach((char, index) => view.setUint8(offset + index, char.charCodeAt(0)));
  text(0, 'RIFF'); view.setUint32(4, 36 + bytes, true); text(8, 'WAVE'); text(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, channels, true);
  view.setUint32(24, buffer.sampleRate, true); view.setUint32(28, buffer.sampleRate * channels * 2, true);
  view.setUint16(32, channels * 2, true); view.setUint16(34, 16, true); text(36, 'data'); view.setUint32(40, bytes, true);
  const samples = Array.from({ length: channels }, (_, channel) => buffer.getChannelData(channel));
  let offset = 44;
  for (let frame = first; frame < first + frames; frame++) for (const channel of samples) {
    const sample = Math.max(-1, Math.min(1, channel[frame]));
    view.setInt16(offset, Math.round(sample * (sample < 0 ? 32768 : 32767)), true); offset += 2;
  }
  return result;
}

export function videoGeometry(width, height, rotation = 0) {
  if (![width, height].every(value => Number.isFinite(value) && value > 0) || ![0, 90, 180, 270].includes(rotation)) throw new Error('The video dimensions or rotation are invalid.');
  const scale = Math.min(1, 1920 / Math.max(width, height));
  const w = Math.max(2, Math.round(width * scale / 2) * 2), h = Math.max(2, Math.round(height * scale / 2) * 2);
  return { width: rotation % 180 ? h : w, height: rotation % 180 ? w : h, drawWidth: w, drawHeight: h };
}

export function editedDuration(duration, speed) {
  if (!Number.isFinite(duration) || duration <= 0 || duration > MAX_SECONDS || !Number.isFinite(speed) || speed < .25 || speed > 4 || duration / speed > MAX_SECONDS) throw new Error('Choose a clip and speed with an output no longer than ten minutes.');
  return duration / speed;
}

export function recordingFormat(Recorder = globalThis.MediaRecorder) {
  if (!Recorder?.isTypeSupported) throw new Error('This browser cannot export video. Try a current Chrome, Edge, or Safari browser.');
  const mimeType = ['video/mp4;codecs=avc1.42001E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp8,opus', 'video/webm'].find(type => Recorder.isTypeSupported(type));
  if (!mimeType) throw new Error('This browser does not support a usable video export format. Try a different browser.');
  return mimeType;
}

export async function decodeAudio(file) {
  validateMediaFile(file, 'audio');
  const Audio = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!Audio) throw new Error('This browser cannot decode audio. Try a current browser.');
  const context = new Audio();
  try { const buffer = await context.decodeAudioData(await file.arrayBuffer()); validateAudio(buffer); return buffer; }
  catch (error) { if (/Choose|too large/.test(error.message)) throw error; throw new Error('This audio codec could not be read. Try a WAV or MP3 file.'); }
  finally { await context.close(); }
}

export function loadVideo(url, signal) {
  const video = document.createElement('video'); video.playsInline = true; video.preload = 'auto';
  return new Promise((resolve, reject) => {
    const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); video.removeEventListener('loadeddata', ready); video.removeEventListener('error', fail); };
    const fail = () => { cleanup(); video.removeAttribute('src'); video.load(); reject(new Error('This video codec could not be played. Try an MP4 (H.264) or WebM file.')); };
    const abort = () => { cleanup(); video.removeAttribute('src'); video.load(); reject(new DOMException('Export cancelled.', 'AbortError')); };
    const ready = () => { cleanup(); resolve(video); };
    const timer = setTimeout(fail, 15_000);
    video.addEventListener('loadeddata', ready); video.addEventListener('error', fail); signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) { abort(); return; }
    video.src = url; video.load();
  });
}

// Record real frames and audio locally; never relabel an unchanged source file.
export function exportAudioContext() {
  const Audio = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!Audio) throw new Error('This browser cannot export audio. Try a current browser.');
  const context = new Audio();
  // Resume while the Export click still supplies browser user activation.
  void context.resume().catch(() => {});
  return context;
}

export async function recordVideo({ canvas, draw, video, audio, speed = 1, mute = false, signal, context, onProgress = () => {} }) {
  signal?.throwIfAborted();
  if (!canvas.captureStream) throw new Error('This browser cannot export canvas video. Try a current Chrome, Edge, or Safari browser.');
  const mimeType = recordingFormat();
  const duration = video ? editedDuration(video.duration, speed) : audio.duration;
  context ||= exportAudioContext();
  const destination = context.createMediaStreamDestination();
  let source, stream, recorder, frame, timer, sourceEnded, visibility, abort, videoEnded;
  try {
    let resumeTimer;
    try { await Promise.race([context.resume(), new Promise((_, reject) => { resumeTimer = setTimeout(() => reject(new Error('The browser blocked audio playback. Press Export again or try another browser.')), 10_000); })]); }
    finally { clearTimeout(resumeTimer); }
    signal?.throwIfAborted();
    if (video) { video.currentTime = 0; video.playbackRate = speed; source = context.createMediaElementSource(video); }
    else { source = context.createBufferSource(); source.buffer = audio; }
    if (!mute) source.connect(destination);
    draw(); stream = canvas.captureStream(30);
    if (!mute) for (const track of destination.stream.getAudioTracks()) stream.addTrack(track);
    recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 5_000_000 });
    return await new Promise((resolve, reject) => {
      const chunks = []; let error, settled = false, stopped = false;
      const stop = reason => { if (stopped) return; stopped = true; error = reason; if (recorder.state !== 'inactive') recorder.stop(); else { settled = true; reject(reason || new Error('Video export did not start.')); } };
      const tick = () => { if (stopped) return; try { draw(); frame = requestAnimationFrame(tick); } catch { stop(new Error('A video frame could not be rendered. Try another file.')); } };
      abort = () => stop(new DOMException('Export cancelled.', 'AbortError'));
      visibility = () => { if (document.hidden) stop(new Error('Export stopped because the tab became hidden. Keep this tab visible and try again.')); };
      videoEnded = () => stop(); sourceEnded = () => stop();
      signal?.addEventListener('abort', abort, { once: true }); document.addEventListener('visibilitychange', visibility);
      recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      recorder.onerror = () => stop(new Error('Video encoding failed. Try a shorter clip or another browser.'));
      recorder.onstop = () => {
        if (settled) return; settled = true;
        if (error) { reject(error); return; }
        const blob = new Blob(chunks, { type: recorder.mimeType });
        if (!blob.size) { reject(new Error('No video was produced. Try another browser.')); return; }
        onProgress(1); resolve({ blob, extension: blob.type.startsWith('video/mp4') ? 'mp4' : 'webm' });
      };
      const started = performance.now(); let lastPosition = 0, lastAdvance = started;
      timer = setInterval(() => {
        const now = performance.now(), position = video ? video.currentTime / speed : (now - started) / 1000;
        onProgress(Math.min(.99, position / duration));
        if (position > lastPosition + .01) { lastPosition = position; lastAdvance = now; }
        if (now - lastAdvance > 20_000 || now - started > duration * 1000 + 20_000) stop(new Error('The clip stopped playing during export. Try again with a shorter clip.'));
      }, 200);
      recorder.start(250); tick();
      if (video) { video.addEventListener('ended', videoEnded, { once: true }); video.play().catch(() => stop(new Error('The browser blocked playback. Press Export again or try another browser.'))); }
      else { source.onended = sourceEnded; source.start(); }
    });
  } finally {
    clearInterval(timer); cancelAnimationFrame(frame);
    signal?.removeEventListener('abort', abort); document.removeEventListener('visibilitychange', visibility);
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    if (video) { video.removeEventListener('ended', videoEnded); video.pause(); }
    else if (source) { source.onended = null; try { source.stop(); } catch { /* Already ended. */ } }
    source?.disconnect(); stream?.getTracks().forEach(track => track.stop()); destination.stream.getTracks().forEach(track => track.stop());
    if (context.state !== 'closed') await context.close();
  }
}

export function drawContained(context, image, width, height) {
  const iw = image.videoWidth || image.naturalWidth, ih = image.videoHeight || image.naturalHeight;
  const scale = Math.min(width / iw, height / ih);
  context.drawImage(image, (width - iw * scale) / 2, (height - ih * scale) / 2, iw * scale, ih * scale);
}

export const safeFileName = name => name.replace(/\.[^.]*$/, '').replace(/[^\p{L}\p{N}_-]+/gu, '-').slice(0, 80) || 'meadow';

export function wrapCanvasText(context, text, maxWidth) {
  const lines = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const { segment } of new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(paragraph)) {
      if (line && context.measureText(line + segment).width > maxWidth) { lines.push(line.trimEnd()); line = ''; }
      line += segment;
    }
    lines.push(line.trimEnd());
  }
  return lines;
}
