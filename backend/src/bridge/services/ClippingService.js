import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { downloadVideo, getVideoInfo, extractVideoId } from "../../lib/rapidapi.js";
import { extractAudio, createClip } from "../../lib/ffmpeg.js";
import { transcribeAudio } from "../../lib/whisper.js";
import { pickClips } from "../../lib/gemini.js";
import { groupWordsIntoPhrases, phrasesToPromptText } from "../../lib/transcript.js";
import { invariant, BridgeError } from "../core/errors.js";

export class ClippingService {
  constructor({ store, projects, media, locks, dataDir, clock = () => Date.now(), pipeline = {} }) {
    Object.assign(this, { store, projects, media, locks, dataDir, clock });
    this.pipeline = { downloadVideo, getVideoInfo, extractAudio, createClip, transcribeAudio, pickClips, ...pipeline };
    this.running = false;
  }
  startWorker() {
    for (const job of this.store.list("clipJob", { status: "running" })) if (!job.leaseUntil || job.leaseUntil < this.clock()) this.patch(job.id, { status: "error", stage: "Interrupted", error: "Clipping was interrupted by a server restart. Start a new clipping job to try again." });
    this.timer = setInterval(() => this.tick().catch(error => console.error("Clipping worker:", error.code || error.name)), 5000);
    this.timer.unref?.();
  }
  stopWorker() { clearInterval(this.timer); }
  patch(id, values) { const job = this.store.get("clipJob", id); if (job) return this.store.put("clipJob", { ...job, ...values, updatedAt: this.clock() }); }

