import "dotenv/config";
import express from "express";
import cors from "cors";
import { clerkMiddleware } from "@clerk/express";
import path from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";

import { downloadVideo, getVideoInfo } from "./lib/rapidapi.js";
import { extractAudio, createClip, ensureDir } from "./lib/ffmpeg.js";
import { transcribeAudio } from "./lib/whisper.js";
import { pickClips } from "./lib/gemini.js";
import { groupWordsIntoPhrases, phrasesToPromptText } from "./lib/transcript.js";
import { requireAuth } from "./lib/clerkAuth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const JOBS_DIR = path.join(__dirname, "..", "jobs");
ensureDir(JOBS_DIR);

const app = express();
app.use(cors());
app.use(express.json());
app.get("/api/health", (req, res) => res.json({ ok: true }));
app.use(clerkMiddleware());

// Only rendered clips are shareable by URL. Never expose source videos,
// extracted audio, partial downloads, or other per-job working files.
app.get("/files/:jobId/clips/:fileName", (req, res, next) => {
  const { jobId, fileName } = req.params;
  const validJobId = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    jobId
  );
  const validClipName = /^clip_[1-9][0-9]*\.mp4$/.test(fileName);
  if (!validJobId || !validClipName) return res.status(404).json({ error: "Clip not found." });

  const clipPath = path.join(JOBS_DIR, jobId, "clips", fileName);
  res.sendFile(clipPath, { dotfiles: "deny" }, (err) => {
    if (!err) return;
    if (err.status === 404 || err.code === "ENOENT") {
      return res.status(404).json({ error: "Clip not found." });
    }
    next(err);
  });
});

// In-memory job store. Fine for a single-user local dev tool; swap for a DB/Firestore later.
const jobs = new Map();

function updateJob(id, patch) {
  const job = jobs.get(id);
  if (!job) return;
  Object.assign(job, patch);
  jobs.set(id, job);
}

app.post("/api/jobs", requireAuth, (req, res) => {
  const { youtubeUrl, numClips, clipLengthSec, subtitleColor, cropMode } = req.body || {};

  if (!youtubeUrl || typeof youtubeUrl !== "string") {
    return res.status(400).json({ error: "youtubeUrl is required." });
  }
  const n = Number(numClips) || 5;
  const len = Number(clipLengthSec) || 45;
  const color = /^#[0-9A-Fa-f]{6}$/.test(subtitleColor || "") ? subtitleColor : "#FFFFFF";
  const crop = cropMode === "crop" ? "crop" : "pad";

  const id = randomUUID();
  const jobDir = ensureDir(path.join(JOBS_DIR, id));

  jobs.set(id, {
    id,
    uid: req.uid,
    status: "queued",
    stage: "Queued",
    error: null,
    clips: [],
    createdAt: Date.now(),
  });

  res.json({ jobId: id });

  // Fire and forget; client polls GET /api/jobs/:id for progress.
  runPipeline(id, jobDir, {
    youtubeUrl,
    numClips: n,
    clipLengthSec: len,
    subtitleColor: color,
    cropMode: crop,
  }).catch((err) => {
    console.error(`Job ${id} failed:`, err);
    updateJob(id, { status: "error", stage: "Failed", error: err.message || String(err) });
  });
});

app.get("/api/jobs", requireAuth, (req, res) => {
  const list = [...jobs.values()]
    .filter((j) => j.uid === req.uid)
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((j) => ({
      id: j.id,
      status: j.status,
      stage: j.stage,
      sourceTitle: j.sourceTitle || null,
      createdAt: j.createdAt,
      clipCount: (j.clips || []).length,
    }));
  res.json({ jobs: list });
});

app.get("/api/jobs/:id", requireAuth, (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: "Job not found." });
  if (job.uid !== req.uid) return res.status(403).json({ error: "This job belongs to a different account." });
  res.json(job);
});

async function runPipeline(id, jobDir, { youtubeUrl, numClips, clipLengthSec, subtitleColor, cropMode }) {
  updateJob(id, { status: "running", stage: "Fetching video info" });
  const info = await getVideoInfo(youtubeUrl);

  updateJob(id, { stage: "Downloading video" });
  const videoPath = await downloadVideo(youtubeUrl, jobDir, (line) => {
    const stage = typeof line === "string" && line.trim() ? line.trim().slice(0, 160) : "Downloading video";
    updateJob(id, { stage });
  });

  updateJob(id, { stage: "Extracting audio" });
  const audioPath = path.join(jobDir, "audio.mp3");
  await extractAudio(videoPath, audioPath);

  // Real word-level timestamps from Whisper, used both for tight subtitle
  // sync and (grouped into phrases below) for the clip-selection prompt.
  updateJob(id, { stage: "Transcribing with Whisper" });
  const words = await transcribeAudio(audioPath);
  if (!words.length) throw new Error("Transcription returned no words.");

  const videoDurationSec = info.durationSec || words[words.length - 1].end;
  const phrases = groupWordsIntoPhrases(words);

  updateJob(id, { stage: "Selecting and ranking best moments with Gemini" });
  const picks = await pickClips(phrasesToPromptText(phrases), {
    numClips,
    clipLengthSec,
    videoDurationSec,
  });
  if (!picks.length) throw new Error("Gemini did not return any clip picks.");

  const clipsOut = [];
  const clipsDir = ensureDir(path.join(jobDir, "clips"));

  for (let i = 0; i < picks.length; i++) {
    const pick = picks[i];
    updateJob(id, { stage: `Rendering clip ${i + 1} of ${picks.length}` });

    const finalPath = path.join(clipsDir, `clip_${i + 1}.mp4`);

    // Reframes to 9:16 and burns in punchy word-chunk captions (real Whisper
    // word timing) in one ffmpeg pass.
    await createClip(videoPath, words, pick.start, pick.end, finalPath, {
      cropMode,
      subtitleColor,
    });

    // Phrase-level transcript for this clip's window, for the "scene analysis" detail view.
    const clipPhrases = phrases
      .filter((p) => p.end > pick.start && p.start < pick.end)
      .map((p) => ({
        start: Math.max(0, p.start - pick.start),
        end: Math.max(0.1, p.end - pick.start),
        text: p.text,
      }));

    clipsOut.push({
      index: i + 1,
      title: pick.title,
      hook: pick.hook,
      viralityScore: Math.round(pick.viralityScore),
      reason: pick.reason,
      startSec: pick.start,
      endSec: pick.end,
      durationSec: Math.round(pick.end - pick.start),
      url: `/files/${id}/clips/clip_${i + 1}.mp4`,
      transcript: clipPhrases,
    });

    // Keep clients seeing progress incrementally.
    updateJob(id, { clips: [...clipsOut].sort((a, b) => b.viralityScore - a.viralityScore) });
  }

  updateJob(id, {
    status: "done",
    stage: "Done",
    sourceTitle: info.title,
    clips: clipsOut.sort((a, b) => b.viralityScore - a.viralityScore),
  });
}

const PORT = process.env.PORT || 8787;

// Safety net: any error that reaches here (thrown synchronously in a route,
// or passed to next(err)) gets a JSON response instead of Express's default
// HTML error page — the frontend always expects JSON from /api routes.
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: err.message || "Internal server error." });
});

app.listen(PORT, () => {
  console.log(`Podcast Clipper backend listening on http://localhost:${PORT}`);
});
