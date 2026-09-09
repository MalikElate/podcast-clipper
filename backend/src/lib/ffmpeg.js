import fs from "fs";
import path from "path";
import { ProcessRunner } from "../bridge/core/ProcessRunner.js";

const runner = new ProcessRunner();
const run = (cmd, args) => runner.run(cmd, args, { timeoutMs: Number(process.env.FFMPEG_TIMEOUT_MS) || 30 * 60000 });

/** Extracts a mono 16kHz mp3 track for transcription. */
export async function extractAudio(videoPath, outAudioPath) {
  await run("ffmpeg", [
    "-y",
    "-i",
    videoPath,
    "-vn",
    "-ac",
    "1",
    "-ar",
    "16000",
    "-b:a",
    "64k",
    outAudioPath,
  ]);
  return outAudioPath;
}

/** Cuts a segment [startSec, endSec) from the source video, reframes to 9:16, and burns in styled ASS subtitles — all in a single ffmpeg pass. */
export async function createClip(
  videoPath,
  words,
  startSec,
  endSec,
  outPath,
  { cropMode = "pad", subtitleColor = "#FFFFFF" } = {}
) {
  const duration = Math.max(0.5, endSec - startSec);
  const assPath = outPath.replace(/\.mp4$/, ".ass");
  buildAssSubtitles(words, startSec, endSec, assPath, subtitleColor);
  const escapedAssPath = escapeForFilterPath(assPath);

  let vf;
  if (cropMode === "crop") {
    // Tighter, "zoomed in" center-crop. Cuts off anything outside a 9:16
    // center slice — only looks right on a single, centered speaker.
    vf = `crop='min(iw,ih*9/16)':'min(ih,iw*16/9)',scale=1080:1920,ass='${escapedAssPath}'`;
  } else if (cropMode === "pad") {
    // Default: scales the full frame to fit (nothing cropped out), and fills
    // the empty top/bottom bars with a blurred, zoomed copy of the same
    // footage so the padding looks intentional instead of dead black space.
    // Safe for multi-person shots, slides, or anything with content near the edges.
    vf =
      "split[bg][fg];" +
      "[bg]scale=270:480:force_original_aspect_ratio=increase," +
      "crop=270:480,gblur=sigma=8,scale=1080:1920[bgblur];" +
      "[fg]scale=1080:1920:force_original_aspect_ratio=decrease[fgscaled];" +
      `[bgblur][fgscaled]overlay=(W-w)/2:(H-h)/2,ass='${escapedAssPath}'`;
  } else {
    throw new Error(`Unknown cropMode: ${cropMode} (expected "pad" or "crop")`);
  }

  await run("ffmpeg", [
    "-y",
    "-ss",
    String(startSec),
    "-i",
    videoPath,
    "-t",
    String(duration),
    "-vf",
    vf,
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "20",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    outPath,
  ]);

  fs.unlinkSync(assPath);
  return outPath;
}

function secondsToAssTimestamp(seconds) {
  const clamped = Math.max(0, seconds);
  const h = Math.floor(clamped / 3600);
  const m = Math.floor((clamped % 3600) / 60);
  const s = (clamped % 60).toFixed(2).padStart(5, "0");
  return `${h}:${String(m).padStart(2, "0")}:${s}`;
}

/**
 * Builds a .ass subtitle file for the given clip window: short, punchy
 * uppercase word-chunk captions (~3 real words at a time, from Whisper's
 * word-level timestamps) in a boxed style that stays legible over busy
 * footage, plus a centered "Sub for more" CTA over the final 3 seconds.
 */
function buildAssSubtitles(words, clipStart, clipEnd, assPath, subtitleColorHex) {
  const primary = hexToAssColor(subtitleColorHex);
  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,68,${primary},&H000000FF,&H00000000,&H80000000,1,0,0,0,100,100,0,0,3,0,4,2,60,60,140,1
Style: Outro,Arial,80,${primary},&H000000FF,&H00000000,&H80000000,1,0,0,0,100,100,0,0,3,0,4,5,60,60,0,1

[Events]
Format: Layer, Start, End, Style, Text
`;
  const lines = [header];

  const clipWords = words
    .filter((w) => w.start < clipEnd && w.end > clipStart)
    .map((w) => ({ word: w.word.replace(/[{}]/g, ""), start: w.start, end: w.end })); // strip ASS override-code characters

  const chunkSize = 3;
  for (let i = 0; i < clipWords.length; i += chunkSize) {
    const chunk = clipWords.slice(i, i + chunkSize);
    const start = chunk[0].start - clipStart;
    const end = chunk[chunk.length - 1].end - clipStart;
    const text = chunk.map((w) => w.word).join(" ").toUpperCase();
    lines.push(`Dialogue: 0,${secondsToAssTimestamp(start)},${secondsToAssTimestamp(end)},Default,${text}`);
  }

  const duration = clipEnd - clipStart;
  const outroStart = Math.max(0, duration - 3);
  lines.push(
    `Dialogue: 1,${secondsToAssTimestamp(outroStart)},${secondsToAssTimestamp(duration)},Outro,Sub for more`
  );

  fs.writeFileSync(assPath, lines.join("\n"), "utf-8");
  return assPath;
}

/** Escapes a filesystem path for use inside an ffmpeg filter argument (colons and backslashes are filter syntax). */
function escapeForFilterPath(p) {
  return p.replace(/\\/g, "/").replace(/:/g, "\\:");
}

/** Converts "#RRGGBB" to ASS's &HAABBGGRR& format (ASS uses BGR order, AA=00 opaque). */
function hexToAssColor(hex) {
  const clean = hex.replace("#", "");
  const r = clean.substring(0, 2);
  const g = clean.substring(2, 4);
  const b = clean.substring(4, 6);
  return `&H00${b}${g}${r}`.toUpperCase();
}

export function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}
