import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { invariant } from "../core/errors.js";

const prefix = "br_live_";

export class ApiKeyService {
  constructor(store, { clock = () => Date.now() } = {}) { this.store = store; this.clock = clock; }

  list(ownerUid) {
    return this.store.list("api_key", { ownerUid }).map(record => this.toPublic(record));
  }

  create(ownerUid, { name } = {}) {
    const cleanName = typeof name === "string" ? name.trim() : "";
    invariant(cleanName.length >= 1 && cleanName.length <= 80, "Give this API key a name between 1 and 80 characters.");
    invariant(this.store.list("api_key", { ownerUid }).length < 20, "You have reached the API key limit.");
    const id = randomBytes(8).toString("hex"), secret = randomBytes(32).toString("base64url");
    const key = `${prefix}${id}_${secret}`, now = this.clock();
    const record = this.store.put("api_key", { id, ownerUid, name: cleanName, digest: this.digest(key), keyHint: `${prefix}${id.slice(0, 6)}…`, createdAt: now, lastUsedAt: null });
    return { apiKey: this.toPublic(record), key };
  }

  remove(ownerUid, id) {
    const record = this.store.get("api_key", id);
    invariant(record && record.ownerUid === ownerUid, "API key not found.", { status: 404, code: "not_found" });
    this.store.remove("api_key", id);
    return { deleted: true };
  }

  token(authorization = "") {
    const match = /^Bearer (br_live_[a-f0-9]{16}_[A-Za-z0-9_-]{43})$/.exec(authorization);
    return match?.[1] || null;
  }

  authenticate(key) {
    const id = key.slice(prefix.length).split("_", 1)[0], record = this.store.get("api_key", id);
    const actual = Buffer.from(this.digest(key), "hex"), expected = Buffer.from(record?.digest || "0".repeat(64), "hex");
    invariant(record && timingSafeEqual(actual, expected), "This API key is invalid or has been revoked.", { status: 401, code: "invalid_api_key" });
    const now = this.clock();
    if (!record.lastUsedAt || record.lastUsedAt <= now - 3600000) this.store.put("api_key", { ...record, lastUsedAt: now });
    return record.ownerUid;
  }

  digest(value) { return createHash("sha256").update(value).digest("hex"); }

  toPublic({ id, name, keyHint, createdAt, lastUsedAt }) { return { id, name, keyHint, createdAt, lastUsedAt }; }
}
