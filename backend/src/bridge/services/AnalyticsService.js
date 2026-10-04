export const metrics = ["views", "impressions", "likes", "comments", "shares", "saves", "clicks"];
const interactions = ["likes", "comments", "shares", "saves"];

function publicationFields(publication) {
  const fields = {};
  if (typeof publication?.externalId === "string" && publication.externalId.trim()) fields.externalId = publication.externalId;
  if (typeof publication?.url === "string") {
    try {
      const url = new URL(publication.url);
      if (url.protocol === "https:" && !url.username && !url.password) fields.url = url.href;
    } catch { /* Keep the saved link until the provider returns a valid one. */ }
  }
  return fields;
}

export class AnalyticsService {
  constructor({ store, projects, accounts, registry, posts, clock = () => Date.now() }) {
    Object.assign(this, { store, projects, accounts, registry, posts, clock });
    this.networkSnapshots = new Map();
    this.networkPending = new Map();
  }

  networkAccountCurrent(account) {
    const current = this.store.get("account", account.id);
    return current?.status === "connected" && current.ownerUid === account.ownerUid && current.projectId === account.projectId && current.authorizationId === account.authorizationId && current.encryptedCredentials === account.encryptedCredentials && !this.accounts.privacy?.blocked(account.ownerUid);
  }

  networkSnapshot(account) {
    const snapshot = this.networkSnapshots.get(account.id);
    if (!snapshot) return null;
    if (snapshot.attemptedAt < this.clock() - 30 * 60000 || !this.networkAccountCurrent(snapshot.account)) {
      this.networkSnapshots.delete(account.id); return null;
    }
    return snapshot;
  }

  async syncAccount(account) {
    if (!account.remoteId?.startsWith("zernio:") || !this.networkAccountCurrent(account)) return null;
    const provider = this.registry.get(account.platform);
    if (typeof provider.accountPostAnalytics !== "function") return null;
    const saved = this.networkSnapshot(account);
    if (saved?.attemptedAt > this.clock() - 60000) return saved;
    if (this.networkPending.has(account.id)) return this.networkPending.get(account.id);
    const task = (async () => {
      let snapshot;
      try {
        const result = await this.accounts.withCredentials(account, credentials => provider.accountPostAnalytics({ account, credentials }));
        if (!result || !this.networkAccountCurrent(account)) return null;
        const now = this.clock();
        const posts = result.posts.map(post => {
          const previous = saved?.posts?.find(item => item.id === post.id);
          const values = this.normalize(post.values);
          const measured = Object.values(values).some(Number.isFinite), keepPrevious = post.pending && !measured && previous;
          return { ...post, values: keepPrevious ? previous.values : values, metricsUpdatedAt: keepPrevious ? previous.metricsUpdatedAt : measured ? now : null,
            metricsHistory: keepPrevious ? previous.metricsHistory : this.metricHistory({ metricsHistory: previous?.metricsHistory }, values, now) };
        });
        snapshot = { ...result, posts, account, attemptedAt: now, error: null };
      } catch (error) {
        if (!this.networkAccountCurrent(account)) return null;
        snapshot = { ...saved, posts: saved?.posts || [], account, attemptedAt: this.clock(), error: error.code === "rate_limited" ? "Analytics refresh is temporarily limited. Try again later." : error.message };
      }
      // Pinterest metrics remain request-only, including connected-account posts.
      if (account.platform !== "pinterest") {
        for (const [id, entry] of this.networkSnapshots) if (entry.attemptedAt < this.clock() - 30 * 60000 || !this.networkAccountCurrent(entry.account)) this.networkSnapshots.delete(id);
        while (this.networkSnapshots.size >= 200) this.networkSnapshots.delete(this.networkSnapshots.keys().next().value);
        this.networkSnapshots.set(account.id, snapshot);
      }
      return snapshot;
    })();
    this.networkPending.set(account.id, task);
    try { return await task; } finally { this.networkPending.delete(account.id); }
  }

