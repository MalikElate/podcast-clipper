import { invariant } from "../core/errors.js";

const DAY = 86400000;
const UNSUPPORTED = "180-day account views are not available from this network connection.";

export function accountViewWindow(now = Date.now()) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(now));
  const midnight = Date.parse(`${today}T00:00:00Z`);
  return { days: 180, startDate: new Date(midnight - 180 * DAY).toISOString().slice(0, 10), endDate: new Date(midnight - DAY).toISOString().slice(0, 10), timeZone: "America/Los_Angeles" };
}

export class AccountViewsService {
  constructor({ store, projects, accounts, registry, clock = () => Date.now() }) {
    Object.assign(this, { store, projects, accounts, registry, clock });
    this.cache = new Map();
    this.pending = new Map();
  }

  current(account) {
    const current = this.store.get("account", account.id);
    return current?.status === "connected" && current.projectId === account.projectId && current.ownerUid === account.ownerUid && current.authorizationId === account.authorizationId && !this.accounts.privacy?.blocked(account.ownerUid);
  }

  async accountReport(account, window, refresh) {
    const unavailable = (reason = UNSUPPORTED, status = "unavailable") => ({ ...window, value: null, status, reason, source: null, throughDate: null });
    if (!this.current(account)) return unavailable("Reconnect this account in Meadow to load its views.", "reconnect_required");
    let provider;
    try { provider = this.registry.get(account.platform); } catch { return unavailable(); }
    if (typeof provider.accountViews !== "function") return unavailable();
    const key = JSON.stringify([account.ownerUid, account.projectId, account.id, account.authorizationId, window.startDate, window.endDate]);
    const saved = this.cache.get(key);
    // Even manual refreshes reuse a report for one minute to protect provider quotas.
    if (saved && saved.at > this.clock() - (refresh ? 60000 : 5 * 60000)) return saved.value;
    if (this.pending.has(key)) return this.pending.get(key);
    const pending = (async () => {
      let value;
      try {
        const result = await this.accounts.withCredentials(account, credentials => provider.accountViews({ account, credentials, window }));
        invariant(Number.isSafeInteger(result.value) && result.value >= 0, "The platform returned invalid account views.");
        value = { ...window, value: result.value, status: "available", source: account.platform === "youtube" ? "youtube_analytics" : "account_analytics", reason: null, throughDate: result.throughDate || null };
      } catch (error) {
        value = unavailable(error.reconnect ? "Reconnect this account in Meadow to load its views." : "Account view history is unavailable. Check this connection's analytics access in Meadow.", error.reconnect ? "reconnect_required" : "error");
      }
      if (!this.current(account)) return unavailable("This account connection changed. Refresh the village.");
      for (const [entry, cached] of this.cache) if (cached.at < this.clock() - 5 * 60000) this.cache.delete(entry);
      while (this.cache.size >= 200) this.cache.delete(this.cache.keys().next().value);
      const cached = { at: this.clock(), value };
      this.cache.set(key, cached);
      setTimeout(() => { if (this.cache.get(key) === cached) this.cache.delete(key); }, 5 * 60000).unref?.();
      return value;
    })();
    this.pending.set(key, pending);
    try { return await pending; } finally { this.pending.delete(key); }
  }

  async report(uid, projectId, { days = 180, refresh = false } = {}) {
    invariant(Number(days) === 180, "Account view reports support the last 180 complete days.");
    this.projects.require(uid, projectId);
    const window = accountViewWindow(this.clock());
    const accounts = this.store.list("account", { projectId }).map(account => ({ ...account }));
    const reports = [];
    // Two concurrent provider requests; no credentials or provider responses escape.
    for (let i = 0; i < accounts.length; i += 2) reports.push(...await Promise.all(accounts.slice(i, i + 2).map(async account => ({ id: account.id, periodViews: await this.accountReport(account, window, refresh) }))));
    this.projects.require(uid, projectId);
    const visible = new Set(this.accounts.list(uid, projectId).map(account => account.id));
    return { window, accounts: reports.filter(account => visible.has(account.id)) };
  }
}
