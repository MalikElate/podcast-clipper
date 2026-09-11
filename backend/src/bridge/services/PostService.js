import { randomUUID } from "node:crypto";
import { BridgeError, invariant } from "../core/errors.js";
import { SecretVault } from "../core/SecretVault.js";
import { isPendingDelivery } from "./RateLimitService.js";

const terminal = new Set(["published", "cancelled"]);
const editableDelivery = item => isPendingDelivery(item) || ["failed", "needs_account"].includes(item.status);

export class PostService {
  constructor({ store, projects, accounts, registry, media, schedules, rates, clock = () => Date.now(), localPreview = false }) {
    Object.assign(this, { store, projects, accounts, registry, media, schedules, rates, clock, localPreview });
  }

  content(post, account) {
    const override = post.overrides?.[account.id] || {};
    return { caption: override.caption ?? post.caption ?? "", title: override.title ?? post.title ?? "", format: override.format || post.format || "auto",
      settings: override.settings || {}, accountOptions: account.options || {}, media: post.mediaIds.map(id => this.store.get("media", id)).filter(Boolean) };
  }

  normalize(uid, projectId, input) {
    invariant(input && typeof input === "object" && !Array.isArray(input), "Invalid post.");
    invariant(typeof (input.caption ?? "") === "string" && (input.caption || "").length <= 65000, "The caption is too long.");
    invariant(typeof (input.title ?? "") === "string" && (input.title || "").length <= 500, "The title is too long.");
    invariant(Array.isArray(input.accountIds) && input.accountIds.length && input.accountIds.length <= 100, "Select at least one destination account.");
    invariant(new Set(input.accountIds).size === input.accountIds.length, "An account was selected more than once.");
    invariant(input.accountIds.every(id => typeof id === "string" && id.length <= 200), "Invalid destination account.");
    const mediaIds = input.mediaIds || [];
    invariant(Array.isArray(mediaIds) && mediaIds.length <= 35 && new Set(mediaIds).size === mediaIds.length, "Select up to 35 different media items.");
    invariant(mediaIds.every(id => typeof id === "string" && id.length <= 200), "Invalid media item.");
    mediaIds.forEach(id => this.media.require(uid, projectId, id));
    const accounts = input.accountIds.map(id => this.accounts.require(uid, projectId, id));
    const schedule = this.schedules.forPost(input.schedule);
    const overrides = input.overrides || {};
    invariant(overrides && typeof overrides === "object" && !Array.isArray(overrides), "Invalid destination settings.");
    for (const [id, override] of Object.entries(overrides)) {
      invariant(accounts.some(account => account.id === id), "Destination settings must belong to a selected account.");
      invariant(override && typeof override === "object" && !Array.isArray(override), "Invalid destination settings.");
      invariant(override.caption === undefined || typeof override.caption === "string" && override.caption.length <= 65000, "Invalid destination caption.");
      invariant(override.title === undefined || typeof override.title === "string" && override.title.length <= 500, "Invalid destination title.");
      invariant(JSON.stringify(override.settings || {}).length <= 10000, "Destination settings are too large.");
      invariant(override.settings === undefined || override.settings && typeof override.settings === "object" && !Array.isArray(override.settings), "Invalid destination settings.");
    }
    return { caption: input.caption || "", title: input.title || "", mediaIds, accountIds: input.accountIds, overrides, format: input.format || "auto", schedule };
  }

