import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import https from "node:https";
import { invariant } from "../core/errors.js";

const RETENTION = 7 * 86400000;
const configurationId = uid => createHash("sha256").update(`webhook:${uid}`).digest("hex");

export function publicWebhookAddress(address) {
  if (isIP(address) === 4) {
    const [a, b, c] = address.split(".").map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || a === 169 && b === 254 || a === 172 && b >= 16 && b <= 31 || a === 192 && (b === 168 || b === 0 || b === 2) || a === 100 && b >= 64 && b <= 127 || a === 198 && (b === 18 || b === 19 || b === 51 && c === 100) || a === 203 && b === 0 && c === 113);
  }
  if (isIP(address) !== 6) return false;
  // Only ordinary global unicast; exclude mapped, transition and reserved ranges.
  const normalized = new URL(`https://[${address}]`).hostname.slice(1, -1).toLowerCase();
  const [first, second] = normalized.split(":").slice(0, 2).map(value => parseInt(value || "0", 16));
  return first >= 0x2000 && first <= 0x3fff && !(first === 0x2001 && (second <= 0x1ff || second === 0xdb8)) && first !== 0x2002 && first !== 0x3fff;
}

export function webhookUrl(value) {
  invariant(typeof value === "string" && value.trim().length <= 2048, "Enter a public HTTPS webhook URL.");
  let url; try { url = new URL(value.trim()); } catch { invariant(false, "Enter a valid HTTPS webhook URL."); }
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  invariant(url.protocol === "https:" && !url.username && !url.password && !url.hash && (!url.port || url.port === "443"), "Use an HTTPS URL on port 443 without credentials or a fragment.");
  invariant(isIP(hostname) ? publicWebhookAddress(hostname) : hostname.includes(".") && !/(^|\.)(localhost|local|internal|lan|home|arpa)\.?$/i.test(hostname), "Webhooks must use a public internet address.");
  return url.href;
}

/** Resolve once per attempt and pin the checked address to the TLS connection.
 * HTTPS keeps the original hostname for certificate verification; redirects are
 * never followed. No receiver response body is retained. */
export async function sendWebhook(urlValue, body, headers, { resolve = lookup, request = https.request } = {}) {
  const url = new URL(webhookUrl(urlValue)), hostname = url.hostname.replace(/^\[|\]$/g, "");
  let timer;
  const addresses = isIP(hostname) ? [{ address: hostname, family: isIP(hostname) }] : await Promise.race([
    resolve(hostname, { all: true, verbatim: true }),
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("dns_timeout")), 5000); }),
  ]).finally(() => clearTimeout(timer));
  invariant(addresses.length && addresses.every(item => publicWebhookAddress(item.address)), "Webhooks must use a public internet address.");
  const pinned = addresses[0];
  return new Promise((resolveResult, reject) => {
    const req = request(url, { method: "POST", agent: false, family: pinned.family, headers: { ...headers, "Content-Length": Buffer.byteLength(body) }, lookup: (_host, options, done) => done(null, ...(options.all ? [[pinned]] : [pinned.address, pinned.family])) }, res => {
      res.destroy();
      resolveResult(res.statusCode);
    });
    const timeout = setTimeout(() => req.destroy(new Error("webhook_timeout")), 10000);
    req.once("error", reject); req.once("close", () => clearTimeout(timeout));
    req.end(body);
  });
}

