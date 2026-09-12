import { randomBytes, randomUUID } from "node:crypto";
import { invariant, ProviderError } from "../core/errors.js";
import { SecretVault } from "../core/SecretVault.js";

export class AccountService {
  constructor({ store, projects, registry, vault, locks, clock = () => Date.now(), localPreview = false }) {
    Object.assign(this, { store, projects, registry, vault, locks, clock, localPreview });
  }
  toPublic(account) {
    const { encryptedCredentials, ...visible } = account;
    return visible;
  }
  list(uid, projectId) { this.projects.require(uid, projectId); return this.store.list("account", { projectId }).map(account => this.toPublic(account)); }
  require(uid, projectId, accountId) { return this.projects.requireRecord(uid, projectId, "account", accountId); }

  async start(uid, projectId, platform, { handle } = {}) {
    this.projects.require(uid, projectId);
    invariant(!this.localPreview, "Live account connections are disabled in local preview.", { status: 409, code: "preview_mode" });
    invariant(this.vault.configured, "Social account connections are not configured on this server.", { status: 503 });
    const provider = this.registry.get(platform);
    const state = randomBytes(32).toString("base64url");
    const verifier = randomBytes(48).toString("base64url");
    this.store.saveState(SecretVault.hash(state), { uid, projectId, platform, verifier }, this.clock() + 10 * 60000);
    return { url: await provider.authorizationUrl({ state, verifier, handle }) };
  }

  async callback(platform, params) {
    const provider = this.registry.get(platform);
    let saved, credentials, candidates;
    if (provider.finishAuthorization) {
      const result = await provider.finishAuthorization(params);
      saved = this.store.consumeState(SecretVault.hash(result.state || ""), this.clock());
      credentials = result.credentials;
      candidates = result.candidates;
    } else {
      saved = this.store.consumeState(SecretVault.hash(params.get("state") || ""), this.clock());
      invariant(saved && saved.platform === platform, "This connection request has expired. Start again.");
      invariant(!params.get("error") && params.get("code"), "The account connection was not authorized.");
      credentials = await provider.exchange({ code: params.get("code"), verifier: saved.verifier });
      candidates = await provider.accounts(credentials);
    }
    invariant(saved && saved.platform === platform, "This connection request has expired. Start again.");
    this.projects.require(saved.uid, saved.projectId);
    invariant(Array.isArray(candidates) && candidates.length, "No eligible accounts were returned. Check your account type and permissions.");
    const id = randomUUID();
    this.store.put("connection", { id, ownerUid: saved.uid, projectId: saved.projectId, platform, createdAt: this.clock(), expiresAt: this.clock() + 10 * 60000,
      encrypted: this.vault.encrypt(candidates.map(candidate => ({ ...candidate, credentials: { ...credentials, ...(candidate.credentials || {}) } })), `connection:${id}`) });
    return { projectId: saved.projectId, connectionId: id };
  }

  pending(uid, projectId, connectionId) {
    const connection = this.projects.requireRecord(uid, projectId, "connection", connectionId);
    invariant(connection.expiresAt > this.clock(), "This connection has expired. Connect the account again.");
    const candidates = this.vault.decrypt(connection.encrypted, `connection:${connectionId}`);
    return { platform: connection.platform, candidates: candidates.map(({ credentials, ...candidate }) => candidate) };
  }