  async prepare(uid, projectId, items, { excludeIds = [], refreshOptions = true } = {}) {
    this.projects.require(uid, projectId);
    invariant(Array.isArray(items) && items.length > 0 && items.length <= 100, "Submit between 1 and 100 posts at a time.");
    const normalized = items.map(item => this.normalize(uid, projectId, item));
    const accountIds = [...new Set(normalized.flatMap(item => item.accountIds))];
    const optionErrors = new Map();
    if (refreshOptions) {
      for (const accountId of accountIds) {
        try { await this.accounts.options(uid, projectId, accountId); } catch (error) { optionErrors.set(accountId, error.message); }
      }
    }
    const proposed = [];
    const rows = normalized.map((post, index) => ({ index, caption: post.caption, title: post.title, destinations: post.accountIds.map(accountId => {
      const account = this.accounts.require(uid, projectId, accountId);
      const provider = this.registry.get(account.platform);
      const errors = provider.validate(this.content(post, account));
      if (account.status !== "connected") errors.push("Reconnect this account before publishing.");
      if (!provider.configured) errors.push("This platform is not configured on the server.");
      if (optionErrors.has(accountId)) errors.push(optionErrors.get(accountId));
      const id = `preview:${index}:${accountId}`;
      proposed.push({ id, rateKey: account.rateKey, requestedAt: post.schedule.requestedAt, order: this.clock() * 100 + index, status: "queued" });
      return { id, accountId, accountName: account.label, platform: account.platform, errors, requestedAt: post.schedule.requestedAt };
    }) }));
    for (const rateKey of new Set(proposed.map(item => item.rateKey))) {
      const allocations = this.rates.plan(rateKey, proposed.filter(item => item.rateKey === rateKey), { excludeIds });
      for (const row of rows) for (const destination of row.destinations) if (allocations.has(destination.id)) Object.assign(destination, allocations.get(destination.id));
    }
    return { normalized, rows, valid: rows.every(row => row.destinations.every(destination => destination.errors.length === 0)), delayed: rows.reduce((sum, row) => sum + row.destinations.filter(destination => destination.delayed).length, 0) };
  }

  async preview(uid, projectId, body) {
    const { normalized, ...preview } = await this.prepare(uid, projectId, body.items);
    return preview;
  }

  async submit(uid, projectId, body) {
    invariant(!this.localPreview, "Live publishing is disabled in local preview.", { status: 409, code: "preview_mode" });
    invariant(typeof body.requestId === "string" && /^[\w-]{16,100}$/.test(body.requestId), "A submission identifier is required.");
    const key = `${uid}:${body.requestId}`;
    const fingerprint = SecretVault.hash(JSON.stringify({ projectId, items: body.items }));
    const existing = this.store.get("submission", key);
    if (existing) {
      invariant(existing.fingerprint === fingerprint, "This submission identifier was already used for different content.", { status: 409 });
      return { posts: existing.postIds.map(id => this.get(uid, projectId, id)), duplicate: true };
    }
    const prepared = await this.prepare(uid, projectId, body.items);
    invariant(prepared.valid, "Some posts need changes before they can be queued.", { code: "invalid_content", details: prepared.rows });
    return this.store.transaction(() => {
      // A second request may have completed while remote options were fetched.
      const duplicate = this.store.get("submission", key);
      if (duplicate) {
        invariant(duplicate.fingerprint === fingerprint, "This submission identifier was already used for different content.", { status: 409 });
        return { posts: duplicate.postIds.map(id => this.get(uid, projectId, id)), duplicate: true };
      }
      const ids = [], rateKeys = new Set();
      prepared.normalized.forEach((input, index) => {
        // Recheck ownership and existence after asynchronous provider lookups.
        input.mediaIds.forEach(mediaId => this.media.require(uid, projectId, mediaId));
        const id = randomUUID(), now = this.clock(), order = this.store.nextSequence("delivery_order", now * 100);
        this.store.put("post", { ...input, id, projectId, ownerUid: uid, createdAt: now, updatedAt: now });
        ids.push(id);
        input.accountIds.forEach(accountId => {
          const account = this.accounts.require(uid, projectId, accountId);
          this.store.put("delivery", { id: randomUUID(), projectId, ownerUid: uid, postId: id, accountId, platform: account.platform, rateKey: account.rateKey,
            requestedAt: input.schedule.requestedAt, dueAt: input.schedule.requestedAt, order, status: "queued", attempts: 0, progress: {}, createdAt: now, updatedAt: now });
          rateKeys.add(account.rateKey);
        });
      });
      rateKeys.forEach(rateKey => this.rates.replan(rateKey));
      this.store.put("submission", { id: key, projectId, ownerUid: uid, fingerprint, postIds: ids, createdAt: this.clock() });
      return { posts: ids.map(id => this.get(uid, projectId, id)), delayed: prepared.delayed };
    });
  }

