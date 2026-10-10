import { fileTypeFromBuffer } from "file-type";
import { invariant } from "../core/errors.js";

export const uploadSampleBytes = 64 * 1024;

// Keep the admission list in one place for preflight and full-file inspection.
export const mediaMimeByExtension = Object.freeze({
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif",
  mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm",
  pdf: "application/pdf",
});
export const acceptedMediaMimes = new Set(Object.values(mediaMimeByExtension));
export const unsupportedMediaMessage = "This file type cannot be posted. Upload a JPG/JPEG, PNG, WebP, GIF, MP4, MOV, WebM, or PDF file.";

/** Reject an unsupported file before issuing either an R2 or API upload grant. */
export async function validateUploadRequest(input = {}, maxBytes) {
  const { bytes, filename, sample } = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  invariant(Number.isSafeInteger(bytes) && bytes > 0 && bytes <= maxBytes,
    `Choose a file of up to ${Math.round(maxBytes / 1024 ** 2)} MB.`, { code: "upload_size_invalid" });
  const extension = typeof filename === "string" && filename.length <= 1024 ? /\.([a-z0-9]+)$/i.exec(filename)?.[1]?.toLowerCase() : null;
  const expectedMime = mediaMimeByExtension[extension];
  invariant(expectedMime, unsupportedMediaMessage, { status: 415, code: "unsupported_media" });
  // This is a bounded preview, not an assertion that the eventual PUT contains
  // the same bytes. The complete file is sniffed again before it becomes ready.
  const requiredBytes = Math.min(bytes, uploadSampleBytes);
  invariant(typeof sample === "string" && sample.length > 0 && sample.length <= Math.ceil(requiredBytes / 3) * 4 + 4,
    "The selected file could not be checked. Select it again.", { code: "upload_sample_invalid" });
  const prefix = Buffer.from(sample, "base64");
  invariant(prefix.length === requiredBytes && prefix.toString("base64") === sample,
    "The selected file could not be checked. Select it again.", { code: "upload_sample_invalid" });
  let detected;
  try { detected = await fileTypeFromBuffer(prefix); } catch { /* An incomplete or malformed file is unsupported. */ }
  invariant(detected?.mime === expectedMime,
    unsupportedMediaMessage, { status: 415, code: "unsupported_media" });
  return { expectedMime };
}
