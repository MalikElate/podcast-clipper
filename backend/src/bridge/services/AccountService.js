import { randomBytes, randomUUID } from "node:crypto";
import { invariant, ProviderError } from "../core/errors.js";
import { SecretVault } from "../core/SecretVault.js";

const DAY = 86400000;
const authorizationFamily = platform => ["youtube", "google_business"].includes(platform) ? "google" : platform;
const sameTokens = (left, right) => left.accessToken === right.accessToken && left.refreshToken === right.refreshToken && left.did === right.did;

export class AccountService {
  constructor({ store, projects, registry, vault, locks, clock = () => Date.now(), localPreview = false }) {
    Object.assign(this, { store, projects, registry, vault, locks, clock, localPreview });
  }
  toPublic(account) {
    const { encryptedCredentials, authorizationId, authorizationGrantedAt, authorizationStartedAt, maintenanceDueAt, maintenanceAttempts, ...visible } = account;
    return visible;
  }
  list(uid, projectId) { this.projects.require(uid, projectId); return this.store.list("account", { projectId }).map(account => this.toPublic(account)); }
  async listFresh(uid, projectId) {
    this.projects.require(uid, projectId);
    const accounts = this.store.list("account", { projectId });
    return Promise.all(accounts.map(async account => {
      if (account.platform !== "pinterest" || account.status !== "connected") return this.toPublic(account);
      try {
        const profiles = await this.withCredentials(account, credentials => this.registry.get("pinterest").accounts(credentials));
        const current = this.store.get("account", account.id);
        if (!current || ["disconnected", "deleting"].includes(current.status)) return null;
        return { ...this.toPublic(current), ...(current.status === "connected" && current.authorizationId === account.authorizationId ? profiles.find(item => item.remoteId === account.remoteId) : {}) };
      } catch {
        const current = this.store.get("account", account.id);
        return current && !["disconnected", "deleting"].includes(current.status) ? { ...this.toPublic(current), label: "Pinterest account", avatar: null, profileUrl: null } : null;
      }
    })).then(items => items.filter(Boolean));
  }
  require(uid, projectId, accountId) { return this.projects.requireRecord(uid, projectId, "account", accountId); }

  async start(uid, projectId, platform, { handle, consent } = {}) {
    this.projects.require(uid, projectId);
    invariant(!this.store.list("account", { ownerUid: uid, status: "deleting", limit: null }).some(item => item.platform === platform || [item.platform, platform].every(value => ["youtube", "google_business"].includes(value))), "Connection removal is still finishing. Try again shortly.", { status: 409 });
    invariant(!this.store.list("revocation", { ownerUid: uid, status: "pending", limit: null }).some(item => item.platform === platform || [item.platform, platform].every(value => ["youtube", "google_business"].includes(value))), "Authorization removal is still finishing. Try connecting again shortly.", { status: 409 });
    invariant(!this.localPreview, "Live account connections are disabled in local preview.", { status: 409, code: "preview_mode" });
    invariant(this.vault.configured, "Social account connections are not configured on this server.", { status: 503 });
    const provider = this.registry.get(platform);
    const privacyConsent = this.privacy?.connectionConsent(platform, consent) || null;
    const state = randomBytes(32).toString("base64url");
    const verifier = randomBytes(48).toString("base64url");
    this.store.saveState(SecretVault.hash(state), { uid, projectId, platform, verifier, privacyConsent, createdAt: this.clock() }, this.clock() + 10 * 60000);
    return { url: await provider.authorizationUrl({ state, verifier, handle }) };
  }