  create(uid, projectId, input) {
    this.projects.require(uid, projectId);
    let videoId;
    try { videoId = extractVideoId(input.youtubeUrl); } catch { throw new BridgeError("Enter a valid YouTube video URL."); }
    const numClips = Number(input.numClips ?? 5), clipLengthSec = Number(input.clipLengthSec ?? 45);
    invariant(Number.isInteger(numClips) && numClips >= 1 && numClips <= 30, "Choose between 1 and 30 clips.");
    invariant(Number.isInteger(clipLengthSec) && clipLengthSec >= 10 && clipLengthSec <= 180, "Choose a clip length between 10 and 180 seconds.");
    invariant(input.ownsContent === true, "Confirm that you have permission to use this source video.");
    return this.store.transaction(() => {
      const active = this.store.list("clipJob", { ownerUid: uid }).filter(job => ["queued", "running"].includes(job.status));
      invariant(active.length < 3, "Please wait for one of your active clipping jobs to finish.", { status: 429 });
      return this.store.put("clipJob", { id: randomUUID(), ownerUid: uid, projectId, status: "queued", stage: "Queued", clips: [], createdAt: this.clock(), updatedAt: this.clock(),
        input: { youtubeUrl: `https://www.youtube.com/watch?v=${videoId}`, numClips, clipLengthSec, subtitleColor: /^#[\dA-Fa-f]{6}$/.test(input.subtitleColor || "") ? input.subtitleColor : "#FFFFFF", cropMode: input.cropMode === "crop" ? "crop" : "pad", ownsContent: true } });
    });
  }

  list(uid, projectId) { this.projects.require(uid, projectId); return this.store.list("clipJob", { projectId }).map(job => this.toPublic(job)); }
  get(uid, projectId, id) { return this.toPublic(this.projects.requireRecord(uid, projectId, "clipJob", id)); }
  toPublic(job) {
    const { leaseUntil, ...visible } = job;
    return { ...visible, clips: (job.clips || []).map(clip => {
      const media = this.store.get("media", clip.mediaId);
      return { ...clip, ...(media ? { media: this.media.toPublic(media), url: this.media.url(media), downloadUrl: this.media.url(media, { download: true }) } : { unavailable: true }) };
    }) };
  }

  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      await this.locks.withLock("clipping-worker", async () => {
        for (const interrupted of this.store.list("clipJob", { status: "running" })) {
          if (!interrupted.leaseUntil || interrupted.leaseUntil <= this.clock()) this.patch(interrupted.id, { status: "error", stage: "Interrupted", error: "Clipping was interrupted. Start a new job to try again.", leaseUntil: null });
        }
        const job = this.store.list("clipJob", { status: "queued" }).sort((a, b) => a.createdAt - b.createdAt)[0];
        if (job) await this.run(job);
      }, { waitMs: 0, leaseMs: 90000 });
    } catch (error) { if (error.code !== "account_busy") throw error; } finally { this.running = false; }
  }

  async run(job) {
    const jobDir = path.join(this.dataDir, "clipping", job.id);
    fs.mkdirSync(jobDir, { recursive: true, mode: 0o700 });
    this.patch(job.id, { status: "running", stage: "Fetching video info", leaseUntil: this.clock() + 90000 });
    const timer = setInterval(() => this.patch(job.id, { leaseUntil: this.clock() + 90000 }), 20000);
    timer.unref?.();
    try {
      const info = await this.pipeline.getVideoInfo(job.input.youtubeUrl);
      invariant(!info.durationSec || info.durationSec <= 3 * 3600, "Choose a source video shorter than three hours.");
      this.patch(job.id, { sourceTitle: info.title, stage: "Downloading video" });
      const video = await this.pipeline.downloadVideo(job.input.youtubeUrl, jobDir, stage => this.patch(job.id, { stage: String(stage).slice(0, 160) }));
      this.patch(job.id, { stage: "Extracting audio" });
      const audio = path.join(jobDir, "audio.mp3");
      await this.pipeline.extractAudio(video, audio);
      this.patch(job.id, { stage: "Transcribing with Whisper" });
      const words = await this.pipeline.transcribeAudio(audio);
      invariant(words.length > 0, "No spoken words were found in this source.");
      const duration = Number(info.durationSec) || words.at(-1).end;
      invariant(duration > 0 && duration <= 3 * 3600, "Choose a source video shorter than three hours.");
      const phrases = groupWordsIntoPhrases(words);
      this.patch(job.id, { stage: "Selecting the best moments" });
      const selected = await this.pipeline.pickClips(phrasesToPromptText(phrases), { ...job.input, videoDurationSec: duration });
      const picks = selected.filter(pick => Number.isFinite(pick.start) && Number.isFinite(pick.end) && pick.start >= 0 && pick.end > pick.start && pick.end <= duration + 1 && pick.end - pick.start <= 240).slice(0, job.input.numClips);
      invariant(picks.length > 0, "No valid clip selections were returned. Try again with different clip settings.");
      const clips = [];
      for (const [index, pick] of picks.entries()) {
        this.patch(job.id, { stage: `Rendering clip ${index + 1} of ${picks.length}` });
        const output = path.join(jobDir, `clip_${index + 1}.mp4`);
        await this.pipeline.createClip(video, words, pick.start, pick.end, output, job.input);
        const media = await this.media.ingest(job.ownerUid, job.projectId, { path: output, originalname: `clip_${index + 1}.mp4` }, { source: "clip", metadata: { jobId: job.id, title: pick.title || `Clip ${index + 1}`, sourceTitle: info.title } });
        clips.push({ index: index + 1, mediaId: media.id, title: String(pick.title || `Clip ${index + 1}`).slice(0, 200), hook: String(pick.hook || "").slice(0, 1000), reason: String(pick.reason || "").slice(0, 1000), viralityScore: Math.max(0, Math.min(100, Math.round(Number(pick.viralityScore) || 0))), startSec: pick.start, endSec: pick.end, durationSec: Math.round(pick.end - pick.start),
          transcript: phrases.filter(phrase => phrase.end > pick.start && phrase.start < pick.end).map(phrase => ({ start: Math.max(0, phrase.start - pick.start), end: Math.min(pick.end - pick.start, phrase.end - pick.start), text: phrase.text })) });
        this.patch(job.id, { clips: [...clips].sort((a, b) => b.viralityScore - a.viralityScore) });
      }
      this.patch(job.id, { status: "done", stage: "Done", leaseUntil: null });
    } catch (error) {
      this.patch(job.id, { status: "error", stage: "Clipping failed", error: String(error.message || "Clipping could not be completed.").slice(0, 600), leaseUntil: null });
    } finally {
      clearInterval(timer);
      // Only this job's temporary work directory; durable media lives elsewhere.
      await fs.promises.rm(jobDir, { recursive: true, force: true });
    }
  }
}