  attach(uid, projectId, connectionId, selectedIds) {
    const connection = this.projects.requireRecord(uid, projectId, "connection", connectionId);
    invariant(connection.expiresAt > this.clock(), "This connection has expired. Connect the account again.");
    invariant(Array.isArray(selectedIds) && selectedIds.length && selectedIds.length <= 100, "Select at least one account.");
    const candidates = this.vault.decrypt(connection.encrypted, `connection:${connectionId}`);
    invariant(selectedIds.every(id => candidates.some(candidate => candidate.remoteId === id)), "An invalid account was selected.");
    return this.store.transaction(() => {
      const accounts = [];
      for (const candidate of candidates.filter(candidate => selectedIds.includes(candidate.remoteId))) {
        const existing = this.store.list("account", { projectId }).find(account => account.platform === connection.platform && account.remoteId === candidate.remoteId);
        const id = existing?.id || randomUUID();
        const { credentials, ...profile } = candidate;
        const account = this.store.put("account", { ...existing, ...profile, id, ownerUid: uid, projectId, platform: connection.platform, status: "connected", rateKey: `${connection.platform}:${candidate.remoteId}`,
          encryptedCredentials: this.vault.encrypt(credentials, `account:${id}`), createdAt: existing?.createdAt || this.clock(), updatedAt: this.clock(), options: null, optionsUpdatedAt: null, lastError: null });
        accounts.push(this.toPublic(account));
        for (const delivery of this.store.list("delivery", { projectId, status: "needs_account" }).filter(item => item.accountId === id)) {
          this.store.put("delivery", { ...delivery, status: delivery.resumeStatus === "processing" ? "processing" : "queued", resumeStatus: null, dueAt: Math.max(this.clock(), delivery.requestedAt), error: null, updatedAt: this.clock() });
        }
      }
      this.store.remove("connection", connectionId);
      return accounts;
    });
  }

  async credentials(account) {
    return this.locks.withLock(`credentials:${account.id}`, async () => {
      const current = this.store.get("account", account.id);
      invariant(current?.status === "connected" && current.encryptedCredentials, current?.lastError || "Reconnect this account before publishing.", { code: "reconnect_required" });
      let credentials = this.vault.decrypt(current.encryptedCredentials, `account:${current.id}`);
      if (credentials.expiresAt && credentials.expiresAt < this.clock() + 5 * 60000) {
        const provider = this.registry.get(current.platform);
        try {
          credentials = await provider.refresh(credentials);
          if (credentials.expiresAt && credentials.expiresAt < this.clock()) throw new ProviderError("Reconnect this account to renew its permissions.", { reconnect: true, code: "reconnect_required" });
          const latest = this.store.get("account", current.id);
          invariant(latest?.status === "connected", "This account was disconnected. Reconnect it before publishing.", { code: "reconnect_required" });
          this.store.put("account", { ...latest, encryptedCredentials: this.vault.encrypt(credentials, `account:${current.id}`), updatedAt: this.clock() });
        } catch (error) {
          if (error.reconnect) this.markReconnect(current.id, error.message);
          throw error;
        }
      }
      return credentials;
    });
  }

  markReconnect(id, message = "Reconnect this account to renew its permissions.") {
    const account = this.store.get("account", id);
    if (account && account.status !== "disconnected") this.store.put("account", { ...account, status: "reconnect_required", lastError: message, updatedAt: this.clock() });
  }

  async options(uid, projectId, accountId, { force = false } = {}) {
    const account = this.require(uid, projectId, accountId);
    if (!force && account.options && account.optionsUpdatedAt > this.clock() - 60000) return account.options;
    const credentials = await this.credentials(account);
    let options;
    try { options = await this.registry.get(account.platform).options(account, credentials); }
    catch (error) { if (error.reconnect) this.markReconnect(account.id, error.message); throw error; }
    const current = this.store.get("account", account.id);
    this.store.put("account", { ...current, options, optionsUpdatedAt: this.clock() });
    return options;
  }

  disconnect(uid, projectId, accountId) {
    const account = this.require(uid, projectId, accountId);
    const active = this.store.list("delivery", { projectId }).some(delivery => delivery.accountId === accountId && ["publishing", "processing"].includes(delivery.status));
    invariant(!active, "Wait for this account's active delivery to finish before disconnecting it.", { status: 409 });
    this.store.put("account", { ...account, status: "disconnected", encryptedCredentials: null, updatedAt: this.clock() });
    return { disconnected: true };
  }
}