  async callback(platform, params) {
    this.pendingCallbacks = (this.pendingCallbacks || 0) + 1;
    try { return await this.finishCallback(platform, params); }
    finally { this.pendingCallbacks--; }
  }
  async finishCallback(platform, params) {
    const provider = this.registry.get(platform);
    let saved, credentials, candidates;
    if (provider.finishAuthorization) {
      if (provider.authorizationState) {
        const state = await provider.authorizationState(params);
        saved = this.store.consumeState(SecretVault.hash(state || ""), this.clock());
        invariant(saved && saved.platform === platform, "This connection request has expired. Start again.");
        this.projects.require(saved.uid, saved.projectId);
        this.privacy?.requireConnectionConsent(platform, saved.privacyConsent);
      }
      await this.store.flush?.();
      const result = await provider.finishAuthorization(params);
      saved ||= this.store.consumeState(SecretVault.hash(result.state || ""), this.clock());
      credentials = result.credentials;
      candidates = result.candidates;
    } else {
      saved = this.store.consumeState(SecretVault.hash(params.get("state") || ""), this.clock());
      invariant(saved && saved.platform === platform, "This connection request has expired. Start again.");
      this.projects.require(saved.uid, saved.projectId);
      this.privacy?.requireConnectionConsent(platform, saved.privacyConsent);
      invariant(!params.get("error") && params.get("code"), "The account connection was not authorized.");
      await this.store.flush?.();
      credentials = await provider.exchange({ code: params.get("code"), verifier: saved.verifier });
      candidates = await provider.accounts(credentials);
    }
    invariant(saved && saved.platform === platform, "This connection request has expired. Start again.");
    invariant((saved.createdAt || 0) + 10 * 60000 > this.clock(), "This connection request has expired. Start again.");
    this.projects.require(saved.uid, saved.projectId);
    this.privacy?.requireConnectionConsent(platform, saved.privacyConsent);
    invariant(!this.privacy?.connectionBarrier(saved.uid, platform) || (saved.createdAt || 0) > this.privacy.connectionBarrier(saved.uid, platform), "This authorization request predates connection removal. Connect again.");
    invariant(Array.isArray(candidates) && candidates.length, "No eligible accounts were returned. Check your account type and permissions.");
    this.metaPrivacy?.assertAuthorization(platform, candidates, saved.createdAt || 0);
    const id = randomUUID();
    this.store.put("connection", { id, ownerUid: saved.uid, projectId: saved.projectId, platform, privacyConsent: saved.privacyConsent || null, authorizationStartedAt: saved.createdAt, createdAt: this.clock(), expiresAt: this.clock() + 10 * 60000,
      encrypted: this.vault.encrypt(candidates.map(candidate => ({ ...(platform === "pinterest" ? { remoteId: candidate.remoteId, label: "Pinterest account" } : candidate), credentials: { ...credentials, ...(candidate.credentials || {}) } })), `connection:${id}`) });
    if (candidates.length === 1) {
      const accounts = this.attach(saved.uid, saved.projectId, id, [candidates[0].remoteId]);
      await this.store.flush?.();
      return { projectId: saved.projectId, accounts };
    }
    await this.store.flush?.();
    return { projectId: saved.projectId, connectionId: id };
  }

  async pending(uid, projectId, connectionId) {
    const connection = this.projects.requireRecord(uid, projectId, "connection", connectionId);
    invariant(connection.expiresAt > this.clock(), "This connection has expired. Connect the account again.");
    const candidates = this.vault.decrypt(connection.encrypted, `connection:${connectionId}`);
    if (connection.platform === "pinterest") {
      const profiles = await this.registry.get("pinterest").accounts(candidates[0].credentials);
      this.projects.require(uid, projectId);
      return { platform: connection.platform, candidates: profiles.map(({ credentials, ...profile }) => profile).filter(item => candidates.some(candidate => candidate.remoteId === item.remoteId)) };
    }
    return { platform: connection.platform, candidates: candidates.map(({ credentials, ...candidate }) => candidate) };
  }