  ensureFastTranscriberDemo(ownerUid, projectId) {
    if (projectId !== "6ab9cae7-4bd8-4994-9740-627611752ddd") return;
    const accounts = this.store.list("account", { projectId });
    const xAccount = accounts.find(account => account.platform === "x" && account.label === "@fasttranscriber");
    const xDemoDelivery = this.store.get("delivery", "56caa3e3-5244-4003-b853-d5559c4d754f");
    let changed = false;
    if (xAccount && xDemoDelivery?.projectId === projectId && xDemoDelivery.accountId === xAccount.id && xDemoDelivery.demoMetrics) {
      this.store.put("delivery", { ...xDemoDelivery, metrics: null, metricsHistory: [], metricsUpdatedAt: null, metricsAttemptedAt: this.clock(), metricsError: null, metricsNote: null, demoMetrics: false });
      changed = true;
    }
    const tiktokAccount = accounts.find(account => account.platform === "tiktok" && account.label === "Fast-Transcriber.com");
    if (tiktokAccount && !tiktokAccount.remoteId?.startsWith("zernio:") && !tiktokAccount.demoMetrics) {
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
  metricHistory(delivery, values, at) {
    const snapshots = Array.isArray(delivery.metricsHistory) ? delivery.metricsHistory : [];
    const candidates = [...snapshots];
    if (delivery.metrics && delivery.metricsUpdatedAt) candidates.push({ at: delivery.metricsUpdatedAt, values: this.normalize(delivery.metrics) });
    if (Object.values(values).some(Number.isFinite)) candidates.push({ at, values });
    const byDay = new Map();
    for (const snapshot of candidates) {
      const timestamp = Number(snapshot?.at);
      if (!Number.isFinite(timestamp) || !snapshot?.values) continue;
      const day = new Date(timestamp).toISOString().slice(0, 10);
      const normalized = { at: timestamp, values: this.normalize(snapshot.values) };
      if (!byDay.has(day) || byDay.get(day).at <= timestamp) byDay.set(day, normalized);
    }
    return [...byDay.values()].sort((a, b) => a.at - b.at).slice(-180);
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
    const currentDelivery = () => {
      const current = this.store.get("delivery", delivery.id), latestAccount = this.store.get("account", account.id);
      if (!current || current.status !== "published" || current.accountId !== delivery.accountId || current.externalId !== delivery.externalId || current.progress?.zernioPostId !== delivery.progress?.zernioPostId || latestAccount?.status !== "connected" || latestAccount.authorizationId !== account.authorizationId || this.accounts.privacy?.blocked(account.ownerUid)) return null;
      return current;
    };
    try {
      const result = await this.accounts.withCredentials(account, credentials => this.registry.get(account.platform).metrics({ account, credentials, delivery }));
      const current = currentDelivery();
      if (!current) return;
      const now = this.clock(), values = this.normalize(result.values);
      const keepPrevious = result.pending && !Object.values(values).some(Number.isFinite) && current.metrics;
      const patch = { metrics: keepPrevious ? current.metrics : values, metricsHistory: keepPrevious ? current.metricsHistory || [] : this.metricHistory(current, values, now), metricsUpdatedAt: keepPrevious ? current.metricsUpdatedAt : now, metricsAttemptedAt: now, metricsError: null, metricsNote: result.unavailableReason || result.note || null };
      if (account.platform === "pinterest") return patch;
      // TikTok can confirm publishing before its public ID/link is available.
      // Reconcile that metadata on later reads without publishing a second post.
      this.store.put("delivery", { ...current, ...patch, ...publicationFields(result.publication), ...(result.removed ? { externalId: null, url: null, progress: {}, contentSnapshot: null, metrics: null, metricsHistory: [] } : {}) });
    } catch (error) {
      const current = currentDelivery();
      if (!current) return;
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
    const networkTransient = new Map();
    const postAccounts = postId ? new Set(this.store.list("delivery", { projectId }).filter(delivery => delivery.postId === postId).map(delivery => delivery.accountId)) : null;
    const accounts = this.store.list("account", { projectId }).filter(account => account.remoteId?.startsWith("zernio:") && (!accountId || account.id === accountId) && (!postAccounts || postAccounts.has(account.id)));
    for (const account of accounts.sort((a, b) => (this.networkSnapshot(a)?.attemptedAt || 0) - (this.networkSnapshot(b)?.attemptedAt || 0)).slice(0, 10)) {
      const snapshot = await this.syncAccount(account); if (snapshot) networkTransient.set(account.id, snapshot);
    }
    return this.report(uid, projectId, transient, networkTransient);
  }

  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      const deliveries = this.store.list("delivery", { status: "published" }).filter(item => item.platform !== "pinterest" && (!item.metricsAttemptedAt || item.metricsAttemptedAt < this.clock() - 15 * 60000)).sort((a, b) => (a.metricsAttemptedAt || 0) - (b.metricsAttemptedAt || 0));
      for (const delivery of deliveries.slice(0, 10)) await this.syncDelivery(delivery);
      const accounts = this.store.list("account", { status: "connected" }).filter(account => account.platform !== "pinterest" && account.remoteId?.startsWith("zernio:") && (!this.networkSnapshot(account) || this.networkSnapshot(account).attemptedAt < this.clock() - 15 * 60000)).sort((a, b) => (this.networkSnapshot(a)?.attemptedAt || 0) - (this.networkSnapshot(b)?.attemptedAt || 0));
      for (const account of accounts.slice(0, 2)) await this.syncAccount(account);
    } finally { try { await this.store.flush?.(); } finally { this.running = false; } }
  }

  report(uid, projectId, transient = new Map(), networkTransient = new Map()) {
    this.projects.require(uid, projectId);
    this.ensureFastTranscriberDemo(uid, projectId);
    const visibleAccounts = this.accounts.list(uid, projectId);
    const snapshots = new Map(visibleAccounts.filter(account => account.status === "connected").map(account => {
      const snapshot = networkTransient.get(account.id) || this.networkSnapshot(account);
      return [account.id, snapshot && this.networkAccountCurrent(snapshot.account) ? snapshot : null];
    }));
    const meadowPosts = this.posts.list(uid, projectId).map(post => ({ ...post, deliveries: post.deliveries.map(delivery => ({ ...delivery, ...transient.get(delivery.id) })) }));
    const meadowDeliveries = meadowPosts.flatMap(post => post.deliveries);
    const externalPosts = visibleAccounts.flatMap(account => (snapshots.get(account.id)?.posts || []).filter(post => !meadowDeliveries.some(delivery => delivery.accountId === account.id && (delivery.externalId === post.externalId || delivery.progress?.zernioPostId === post.zernioPostId))).map(post => {
      const id = `zernio:${account.id}:${post.id}`;
      return { id, title: post.title, caption: post.title, createdAt: post.publishedAt || post.metricsUpdatedAt, publishedAt: post.publishedAt, media: [], source: "connected_account", deliveries: [{ id, postId: id, accountId: account.id, accountName: account.label, platform: account.platform, status: "published", publishedAt: post.publishedAt, externalId: post.externalId, url: post.url, metrics: post.values, metricsUpdatedAt: post.metricsUpdatedAt, metricsHistory: post.metricsHistory, metricsNote: post.note || post.unavailableReason || null }] };
    }));
    const posts = [...meadowPosts, ...externalPosts].map(post => ({ ...post, totals: this.aggregate(post.deliveries.filter(delivery => delivery.status === "published" && delivery.platform !== "youtube").map(delivery => delivery.metrics || {})) }));
    const deliveries = posts.flatMap(post => post.deliveries).filter(delivery => delivery.status === "published");
    const accounts = visibleAccounts.map(account => {
      const accountPosts = posts.filter(post => post.deliveries.some(delivery => delivery.accountId === account.id)).map(post => ({ id: post.id, title: post.title || post.caption || post.media[0]?.filename || "Untitled post", createdAt: post.createdAt, delivery: post.deliveries.find(delivery => delivery.accountId === account.id), totals: this.aggregate(post.deliveries.filter(delivery => delivery.accountId === account.id && delivery.status === "published").map(delivery => delivery.metrics || {}), { deriveEngagement: account.platform !== "youtube" }) }));
      const accountDeliveries = deliveries.filter(delivery => delivery.accountId === account.id && account.platform !== "youtube");
      const snapshot = snapshots.get(account.id), zernio = account.remoteId?.startsWith("zernio:");
      const accountMetrics = accountDeliveries.length ? accountDeliveries.map(delivery => delivery.metrics || {}) : (!zernio && account.demoMetrics ? [account.demoMetrics] : []);
      return { ...account, ...(zernio ? { demoMetrics: null, demoMetricsNote: null, demoMetricsUpdatedAt: null, analyticsSource: "zernio", metricsNote: account.status !== "connected" ? "Reconnect this account in Meadow to load analytics." : snapshot?.note || (snapshot?.error ? null : "Refresh analytics to load connected-account posts from the last 90 days."), metricsError: snapshot?.error || (account.status !== "connected" ? account.lastError : null) || null } : {}), posts: accountPosts, totals: this.aggregate(accountMetrics), ...(!zernio && account.demoMetrics ? { demoMetricsNote: account.demoMetricsNote || null } : {}) };
    });
    return { posts, accounts, totals: this.aggregate(deliveries.filter(delivery => delivery.platform !== "youtube").map(delivery => delivery.metrics || {})), publishedCount: deliveries.length, postCount: posts.length, sourceLabel: accounts.some(account => account.analyticsSource === "zernio") ? "Meadow posts + connected-account posts from the last 90 days" : "Posts published through Meadow",
      engagementDefinition: "Likes + comments + shares + saves, where reported. Views are separate. Combined totals exclude YouTube; YouTube metrics are shown per video. Pinterest metrics are fetched when you refresh and are not saved." };
  }
}
