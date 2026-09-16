import { randomUUID, createHmac, timingSafeEqual } from "node:crypto";
import { invariant } from "../core/errors.js";
import { SecretVault } from "../core/SecretVault.js";
import fs from "node:fs/promises";
import path from "node:path";
import { connectionDisclosure } from "../platforms/connectionPrivacy.js";

export const POLICY_VERSION = "2026-09-16";
const DAY = 86400000;
const CONNECTION_BARRIER_TTL = 15 * 60000;
// Production may wake only once daily, so reserve a full wake interval before
// the public seven-day deadline when ordinary lock-protected cleanup is stuck.
const HARD_LOCAL_PURGE_AFTER = 6 * DAY;
const HARD_PURGE_PLATFORMS = new Set(["youtube", "google_business", "tiktok"]);
export const deletionMarker = uid => SecretVault.hash(`meadow-deletion:${uid}`);

/** Durable erasure jobs. Failed external operations never restore access or data. */
export class PrivacyService {
  constructor({ store, vault, locks, registry, storage, projects, billing, deleteIdentity, deleteAnalytics, clock = () => Date.now(), env = {} }) {
    Object.assign(this, { store, vault, locks, registry, storage, projects, billing, deleteIdentity, deleteAnalytics, clock, env });
    this.activeRequests = new Map();
  }
  blocked(uid) { return Boolean(this.store.get("privacyBlock", deletionMarker(uid))); }
  connectionBarrier(uid, platform) {
    const keys = new Set([platform, ...(["youtube", "google_business"].includes(platform) ? ["google"] : [])]);
    return Math.max(0, ...[...keys].map(key => this.store.get("connectionBarrier", SecretVault.hash(`${uid}:${key}`))).filter(record => record && (!record.expiresAt || record.expiresAt > this.clock())).map(record => record.createdAt || 0));
  }
  setConnectionBarrier(uid, key) {
    const now = this.clock();
    this.store.put("connectionBarrier", { id: SecretVault.hash(`${uid}:${key}`), createdAt: now, expiresAt: now + CONNECTION_BARRIER_TTL });
  }
  assertActive(uid) { invariant(!this.blocked(uid), "Account deletion has been requested. This workspace is closed.", { status: 410, code: "account_deleting" }); }
  status(uid) {
    const block = this.store.get("privacyBlock", deletionMarker(uid));
    const job = block && this.store.get("erasure", block.jobId);
    return { version: POLICY_VERSION,
      deletion: block ? { requestedAt: block.createdAt, status: block.status, reference: block.jobId, pending: job?.pending || [] } : null };
  }
  requireConnectionConsent(platform, consent) {
    const disclosure = connectionDisclosure(platform);
    if (!disclosure) return;
    invariant(consent?.accepted === true && consent.platform === platform && consent.version === disclosure.version,
      `Review and accept the ${disclosure.name} connection privacy notice before connecting.`, { status: 400, code: "connection_consent_required" });
  }
  connectionConsent(platform, input) {
    this.requireConnectionConsent(platform, input);
    return connectionDisclosure(platform) ? { platform, version: input.version, accepted: true, acceptedAt: this.clock() } : null;
  }
  track(uid, res) {
    this.activeRequests.set(uid, (this.activeRequests.get(uid) || 0) + 1);
    let finished = false;
    const release = () => { if (finished) return; finished = true; const remaining = (this.activeRequests.get(uid) || 1) - 1; if (remaining) this.activeRequests.set(uid, remaining); else this.activeRequests.delete(uid); };
    res.once("finish", release);
    return release;
  }
  requestAccount(uid, input, { identityAlreadyDeleted = false } = {}) {
    invariant(identityAlreadyDeleted || input?.confirmation === "DELETE", "Type DELETE to confirm permanent account deletion.");
    if (this.blocked(uid)) return this.status(uid);
    this.store.transaction(() => {
      const id = randomUUID(), now = this.clock();
      this.store.put("privacyBlock", { id: deletionMarker(uid), jobId: id, status: "pending", createdAt: now });
      this.store.put("erasure", { id, ownerUid: uid, type: "owner", status: "pending", createdAt: now, dueAt: now, identityDone: identityAlreadyDeleted });
      for (const key of this.store.list("api_key", { ownerUid: uid, limit: null })) this.store.remove("api_key", key.id);
      for (const account of this.store.list("account", { ownerUid: uid, limit: null })) this.markDeleting(account);
    });
    return this.status(uid);
  }
  markDeleting(account) {
    this.store.put("account", { ...account, status: "deleting", deletionRequestedAt: account.deletionRequestedAt || this.clock(), updatedAt: this.clock() });
    for (const delivery of this.store.list("delivery", { ownerUid: account.ownerUid, limit: null }).filter(item => item.accountId === account.id && !["published", "publishing"].includes(item.status))) {
      this.store.put("delivery", { ...delivery, status: "cancelled", error: null, updatedAt: this.clock() });
    }
  }
  requestLostAccess(account, { authorizationLost = false } = {}) {
    const selected = this.store.get("account", account.id);
    if (!selected || selected.platform !== "youtube" || selected.authorizationId !== account.authorizationId || selected.status === "disconnected" || !authorizationLost && selected.status === "deleting") return false;
    if (authorizationLost) {
      this.requestConnection(selected.ownerUid, selected.projectId, selected.id, { alreadyRevoked: true, matchAuthorizationOnly: true, scheduleUncovered: true });
      return true;
    }
    const existingJob = this.store.list("erasure", { ownerUid: selected.ownerUid, limit: null }).find(item => item.type === "connection" && item.accountIds.includes(selected.id));
    if (existingJob) return true;
    const id = randomUUID(), now = this.clock();
    this.store.transaction(() => {
      this.setConnectionBarrier(selected.ownerUid, "youtube");
      this.store.removeStates(selected.ownerUid, ["youtube"]);
      for (const connection of this.store.list("connection", { ownerUid: selected.ownerUid, limit: null }).filter(item => item.platform === "youtube")) this.store.remove("connection", connection.id);
      this.markDeleting(selected);
      // A missing channel can share an otherwise valid Google authorization
      // with a Business Profile. Remove only the unavailable YouTube account.
      this.store.put("erasure", { id, ownerUid: selected.ownerUid, type: "connection", accountIds: [selected.id], alreadyRevoked: true, reason: "lost_access", status: "pending", dueAt: now, createdAt: now });
    });
    return true;
  }
  requestConnection(uid, projectId, accountId, { alreadyRevoked = false, matchAuthorizationOnly = false, scheduleUncovered = false } = {}) {
    const selected = this.projects.requireRecord(uid, projectId, "account", accountId);
    const existingJob = this.store.list("erasure", { ownerUid: uid, limit: null }).find(item => item.type === "connection" && item.accountIds.includes(accountId));
    if (existingJob && !scheduleUncovered) return { disconnected: true, deletionPending: true, reference: existingJob.id };
    // The same authorization can be attached to several workspaces owned by this user.
    const tokens = account => { try { return account.encryptedCredentials ? this.vault.decrypt(account.encryptedCredentials, `account:${account.id}`) : {}; } catch { return {}; } };
    const selectedTokens = tokens(selected);
    let accounts = this.store.list("account", { ownerUid: uid, limit: null }).filter(account => {
      if (account.id === selected.id) return true;
      if (!matchAuthorizationOnly && account.platform === selected.platform && account.remoteId === selected.remoteId) return true;
      if (account.authorizationId && account.authorizationId === selected.authorizationId) return true;
      if (!account.encryptedCredentials || !selected.encryptedCredentials) return false;
      const candidate = tokens(account);
      const sameFamily = account.platform === selected.platform || [account.platform, selected.platform].every(value => ["youtube", "google_business"].includes(value));
      return sameFamily && Boolean(selectedTokens.refreshToken && candidate.refreshToken === selectedTokens.refreshToken || selectedTokens.accessToken && candidate.accessToken === selectedTokens.accessToken);
    });
    if (scheduleUncovered) {
      const scheduled = new Set(this.store.list("erasure", { ownerUid: uid, limit: null }).filter(item => item.type === "connection").flatMap(item => item.accountIds));
      accounts = accounts.filter(account => !scheduled.has(account.id));
      if (!accounts.length) return { disconnected: true, deletionPending: true, reference: existingJob?.id };
    }
    const id = randomUUID();
    this.store.transaction(() => {
      const platforms = ["youtube", "google_business"].includes(selected.platform) ? ["youtube", "google_business"] : [selected.platform];
      this.setConnectionBarrier(uid, platforms.length > 1 ? "google" : selected.platform);
      this.store.removeStates(uid, platforms);
      for (const connection of this.store.list("connection", { ownerUid: uid, limit: null }).filter(item => platforms.includes(item.platform))) this.store.remove("connection", connection.id);
      for (const account of accounts) this.markDeleting(account);
      this.store.put("erasure", { id, ownerUid: uid, type: "connection", accountIds: accounts.map(item => item.id), alreadyRevoked, status: "pending", dueAt: this.clock(), createdAt: this.clock() });
    });
    return { disconnected: true, deletionPending: true, reference: id, affectedConnections: accounts.length, remoteRevocation: ["youtube", "google_business", "tiktok"].includes(selected.platform) ? "pending" : "manual" };
  }
  removeConnectionData(account) {
    for (const delivery of this.store.list("delivery", { ownerUid: account.ownerUid, limit: null }).filter(item => item.accountId === account.id)) { this.store.removeRateEvent(delivery.id); this.store.remove("delivery", delivery.id); }
    this.store.removeRateEventsForAccount(account.ownerUid, account.id);
    for (const post of this.store.list("post", { ownerUid: account.ownerUid, limit: null }).filter(item => item.accountIds.includes(account.id))) {
      const overrides = { ...post.overrides }; delete overrides[account.id];
      const accountIds = post.accountIds.filter(id => id !== account.id);
      this.store.put("post", { ...post, accountIds, overrides, ...(!accountIds.length ? { status: "draft" } : {}), updatedAt: this.clock() });
    }
    this.store.remove("account", account.id);
  }
  manualRevocationReceipt({ id = randomUUID(), subject, platform, createdAt }) {
    return { id, subject, platform, status: "manual_revocation_required", createdAt, expiresAt: this.clock() + 30 * DAY };
  }
  discardRevocationCredentials(job) {
    const receipt = this.manualRevocationReceipt(job);
    this.store.put("revocation", receipt);
    console.error("Privacy revocation needs manual follow-up:", receipt.id, receipt.platform);
    return receipt;
  }
  expireRevocationCredentials() {
    const expired = this.store.list("revocation", { status: "pending", limit: null }).filter(job => job.expiresAt <= this.clock());
    for (const job of expired) this.discardRevocationCredentials(job);
    if (expired.length) this.store.checkpointDeletedData();
  }
  hardPurgeExpiredConnections() {
    const expired = this.store.list("account", { status: "deleting", limit: null }).filter(account => HARD_PURGE_PLATFORMS.has(account.platform) && account.deletionRequestedAt <= this.clock() - HARD_LOCAL_PURGE_AFTER);
    if (!expired.length) return;
    const erasures = this.store.list("erasure", { limit: null });
    const manual = [], blueskyIds = [], accountLockIds = [], publishingRateKeys = [], credentialGrantKeys = [];
    this.store.transaction(() => {
      for (const original of expired) {
        const account = this.store.get("account", original.id);
        if (!account || account.status !== "deleting" || account.deletionRequestedAt > this.clock() - HARD_LOCAL_PURGE_AFTER) continue;
        const related = erasures.filter(job => job.ownerUid === account.ownerUid && (job.type === "owner" || job.accountIds?.includes(account.id)));
        const alreadyRevoked = related.length > 0 && related.every(job => job.alreadyRevoked === true);
        if (!alreadyRevoked && account.encryptedCredentials && ["youtube", "google_business", "tiktok"].includes(account.platform)) {
          const receipt = this.manualRevocationReceipt({ subject: deletionMarker(account.ownerUid), platform: account.platform, createdAt: account.deletionRequestedAt });
          this.store.put("revocation", receipt); manual.push(receipt);
        }
        if (account.platform === "bluesky") blueskyIds.push(account.remoteId);
        accountLockIds.push(account.id);
        if (account.rateKey) publishingRateKeys.push(account.rateKey);
        if (this.accounts) credentialGrantKeys.push(this.accounts.credentialLockKey(account));
        this.removeConnectionData(account);
      }
      for (const job of erasures.filter(item => item.type === "connection")) {
        const accountIds = job.accountIds.filter(id => this.store.get("account", id));
        if (!accountIds.length) this.store.remove("erasure", job.id);
        else if (accountIds.length !== job.accountIds.length) this.store.put("erasure", { ...job, accountIds });
      }
    });
    for (const id of accountLockIds) this.locks.cancel(`credentials:${id}`);
    for (const rateKey of new Set(publishingRateKeys)) {
      if (!this.store.list("account", { rateKey, limit: 1 }).length) this.locks.cancel(`publishing:${rateKey}`);
    }
    for (const key of new Set(credentialGrantKeys)) {
      if (!this.store.list("account", { limit: null }).some(account => this.accounts.credentialLockKey(account) === key)) this.locks.cancel(key);
    }
    for (const remoteId of blueskyIds) this.pruneBlueskySession(remoteId);
    for (const receipt of manual) console.error("Privacy revocation needs manual follow-up:", receipt.id, receipt.platform);
    this.store.checkpointDeletedData();
  }
  async eraseConnection(accountId, alreadyRevoked) {
    const initial = this.store.get("account", accountId);
    if (!initial) return;
    const lockCredentials = operation => this.accounts ? this.accounts.withCredentialLock(initial, operation, { waitMs: 0 }) : this.locks.withLock(`credentials:${accountId}`, operation, { waitMs: 0 });
    await this.locks.withLock(`publishing:${initial.rateKey}`, () => lockCredentials(async () => {
      const account = this.store.get("account", accountId);
      if (!account) return;
      this.store.transaction(() => {
        if (!alreadyRevoked && account.encryptedCredentials && ["youtube", "google_business", "tiktok"].includes(account.platform)) {
          // Retain only the encrypted token needed to revoke, for at most seven days.
          const id = randomUUID();
          this.store.put("revocation", { id, ownerUid: account.ownerUid, subject: deletionMarker(account.ownerUid), platform: account.platform, encrypted: account.encryptedCredentials, aad: `account:${accountId}`, status: "pending", dueAt: this.clock(), expiresAt: (account.deletionRequestedAt || this.clock()) + HARD_LOCAL_PURGE_AFTER, createdAt: this.clock() });
        }
        this.removeConnectionData(account);
      });
      if (account.platform === "bluesky") this.pruneBlueskySessions();
      await this.store.flush?.();
    }), { waitMs: 0, leaseMs: 90000 });
  }
  async process(job) {
    if (this.activeRequests.has(job.ownerUid) || this.accounts?.pendingCallbacks) return;
    await this.store.flush?.();
    const accountIds = job.type === "owner" ? this.store.list("account", { ownerUid: job.ownerUid, limit: null }).map(item => item.id) : job.accountIds;
    for (const id of accountIds) await this.eraseConnection(id, job.alreadyRevoked);
    if (job.type === "connection") { this.store.remove("erasure", job.id); this.store.checkpointDeletedData(); return; }
    if (!job.localDone) {
      // Persist the file manifest before deleting any row; retries also remove partial variants.
      if (!job.fileKeys) {
        const fileKeys = this.store.list("media", { ownerUid: job.ownerUid, limit: null }).flatMap(item => [item.storageKey, item.thumbnailKey, `${item.id}-thumb.jpg`, `${item.id}-jpeg.jpg`, `${item.id}-mp4.mp4`, ...Object.values(item.variants || {}).map(asset => asset.key)]).filter(Boolean);
        job = this.store.put("erasure", { ...job, fileKeys: [...new Set(fileKeys)] });
      }
      await this.store.flush?.();
      for (const key of job.fileKeys) await this.storage.remove(key);
      this.store.removeOwner(job.ownerUid, { keepKinds: ["erasure", "revocation", "billing", "checkout_session", "processor_erasure"] });
      job = this.store.put("erasure", { ...job, localDone: true, fileKeys: null });
      this.pruneBlueskySessions();
      this.store.checkpointDeletedData();
    }
    const pending = [];
    if (!job.billingDone) {
      try { await this.billing.cancelForDeletion(job.ownerUid); job.billingDone = true; this.store.remove("billing", job.ownerUid); }
      catch { pending.push("billing"); }
    }
    if (!job.analyticsDone) {
      try { job.analyticsDone = await this.deleteAnalytics(job.ownerUid) !== false; if (!job.analyticsDone) pending.push("analytics"); }
      catch { pending.push("analytics"); }
    }
    if (!job.identityDone) {
      try { await this.deleteIdentity(job.ownerUid); job.identityDone = true; }
      catch { pending.push("sign_in"); }
    }
    const revocations = this.store.list("revocation", { ownerUid: job.ownerUid, limit: null });
    if (revocations.some(item => item.status === "pending")) pending.push("social_authorization");
    const status = pending.length ? "pending" : "complete";
    this.store.put("privacyBlock", { id: deletionMarker(job.ownerUid), jobId: job.id, status, createdAt: job.createdAt, ...(status === "complete" ? { completedAt: this.clock() } : {}) });
    if (status === "complete") { this.store.remove("erasure", job.id); this.store.checkpointDeletedData(); }
    else this.store.put("erasure", { ...job, pending, dueAt: this.clock() + 60000 });
  }
  async revoke(job) {
    if (job.expiresAt <= this.clock()) {
      // Never keep a failed revocation token indefinitely. The receipt is visible to operators.
      this.discardRevocationCredentials(job);
      this.store.checkpointDeletedData();
      return;
    }
    try {
      await this.store.flush?.();
      let credentials = this.vault.decrypt(job.encrypted, job.aad || `revocation:${job.id}`);
      const provider = this.registry.forCleanup(job.platform);
      if (job.platform === "tiktok" && credentials.refreshToken && credentials.expiresAt && credentials.expiresAt <= this.clock() + 60000) {
        credentials = await provider.refresh(credentials);
        job = this.store.put("revocation", { ...job, aad: `revocation:${job.id}`, encrypted: this.vault.encrypt(credentials, `revocation:${job.id}`) });
        await this.store.flush?.();
      }
      await provider.revoke(credentials);
      this.store.remove("revocation", job.id);
      this.store.checkpointDeletedData();
    } catch { this.store.put("revocation", { ...job, attempts: (job.attempts || 0) + 1, dueAt: this.clock() + 60000 }); }
  }
  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      this.prune();
      for (const job of this.store.list("revocation", { status: "pending", dueBefore: this.clock(), limit: null })) await this.revoke(job);
      for (const job of this.store.list("erasure", { dueBefore: this.clock(), limit: null })) {
        try { await this.process(job); }
        catch (error) { this.store.put("erasure", { ...this.store.get("erasure", job.id), dueAt: this.clock() + 60000, lastError: error.code === "account_busy" ? "work_finishing" : "cleanup_retry" }); }
      }
      await this.accounts?.maintainApiData();
      await this.media?.retryRemovals();
      await this.pruneFiles();
      this.pruneBlueskySessions();
    } finally { try { await this.store.flush?.(); } finally { this.running = false; } }
  }
  prune() {
    this.store.pruneLeases(this.clock());
    this.hardPurgeExpiredConnections();
    this.expireRevocationCredentials();
    this.metaPrivacy?.prune();
    this.store.pruneStates(this.clock());
    for (const kind of ["connection", "blueskyState", "revocation", "connectionBarrier"]) for (const record of this.store.list(kind, { limit: null })) {
      if ((kind === "connectionBarrier" ? !record.expiresAt || record.expiresAt <= this.clock() : record.expiresAt <= this.clock()) && (kind !== "revocation" || record.status !== "pending")) this.store.remove(kind, record.id);
    }
    for (const account of this.store.list("account", { limit: null })) {
      if (account.status === "disconnected" && !this.blocked(account.ownerUid)) {
        this.markDeleting(account);
        this.store.put("erasure", { id: randomUUID(), ownerUid: account.ownerUid, type: "connection", accountIds: [account.id], alreadyRevoked: true, status: "pending", createdAt: this.clock(), dueAt: this.clock() });
        continue;
      }
      if (account.platform === "pinterest" && (account.label !== "Pinterest account" || account.avatar || account.profileUrl || account.metadata || account.options)) this.store.put("account", { ...account, label: "Pinterest account", avatar: null, profileUrl: null, metadata: null, options: null, optionsUpdatedAt: null });
    }
    for (const delivery of this.store.list("delivery", { limit: null })) {
      if (delivery.platform === "pinterest" && (delivery.metrics || delivery.metricsUpdatedAt || delivery.metricsNote || delivery.metricsError)) this.store.put("delivery", { ...delivery, metrics: null, metricsUpdatedAt: null, metricsAttemptedAt: null, metricsNote: null, metricsError: null });
      if (delivery.platform === "youtube" && (delivery.metricsUpdatedAt || delivery.publishedAt || delivery.createdAt) < this.clock() - 30 * DAY && (delivery.metrics || delivery.externalId || Object.keys(delivery.progress || {}).length)) this.store.put("delivery", { ...delivery, metrics: null, metricsUpdatedAt: null, externalId: null, url: null, progress: {}, contentSnapshot: null, metricsNote: "YouTube data expired. Open YouTube Studio to view this video's current status." });
    }
    for (const connection of this.store.list("connection", { limit: null }).filter(item => item.platform === "pinterest")) {
      try {
        const candidates = this.vault.decrypt(connection.encrypted, `connection:${connection.id}`);
        if (candidates.some(item => item.label !== "Pinterest account" || item.avatar || item.profileUrl)) this.store.put("connection", { ...connection, encrypted: this.vault.encrypt(candidates.map(item => ({ remoteId: item.remoteId, label: "Pinterest account", credentials: item.credentials })), `connection:${connection.id}`) });
      } catch { this.store.remove("connection", connection.id); }
    }
  }
  async pruneFiles() {
    if (!this.storage.root) return;
    for (const [directory, incoming] of [[this.incomingDirectory, true], [this.storage.root, false]]) {
      if (!directory) continue;
      for (const name of await fs.readdir(directory)) {
        const mediaId = name.match(/^([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})[.-]/i)?.[1];
        if (incoming ? !/^[a-f0-9]{32}$/i.test(name) : !mediaId || this.store.get("media", mediaId)) continue;
        const filename = path.join(directory, name), stat = await fs.lstat(filename).catch(() => null);
        if (stat?.isFile() && stat.mtimeMs < this.clock() - DAY) await fs.unlink(filename).catch(error => { if (error.code !== "ENOENT") throw error; });
      }
    }
  }
  pruneBlueskySession(remoteId) {
    if (this.store.list("account", { limit: null }).some(item => item.platform === "bluesky" && item.remoteId === remoteId)) return;
    for (const connection of this.store.list("connection", { limit: null }).filter(item => item.platform === "bluesky")) {
      try { if (this.vault.decrypt(connection.encrypted, `connection:${connection.id}`).some(candidate => candidate.remoteId === remoteId)) return; }
      catch { return; }
    }
    this.store.remove("blueskySession", SecretVault.hash(remoteId));
  }
  pruneBlueskySessions() {
    if (this.accounts?.pendingCallbacks) return;
    const referenced = new Set(this.store.list("account", { limit: null }).filter(item => item.platform === "bluesky").map(item => SecretVault.hash(item.remoteId)));
    for (const connection of this.store.list("connection", { limit: null }).filter(item => item.platform === "bluesky")) {
      try { for (const candidate of this.vault.decrypt(connection.encrypted, `connection:${connection.id}`)) referenced.add(SecretVault.hash(candidate.remoteId)); }
      catch { return; }
    }
    for (const session of this.store.list("blueskySession", { limit: null })) if (!referenced.has(session.id)) this.store.remove("blueskySession", session.id);
  }
  tiktokWebhook(rawBody, signature) {
    invariant(this.env.TIKTOK_CLIENT_SECRET, "TikTok webhooks are not configured.", { status: 503 });
    invariant(Buffer.isBuffer(rawBody), "Invalid webhook body.", { status: 400 });
    const fields = String(signature || "").split(",").map(value => value.trim().split("="));
    const timestamp = fields.find(([key]) => key === "t")?.[1];
    const signatures = fields.filter(([key]) => key === "s").map(([, value]) => value);
    const expected = createHmac("sha256", this.env.TIKTOK_CLIENT_SECRET).update(`${timestamp}.`).update(rawBody).digest();
    invariant(/^\d+$/.test(timestamp || "") && Math.abs(this.clock() - Number(timestamp) * 1000) <= 5 * 60000 && signatures.some(value => { const actual = Buffer.from(value || "", "hex"); return actual.length === expected.length && timingSafeEqual(actual, expected); }), "Invalid TikTok webhook signature.", { status: 400 });
    let event; try { event = JSON.parse(rawBody); } catch { invariant(false, "Invalid webhook body."); }
    invariant(event.client_key === this.env.TIKTOK_CLIENT_KEY, "Unexpected TikTok client.", { status: 400 });
    if (event.event === "authorization.removed") {
      invariant(event.user_openid && Number.isFinite(event.create_time), "Invalid authorization event.");
      for (const account of this.store.list("account", { limit: null }).filter(item => item.platform === "tiktok" && item.remoteId === event.user_openid && Math.floor((item.authorizationGrantedAt || item.createdAt) / 1000) <= event.create_time)) {
        if (!this.blocked(account.ownerUid)) this.requestConnection(account.ownerUid, account.projectId, account.id, { alreadyRevoked: true });
      }
    }
    return { received: true };
  }
}