  attach(uid, projectId, connectionId, selectedIds) {
    const connection = this.projects.requireRecord(uid, projectId, "connection", connectionId);
    this.privacy?.requireConnectionConsent(connection.platform, connection.privacyConsent);
    invariant(connection.expiresAt > this.clock(), "This connection has expired. Connect the account again.");
    invariant(Array.isArray(selectedIds) && selectedIds.length && selectedIds.length <= 100, "Select at least one account.");
    const candidates = this.vault.decrypt(connection.encrypted, `connection:${connectionId}`);
    invariant(selectedIds.every(id => candidates.some(candidate => candidate.remoteId === id)), "An invalid account was selected.");
    this.metaPrivacy?.assertAuthorization(connection.platform, candidates, connection.authorizationStartedAt || connection.createdAt);
    return this.store.transaction(() => {
      const accounts = [];
      for (const candidate of candidates.filter(candidate => selectedIds.includes(candidate.remoteId))) {
        const existing = this.store.list("account", { projectId }).find(account => account.platform === connection.platform && account.remoteId === candidate.remoteId);
        invariant(existing?.status !== "deleting", "This connection is being removed. Connect again after deletion finishes.", { status: 409 });
        const id = existing?.id || randomUUID();
        const { credentials, ...profile } = candidate;
        const account = this.store.put("account", { ...existing, ...profile, id, ownerUid: uid, projectId, platform: connection.platform, status: "connected", rateKey: `${connection.platform}:${candidate.remoteId}`,
          encryptedCredentials: this.vault.encrypt(credentials, `account:${id}`), authorizationId: connectionId, authorizationStartedAt: connection.authorizationStartedAt || connection.createdAt, authorizationGrantedAt: connection.createdAt, privacyConsent: connection.privacyConsent || null, profileUpdatedAt: this.clock(), createdAt: existing?.createdAt || this.clock(), updatedAt: this.clock(), options: null, optionsUpdatedAt: null, lastError: null, maintenanceDueAt: null, maintenanceAttempts: 0 });
        accounts.push(this.toPublic(account));
        for (const delivery of this.store.list("delivery", { projectId, status: "needs_account" }).filter(item => item.accountId === id)) {
          this.store.put("delivery", { ...delivery, status: delivery.resumeStatus === "processing" ? "processing" : "queued", resumeStatus: null, dueAt: Math.max(this.clock(), delivery.requestedAt), error: null, updatedAt: this.clock() });
        }
      }
      this.store.remove("connection", connectionId);
      return accounts;
    });
  }

  credentialLockKey(account) {
    let credentials = {};
    try { if (account.encryptedCredentials) credentials = this.vault.decrypt(account.encryptedCredentials, `account:${account.id}`); }
    catch { /* Erasure must remain possible if an encryption key is unavailable. */ }
    const token = credentials.refreshToken || credentials.accessToken || account.authorizationId || account.id;
    return `credential-grant:${account.ownerUid}:${authorizationFamily(account.platform)}:${SecretVault.hash(token)}`;
  }

  withCredentialLock(account, operation, options = {}) {
    return this.locks.withLock(`credentials:${account.id}`, () => {
      const current = this.store.get("account", account.id) || account;
      return this.locks.withLock(this.credentialLockKey(current), operation, options);
    }, options);
  }

  async credentials(account, { force = false, minValidityMs = 5 * 60000, rejectedCredentials } = {}) {
    const initial = this.store.get("account", account.id);
    invariant(initial?.status === "connected" && initial.encryptedCredentials, initial?.lastError || "Reconnect this account before publishing.", { code: "reconnect_required" });
    const initialTokens = this.vault.decrypt(initial.encryptedCredentials, `account:${initial.id}`);
    // Accounts selected from the same grant may share a rotating refresh token.
    // Serialize by that token, then re-read after waiting for another refresh.
    return this.withCredentialLock(initial, async () => {
      const current = this.store.get("account", account.id);
      invariant(current?.status === "connected" && current.encryptedCredentials, current?.lastError || "Reconnect this account before publishing.", { code: "reconnect_required" });
      invariant(current.authorizationId === initial.authorizationId, "This account connection changed. Try again.", { code: "connection_changed", status: 409 });
      let credentials = this.vault.decrypt(current.encryptedCredentials, `account:${current.id}`);
      const requireCurrent = expected => {
        const latest = this.store.get("account", current.id);
        invariant(latest?.status === "connected" && latest.authorizationId === current.authorizationId && latest.encryptedCredentials && sameTokens(this.vault.decrypt(latest.encryptedCredentials, `account:${current.id}`), expected), "This account connection changed. Try again.", { code: "connection_changed", status: 409 });
      };
      const changed = !sameTokens(credentials, initialTokens) || rejectedCredentials && !sameTokens(credentials, rejectedCredentials);
      if (!changed && (force || credentials.expiresAt && credentials.expiresAt < this.clock() + minValidityMs)) {
        const provider = this.registry.get(current.platform);
        const before = credentials;
        const sharing = this.store.list("account", { ownerUid: current.ownerUid, status: "connected", limit: null }).filter(item => authorizationFamily(item.platform) === authorizationFamily(current.platform) && item.encryptedCredentials).filter(item => {
          const value = this.vault.decrypt(item.encryptedCredentials, `account:${item.id}`);
          return before.refreshToken ? value.refreshToken === before.refreshToken : value.accessToken && value.accessToken === before.accessToken || item.id === current.id;
        });
        try {
          await this.store.flush?.();
          requireCurrent(credentials);
          credentials = await provider.refresh(credentials);
          if (credentials.expiresAt && credentials.expiresAt < this.clock()) throw new ProviderError("Reconnect this account to renew its permissions.", { reconnect: true, code: "reconnect_required" });
          const latest = this.store.get("account", current.id);
          invariant(latest && ["connected", "deleting"].includes(latest.status) && latest.authorizationId === current.authorizationId, "This account connection changed. Try again.", { code: "connection_changed", status: 409 });
          this.store.transaction(() => {
            for (const saved of sharing) {
              const target = this.store.get("account", saved.id);
              if (!target || !["connected", "deleting"].includes(target.status) || target.authorizationId !== saved.authorizationId || target.encryptedCredentials !== saved.encryptedCredentials) continue;
              const old = this.vault.decrypt(target.encryptedCredentials, `account:${target.id}`);
              this.store.put("account", { ...target, encryptedCredentials: this.vault.encrypt({ ...old, ...credentials }, `account:${target.id}`), updatedAt: this.clock(), maintenanceDueAt: this.clock() + DAY, maintenanceAttempts: 0, lastError: null });
            }
          });
        } catch (error) {
          if (error.reconnect) this.markReconnect(current.id, error.message, { authorizationId: current.authorizationId, credentials: before, lossScope: error.authFailure === "grant" ? "authorization" : null });
          throw error;
        }
      }
      // Every path must wait for dirty credentials to become durable. A rotation
      // may have survived in memory after an earlier persistence failure.
      await this.store.flush?.();
      // A disconnect can arrive during rotation or persistence. Keep its tokens
      // for erasure, and never return an older or removed authorization.
      requireCurrent(credentials);
      return credentials;
    });
  }

