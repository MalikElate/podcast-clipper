import { createHash } from "node:crypto";
import { AwsV4Signer } from "aws4fetch";

export const DIRECT_UPLOAD_PART_SIZE = 32 * 1024 ** 2;
const MAX_GRANT_MS = 30 * 60000;
const uploadKey = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.upload$/;

class UploadError extends Error {
  constructor(message, code = "invalid_upload", status = 400) { super(message); Object.assign(this, { code, status }); }
}
const check = (condition, message, code, status) => { if (!condition) throw new UploadError(message, code, status); };
const missingUpload = error => error?.code === 10024 || error?.code === "NoSuchUpload" || /\b(?:10024|NoSuchUpload)\b/.test(error?.message || "");
const plainEtag = value => String(value || "").replace(/^"|"$/g, "");

function validateBytes(bytes, env) {
  const maximum = Number(env.BRIDGE_MAX_UPLOAD_MB || 1024) * 1024 ** 2;
  check(Number.isSafeInteger(bytes) && bytes > 0 && bytes <= maximum && Math.ceil(bytes / DIRECT_UPLOAD_PART_SIZE) <= 10000, "The upload size is invalid.", "upload_size_invalid");
}

function manifest(parts, bytes) {
  check(Array.isArray(parts) && parts.length === Math.ceil(bytes / DIRECT_UPLOAD_PART_SIZE), "The uploaded parts do not match this file.", "upload_parts_invalid");
  const normalized = parts.map((part, index) => {
    const etag = plainEtag(part?.etag);
    check(part?.partNumber === index + 1 && /^[a-f0-9]{32}$/i.test(etag), "The uploaded parts are invalid or out of order.", "upload_parts_invalid");
    return { partNumber: part.partNumber, etag: etag.toLowerCase() };
  });
  const hash = createHash("md5");
  normalized.forEach(part => hash.update(Buffer.from(part.etag, "hex")));
  return { parts: normalized, etag: `${hash.digest("hex")}-${normalized.length}` };
}

function completedObject(object, key, bytes, etag) {
  check(object.customMetadata?.sessionKey === key && object.customMetadata?.expectedBytes === String(bytes), "The stored upload does not match this upload session.", "upload_session_mismatch", 409);
  check(object.size === bytes, "The uploaded file size did not match. Select the file again.", "upload_size_mismatch", 409);
  check(plainEtag(object.etag) === etag, "The uploaded parts do not match the stored file.", "upload_parts_mismatch", 409);
  return { key, bytes: object.size, etag };
}

async function createUpload(bucket, env, objectKey, key, input, now) {
  validateBytes(input.bytes, env);
  check(input.partSize === DIRECT_UPLOAD_PART_SIZE, "The upload part size is invalid.");
  check(Number.isSafeInteger(input.expiresAt) && input.expiresAt > now + 1000 && input.expiresAt <= now + MAX_GRANT_MS, "The upload authorization has expired.", "upload_expired");
  check(/^[a-f0-9]{32}$/i.test(env.R2_ACCOUNT_ID || "") && /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(env.R2_BUCKET_NAME || "") && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY, "Direct uploads are not configured.", "direct_uploads_unavailable", 503);
  // The browser can upload parts only. Completing (or aborting) consumes the
  // multipart session, so a still-valid URL cannot overwrite a ready original.
  check(!await bucket.head(objectKey), "This upload already exists.", "upload_session_exists", 409);
  const upload = await bucket.createMultipartUpload(objectKey, { httpMetadata: { contentType: "application/octet-stream" }, customMetadata: { sessionKey: key, expectedBytes: String(input.bytes) } });
  try {
    const parts = [];
    for (let offset = 0; offset < input.bytes; offset += DIRECT_UPLOAD_PART_SIZE) {
      const partNumber = parts.length + 1, bytes = Math.min(DIRECT_UPLOAD_PART_SIZE, input.bytes - offset);
      const url = new URL(`https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${env.R2_BUCKET_NAME}/${objectKey}`);
      url.searchParams.set("partNumber", String(partNumber));
      url.searchParams.set("uploadId", upload.uploadId);
      url.searchParams.set("X-Amz-Expires", String(Math.floor((input.expiresAt - now) / 1000)));
      const signer = new AwsV4Signer({ method: "PUT", url, headers: { "Content-Type": "application/octet-stream", "Content-Length": String(bytes) }, accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY, region: "auto", service: "s3", signQuery: true, allHeaders: true, datetime: new Date(now).toISOString().replace(/[:-]|\.\d{3}/g, "") });
      parts.push({ partNumber, bytes, url: (await signer.sign()).url.toString() });
    }
    return { uploadId: upload.uploadId, partSize: DIRECT_UPLOAD_PART_SIZE, parts, expiresAt: input.expiresAt };
  } catch (error) {
    await upload.abort().catch(() => {});
    throw error;
  }
}

async function completeUpload(bucket, objectKey, key, input, env) {
  validateBytes(input.bytes, env);
  const expected = manifest(input.parts, input.bytes);
  const existing = await bucket.head(objectKey);
  if (existing) return completedObject(existing, key, input.bytes, expected.etag);
  let object;
  try { object = await bucket.resumeMultipartUpload(objectKey, input.uploadId).complete(expected.parts); }
  catch (error) {
    // A completion response can be lost after R2 commits the object. Recover
    // only the same session, size and manifest; never delete an existing file.
    object = await bucket.head(objectKey);
    if (!object) {
      if (missingUpload(error)) throw new UploadError("The upload is no longer available. Select the file again.", "upload_missing", 409);
      throw error;
    }
  }
  return completedObject(object, key, input.bytes, expected.etag);
}

/** Private Container outbound bridge. Never mounted on the public Worker. */
export async function handleDirectUpload(request, env, { containerId, key, now = Date.now() }) {
  try {
    check(request.method === "POST", "Method not allowed.", "method_not_allowed", 405);
    check(uploadKey.test(key), "Invalid media upload key.");
    check(env.MEADOW_MEDIA, "Durable media storage is not configured.", "media_storage_unavailable", 503);
    let input;
    try { input = await request.json(); } catch { throw new UploadError("Invalid upload request."); }
    check(input && typeof input === "object" && !Array.isArray(input), "Invalid upload request.");
    const objectKey = `${containerId}/${key}`, bucket = env.MEADOW_MEDIA;
    if (input.action === "create") return Response.json(await createUpload(bucket, env, objectKey, key, input, now), { status: 201 });
    check(typeof input.uploadId === "string" && input.uploadId.length > 0 && input.uploadId.length <= 2048, "Invalid upload session.");
    if (input.action === "complete") return Response.json(await completeUpload(bucket, objectKey, key, input, env));
    if (input.action === "abort") {
      try { await bucket.resumeMultipartUpload(objectKey, input.uploadId).abort(); } catch (error) { if (!missingUpload(error)) throw error; }
      return Response.json({ aborted: true });
    }
    throw new UploadError("Invalid upload action.");
  } catch (error) {
    const known = error instanceof UploadError;
    return Response.json({ code: known ? error.code : "media_storage_unavailable", error: known ? error.message : "Media storage is temporarily unavailable. Please try again." }, { status: known ? error.status : 503 });
  }
}
