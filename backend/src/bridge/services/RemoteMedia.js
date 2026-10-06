import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import path from "node:path";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { BridgeError, invariant } from "../core/errors.js";
import { publicWebhookAddress as publicAddress } from "./WebhookService.js";

const redirects = new Set([301, 302, 303, 307, 308]);
const maxRedirects = 3;
const privateHost = /(^|\.)(localhost|local|internal|lan|home|arpa)\.?$/i;
const notPublic = "Media URLs must point to a public internet address.";

export function remoteMediaUrl(value) {
  invariant(typeof value === "string" && value.length <= 4096, "Enter a public media URL.");
  let url; try { url = new URL(value); } catch { invariant(false, "Enter a valid media URL."); }
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  invariant(["http:", "https:"].includes(url.protocol) && !url.username && !url.password, "Media URLs must use HTTP or HTTPS without credentials.");
  invariant(!url.port || url.port === (url.protocol === "https:" ? "443" : "80"), "Media URLs must use the standard HTTP or HTTPS port.");
  invariant(isIP(hostname) ? publicAddress(hostname) : hostname.includes(".") && !privateHost.test(hostname), notPublic);
  return url;
}

function filenameFrom(url, disposition = "") {
  const declared = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition)?.[1];
  let name = declared || path.posix.basename(url.pathname);
  try { name = decodeURIComponent(name); } catch { /* Keep the raw segment. */ }
  return name || undefined;
}

/** Download a public file to `destination`. Every hop is resolved once, checked
 * against private address ranges and pinned to the connection, so a redirect or
 * DNS rebinding cannot reach Meadow's own network. */
export async function downloadRemoteMedia(value, destination, { maxBytes, timeoutMs = 120000, resolve = lookup, request } = {}) {
  let url = remoteMediaUrl(value);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    for (let hop = 0; ; hop += 1) {
      const hostname = url.hostname.replace(/^\[|\]$/g, "");
      const addresses = isIP(hostname) ? [{ address: hostname, family: isIP(hostname) }] : await resolve(hostname, { all: true, verbatim: true });
      invariant(addresses.length && addresses.every(item => publicAddress(item.address)), notPublic);
      const pinned = addresses[0];
      const send = request || (url.protocol === "https:" ? https.request : http.request);
      const response = await new Promise((done, fail) => {
        const req = send(url, { method: "GET", agent: false, family: pinned.family, signal: controller.signal, headers: { "User-Agent": "Meadow media import (+https://findmeadow.com)", Accept: "*/*" }, lookup: (_host, options, callback) => callback(null, ...(options.all ? [[pinned]] : [pinned.address, pinned.family])) }, done);
        req.once("error", fail);
        req.end();
      });
      if (redirects.has(response.statusCode)) {
        response.resume();
        invariant(hop < maxRedirects && response.headers.location, "The media URL redirected too many times.", { code: "media_download_failed" });
        url = remoteMediaUrl(new URL(response.headers.location, url).href);
        continue;
      }
      if (response.statusCode < 200 || response.statusCode > 299) {
        response.resume();
        throw new BridgeError(`The media URL returned HTTP ${response.statusCode}.`, { status: 422, code: "media_download_failed" });
      }
      const tooLarge = () => new BridgeError(`The file at this URL is larger than ${Math.round(maxBytes / 1024 ** 2)} MB.`, { status: 413, code: "upload_limit" });
      const declared = Number(response.headers["content-length"]);
      if (declared > maxBytes) { response.destroy(); throw tooLarge(); }
      let bytes = 0;
      const limit = new Transform({ transform(chunk, _encoding, next) { bytes += chunk.length; next(bytes > maxBytes ? tooLarge() : null, chunk); } });
      await pipeline(response, limit, fs.createWriteStream(destination, { mode: 0o600 }));
      invariant(bytes > 0, "The media URL returned an empty file.", { status: 422, code: "media_download_failed" });
      return { filename: filenameFrom(url, response.headers["content-disposition"]), bytes };
    }
  } catch (error) {
    if (error instanceof BridgeError) throw error;
    throw new BridgeError(controller.signal.aborted ? "The media URL took too long to download. Use create_upload_url for large files." : "The media URL could not be downloaded.", { status: 422, code: "media_download_failed" });
  } finally {
    clearTimeout(timer);
  }
}
