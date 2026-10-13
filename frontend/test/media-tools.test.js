import test from 'node:test';
import assert from 'node:assert/strict';
import { editedDuration, encodeWav, MAX_AUDIO_BYTES, MAX_VIDEO_BYTES, recordingFormat, recordVideo, trimFrames, validateMediaFile, videoGeometry, wrapCanvasText } from '../src/tools/mediaProcessing.js';
import { fitProfileDrafts, writingIdeas, WRITING_LIMITS } from '../../shared/writingTools.js';

test('a WAV trim exports only the selected samples with a playable PCM header and interleaved stereo', () => {
  const channels = [Float32Array.from([0, .5, -1, 2]), Float32Array.from([0, -.5, 1, -2])];
  const buffer = { duration: 1, sampleRate: 4, length: 4, numberOfChannels: 2, getChannelData: index => channels[index] };
  const data = encodeWav(buffer, .25, 1), view = new DataView(data);
  assert.equal(new TextDecoder().decode(data.slice(0, 4)), 'RIFF');
  assert.equal(new TextDecoder().decode(data.slice(8, 12)), 'WAVE');
  assert.equal(view.getUint16(20, true), 1); assert.equal(view.getUint16(22, true), 2);
  assert.equal(view.getUint32(24, true), 4); assert.equal(view.getUint16(34, true), 16);
  assert.equal(view.getUint32(40, true), 12); assert.equal(data.byteLength, 56);
  assert.deepEqual(Array.from({ length: 6 }, (_, index) => view.getInt16(44 + index * 2, true)), [16384, -16384, -32768, 32767, 32767, -32768]);
  for (const [start, end] of [[1, 0], [-1, 1], [0, 2], [NaN, 1], [0, 0]]) assert.throws(() => trimFrames(buffer, start, end));
});
test('rotation swaps dimensions without cropping, caps large frames and speed changes alter duration', () => {
  assert.deepEqual(videoGeometry(320, 180, 90), { width: 180, height: 320, drawWidth: 320, drawHeight: 180 });
  assert.equal(videoGeometry(320, 180, 270).height, 320);
  assert.equal(videoGeometry(3840, 2160, 180).width, 1920);
  assert.equal(videoGeometry(321, 181).width % 2, 0);
  assert.equal(editedDuration(3, 2), 1.5); assert.equal(editedDuration(3, .5), 6);
  for (const args of [[601, 1], [600, .5], [3, 0], [3, 5], [Infinity, 1]]) assert.throws(() => editedDuration(...args));
  assert.throws(() => videoGeometry(0, 10)); assert.throws(() => videoGeometry(10, 10, 45));
});
test('file and codec checks bound resources and select a genuinely supported export container', () => {
  validateMediaFile({ name: 'clip.mp4', type: '', size: 100 }, 'video');
  assert.throws(() => validateMediaFile({ name: 'clip.mp4', type: 'video/mp4', size: MAX_VIDEO_BYTES + 1 }, 'video'));
  assert.throws(() => validateMediaFile({ name: 'clip.mp3', type: 'audio/mpeg', size: MAX_AUDIO_BYTES + 1 }, 'audio'));
  assert.throws(() => validateMediaFile({ name: 'empty.wav', type: 'audio/wav', size: 0 }, 'audio'));
  assert.throws(() => validateMediaFile({ name: 'file.txt', type: 'text/plain', size: 10 }, 'video'));
  assert.equal(recordingFormat({ isTypeSupported: type => type === 'video/mp4' }), 'video/mp4');
  assert.equal(recordingFormat({ isTypeSupported: type => type === 'video/webm' }), 'video/webm');
  assert.throws(() => recordingFormat({ isTypeSupported: () => false }));
});
test('muted export keeps the playback graph running, omits the audio track and releases resources', async () => {
  const names = ['AudioContext', 'MediaRecorder', 'document', 'requestAnimationFrame', 'cancelAnimationFrame'];
  const original = Object.fromEntries(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  let connected = false, closed = false, captured, stoppedTracks = 0;
  const track = kind => ({ kind, stop: () => stoppedTracks++ });
  const audioTrack = track('audio'), videoTrack = track('video');
  class Context {
    state = 'running';
    resume() { return Promise.resolve(); }
    close() { closed = true; this.state = 'closed'; return Promise.resolve(); }
    createMediaStreamDestination() { return { stream: { getAudioTracks: () => [audioTrack], getTracks: () => [audioTrack] } }; }
    createMediaElementSource() { return { connect: () => { connected = true; }, disconnect() {} }; }
  }
  class Recorder {
    static isTypeSupported(type) { return type === 'video/mp4'; }
    state = 'inactive';
    constructor(stream, options) { captured = stream; this.mimeType = options.mimeType; }
    start() { this.state = 'recording'; }
    stop() { this.state = 'inactive'; queueMicrotask(() => { this.ondataavailable({ data: new Blob(['encoded frames']) }); this.onstop(); }); }
  }
  const document = new EventTarget(); document.hidden = false;
  Object.assign(globalThis, { AudioContext: Context, MediaRecorder: Recorder, document, requestAnimationFrame: () => 1, cancelAnimationFrame: () => {} });
  try {
    const video = new EventTarget(); Object.assign(video, { duration: 1, currentTime: 0, pause() {}, play() { assert.equal(connected, true); queueMicrotask(() => this.dispatchEvent(new Event('ended'))); return Promise.resolve(); } });
    const tracks = [videoTrack], canvas = { captureStream: () => ({ getTracks: () => tracks, addTrack: value => tracks.push(value) }) };
    const result = await recordVideo({ canvas, draw() {}, video, mute: true });
    assert.equal(result.extension, 'mp4'); assert.ok(result.blob.size > 0);
    assert.equal(captured.getTracks().length, 1); assert.equal(captured.getTracks()[0].kind, 'video');
    assert.equal(closed, true); assert.equal(stoppedTracks, 2);
  } finally { for (const name of names) { if (original[name]) Object.defineProperty(globalThis, name, original[name]); else delete globalThis[name]; } }
});
test('canvas captions retain line breaks and joined emoji when wrapping', () => {
  const context = { measureText: value => ({ width: [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(value)].length }) };
  assert.deepEqual(wrapCanvasText(context, '👨‍👩‍👧‍👦ab\n\ncd', 2), ['👨‍👩‍👧‍👦a', 'b', '', 'cd']);
});
test('profile drafts require identity fields and bound the bio without claiming handle availability', () => {
  assert.deepEqual(fitProfileDrafts(['A caption instead of a profile.']), []);
  const [profile] = fitProfileDrafts([`Name: Meadow\nHandle idea: @meadow\nBio: ${'🌱'.repeat(200)}`]);
  assert.ok(Array.from(profile.split('Bio: ')[1]).length <= 150);
  for (const kind of ['slogan', 'profile']) {
    const drafts = writingIdeas({ kind, brand: 'Atelier', topic: 'Small-batch ceramic tableware', language: 'French' });
    assert.equal(drafts.length, 3); assert.ok(drafts.every(text => Array.from(text).length <= WRITING_LIMITS[kind]));
    if (kind === 'profile') assert.ok(drafts.every(text => text.includes('Idée de pseudo: @atelier') && text.includes('Bio:')));
  }
});