  markReconnect(id, message = "Reconnect this account to renew its permissions.", expected = {}) {
    const account = this.store.get("account", id);
    if (!account || account.status === "disconnected" || this.privacy?.blocked(account.ownerUid)) return false;
    if (Object.hasOwn(expected, "authorizationId") && account.authorizationId !== expected.authorizationId) return false;
    if (expected.credentials && account.encryptedCredentials && !sameTokens(this.vault.decrypt(account.encryptedCredentials, `account:${id}`), expected.credentials)) return false;
    if (account.status === "deleting") return expected.lossScope === "authorization" && account.platform === "youtube" ? Boolean(this.privacy?.requestLostAccess(account, { authorizationLost: true })) : false;
    const updated = this.store.put("account", { ...account, status: "reconnect_required", lastError: message, updatedAt: this.clock() });
    if (expected.lossScope && updated.platform === "youtube") this.privacy?.requestLostAccess(updated, { authorizationLost: expected.lossScope === "authorization" });
    return true;
  }

  async recoverAccess(account, credentials, error) {
    if (error.authFailure !== "access_token" || !credentials) return null;
    const current = this.store.get("account", account.id);
    if (current?.status !== "connected" || current.authorizationId !== account.authorizationId) return null;
    const renewed = await this.credentials(current, { force: true, rejectedCredentials: credentials });
    return !sameTokens(renewed, credentials) || current.platform === "bluesky" ? renewed : null;
  }

  async withCredentials(account, operation) {
    let credentials;
    try {
      credentials = await this.credentials(account);
      try { return await operation(credentials); }
      catch (error) {
        const renewed = await this.recoverAccess(account, credentials, error);
        if (!renewed) throw error;
        credentials = renewed;
        return await operation(credentials);
      }
    } catch (error) {
      if (error.reconnect) this.markReconnect(account.id, error.message, { authorizationId: account.authorizationId, credentials, lossScope: ["grant", "access_token"].includes(error.authFailure) ? "authorization" : null });
      throw error;
    }
  }

  async options(uid, projectId, accountId, { force = false } = {}) {
    const account = this.require(uid, projectId, accountId);
    if (account.platform !== "pinterest" && !force && account.options && account.optionsUpdatedAt > this.clock() - 60000) return account.options;
    const options = await this.withCredentials(account, credentials => this.registry.get(account.platform).options(account, credentials));
    const current = this.store.get("account", account.id);
    invariant(current?.status === "connected" && current.authorizationId === account.authorizationId, "This account connection changed. Try again.", { code: "connection_changed", status: 409 });
    if (account.platform !== "pinterest") this.store.put("account", { ...current, options, optionsUpdatedAt: this.clock() });
    return options;
  }

