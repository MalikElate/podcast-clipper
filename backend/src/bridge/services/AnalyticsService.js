export const metrics = ["views", "impressions", "likes", "comments", "shares", "saves", "clicks"];
const interactions = ["likes", "comments", "shares", "saves"];

export class AnalyticsService {
  constructor({ store, projects, accounts, registry, posts, clock = () => Date.now() }) { Object.assign(this, { store, projects, accounts, registry, posts, clock }); }

  normalize(values = {}) {
    return Object.fromEntries(metrics.map(key => [key, values[key] !== null && values[key] !== undefined && Number.isFinite(Number(values[key])) && Number(values[key]) >= 0 ? Number(values[key]) : null]));
  }
  aggregate(rows, { deriveEngagement = true } = {}) {
    const coverage = {}, values = {};
    for (const metric of metrics) {
      const available = rows.map(row => row?.[metric]).filter(value => Number.isFinite(value));
      values[metric] = available.length ? available.reduce((sum, value) => sum + value, 0) : null;
      coverage[metric] = { available: available.length, total: rows.length };
    }
    const availableInteractions = interactions.map(metric => values[metric]).filter(value => Number.isFinite(value));
    values.engagement = deriveEngagement && availableInteractions.length ? availableInteractions.reduce((sum, value) => sum + value, 0) : null;
    return { values, coverage };
  }

  async syncDelivery(delivery) {
    if (delivery.demoMetrics || delivery.status !== "published" || !delivery.externalId) return;
    const account = this.store.get("account", delivery.accountId);
    if (!account || account.status !== "connected") return;
    if (this.accounts.privacy?.blocked(account.ownerUid)) return;
    try {
      const result = await this.accounts.withCredentials(account, credentials => this.registry.get(account.platform).metrics({ account, credentials, delivery }));
      const current = this.store.get("delivery", delivery.id);
      const latestAccount = this.store.get("account", account.id);
      if (!current || latestAccount?.status !== "connected" || latestAccount.authorizationId !== account.authorizationId) return;
      const patch = { metrics: this.normalize(result.values), metricsUpdatedAt: this.clock(), metricsAttemptedAt: this.clock(), metricsError: null, metricsNote: result.unavailableReason || result.note || null };
      if (account.platform === "pinterest") return patch;
      this.store.put("delivery", { ...current, ...patch, ...(result.removed ? { externalId: null, url: null, progress: {}, contentSnapshot: null, metrics: null } : {}) });
    } catch (error) {
      const current = this.store.get("delivery", delivery.id);
      const latestAccount = this.store.get("account", account.id);
      if (!current || latestAccount?.status !== "connected" || latestAccount.authorizationId !== account.authorizationId) return;
      if (account.platform !== "pinterest") this.store.put("delivery", { ...current, metricsAttemptedAt: this.clock(), metricsError: error.message });
    }
  }

  seedDemoDelivery({ ownerUid, accountId, deliveryId, values, note }) {
    const account = this.store.get("account", accountId);
    const delivery = this.store.get("delivery", deliveryId);
    if (!account || account.ownerUid !== ownerUid || account.id !== accountId || account.platform !== "x" || !delivery || delivery.ownerUid !== ownerUid || delivery.accountId !== accountId || delivery.id !== deliveryId || delivery.status !== "published" || delivery.demoMetrics) return false;
    const now = this.clock();
    this.store.put("delivery", { ...delivery, metrics: this.normalize(values), metricsUpdatedAt: now, metricsAttemptedAt: now, metricsError: null, metricsNote: note, demoMetrics: true });
    return true;
  }

  async refresh(uid, projectId, { postId, accountId } = {}) {
    this.projects.require(uid, projectId);
    const deliveries = this.store.list("delivery", { projectId }).filter(item => item.status === "published" && (!postId || item.postId === postId) && (!accountId || item.accountId === accountId) && (!item.metricsAttemptedAt || item.metricsAttemptedAt <= this.clock() - 60000));
    // Bound each refresh. Repeated requests continue with the oldest records.
    const transient = new Map();
    for (const delivery of deliveries.sort((a, b) => (a.metricsAttemptedAt || 0) - (b.metricsAttemptedAt || 0)).slice(0, 50)) {
      const result = await this.syncDelivery(delivery); if (result) transient.set(delivery.id, result);
    }
    return this.report(uid, projectId, transient);
  }

  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      const deliveries = this.store.list("delivery", { status: "published" }).filter(item => item.platform !== "pinterest" && (!item.metricsAttemptedAt || item.metricsAttemptedAt < this.clock() - 15 * 60000)).sort((a, b) => (a.metricsAttemptedAt || 0) - (b.metricsAttemptedAt || 0));
      for (const delivery of deliveries.slice(0, 10)) await this.syncDelivery(delivery);
    } finally { try { await this.store.flush?.(); } finally { this.running = false; } }
  }

  report(uid, projectId, transient = new Map()) {
    this.projects.require(uid, projectId);
    const posts = this.posts.list(uid, projectId).map(post => ({ ...post, deliveries: post.deliveries.map(delivery => ({ ...delivery, ...transient.get(delivery.id) })) })).map(post => ({ ...post, totals: this.aggregate(post.deliveries.filter(delivery => delivery.status === "published" && delivery.platform !== "youtube").map(delivery => delivery.metrics || {})) }));
    const deliveries = posts.flatMap(post => post.deliveries).filter(delivery => delivery.status === "published");
    const accounts = this.accounts.list(uid, projectId).map(account => {
      const accountPosts = posts.filter(post => post.deliveries.some(delivery => delivery.accountId === account.id)).map(post => ({ id: post.id, title: post.title || post.caption || post.media[0]?.filename || "Untitled post", createdAt: post.createdAt, delivery: post.deliveries.find(delivery => delivery.accountId === account.id), totals: this.aggregate(post.deliveries.filter(delivery => delivery.accountId === account.id && delivery.status === "published").map(delivery => delivery.metrics || {}), { deriveEngagement: account.platform !== "youtube" }) }));
      return { ...account, posts: accountPosts, totals: this.aggregate(deliveries.filter(delivery => delivery.accountId === account.id && account.platform !== "youtube").map(delivery => delivery.metrics || {})) };
    });
    return { posts, accounts, totals: this.aggregate(deliveries.filter(delivery => delivery.platform !== "youtube").map(delivery => delivery.metrics || {})), publishedCount: deliveries.length, postCount: posts.length,
      engagementDefinition: "Likes + comments + shares + saves, where reported. Views are separate. Combined totals exclude YouTube; YouTube metrics are shown per video. Pinterest metrics are fetched when you refresh and are not saved." };
  }
}
