import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { BridgeError } from "../core/errors.js";
import { downloadRemoteMedia } from "./RemoteMedia.js";

// Fast Transcriber's link resolver, adapted for video: a platform's own file
// URL first, then Cobalt, then local yt-dlp. TikTok and YouTube do not expose
// downloadable files through their APIs, so they always use the resolvers.
// Dropper only passes URLs read from the user's own connected accounts.

const YTDLP_VERSION = "2026.08.19";
const resolverPlatforms = new Set(["tiktok", "youtube", "instagram", "facebook", "threads"]);
const unavailable = message => new BridgeError(message, { status: 422, code: "video_download_failed" });

function proxyUrl(template) {
  if (!template) return null;
  return template.replace(/\{session\}/g, () => randomUUID().replace(/-/g, "").slice(0, 12));
}

/** Prefer H.264 MP4 with audio. TikTok labels some HEVC renditions as having
 * audio when they do not, so a muxed H.264 format is the safe choice. */
const ytDlpFormat = "bv*[vcodec^=avc1][ext=mp4]+ba[ext=m4a]/b[ext=mp4][vcodec^=avc1]/b[vcodec*=h264]/bv*[ext=mp4]+ba/b[ext=mp4]/b";

function runYtDlp(binary, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.stdout.on("data", chunk => { stdout = (stdout + chunk).slice(-20000); });
    child.stderr.on("data", chunk => { stderr = (stderr + chunk).slice(-20000); });
    child.on("error", error => { clearTimeout(timer); reject(error); });
    child.on("close", (code, signal) => { clearTimeout(timer); resolve({ code, signal, stdout, stderr }); });
  });
}

function friendlyYtDlpError(stderr) {
  if (/private video|this video is private|login required|log in/i.test(stderr)) return "This video is private, so Meadow cannot download it.";
  if (/video unavailable|has been removed|not available|does not exist|404/i.test(stderr)) return "This video is no longer available.";
  if (/sign in to confirm|not a bot|HTTP Error 403|429/i.test(stderr)) return "The platform temporarily blocked the download. Try this video again later.";
  return "Meadow could not download this video. Try it again later.";
}

export class VideoSourceDownloader {
  constructor({ env = process.env, downloadMedia = downloadRemoteMedia, fetcher = (...args) => fetch(...args), run = runYtDlp } = {}) {
    this.cobaltUrl = env.COBALT_API_URL?.trim() || null;
    this.cobaltKey = env.COBALT_API_KEY?.trim() || null;
    this.ytDlpPath = env.YTDLP_PATH?.trim() || null;
    this.proxyTemplate = env.YTDLP_PROXY?.trim() || null;
    this.timeoutMs = 10 * 60000;
    Object.assign(this, { downloadMedia, fetcher, run });
  }

  /** Whether Meadow can fetch a video from this platform without a direct file URL. */
  supports(platform) { return resolverPlatforms.has(platform) && Boolean(this.cobaltUrl || this.ytDlpPath); }

  async download({ url, platform, directUrl }, destination, { maxBytes }) {
    const failures = [];
    if (directUrl) {
      try { return { ...await this.downloadMedia(directUrl, destination, { maxBytes, timeoutMs: this.timeoutMs }), resolver: "direct" }; }
      catch (error) { failures.push(error); }
    }
    if (!resolverPlatforms.has(platform)) throw failures[0] || unavailable("Meadow cannot download videos from this platform.");
    if (this.cobaltUrl) {
      try { return await this.viaCobalt(url, destination, maxBytes); }
      catch (error) { failures.push(error); }
    }
    if (this.ytDlpPath) {
      try { return await this.viaYtDlp(url, platform, destination, maxBytes); }
      catch (error) { failures.push(error); }
    }
    if (!failures.length) throw unavailable("Video downloads are not configured on this server.");
    // Report the last resolver's reason; earlier ones were retried past.
    const last = failures.at(-1);
    throw last instanceof BridgeError ? last : unavailable("Meadow could not download this video. Try it again later.");
  }

  async viaCobalt(url, destination, maxBytes) {
    let response;
    try {
      response = await this.fetcher(this.cobaltUrl, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json", ...(this.cobaltKey ? { Authorization: `Api-Key ${this.cobaltKey}` } : {}) },
        body: JSON.stringify({ url, downloadMode: "auto", videoQuality: "1080", youtubeVideoCodec: "h264", filenameStyle: "basic", disableMetadata: true, localProcessing: "disabled" }),
        signal: AbortSignal.timeout(60000),
      });
    } catch { throw unavailable("The video resolver did not respond. Try this video again later."); }
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload || payload.status === "error") {
      const code = String(payload?.error?.code || "");
      throw unavailable(/private|login|age/.test(code) ? "This video is private, so Meadow cannot download it." : /unavailable|not_found|deleted/.test(code) ? "This video is no longer available." : "Meadow could not download this video. Try it again later.");
    }
    const target = payload.status === "picker" ? payload.picker?.find(item => item?.type === "video")?.url : ["tunnel", "redirect"].includes(payload.status) ? payload.url : null;
    if (!target) throw unavailable("This post has no single downloadable video.");
    const result = await this.downloadMedia(new URL(target, this.cobaltUrl).href, destination, { maxBytes, timeoutMs: this.timeoutMs });
    return { ...result, filename: payload.filename || result.filename, resolver: "cobalt" };
  }

  async viaYtDlp(url, platform, destination, maxBytes) {
    const directory = path.dirname(destination), stem = `${path.basename(destination)}-ytdlp`;
    const args = ["--no-playlist", "--no-progress", "--no-warnings", "--socket-timeout", "30", "--retries", "2", "--fragment-retries", "2",
      "-f", ytDlpFormat, "--merge-output-format", "mp4", "--max-filesize", String(maxBytes), "--js-runtimes", "node",
      "-o", path.join(directory, `${stem}.%(ext)s`), "--print", "after_move:filepath"];
    // YouTube blocks datacenter addresses, so it alone goes through the
    // residential proxy, with a fresh sticky session per download.
    const proxy = platform === "youtube" ? proxyUrl(this.proxyTemplate) : null;
    if (proxy) args.push("--proxy", proxy);
    args.push("--", url);
    let result;
    try { result = await this.run(this.ytDlpPath, args, this.timeoutMs); }
    catch { throw unavailable("Video downloads are not available on this server right now."); }
    const produced = result.stdout.split("\n").map(line => line.trim()).find(line => line.startsWith(path.join(directory, stem)) && fs.existsSync(line));
    if (result.code !== 0 || !produced) {
      for (const entry of await fs.promises.readdir(directory).catch(() => [])) if (entry.startsWith(stem)) await fs.promises.unlink(path.join(directory, entry)).catch(() => {});
      if (result.code === 0) throw new BridgeError(`This video is larger than ${Math.round(maxBytes / 1024 ** 2)} MB.`, { status: 413, code: "upload_limit" });
      throw unavailable(result.signal ? "Downloading this video took too long." : friendlyYtDlpError(result.stderr));
    }
    await fs.promises.rename(produced, destination);
    const { size } = await fs.promises.stat(destination);
    return { filename: `${platform}-video.mp4`, bytes: size, resolver: proxy ? "residential-ytdlp" : "ytdlp" };
  }
}

export { YTDLP_VERSION };
