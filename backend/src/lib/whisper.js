import path from "node:path";
import { fileURLToPath } from "node:url";
import { ProcessRunner } from "../bridge/core/ProcessRunner.js";
import { BridgeError } from "../bridge/core/errors.js";

const SCRIPT_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../scripts/transcribe_whisper.py");
const runner = new ProcessRunner();

/** Local transcription with real word timestamps, a bounded runtime and output. */
export async function transcribeAudio(audioPath) {
  const stdout = await runner.run(process.env.PYTHON_BIN || "python3", [SCRIPT_PATH, audioPath], {
    timeoutMs: Number(process.env.WHISPER_TIMEOUT_MS) || 2 * 3600000,
    maxOutput: 20 * 1024 ** 2,
  });
  let words;
  try { words = JSON.parse(stdout.trim()); }
  catch { throw new BridgeError("Whisper returned an unreadable transcript. Please try again."); }
  if (!Array.isArray(words) || !words.length || !words.every(word => typeof word.word === "string" && Number.isFinite(word.start) && Number.isFinite(word.end) && word.end >= word.start)) {
    throw new BridgeError("Whisper returned no valid spoken words. Check that the source contains speech.");
  }
  return words;
}
