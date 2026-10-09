export const MEADOW_ORIGIN = "https://findmeadow.com";
export const AUTH_STORAGE_KEY = "meadowExtensionAuth";
export const LOGIN_STORAGE_KEY = "meadowExtensionLogin";
export const REVOCATION_URL = "https://app.findmeadow.com/dashboard/api-keys";

const keyPattern = /^br_live_[a-f0-9]{16}_[A-Za-z0-9_-]{43}$/;
const authLock = "findmeadow-extension-auth-v1";
const defaultFetcher = (...args) => globalThis.fetch(...args);
const authenticationError = () => Object.assign(new Error("Connect your Meadow account to continue."), { code: "authentication_required", status: 401 });

export function meadowUrl(path) {
  if (typeof path !== "string" || !path.startsWith("/api/") || path.includes("#")) throw new Error("Invalid Meadow API address.");
  const url = new URL(path, MEADOW_ORIGIN);
  if (url.origin !== MEADOW_ORIGIN || !url.pathname.startsWith("/api/")) throw new Error("Invalid Meadow API address.");
  return url.href;
}

// Neither cookies nor redirects are used to authenticate extension requests.
export async function fetchMeadowJson(path, { method = "GET", body, token, signal, timeoutMs = 60000, fetcher = defaultFetcher } = {}) {
  signal?.throwIfAborted();
  const controller = new AbortController();
  const abort = () => controller.abort(signal.reason);
  const timeoutError = Object.assign(new Error("Meadow took too long to respond. Try again to check the result."), { code: "request_timeout" });
  const timer = setTimeout(() => controller.abort(timeoutError), timeoutMs);
  signal?.addEventListener("abort", abort, { once: true });
  try {
    signal?.throwIfAborted();
    const response = await fetcher(meadowUrl(path), {
      method, credentials: "omit", redirect: "error", cache: "no-store", signal: controller.signal,
      headers: { ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await response.json().catch(error => {
      if (controller.signal.aborted) throw error;
      if (!response.ok) return {};
      throw Object.assign(new Error("Meadow returned an unreadable response. Try again to check the result."), { code: "invalid_response" });
    });
    if (!response.ok) {
      const error = new Error(typeof data.error === "string" ? data.error : `Meadow request failed (${response.status}).`);
      Object.assign(error, { status: response.status, code: data.code, details: data.details });
      const retry = Number(response.headers?.get("Retry-After"));
      if (Number.isFinite(retry) && retry > 0) error.retryAfterMs = Math.min(retry * 1000, 600000);
      throw error;
    }
    if (!data || typeof data !== "object" || Array.isArray(data)) throw Object.assign(new Error("Meadow returned an invalid response."), { code: "invalid_response" });
    return data;
  } catch (error) {
    if (controller.signal.aborted) throw controller.signal.reason;
    if (error.name === "TypeError") throw Object.assign(new Error("Meadow could not be reached. Check your connection and try again.", { cause: error }), { code: "network_error" });
    throw error;
  } finally { clearTimeout(timer); signal?.removeEventListener("abort", abort); }
}

function publicLogin(record) {
  return { userCode: record.userCode, verificationUrlComplete: record.verificationUrlComplete, expiresAt: record.expiresAt, interval: record.interval };
}

function validCredential(record) {
  return record && keyPattern.test(record.key) && record.keyId === record.key.split("_")[2]
    && typeof record.keyName === "string" && record.keyName.length <= 80;
}

function validateLogin(data, now) {
  let url;
  try { url = new URL(data.verificationUrlComplete); } catch { throw new Error("Meadow returned an invalid sign-in request. Start a new sign-in."); }
  if (typeof data.deviceCode !== "string" || !/^meadow_agent_login_[A-Za-z0-9_-]{43}$/.test(data.deviceCode)
    || !/^[A-Z]{4}-[A-Z]{4}$/.test(data.userCode) || url.origin !== "https://app.findmeadow.com"
    || url.pathname !== "/dashboard/connect-agent" || url.username || url.password || url.hash
    || url.searchParams.get("code") !== data.userCode || [...url.searchParams.keys()].some(key => key !== "code")
    || !Number.isFinite(data.expiresAt) || data.expiresAt <= now || data.expiresAt > now + 15 * 60000
    || !Number.isFinite(data.interval) || data.interval < 5 || data.interval > 60) {
    throw new Error("Meadow returned an invalid sign-in request. Start a new sign-in.");
  }
  return { deviceCode: data.deviceCode, ...publicLogin(data), nextPollAt: now + data.interval * 1000 };
}

export function createExtensionAuth({ chromeApi = globalThis.chrome, lockManager = globalThis.navigator?.locks, fetcher = defaultFetcher, now = () => Date.now() } = {}) {
  let initialization, generation = 0, polling, pollingAbort, startingAbort, lastNotified;
  const listeners = new Set();
  const storage = () => {
    if (!chromeApi?.storage?.local || !chromeApi?.storage?.session) throw new Error("Open FindMeadow in Chrome to connect your account.");
    return chromeApi.storage;
  };
  function locked(action, signal) {
    if (!lockManager?.request) throw new Error("Chrome could not secure this sign-in. Reopen the extension and try again.");
    return lockManager.request(authLock, { mode: "exclusive", ...(signal ? { signal } : {}) }, action);
  }
  async function initialize() {
    if (!initialization) initialization = (async () => {
      const stores = storage();
      await Promise.all([
        stores.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" }),
        stores.session.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" }),
      ]);
      stores.onChanged?.addListener((changes, area) => {
        if (area === "local" && AUTH_STORAGE_KEY in changes || area === "session" && LOGIN_STORAGE_KEY in changes) {
          const change = changes[area === "local" ? AUTH_STORAGE_KEY : LOGIN_STORAGE_KEY];
          if (change.oldValue && !change.newValue) generation++;
          void notify();
        }
      });
    })().catch(error => { initialization = undefined; throw error; });
    await initialization;
  }
  async function credentials() {
    await initialize();
    const value = (await storage().local.get(AUTH_STORAGE_KEY))[AUTH_STORAGE_KEY];
    return validCredential(value) ? value : null;
  }
  async function pending() {
    await initialize();
    const value = (await storage().session.get(LOGIN_STORAGE_KEY))[LOGIN_STORAGE_KEY];
    if (!value) return null;
    try { validateLogin(value, now()); return value; }
    catch { await storage().session.remove(LOGIN_STORAGE_KEY); return null; }
  }
  async function status() {
    const credential = await credentials();
    if (credential) return { status: "connected", keyName: credential.keyName, keyId: credential.keyId };
    const login = await pending();
    return { status: "disconnected", ...(login ? { pending: publicLogin(login) } : {}) };
  }
  async function notify() {
    try {
      const value = await status(), serialized = JSON.stringify(value);
      if (serialized === lastNotified) return;
      lastNotified = serialized;
      for (const listener of listeners) { try { listener(value); } catch { /* A UI listener cannot change authorization. */ } }
    }
    catch { /* The caller reports storage failures; no credential is broadcast. */ }
  }
  async function startOnce({ signal } = {}) {
    signal?.throwIfAborted();
    if (await credentials()) throw new Error("Meadow is already connected. Disconnect before connecting another account.");
    const existing = await pending();
    if (existing) return publicLogin(existing);
    const current = ++generation;
    const data = await fetchMeadowJson("/api/agent-login", { method: "POST", body: { agentName: "FindMeadow for Chrome" }, signal, timeoutMs: 30000, fetcher });
    signal?.throwIfAborted();
    if (current !== generation) throw new DOMException("Sign-in was cancelled.", "AbortError");
    const login = validateLogin(data, now());
    await storage().session.set({ [LOGIN_STORAGE_KEY]: login });
    await notify();
    return publicLogin(login);
  }
  async function start({ signal } = {}) {
    const controller = new AbortController(); startingAbort = controller;
    const combined = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
    try { return await locked(() => startOnce({ signal: combined }), combined); }
    finally { if (startingAbort === controller) startingAbort = undefined; }
  }
  async function pollOnce({ signal } = {}) {
    signal?.throwIfAborted();
    // Another editor may already have collected this one-use approval.
    const credential = await credentials();
    if (credential) return { status: "approved", keyName: credential.keyName, keyId: credential.keyId };
    const current = generation, login = await pending();
    if (!login) throw Object.assign(new Error("This sign-in expired or was cancelled. Connect to Meadow again."), { code: "expired_token", status: 410 });
    if (current !== generation) throw new DOMException("Sign-in was cancelled.", "AbortError");
    if (now() < login.nextPollAt) return { status: "pending", ...publicLogin(login), retryAfterMs: login.nextPollAt - now() };
    await storage().session.set({ [LOGIN_STORAGE_KEY]: { ...login, nextPollAt: now() + login.interval * 1000 } });
    let data;
    try { data = await fetchMeadowJson("/api/agent-login/poll", { method: "POST", body: { deviceCode: login.deviceCode }, signal, timeoutMs: 30000, fetcher }); }
    catch (error) {
      if ([403, 410].includes(error.status) && (await pending())?.deviceCode === login.deviceCode) await storage().session.remove(LOGIN_STORAGE_KEY);
      throw error;
    }
    signal?.throwIfAborted();
    if (current !== generation || (await pending())?.deviceCode !== login.deviceCode) throw new DOMException("Sign-in was cancelled.", "AbortError");
    if (data.status === "pending") return { status: "pending", ...publicLogin(login), retryAfterMs: login.interval * 1000 };
    const approvedCredential = { key: data.apiKey, keyId: data.keyId, keyName: data.keyName, connectedAt: now() };
    if (data.status !== "approved" || !validCredential(approvedCredential)) throw new Error("Meadow could not finish this sign-in. Connect again.");
    await storage().local.set({ [AUTH_STORAGE_KEY]: approvedCredential });
    await storage().session.remove(LOGIN_STORAGE_KEY);
    await notify();
    return { status: "approved", keyName: approvedCredential.keyName, keyId: approvedCredential.keyId };
  }
  async function poll(options = {}) {
    options.signal?.throwIfAborted();
    if (polling) return polling;
    const controller = new AbortController(); pollingAbort = controller;
    const combined = options.signal ? AbortSignal.any([options.signal, controller.signal]) : controller.signal;
    const task = locked(() => pollOnce({ signal: combined }), combined); polling = task;
    try { return await task; } finally { if (polling === task) { polling = undefined; pollingAbort = undefined; } }
  }
  async function disconnect() {
    generation++;
    const cancelled = new DOMException("Sign-in was cancelled.", "AbortError");
    pollingAbort?.abort(cancelled); startingAbort?.abort(cancelled);
    await initialize();
    // Cancellation removes the pending secret immediately. Credential removal
    // then waits for any other editor's collector before completing disconnect.
    await storage().session.remove(LOGIN_STORAGE_KEY);
    await locked(() => storage().local.remove(AUTH_STORAGE_KEY));
    await notify();
  }
  async function invalidateKey(key) {
    await locked(async () => {
      const current = await credentials();
      if (current?.key !== key) return;
      generation++;
      const cancelled = new DOMException("Sign-in was cancelled.", "AbortError");
      pollingAbort?.abort(cancelled); startingAbort?.abort(cancelled);
      await storage().session.remove(LOGIN_STORAGE_KEY);
      await storage().local.remove(AUTH_STORAGE_KEY);
      await notify();
    });
  }
  return {
    status, start, poll, disconnect, invalidateKey,
    async getKey() { const value = await credentials(); if (!value) throw authenticationError(); return value.key; },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
  };
}

export const auth = createExtensionAuth();