  get(uid, projectId, id) {
    const post = this.projects.requireRecord(uid, projectId, "post", id);
    return this.toPublic(post);
  }
  list(uid, projectId) { this.projects.require(uid, projectId); return this.store.list("post", { projectId }).map(post => this.toPublic(post)); }
  toPublic(post) {
    const deliveries = this.store.list("delivery", { projectId: post.projectId }).filter(delivery => delivery.postId === post.id).map(delivery => {
      const { progress, leaseUntil, workerId, ...visible } = delivery;
      const account = this.store.get("account", delivery.accountId);
      return { ...visible, accountName: account?.label || "Disconnected account", accountStatus: account?.status || "disconnected" };
    });
    const status = deliveries.every(item => item.status === "published") ? "published" : deliveries.every(item => item.status === "cancelled") ? "cancelled" : deliveries.some(item => ["publishing", "processing"].includes(item.status)) ? "publishing" : deliveries.some(item => ["failed", "needs_review", "needs_account"].includes(item.status)) ? "needs_attention" : deliveries.some(item => item.status === "published") ? "partially_published" : "scheduled";
    return { ...post, status, deliveries, media: post.mediaIds.map(id => this.store.get("media", id)).filter(Boolean).map(item => this.media.toPublic(item)), editable: deliveries.some(editableDelivery) && deliveries.every(item => editableDelivery(item) || terminal.has(item.status)), deletable: deliveries.every(item => !["publishing", "processing"].includes(item.status)) };
  }

  async update(uid, projectId, id, input) {
    const original = this.projects.requireRecord(uid, projectId, "post", id);
    const deliveries = this.store.list("delivery", { projectId }).filter(item => item.postId === id);
    invariant(deliveries.some(editableDelivery) && deliveries.every(item => editableDelivery(item) || terminal.has(item.status)), "Only posts with editable queued deliveries and no active publication can be edited.", { status: 409 });
    invariant(input.revision === original.revision, "This post changed in another window. Refresh it before editing.", { status: 409, code: "revision_conflict" });
    const frozen = deliveries.filter(item => terminal.has(item.status)), frozenIds = new Set(frozen.map(item => item.accountId));
    const editableInput = { ...input, accountIds: (input.accountIds || []).filter(id => !frozenIds.has(id)), overrides: Object.fromEntries(Object.entries(input.overrides || {}).filter(([id]) => !frozenIds.has(id))) };
    const prepared = await this.prepare(uid, projectId, [editableInput], { excludeIds: deliveries.filter(editableDelivery).map(item => item.id) });
    invariant(prepared.valid, "Some destinations need changes.", { details: prepared.rows, code: "invalid_content" });
    return this.store.transaction(() => {
      const current = this.store.get("post", id);
      const currentDeliveries = this.store.list("delivery", { projectId }).filter(item => item.postId === id);
      invariant(current.revision === original.revision && currentDeliveries.every(item => deliveries.some(before => before.id === item.id && before.status === item.status)), "This post changed while you were editing. Refresh it and try again.", { status: 409 });
      const next = prepared.normalized[0];
      next.mediaIds.forEach(mediaId => this.media.require(uid, projectId, mediaId));
      const overrides = { ...next.overrides };
      frozen.forEach(delivery => {
        const previousContent = delivery.contentSnapshot || this.content(original, this.store.get("account", delivery.accountId));
        overrides[delivery.accountId] = { caption: previousContent.caption, title: previousContent.title, format: previousContent.format, settings: previousContent.settings };
      });
      this.store.put("post", { ...original, ...next, accountIds: [...next.accountIds, ...frozenIds], overrides, updatedAt: this.clock() });
      deliveries.filter(editableDelivery).forEach(item => this.store.remove("delivery", item.id));
      next.accountIds.forEach(accountId => {
        const account = this.accounts.require(uid, projectId, accountId);
        const previous = deliveries.find(item => item.accountId === accountId);
        this.store.put("delivery", { id: previous?.id || randomUUID(), projectId, ownerUid: uid, postId: id, accountId, platform: account.platform, rateKey: account.rateKey,
          status: "queued", requestedAt: next.schedule.requestedAt, dueAt: next.schedule.requestedAt, order: previous?.order || this.store.nextSequence("delivery_order", this.clock() * 100), attempts: 0, progress: {}, createdAt: previous?.createdAt || this.clock(), updatedAt: this.clock() });
      });
      new Set([...deliveries.map(item => item.rateKey), ...next.accountIds.map(accountId => this.store.get("account", accountId).rateKey)]).forEach(key => this.rates.replan(key));
      return this.get(uid, projectId, id);
    });
  }