export class WebhookService {
  constructor({ store, vault, locks, privacy, send = sendWebhook, clock = () => Date.now(), enabled = true }) {
    Object.assign(this, { store, vault, locks, privacy, send, clock, enabled });
    this.running = false;
  }
  record(uid) { return this.store.get("webhook", configurationId(uid)); }
  publicRecord(record) {
    if (!record) return null;
    const { id, url, createdAt, updatedAt, lastDelivery } = record;
    return { id, url, createdAt, updatedAt, lastDelivery: lastDelivery || null };
  }
  get(uid) { return { webhook: this.publicRecord(this.record(uid)), ready: this.vault.configured }; }
  save(uid, input = {}) {
    invariant(this.vault.configured, "Webhook signing is not configured on this server.", { status: 503 });
    const url = webhookUrl(input.url), previous = this.record(uid), id = configurationId(uid);
    const changed = previous?.url !== url, secret = changed ? `whsec_${randomBytes(32).toString("base64url")}` : null;
    return this.store.transaction(() => {
      if (changed) this.clearPending(uid);
      const record = this.store.put("webhook", { ...(changed ? {} : previous), id, ownerUid: uid, url, generation: changed ? randomUUID() : previous.generation, encryptedSecret: secret ? this.vault.encrypt(secret, `webhook:${id}`) : previous.encryptedSecret, createdAt: previous?.createdAt || this.clock(), updatedAt: this.clock() });
      return { webhook: this.publicRecord(record), ...(secret ? { secret } : {}) };
    });
  }
  clearPending(uid) { for (const item of this.store.list("webhookDelivery", { ownerUid: uid, limit: null })) this.store.remove("webhookDelivery", item.id); }
  remove(uid) { return this.store.transaction(() => { this.clearPending(uid); this.store.remove("webhook", configurationId(uid)); return { removed: true }; }); }
  rotate(uid) {
    const record = this.record(uid);
    invariant(record, "Save a webhook URL first.", { status: 404 });
    const secret = `whsec_${randomBytes(32).toString("base64url")}`;
    return this.store.transaction(() => {
      this.clearPending(uid);
      const updated = this.store.put("webhook", { ...record, generation: randomUUID(), encryptedSecret: this.vault.encrypt(secret, `webhook:${record.id}`), updatedAt: this.clock() });
      return { webhook: this.publicRecord(updated), secret };
    });
  }
  enqueue(uid, type, data) {
    const record = this.record(uid);
    if (!record || this.privacy?.blocked(uid)) return null;
    const id = randomUUID(), now = this.clock();
    return this.store.put("webhookDelivery", { id, ownerUid: uid, generation: record.generation, status: "pending", dueAt: now, createdAt: now, attempts: 0, event: { id, type, created_at: new Date(now).toISOString(), data } });
  }
  postCompleted(delivery) {
    const account = this.store.get("account", delivery.accountId);
    if (!account || ["deleting", "disconnected"].includes(account.status)) return null;
    return this.enqueue(delivery.ownerUid, "post.completed", { project_id: delivery.projectId, post_id: delivery.postId, delivery_id: delivery.id, account_id: delivery.accountId, platform: delivery.platform, status: delivery.status, external_ref: delivery.externalId || null, url: delivery.url || null });
  }
  reconnect(account) { return this.enqueue(account.ownerUid, "connection.needs_reconnect", { project_id: account.projectId, account_id: account.id, platform: account.platform }); }
  async test(uid) {
    invariant(this.enabled, "Webhook delivery is disabled in local preview.", { status: 409 });
    const item = this.enqueue(uid, "webhook.test", { message: "Meadow webhook connection test." });
    invariant(item, "Save a webhook URL first.", { status: 404 });
    await this.store.flush?.();
    await this.deliver(item.id);
    return this.get(uid);
  }
  async deliver(id) {
    const initial = this.store.get("webhookDelivery", id);
    if (!initial || initial.status !== "pending") return;
    return this.locks.withLock(`webhook-delivery:${id}`, async () => {
      const item = this.store.get("webhookDelivery", id), record = item && this.record(item.ownerUid);
      if (!item || item.status !== "pending" || item.dueAt > this.clock()) return;
      if (!record || record.generation !== item.generation || this.privacy?.blocked(item.ownerUid)) { this.store.remove("webhookDelivery", id); return; }
      const release = this.privacy?.track(item.ownerUid);
      try {
        // Persist the outbox before making an external request. A lost response
        // may be retried with the same event ID; receivers should deduplicate it.
        const attempt = item.attempts + 1;
        this.store.put("webhookDelivery", { ...item, attempts: attempt, dueAt: this.clock() + 60000 });
        await this.store.flush?.();
        const current = this.record(item.ownerUid);
        if (!current || current.generation !== item.generation || this.privacy?.blocked(item.ownerUid)) return;
        const body = JSON.stringify(item.event), timestamp = String(Math.floor(this.clock() / 1000));
        const secret = this.vault.decrypt(current.encryptedSecret, `webhook:${current.id}`);
        const signature = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
        let statusCode, error;
        try { statusCode = await this.send(current.url, body, { "Content-Type": "application/json", "User-Agent": "Meadow-Webhooks/1.0", "X-Meadow-Event-Id": item.id, "X-Meadow-Signature": `t=${timestamp},v1=${signature}` }); if (!Number.isInteger(statusCode) || statusCode < 200 || statusCode >= 300) error = Number.isInteger(statusCode) ? `Receiver returned HTTP ${statusCode}.` : "Receiver did not return a valid HTTP response."; }
        catch { error = "Could not reach the webhook. Check its public HTTPS URL and try again."; }
        if (!this.store.get("webhookDelivery", id) || this.record(item.ownerUid)?.generation !== item.generation || this.privacy?.blocked(item.ownerUid)) return;
        const status = !error ? "delivered" : attempt >= 5 ? "failed" : "pending", now = this.clock();
        this.store.transaction(() => {
          this.store.put("webhookDelivery", { ...item, attempts: attempt, status, dueAt: error ? now + 60000 * 2 ** (attempt - 1) : null });
          const latest = this.record(item.ownerUid);
          this.store.put("webhook", { ...latest, lastDelivery: { eventId: id, type: item.event.type, status, attempts: attempt, at: now, statusCode: statusCode || null, error: error || null } });
        });
      } finally { try { await this.store.flush?.(); } finally { release?.(); } }
    }, { waitMs: 0, leaseMs: 30000 });
  }
  start() {
    if (!this.enabled || this.timer) return;
    this.timer = setInterval(() => this.tick().catch(error => console.error("Webhook worker:", error.code || error.name)), 5000); this.timer.unref?.();
    this.tick().catch(error => console.error("Webhook worker:", error.code || error.name));
  }
  stop() { clearInterval(this.timer); this.timer = null; }
  async tick() {
    if (!this.enabled || this.running) return;
    this.running = true;
    try {
      for (const item of this.store.list("webhookDelivery", { limit: null })) if (item.createdAt <= this.clock() - RETENTION) this.store.remove("webhookDelivery", item.id);
      const due = this.store.list("webhookDelivery", { status: "pending", dueBefore: this.clock(), orderByDue: true, limit: 3 });
      await Promise.all(due.map(item => this.deliver(item.id).catch(error => { if (error.code !== "account_busy") throw error; })));
    } finally { try { await this.store.flush?.(); } finally { this.running = false; } }
  }
}
