const pendingStates = new Set(["queued", "scheduled", "retrying"]);

/** Plans each account independently. Unknown provider quotas stay unknown. */
export class RateLimitService {
  constructor({ store, clock = () => Date.now() }) { Object.assign(this, { store, clock }); }

  nextTime(requested, reservations, rules, blockedUntil = 0) {
    let at = Math.max(requested, blockedUntil || 0);
    for (let iteration = 0; iteration < 10000; iteration++) {
      let next = at;
      for (const rule of rules) {
        const count = Math.floor(rule.limit);
        if (!(count > 0) || !(rule.windowMs > 0)) continue;
        const relevant = reservations.filter(time => time > at - rule.windowMs && time <= at).sort((a, b) => a - b);
        if (relevant.length >= count) next = Math.max(next, relevant[relevant.length - count] + rule.windowMs + 1);
      }
      if (next === at) return at;
      at = next;
    }
    throw new Error("Queue planning exceeded its safe bound.");
  }

  plan(rateKey, proposed = [], { excludeIds = [] } = {}) {
    const now = this.clock();
    const accounts = this.store.list("account", { rateKey, limit: null });
    const account = [...accounts].sort((a, b) => (b.optionsUpdatedAt || 0) - (a.optionsUpdatedAt || 0))[0];
    const rules = (account?.options?.limits || []).filter(rule => rule.limit > 0 && rule.windowMs > 0);
    const blockedUntil = Math.max(0, ...accounts.map(item => Number(item.blockedUntil) || 0));
    const windowMs = Math.max(86400000, ...rules.map(rule => rule.windowMs));
    const actual = this.store.rateEvents(rateKey, now - windowMs);
    const reservations = [...actual];
    // Remote usage may include native posts or other applications. Reserve that
    // usage conservatively until its rolling window can expire, then refresh.
    for (const rule of rules) {
      if (!Number.isFinite(rule.used) || !rule.observedAt || rule.observedAt + rule.windowMs < now) continue;
      const known = actual.filter(time => time <= rule.observedAt && time > rule.observedAt - rule.windowMs).length;
      const missing = Math.max(0, Math.min(rule.limit, rule.used) - known);
      for (let i = 0; i < missing; i++) reservations.push(rule.observedAt);
    }
    const excluded = new Set(excludeIds);
    const existing = this.store.list("delivery", { rateKey, statuses: [...pendingStates], limit: null }).filter(delivery => !excluded.has(delivery.id));
    const proposedIds = new Set(proposed.map(item => item.id));
    const deliveries = [...existing.filter(item => !proposedIds.has(item.id)), ...proposed].sort((a, b) => Math.max(now, a.requestedAt) - Math.max(now, b.requestedAt) || a.order - b.order || a.id.localeCompare(b.id));
    const result = new Map();
    for (const delivery of deliveries) {
      const requested = Math.max(now, delivery.requestedAt, delivery.retryAt || 0);
      const dueAt = this.nextTime(requested, reservations, rules, blockedUntil);
      reservations.push(dueAt);
      result.set(delivery.id, { dueAt, delayed: dueAt > Math.max(now, delivery.requestedAt) + 1000,
        allowanceKnown: rules.length > 0, estimated: rules.some(rule => rule.used > 0),
        reason: dueAt > requested + 1000 ? "Waiting for this account's posting allowance." : rules.length ? null : "The platform will check its allowance when this post is sent." });
    }
    return result;
  }

  replan(rateKey) {
    return this.store.transaction(() => {
      const plan = this.plan(rateKey);
      for (const [id, allocation] of plan) {
        const delivery = this.store.get("delivery", id);
        if (!delivery || !pendingStates.has(delivery.status)) continue;
        this.store.put("delivery", { ...delivery, ...allocation, status: delivery.status === "retrying" ? "retrying" : allocation.dueAt > this.clock() + 1000 ? "scheduled" : "queued" });
      }
      return plan;
    });
  }

  block(rateKey, until, reason) {
    for (const account of this.store.list("account", { rateKey, limit: null })) {
      this.store.put("account", { ...account, blockedUntil: Math.max(account.blockedUntil || 0, until), allowanceMessage: reason });
    }
    this.replan(rateKey);
  }
}

export const isPendingDelivery = delivery => pendingStates.has(delivery.status);
