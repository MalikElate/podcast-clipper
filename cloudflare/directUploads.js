import { AwsClient } from "aws4fetch";

export const directUploadMaxBytes = 5115 * 1024 ** 2;
export const directUploadLifetimeSeconds = 3600;
export const stagingKey = (containerId, key) => `direct-uploads/${containerId}/${key}`;

/** Called only by the container's private meadow.storage outbound handler. */
export async function handleDirectUpload(request, env, { containerId }, { fetcher = fetch } = {}) {
  const fail = (error, status = 503, code = "media_storage_unavailable") => Response.json({ error, code }, { status });
  if (!env.MEADOW_MEDIA || !env.R2_UPLOAD_ACCOUNT_ID || !env.R2_UPLOAD_BUCKET || !env.R2_UPLOAD_ACCESS_KEY_ID || !env.R2_UPLOAD_SECRET_ACCESS_KEY) {
    return fail("Direct uploads are not configured. Please try again shortly.");
  }
  if (request.method !== "POST") return fail("Method not allowed.", 405);
  const input = await request.json().catch(() => null);
  if (!input || !/^[a-f0-9-]{36}\.upload$/.test(input.key) || !/^[a-f0-9]+$/.test(containerId) || !Number.isSafeInteger(input.bytes) || input.bytes <= 0 || input.bytes > directUploadMaxBytes) {
    return fail("Choose a file of up to 5115 MB.", 400, "upload_size_invalid");
  }
  const client = new AwsClient({ accessKeyId: env.R2_UPLOAD_ACCESS_KEY_ID, secretAccessKey: env.R2_UPLOAD_SECRET_ACCESS_KEY, service: "s3", region: "auto", retries: 0 });
  const objectUrl = key => `https://${env.R2_UPLOAD_ACCOUNT_ID}.r2.cloudflarestorage.com/${env.R2_UPLOAD_BUCKET}/${key.split("/").map(encodeURIComponent).join("/")}`;
  const temporaryKey = stagingKey(containerId, input.key), finalKey = `${containerId}/${input.key}`;
  try {
    if (new URL(request.url).pathname === "/uploads") {
      const headers = { "Content-Type": "application/octet-stream", "If-None-Match": "*" };
      // XHR supplies Content-Length from the raw File; signing it enforces the declared size.
      const signed = await client.sign(`${objectUrl(temporaryKey)}?X-Amz-Expires=${directUploadLifetimeSeconds}`, { method: "PUT", headers: { ...headers, "Content-Length": String(input.bytes) }, aws: { signQuery: true, allHeaders: true } });
      return Response.json({ uploadUrl: signed.url, method: "PUT", headers, expiresAt: Date.now() + directUploadLifetimeSeconds * 1000 });
    }
    if (new URL(request.url).pathname !== "/uploads/complete") return fail("Not found.", 404);
    // A retry after the copy succeeded must not need the already-deleted staging object.
    const existing = await env.MEADOW_MEDIA.head(finalKey);
    if (!existing) {
      const object = await env.MEADOW_MEDIA.head(temporaryKey);
      if (!object) return fail("The file has not finished uploading. Select the file again.", 409, "upload_incomplete");
      if (object.size !== input.bytes) return fail("The uploaded file size did not match. Select the file again.", 400, "upload_size_mismatch");
      // Copy within R2. The original never passes through a Meadow HTTP upload request.
      const signed = await client.sign(objectUrl(finalKey), { method: "PUT", headers: { "x-amz-copy-source": `/${env.R2_UPLOAD_BUCKET}/${temporaryKey}`, "x-amz-copy-source-if-match": object.httpEtag || `"${object.etag}"` } });
      const copied = await fetcher(signed, { signal: AbortSignal.timeout(120000) });
      const result = await copied.text();
      if (!copied.ok || !/<CopyObjectResult[\s>]/.test(result) || /<Error[\s>]/.test(result)) return fail("The uploaded file could not be saved. Please try again.");
    } else if (existing.size !== input.bytes) {
      return fail("The uploaded file size did not match. Select the file again.", 400, "upload_size_mismatch");
    }
    await env.MEADOW_MEDIA.delete(temporaryKey);
    return Response.json({ saved: true });
  } catch {
    return fail("Media storage is temporarily unavailable. Please try again.");
  }
}
