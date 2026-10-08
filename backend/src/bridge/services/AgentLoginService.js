import { createHash, randomBytes, randomInt } from "node:crypto";
import { invariant } from "../core/errors.js";

const devicePrefix = "meadow_agent_login_";
// Consonants only: codes are read aloud or retyped and never spell words.
const codeAlphabet = "BCDFGHJKLMNPQRSTVWXZ";
const lifetimeMs = 10 * 60000;
export const agentLoginPollSeconds = 5;
const notFound = { status: 404, code: "agent_login_not_found" };

/** Device-style sign-in for agents that cannot receive a browser redirect, such
 * as remote or cloud agents. The agent starts a request and polls with a secret
 * device code; the user approves a short code while signed in to Meadow. The
 * API key is minted only when the agent collects it, so no key is stored. */
export class AgentLoginService {
  constructor({ store, apiKeys, privacy, appUrl, clock = () => Date.now() }) {
    Object.assign(this, { store, apiKeys, privacy, appUrl, clock });
  }

  start({ agentName } = {}) {
    const name = typeof agentName === "string" ? agentName.replace(/\s+/g, " ").trim() : "";
    invariant(name.length >= 1 && name.length <= 60, "Send agentName: a name between 1 and 60 characters that identifies this agent, such as \"Claude Code on build server\".");
    const deviceCode = devicePrefix + randomBytes(32).toString("base64url");
    const userCode = Array.from({ length: 8 }, () => codeAlphabet[randomInt(codeAlphabet.length)]).join("").replace(/^(.{4})/, "$1-");
    const now = this.clock(), expiresAt = now + lifetimeMs, deviceKey = this.deviceKey(deviceCode);
    this.store.transaction(() => {
      this.store.saveState(deviceKey, { kind: "agent_login", agentName: name, status: "pending", createdAt: now, expiresAt }, expiresAt);
      this.store.saveState(this.codeKey(userCode), { kind: "agent_login_code", deviceKey }, expiresAt);
    });
    const verificationUrl = new URL("/dashboard/connect-agent", this.appUrl);
    const verificationUrlComplete = new URL(verificationUrl); verificationUrlComplete.searchParams.set("code", userCode);
    return { deviceCode, userCode, verificationUrl: verificationUrl.href, verificationUrlComplete: verificationUrlComplete.href, expiresAt, expiresIn: lifetimeMs / 1000, interval: agentLoginPollSeconds };
  }

  /** What the approval page shows before the user decides. */
  describe(userCode) {
    const { request } = this.pending(userCode);
    return { agentName: request.agentName, createdAt: request.createdAt, expiresAt: request.expiresAt };
  }

  approve(uid, userCode) {
    invariant(this.apiKeys.list(uid).length < 20, "You have reached the API key limit. Revoke an unused key in API keys, then approve again.");
    return this.decide(userCode, { status: "approved", uid });
  }

  deny(userCode) { return this.decide(userCode, { status: "denied" }); }

  /** Polled by the agent. An approval is collected exactly once. */
  poll({ deviceCode } = {}) {
    invariant(typeof deviceCode === "string" && deviceCode.startsWith(devicePrefix), "Send the deviceCode returned when this sign-in started.");
    const deviceKey = this.deviceKey(deviceCode);
    const request = this.store.transaction(() => {
      const current = this.store.peekState(deviceKey, this.clock());
      if (current?.kind === "agent_login" && current.status !== "pending") this.store.consumeState(deviceKey, this.clock());
      return current?.kind === "agent_login" ? current : null;
    });
    invariant(request, "This sign-in expired or was already collected. Start a new one.", { status: 410, code: "expired_token" });
    if (request.status === "pending") return { status: "pending", interval: agentLoginPollSeconds, expiresAt: request.expiresAt };
    invariant(request.status === "approved", "The Meadow user declined this sign-in.", { status: 403, code: "access_denied" });
    this.privacy?.assertActive(request.uid);
    const { apiKey, key } = this.apiKeys.create(request.uid, { name: request.agentName });
    return { status: "approved", apiKey: key, keyId: apiKey.id, keyName: apiKey.name };
  }

  decide(userCode, change) {
    return this.store.transaction(() => {
      const { codeKey, deviceKey, request } = this.pending(userCode);
      this.store.consumeState(codeKey, this.clock());
      this.store.saveState(deviceKey, { ...request, ...change, decidedAt: this.clock() }, request.expiresAt);
      return { status: change.status, agentName: request.agentName };
    });
  }

  pending(userCode) {
    const codeKey = this.codeKey(userCode), now = this.clock();
    const link = this.store.peekState(codeKey, now);
    const request = link?.kind === "agent_login_code" ? this.store.peekState(link.deviceKey, now) : null;
    invariant(request?.kind === "agent_login" && request.status === "pending", "This code is invalid, expired or already used. Ask your agent to start again.", notFound);
    return { codeKey, deviceKey: link.deviceKey, request };
  }

  deviceKey(deviceCode) { return `agent_login:${this.digest(deviceCode)}`; }
  codeKey(userCode) { return `agent_login_code:${this.digest(String(userCode || "").toUpperCase().replace(/[^A-Z]/g, ""))}`; }
  digest(value) { return createHash("sha256").update(value).digest("hex"); }
}
