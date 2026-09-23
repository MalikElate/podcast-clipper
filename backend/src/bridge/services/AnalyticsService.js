export const metrics = ["views", "impressions", "likes", "comments", "shares", "saves", "clicks"];
const interactions = ["likes", "comments", "shares", "saves"];

export class AnalyticsService {
  constructor({ store, projects, accounts, registry, posts, clock = () => Date.now() }) { Object.assign(this, { store, projects, accounts, registry, posts, clock }); }

  ensureFastTranscriberDemo(ownerUid, projectId) {
    if (ownerUid !== "user_3JBc1sWWzPxfPBGc3WGz7bw0Slu" || projectId !== "6ab9cae7-4bd8-4994-9740-627611752ddd") return;
    const xDemoDelivery = this.store.get("delivery", "56caa3e3-5244-4003-b853-d5559c4d754f");
    let changed = false;
    if (xDemoDelivery?.ownerUid === ownerUid && xDemoDelivery.projectId === projectId && xDemoDelivery.accountId === "c9cd5888-5885-4e78-9338-7dfa8eea7034" && xDemoDelivery.demoMetrics) {
      this.store.put("delivery", { ...xDemoDelivery, metrics: null, metricsUpdatedAt: null, metricsAttemptedAt: this.clock(), metricsError: null, metricsNote: null, demoMetrics: false });
      changed = true;
    }
    const tiktokAccount = this.store.get("account", "402e54f7-fdfc-4c08-855f-38f1b19fb646");
    if (tiktokAccount?.ownerUid === ownerUid && tiktokAccount.projectId === projectId && tiktokAccount.platform === "tiktok" && !tiktokAccount.demoMetrics) {
      this.store.put("account", {
        ...tiktokAccount,
        demoMetrics: { views: 18, impressions: 18, likes: 737, comments: 0, shares: 0, saves: 0, clicks: 0 },
        demoMetricsUpdatedAt: this.clock(),
        demoMetricsNote: "Demo values based on public @fast.transcriber TikTok activity: 18 views across 31 visible videos and 737 profile likes. TikTok does not expose the remaining metrics publicly."
      });
      changed = true;
    }
    if (changed) Promise.resolve(this.store.flush?.()).catch(error => console.error("Analytics demo snapshot:", error.code || error.name));
  }

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
    this.ensureFastTranscriberDemo(uid, projectId);
    const posts = this.posts.list(uid, projectId).map(post => ({ ...post, deliveries: post.deliveries.map(delivery => ({ ...delivery, ...transient.get(delivery.id) })) })).map(post => ({ ...post, totals: this.aggregate(post.deliveries.filter(delivery => delivery.status === "published" && delivery.platform !== "youtube").map(delivery => delivery.metrics || {})) }));
    const deliveries = posts.flatMap(post => post.deliveries).filter(delivery => delivery.status === "published");
    const accounts = this.accounts.list(uid, projectId).map(account => {
      const accountPosts = posts.filter(post => post.deliveries.some(delivery => delivery.accountId === account.id)).map(post => ({ id: post.id, title: post.title || post.caption || post.media[0]?.filename || "Untitled post", createdAt: post.createdAt, delivery: post.deliveries.find(delivery => delivery.accountId === account.id), totals: this.aggregate(post.deliveries.filter(delivery => delivery.accountId === account.id && delivery.status === "published").map(delivery => delivery.metrics || {}), { deriveEngagement: account.platform !== "youtube" }) }));
      const accountDeliveries = deliveries.filter(delivery => delivery.accountId === account.id && account.platform !== "youtube");
      const accountMetrics = accountDeliveries.length ? accountDeliveries.map(delivery => delivery.metrics || {}) : (account.demoMetrics ? [account.demoMetrics] : []);
      return { ...account, posts: accountPosts, totals: this.aggregate(accountMetrics), ...(account.demoMetrics ? { demoMetricsNote: account.demoMetricsNote || null } : {}) };
    });
    return { posts, accounts, totals: this.aggregate(deliveries.filter(delivery => delivery.platform !== "youtube").map(delivery => delivery.metrics || {})), publishedCount: deliveries.length, postCount: posts.length,
      engagementDefinition: "Likes + comments + shares + saves, where reported. Views are separate. Combined totals exclude YouTube; YouTube metrics are shown per video. Pinterest metrics are fetched when you refresh and are not saved." };
  }
}