  cancel(uid, projectId, id) {
    this.projects.requireRecord(uid, projectId, "post", id);
    return this.store.transaction(() => {
      const deliveries = this.store.list("delivery", { projectId }).filter(item => item.postId === id);
      invariant(!deliveries.some(item => ["publishing", "processing"].includes(item.status)), "A delivery is already in progress. Wait for its result before cancelling the remaining queue.", { status: 409 });
      for (const delivery of deliveries) if (!terminal.has(delivery.status)) this.store.put("delivery", { ...delivery, status: "cancelled", updatedAt: this.clock() });
      new Set(deliveries.map(item => item.rateKey)).forEach(key => this.rates.replan(key));
      return this.get(uid, projectId, id);
    });
  }

  remove(uid, projectId, id) {
    return this.store.transaction(() => {
      const original = this.get(uid, projectId, id);
      invariant(!original.deliveries.some(item => item.status === "published"), "Published posts stay in your history. Deleting a post from a social network must be done on that network.", { status: 409 });
      const post = this.cancel(uid, projectId, id);
      post.deliveries.forEach(item => this.store.remove("delivery", item.id));
      this.store.remove("post", id);
      return { deleted: true };
    });
  }

  reorder(uid, projectId, accountId, ids) {
    const account = this.accounts.require(uid, projectId, accountId);
    invariant(Array.isArray(ids) && ids.length > 0 && new Set(ids).size === ids.length, "Supply each queued delivery once.");
    return this.store.transaction(() => {
      const queue = this.store.list("delivery", { projectId }).filter(item => item.accountId === accountId && isPendingDelivery(item));
      invariant(queue.length === ids.length && ids.every(id => queue.some(item => item.id === id)), "The queue has changed. Refresh it before reordering.", { status: 409 });
      const slots = [...queue].sort((a, b) => Math.max(this.clock(), a.requestedAt) - Math.max(this.clock(), b.requestedAt) || a.order - b.order).map(item => ({ requestedAt: item.requestedAt, order: item.order }));
      ids.forEach((id, index) => this.store.put("delivery", { ...queue.find(item => item.id === id), ...slots[index], updatedAt: this.clock() }));
      this.rates.replan(account.rateKey);
      return this.list(uid, projectId);
    });
  }

  retry(uid, projectId, deliveryId, { confirmedNotPublished = false } = {}) {
    const delivery = this.projects.requireRecord(uid, projectId, "delivery", deliveryId);
    invariant(["failed", "needs_account", "needs_review"].includes(delivery.status), "This delivery cannot be retried.", { status: 409 });
    invariant(delivery.status !== "needs_review" || confirmedNotPublished === true, "Check the social account first and confirm that this post was not published, to avoid a duplicate.", { status: 409, code: "confirmation_required" });
    const account = this.accounts.require(uid, projectId, delivery.accountId);
    invariant(account.status === "connected", "Reconnect this account before retrying.");
    if (delivery.status === "needs_account" && delivery.resumeStatus === "processing") {
      this.store.put("delivery", { ...delivery, status: "processing", resumeStatus: null, dueAt: this.clock(), error: null, updatedAt: this.clock() });
      return this.get(uid, projectId, delivery.postId);
    }
    this.store.put("delivery", { ...delivery, status: "queued", requestedAt: this.clock(), dueAt: this.clock(), retryAt: null, error: null, progress: {}, contentSnapshot: null, startedAt: null, attempts: 0, updatedAt: this.clock() });
    this.rates.replan(account.rateKey);
    return this.get(uid, projectId, delivery.postId);
  }
}
