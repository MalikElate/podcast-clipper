import { randomUUID } from "node:crypto";
import { BridgeError } from "../core/errors.js";
import { isPendingDelivery } from "./RateLimitService.js";

/** One durable delivery per destination. A successful destination is never resent. */
export class PublishingWorker {
  constructor({ store, accounts, registry, posts, rates, media, locks, analytics, clock = () => Date.now(), enabled = true, intervalMs = 5000 }) {
    Object.assign(this, { store, accounts, registry, posts, rates, media, locks, analytics, clock, enabled, intervalMs });
    this.id = randomUUID(); this.running = false; this.stopped = true; this.timer = null;
  }
  start() {
    if (!this.enabled || !this.stopped) return;
    this.stopped = false;
    this.timer = setInterval(() => this.tick().catch(error => console.error("Publishing worker:", error.code || error.name)), this.intervalMs);
    this.timer.unref?.();
    this.tick().catch(error => console.error("Publishing worker:", error.code || error.name));
  }
  stop() { this.stopped = true; clearInterval(this.timer); }

  recover() {
    for (const delivery of this.store.list("delivery", { status: "publishing" })) {
      if (delivery.leaseUntil > this.clock()) continue;
      this.store.put("delivery", { ...delivery, status: "needs_review", error: "Publishing was interrupted before the platform confirmed the result. Check the social account before retrying to avoid a duplicate.", updatedAt: this.clock() });
    }
  }

  async tick() {
    if (!this.enabled || this.running) return;
    this.running = true;
    try {
      this.recover();
      const due = this.store.list("delivery", { statuses: ["queued", "scheduled", "retrying", "processing"], dueBefore: this.clock(), orderByDue: true });
      const selected = [], keys = new Set();
      for (const item of due) {
        if (keys.has(item.rateKey)) continue;
        selected.push(item); keys.add(item.rateKey);
        if (selected.length === 3) break;
      }
      await Promise.all(selected.map(item => this.deliver(item.id).catch(error => { if (error.code !== "account_busy") console.error("Delivery worker:", error.code || error.name); })));
    } finally { this.running = false; }
  }

