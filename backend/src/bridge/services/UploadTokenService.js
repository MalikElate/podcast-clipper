import { createHash, randomBytes } from "node:crypto";
import { invariant } from "../core/errors.js";

const prefix = "meadow_upload_";
const invalidToken = { status: 401, code: "invalid_upload_token" };

/** Short-lived, single-file grants keep slow uploads independent of session JWT expiry. */
export class UploadTokenService {
  constructor({ store, projects, maxBytes, clock = () => Date.now() }) {
    Object.assign(this, { store, projects, maxBytes, clock });
  }

  create(uid, projectId, { bytes } = {}) {
    this.projects.require(uid, projectId);
    invariant(Number.isSafeInteger(bytes) && bytes > 0 && bytes <= this.maxBytes, `Choose a file of up to ${Math.round(this.maxBytes / 1024 ** 2)} MB.`, { code: "upload_size_invalid" });
    const uploadToken = prefix + randomBytes(32).toString("base64url");
    const expiresAt = this.clock() + 30 * 60000;
    this.store.saveState(this.digest(uploadToken), { kind: "media_upload", uid, projectId, bytes, expiresAt }, expiresAt);
    return { uploadToken, expiresAt };
  }

  matches(authorization = "") { return /^Bearer\s+meadow_upload_/i.test(authorization); }

  consume(authorization, method, requestPath) {
    const match = /^Bearer (meadow_upload_[A-Za-z0-9_-]{43})$/.exec(authorization);
    const pathMatch = /^\/projects\/([^/]+)\/media$/.exec(requestPath);
    invariant(match && method === "POST" && pathMatch, "This upload authorization is invalid or expired. Select the file again.", invalidToken);
    const grant = this.store.consumeState(this.digest(match[1]), this.clock());
    invariant(grant?.kind === "media_upload" && grant.projectId === pathMatch[1], "This upload authorization is invalid or expired. Select the file again.", invalidToken);
    return grant;
  }

  digest(token) { return createHash("sha256").update(token).digest("hex"); }
}