  disconnect(uid, projectId, accountId) {
    if (this.privacy) return this.privacy.requestConnection(uid, projectId, accountId);
    const account = this.require(uid, projectId, accountId);
    const active = this.store.list("delivery", { projectId }).some(delivery => delivery.accountId === accountId && ["publishing", "processing"].includes(delivery.status));
    invariant(!active, "Wait for this account's active delivery to finish before disconnecting it.", { status: 409 });
    this.store.put("account", { ...account, status: "disconnected", encryptedCredentials: null, updatedAt: this.clock() });
    return { disconnected: true };
  }

  async maintainApiData() {
    const now = this.clock();
    const accounts = this.store.list("account", { limit: null }).filter(item => item.platform === "youtube" && item.status !== "deleting" && !this.privacy?.blocked(item.ownerUid));
    for (const account of accounts) {
      if ((account.profileUpdatedAt || account.createdAt) < now - 30 * DAY) this.store.put("account", { ...account, label: "YouTube channel", avatar: null, profileUrl: null, metadata: null, options: null, optionsUpdatedAt: null });
    }
    for (const selected of accounts.filter(item => item.status === "connected" && (item.profileAttemptedAt || 0) <= now - DAY).sort((a, b) => (a.profileAttemptedAt || 0) - (b.profileAttemptedAt || 0)).slice(0, 10)) {
      const account = this.store.get("account", selected.id);
      if (account?.status !== "connected" || account.authorizationId !== selected.authorizationId) continue;
      this.store.put("account", { ...account, profileAttemptedAt: now });
      try {
        const profiles = await this.withCredentials(account, credentials => this.registry.get("youtube").accounts(credentials));
        const current = this.store.get("account", account.id);
        if (current?.status !== "connected" || current.authorizationId !== account.authorizationId) continue;
        const profile = profiles.find(item => item.remoteId === account.remoteId);
        if (!profile) { this.markReconnect(account.id, "This YouTube channel is no longer available to Meadow.", { authorizationId: account.authorizationId, lossScope: "account" }); continue; }
        this.store.put("account", { ...current, ...profile, profileUpdatedAt: now });
      } catch { /* Keep the connection and retry; expired profile data was cleared above. */ }
    }
  }

  async maintainConnections() {
    if (this.running || this.localPreview) return;
    this.running = true;
    try {
      const due = this.store.list("account", { status: "connected", limit: null }).filter(account => account.encryptedCredentials && (account.maintenanceDueAt || 0) <= this.clock() && !this.privacy?.blocked(account.ownerUid)).sort((a, b) => (a.maintenanceDueAt || 0) - (b.maintenanceDueAt || 0)).slice(0, 25);
      for (const selected of due) {
        const account = this.store.get("account", selected.id);
        if (account?.status !== "connected" || account.authorizationId !== selected.authorizationId || (account.maintenanceDueAt || 0) > this.clock() || this.privacy?.blocked(account.ownerUid)) continue;
        this.store.put("account", { ...account, maintenanceDueAt: this.clock() + 60000 });
        try {
          const credentials = this.vault.decrypt(account.encryptedCredentials, `account:${account.id}`);
          const expiring = credentials.expiresAt && credentials.expiresAt <= this.clock() + 7 * DAY || credentials.refreshExpiresAt && credentials.refreshExpiresAt <= this.clock() + 7 * DAY;
          const withoutLifetime = !credentials.expiresAt && credentials.refreshToken;
          if (expiring || withoutLifetime || account.platform === "bluesky") await this.credentials(account, { force: true });
          const current = this.store.get("account", account.id);
          if (current?.status === "connected" && current.authorizationId === account.authorizationId) this.store.put("account", { ...current, maintenanceDueAt: this.clock() + (withoutLifetime ? 30 * DAY : DAY), maintenanceAttempts: 0 });
        } catch {
          const current = this.store.get("account", account.id);
          if (current?.status === "connected" && current.authorizationId === account.authorizationId) {
            const attempts = (current.maintenanceAttempts || 0) + 1;
            this.store.put("account", { ...current, maintenanceAttempts: attempts, maintenanceDueAt: this.clock() + Math.min(6 * 3600000, 5 * 60000 * 2 ** Math.min(attempts - 1, 7)) });
          }
        }
      }
    } finally { try { await this.store.flush?.(); } finally { this.running = false; } }
  }
}