  async deliver(id) {
    const initial = this.store.get("delivery", id);
    if (!initial || initial.status === "published") return;
    return this.locks.withLock(`publishing:${initial.rateKey}`, async () => {
      let delivery = this.store.get("delivery", id);
      if (!delivery || !(isPendingDelivery(delivery) || delivery.status === "processing") || delivery.dueAt > this.clock()) return;
      const polling = delivery.status === "processing";
      let account = this.store.get("account", delivery.accountId);
      if (this.accounts.privacy?.blocked(delivery.ownerUid)) return;
      if (account?.status !== "connected") {
        this.store.put("delivery", { ...delivery, status: "needs_account", resumeStatus: polling ? "processing" : "queued", error: account?.lastError || "Reconnect this account to continue publishing.", updatedAt: this.clock() });
        return;
      }
      let claimed = false, timer;
      try {
        if (polling && delivery.startedAt && this.clock() - delivery.startedAt > 24 * 3600000) throw new BridgeError("The platform has not confirmed this post after 24 hours. Check the account before retrying.", { code: "processing_timeout" });
        const provider = this.registry.get(account.platform);
        let freshOptions = account.options;
        if (polling && account.platform === "pinterest") freshOptions = await this.accounts.options(account.ownerUid, account.projectId, account.id, { force: true });
        if (!polling) {
          freshOptions = await this.accounts.options(account.ownerUid, account.projectId, account.id, { force: true });
          this.rates.replan(account.rateKey);
          delivery = this.store.get("delivery", id);
          if (!isPendingDelivery(delivery) || delivery.dueAt > this.clock() + 50) return;
        }
        const credentials = await this.accounts.credentials(account);
        account = this.store.get("account", account.id);
        if (account?.status !== "connected") return;
        account = { ...account, options: freshOptions };
        const post = this.store.get("post", delivery.postId);
        if (!post) throw new BridgeError("The post is no longer available.");
        const content = polling && delivery.contentSnapshot ? { ...delivery.contentSnapshot, accountOptions: account.options || {}, media: delivery.contentSnapshot.mediaIds.map(id => this.store.get("media", id)).filter(Boolean) } : this.posts.content(post, account);
        if (content.media.length !== post.mediaIds.length) throw new BridgeError("A media item is no longer available.");
        provider.assertValid(content);
        delivery = this.store.transaction(() => {
          const current = this.store.get("delivery", id);
          if (!(isPendingDelivery(current) || current.status === "processing")) return null;
          const { media, accountOptions, ...snapshot } = content;
          return this.store.put("delivery", { ...current, contentSnapshot: current.contentSnapshot || { ...snapshot, mediaIds: media.map(item => item.id) }, status: "publishing", workerId: this.id, leaseUntil: this.clock() + 90000, attempts: polling ? current.attempts : current.attempts + 1, startedAt: current.startedAt || this.clock(), updatedAt: this.clock() });
        });
        if (!delivery) return;
        claimed = true;
        const checkpoint = patch => {
          const current = this.store.get("delivery", id);
          if (!current) return;
          this.store.put("delivery", { ...current, progress: { ...current.progress, ...patch }, leaseUntil: this.clock() + 90000, updatedAt: this.clock() });
        };
        timer = setInterval(() => checkpoint({}), 20000); timer.unref?.();
        if (!polling) this.store.recordRateEvent(id, account.rateKey, this.clock());
        const context = { account, credentials, delivery, post, content, media: this.media, progress: delivery.progress || {}, checkpoint };
        const result = await (polling ? provider.poll(context) : provider.publish(context));
        const current = this.store.get("delivery", id);
        if (!current) return;
        if (result.status === "processing") {
          if (this.clock() - current.startedAt > 24 * 3600000) throw new BridgeError("The platform is still processing after 24 hours. Check the account before retrying.", { code: "processing_timeout" });
          this.store.put("delivery", { ...current, status: "processing", externalId: result.externalId || current.externalId || null, progress: { ...current.progress, ...result.progress }, dueAt: this.clock() + Math.max(5000, Math.min(result.pollAfterMs || 15000, 300000)), leaseUntil: null, updatedAt: this.clock() });
        } else {
          if (result.status !== "published" || !result.externalId) throw new BridgeError("The platform did not confirm a published post.", { code: "unconfirmed_publication" });
          const url = result.url?.startsWith("https://") ? result.url : null;
          this.store.put("delivery", { ...current, status: "published", externalId: String(result.externalId), url, error: null, publishedAt: this.clock(), leaseUntil: null, progress: { ...current.progress, ...(result.progress || {}) }, updatedAt: this.clock() });
          this.rates.replan(account.rateKey);
        }
      } catch (error) {
        const current = this.store.get("delivery", id);
        if (!current || current.status === "published" || !claimed && !isPendingDelivery(current) && current.status !== "processing") return;
        if (error.uncertain || ["processing_timeout", "unconfirmed_publication"].includes(error.code)) {
          this.store.put("delivery", { ...current, status: "needs_review", error: error.message, leaseUntil: null, updatedAt: this.clock() });
        } else if (error.reconnect || error.code === "reconnect_required") {
          const message = error instanceof BridgeError ? error.message : "Reconnect this account to renew its permissions.";
          this.accounts.markReconnect(account.id, message);
          this.store.put("delivery", { ...current, status: "needs_account", resumeStatus: polling ? "processing" : "queued", error: message, leaseUntil: null, updatedAt: this.clock() });
          if (!polling) this.store.removeRateEvent(id);
        } else if (error.code === "rate_limited") {
          if (!polling || error.restartPublishing) this.store.removeRateEvent(id);
          const retryAt = error.retryAt || this.clock() + 15 * 60000;
          this.store.put("delivery", { ...current, status: polling && !error.restartPublishing ? "processing" : "retrying", ...(error.restartPublishing ? { progress: {}, startedAt: null } : {}), dueAt: retryAt, retryAt, attempts: Math.max(0, current.attempts - (claimed && !polling ? 1 : 0)), error: error.message, leaseUntil: null, updatedAt: this.clock() });
          this.rates.block(account.rateKey, retryAt, error.retryAt ? "Waiting for the provider's reset time." : "The platform did not give a reset time. Meadow will check its allowance again.");
        } else if (error.retryable && current.attempts < 5) {
          if (!polling) this.store.removeRateEvent(id);
          const retryAt = this.clock() + Math.min(60 * 60000, 60000 * 2 ** Math.max(0, current.attempts - 1));
          this.store.put("delivery", { ...current, status: polling ? "processing" : "retrying", dueAt: retryAt, retryAt, error: error.message, leaseUntil: null, updatedAt: this.clock() });
          if (!polling) this.rates.replan(account.rateKey);
        } else {
          if (!polling) this.store.removeRateEvent(id);
          this.store.put("delivery", { ...current, status: "failed", error: error instanceof BridgeError ? error.message : "Publishing could not be completed. Check the media and account settings.", leaseUntil: null, updatedAt: this.clock() });
          this.rates.replan(account.rateKey);
        }
      } finally { clearInterval(timer); }
    }, { waitMs: 0, leaseMs: 90000 });
  }
}
