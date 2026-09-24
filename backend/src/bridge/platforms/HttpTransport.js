import { ProviderError } from "../core/errors.js";
import { assertXResponse } from "./xErrors.js";
import { assertTikTokResponse } from "./tiktokErrors.js";

const authorizationError = (message, authFailure, details = null) => Object.assign(new ProviderError(message, { reconnect: true, code: "reconnect_required", details }), { authFailure });
const invalidAccessTokenCodes = new Set(["invalid_token", "access_token_invalid", "access_token_expired", "token_expired"]);

export class HttpTransport {
  constructor({ fetcher = fetch, clock = () => Date.now() } = {}) { this.fetcher = fetcher; this.clock = clock; }

  async request(url, { method = "GET", token, json, form, body, headers = {}, safeToRetry = method === "GET", timeoutMs = 60000, raw = false, acceptStatuses = [], diagnosticStage, ...options } = {}) {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") throw new ProviderError("The platform returned an insecure endpoint.");
    const requestHeaders = { ...headers, ...(token ? { Authorization: `Bearer ${token}` } : {}) };
    if (json !== undefined) { requestHeaders["Content-Type"] = "application/json"; body = JSON.stringify(json); }
    if (form) { body = new URLSearchParams(form); requestHeaders["Content-Type"] = "application/x-www-form-urlencoded"; }
    let response;
    try {
      response = await this.fetcher(url, { method, headers: requestHeaders, body, redirect: "error", signal: AbortSignal.timeout(timeoutMs), ...(body?.pipe ? { duplex: "half" } : {}), ...options });
    } catch {
      throw new ProviderError(safeToRetry ? "The platform did not respond. Meadow will try again." : "The platform did not confirm the request. Check its result before retrying.", { retryable: safeToRetry, uncertain: !safeToRetry, code: "provider_connection" });
    }
    if (response.status === 429) {
      const after = response.headers.get("retry-after");
      const reset = response.headers.get("x-rate-limit-reset") || response.headers.get("ratelimit-reset");
      let retryAt = after ? (/^\d+(\.\d+)?$/.test(after) ? this.clock() + Number(after) * 1000 : Date.parse(after)) : reset ? Number(reset) * 1000 : null;
      if (!Number.isFinite(retryAt) || retryAt <= this.clock()) retryAt = null;
      throw new ProviderError("The platform's posting allowance has been reached. This delivery is queued.", { retryable: true, retryAt, code: "rate_limited" });
    }
    const pinterestHost = ["api.pinterest.com", "api-sandbox.pinterest.com"].includes(parsed.hostname);
    const googleTokenEndpoint = parsed.hostname === "oauth2.googleapis.com" && parsed.pathname === "/token";
    const tokenEndpoint = /\/(?:token|access_token|accessToken)\/?$/i.test(parsed.pathname);
    if (response.status >= 500) throw new ProviderError("The platform is temporarily unavailable.", { retryable: safeToRetry, uncertain: !safeToRetry, code: "provider_unavailable" });
    if (raw && response.status !== 401 && (response.ok || acceptStatuses.includes(response.status))) return response;
    let text;
    try { text = await response.text(); }
    catch { throw new ProviderError(safeToRetry ? "The platform response was interrupted. Meadow will try again." : "The platform response was interrupted. Check whether it published before retrying.", { retryable: safeToRetry, uncertain: !safeToRetry, code: "provider_connection" }); }
    let data;
    try { data = text ? JSON.parse(text) : {}; } catch {
      if (response.ok && text.trim()) throw new ProviderError("The platform returned an unreadable response.", { retryable: safeToRetry, uncertain: !safeToRetry, code: "provider_response" });
      data = {};
    }
    const providerCode = data?.error?.code || data?.errors?.[0]?.reason || data?.error;
    const oauthCode = typeof data?.error === "string" ? data.error : data?.error?.code;
    const graphHost = ["graph.facebook.com", "graph.instagram.com", "graph.threads.net"].includes(parsed.hostname);
    const graphDetails = graphHost ? {
      provider: "meta",
      httpStatus: response.status,
      ...(typeof providerCode === "string" || typeof providerCode === "number" ? { providerCode } : {}),
      ...(typeof data?.error?.error_subcode === "number" ? { providerSubcode: data.error.error_subcode } : {}),
      ...(diagnosticStage ? { connectionStage: diagnosticStage } : {}),
    } : null;
    const invalidAccessToken = invalidAccessTokenCodes.has(oauthCode) || graphHost && Number(data?.error?.code) === 190;
    if (parsed.hostname === "open.tiktokapis.com" && !tokenEndpoint) assertTikTokResponse(data, { status: response.status, ok: response.ok });
    if (!response.ok || tokenEndpoint && oauthCode && oauthCode !== "ok") {
      if (parsed.hostname === "api.x.com" && response.status === 402) throw new ProviderError("X requires API credits before it will return analytics.", { code: "x_credits_required" });
      if (parsed.hostname === "api.x.com" && !tokenEndpoint && response.status !== 401) assertXResponse(data);
      if (googleTokenEndpoint) {
        // Token revocation is an account issue; invalid app credentials are not.
        // Use fixed messages so Google's response cannot expose request data.
        const knownCode = ["invalid_grant", "invalid_client", "unauthorized_client"].includes(data?.error) ? data.error : null;
        const details = { provider: "google", httpStatus: response.status, ...(knownCode ? { providerCode: knownCode } : {}) };
        if (knownCode === "invalid_grant") {
          throw authorizationError("Google rejected this account's authorization. Reconnect the account in Meadow to continue publishing.", "grant", details);
        }
        if (knownCode === "invalid_client" || knownCode === "unauthorized_client" || response.status === 401) {
          throw new ProviderError("Google rejected Meadow's app authorization. Meadow's administrator must check the Google OAuth client configuration.", { code: "google_app_credentials", details });
        }
      }
      if (pinterestHost) {
        // Pinterest uses top-level code/message fields. Keep diagnostics, but
        // never expose the response body, which may contain request data.
        const code = Number.isInteger(data?.code) ? data.code : null;
        const details = { provider: "pinterest", httpStatus: response.status, ...(code !== null ? { providerCode: code } : {}) };
        const reference = ` (HTTP ${response.status}${code !== null ? `, Pinterest code ${code}` : ""})`;
        const message = typeof data?.message === "string" ? data.message : "";
        if (/trial access|standard access|app.*access tier/i.test(message)) {
          throw new ProviderError(`Pinterest requires a different app access tier for this action. Meadow's administrator must use Sandbox for Trial testing or obtain Standard access for production publishing.${reference}`, { code: "pinterest_app_access_required", details });
        }
        if (tokenEndpoint && (response.status === 401 && data?.error !== "invalid_grant" || ["invalid_client", "unauthorized_client"].includes(data?.error))) {
          throw new ProviderError(`Pinterest rejected Meadow's app credentials. Meadow's administrator must check the Pinterest app ID and secret.${reference}`, { code: "pinterest_app_credentials", details });
        }
        if (data?.error === "invalid_grant" || response.status === 401) {
          throw authorizationError(`Pinterest rejected this account's authorization. Reconnect Pinterest in Meadow. If the integration changed between Sandbox and Production, a new connection is required.${reference}`, data?.error === "invalid_grant" ? "grant" : "access_token", details);
        }
        if (response.status === 403 && /scope|token.*(?:permission|access)|insufficient permission/i.test(message)) {
          throw new ProviderError(`Pinterest has not granted the permissions needed for this action. Check the app's granted access before trying again.${reference}`, { code: "provider_permissions", details });
        }
        throw new ProviderError(`Pinterest rejected the request. Check the selected board, media, and app access.${reference}`, { code: "provider_rejected", details });
      }
      if (tokenEndpoint && oauthCode === "invalid_grant") throw authorizationError("The platform rejected this account's authorization. Reconnect the account in Meadow to continue publishing.", "grant", graphDetails || { providerCode: oauthCode });
      if (tokenEndpoint && (["invalid_client", "unauthorized_client"].includes(oauthCode) || response.status === 401 && !invalidAccessToken)) {
        throw new ProviderError("The platform rejected Meadow's app authorization. Meadow's administrator must check the app credentials.", { code: "provider_app_credentials", details: graphDetails || { httpStatus: response.status, ...(["invalid_client", "unauthorized_client"].includes(oauthCode) ? { providerCode: oauthCode } : {}) } });
      }
      if (response.status === 401) throw authorizationError("Reconnect this social account to renew its permissions.", "access_token");
      const rateLimited = graphHost && [4, 17, 32, 341, 613, 80001, 80002, 80004, 80006].includes(Number(data?.error?.code)) || /quotaExceeded|dailyLimitExceeded|rate.limit|too_many|spam_risk_too_many_posts|publishing.limit|request.limit/i.test(JSON.stringify(data?.error || data?.errors || {}));
      if (!rateLimited && invalidAccessToken) throw authorizationError("The platform rejected this account's access token. Meadow needs to renew its authorization.", "access_token", graphDetails || (typeof providerCode === "string" || typeof providerCode === "number" ? { providerCode } : null));
      throw new ProviderError(rateLimited ? "The platform's allowance has been reached. This delivery is queued." : `The platform rejected the request (HTTP ${response.status}). Check the account permissions and post settings.`, {
        code: rateLimited ? "rate_limited" : "provider_rejected", retryable: rateLimited,
        details: graphDetails || (typeof providerCode === "string" || typeof providerCode === "number" ? { providerCode } : null),
      });
    }
    // TikTok reports many failures in successful HTTP responses.
    if (data?.error?.code && data.error.code !== "ok") {
      const limited = /rate_limit|too_many|spam_risk_too_many_posts/.test(data.error.code);
      if (!limited && invalidAccessToken) throw authorizationError("The platform rejected this account's access token. Meadow needs to renew its authorization.", "access_token", { providerCode: data.error.code });
      throw new ProviderError(limited ? "This account has reached its publishing allowance." : "The platform could not complete the request. Check this account's permissions and post settings.", { retryable: limited, code: limited ? "rate_limited" : "provider_rejected", details: { providerCode: data.error.code } });
    }
    return data;
  }
}
