import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { invariant } from "../core/errors.js";
import { SecretVault } from "../core/SecretVault.js";

const DAY = 86400000;
const secrets = { facebook: "FACEBOOK_CLIENT_SECRET", instagram: "INSTAGRAM_CLIENT_SECRET", threads: "THREADS_CLIENT_SECRET" };
const subjectKey = (platform, userId) => SecretVault.hash(`meta-removal:${platform}:${userId}`);

/** Meta signs removal requests with the product's own app secret, not a user token. */
export class MetaPrivacyService {
  constructor({ store, vault, privacy, env, publicUrl, clock = () => Date.now() }) {
    Object.assign(this, { store, vault, privacy, env, publicUrl, clock });
  }

  parse(platform, signedRequest) {
    invariant(Object.hasOwn(secrets, platform), "Unknown Meta platform.", { status: 404 });
    const secret = this.env[secrets[platform]];
    invariant(secret, "Meta callbacks are not configured.", { status: 503 });
    const invalid = () => invariant(false, "Invalid Meta signed request.", { status: 400 });
    if (typeof signedRequest !== "string" || signedRequest.length > 16384 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(signedRequest)) invalid();
    const [signature, payload] = signedRequest.split(".");
    const actual = Buffer.from(signature, "base64url"), expected = createHmac("sha256", secret).update(payload).digest();
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) invalid();
    let data;
    try { data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")); } catch { invalid(); }
    if (!data || data.algorithm !== "HMAC-SHA256" || typeof data.user_id !== "string" || !/^\d{1,64}$/.test(data.user_id) ||
      !Number.isSafeInteger(data.issued_at) || data.issued_at <= 0 || data.issued_at * 1000 > this.clock() + 300000) invalid();
    // Meta may retry an older deletion request. Its timestamp limits which grants it removes.
    return { userId: data.user_id, cutoff: (data.issued_at + 1) * 1000 - 1, requestId: SecretVault.hash(`${platform}:${payload}`) };
  }

  subjects(platform, candidate) {
    if (!Object.hasOwn(secrets, platform)) return [];
    const ids = candidate.credentials?.metaUserIds;
    return Array.isArray(ids) ? ids.filter(id => typeof id === "string") : (platform !== "facebook" && candidate.remoteId ? [String(candidate.remoteId)] : []);
  }

  assertAuthorization(platform, candidates, startedAt) {
    for (const candidate of candidates) for (const subject of this.subjects(platform, candidate)) {
      const barrier = this.store.get("metaRemovalBarrier", subjectKey(platform, subject));
      invariant(!barrier || startedAt > barrier.cutoff, "This Meta authorization predates a removal request. Connect again.", { status: 409, code: "connection_removed" });
    }
  }

  receive(platform, signedRequest) {
    const { userId, cutoff, requestId } = this.parse(platform, signedRequest);
    return this.store.transaction(() => {
      const existing = this.store.get("metaRemovalRequest", requestId);
      if (existing) return this.response(existing.code);
      const now = this.clock(), barrierId = subjectKey(platform, userId);
      const previous = this.store.get("metaRemovalBarrier", barrierId);
      this.store.put("metaRemovalBarrier", { id: barrierId, cutoff: Math.max(previous?.cutoff || 0, cutoff), createdAt: now, expiresAt: now + DAY });
      const matches = candidate => this.subjects(platform, candidate).includes(userId);
      const ownerAccounts = new Map();
      for (const account of this.store.list("account", { limit: null })) {
        if (account.platform !== platform || (account.authorizationStartedAt || account.authorizationGrantedAt || account.createdAt) > cutoff) continue;
        // Fail the callback for retry if credentials cannot be inspected, rather than claiming erasure.
        const credentials = account.encryptedCredentials ? this.vault.decrypt(account.encryptedCredentials, `account:${account.id}`) : {};
        invariant(platform !== "facebook" || this.subjects(platform, { credentials }).length, "A legacy Facebook connection needs reconnection before this removal can be verified.", { status: 503 });
        if (!matches({ ...account, credentials })) continue;
        this.privacy.markDeleting(account);
        const ids = ownerAccounts.get(account.ownerUid) || [];
        ids.push(account.id); ownerAccounts.set(account.ownerUid, ids);
      }
      for (const connection of this.store.list("connection", { limit: null })) {
        if (connection.platform !== platform || (connection.authorizationStartedAt || connection.createdAt) > cutoff) continue;
        const candidates = this.vault.decrypt(connection.encrypted, `connection:${connection.id}`);
        const remaining = candidates.filter(candidate => !matches(candidate));
        if (!remaining.length) this.store.remove("connection", connection.id);
        else if (remaining.length !== candidates.length) this.store.put("connection", { ...connection, encrypted: this.vault.encrypt(remaining, `connection:${connection.id}`) });
      }
      const jobs = [];
      for (const [ownerUid, accountIds] of ownerAccounts) {
        const id = randomUUID(); jobs.push(id);
        this.store.put("erasure", { id, ownerUid, type: "connection", accountIds, alreadyRevoked: true, status: "pending", dueAt: now, createdAt: now });
      }
      const code = randomBytes(24).toString("hex");
      // Receipts contain no platform user IDs, account labels, tokens, or Meadow owner IDs.
      this.store.put("metaRemovalReceipt", { id: code, jobs, createdAt: now, expiresAt: now + 90 * DAY });
      this.store.put("metaRemovalRequest", { id: requestId, code, createdAt: now, expiresAt: now + 90 * DAY });
      return this.response(code);
    });
  }

  response(code) { return { url: `${this.publicUrl}/api/meta/deletion-status/${code}`, confirmation_code: code }; }

  status(code) {
    const receipt = /^[a-f0-9]{48}$/.test(code || "") && this.store.get("metaRemovalReceipt", code);
    invariant(receipt && receipt.expiresAt > this.clock(), "This deletion reference was not found or has expired.", { status: 404 });
    return { confirmationCode: code, status: receipt.jobs.some(id => this.store.get("erasure", id)) ? "pending" : "complete" };
  }

  prune() {
    for (const kind of ["metaRemovalBarrier", "metaRemovalRequest", "metaRemovalReceipt"]) {
      for (const item of this.store.list(kind, { limit: null })) {
        if (item.expiresAt > this.clock()) continue;
        const receipt = kind === "metaRemovalReceipt" ? item : kind === "metaRemovalRequest" ? this.store.get("metaRemovalReceipt", item.code) : null;
        if (receipt?.jobs.some(id => this.store.get("erasure", id))) {
          this.store.put(kind, { ...item, expiresAt: this.clock() + 90 * DAY });
          continue;
        }
        this.store.remove(kind, item.id);
      }
    }
  }
}
