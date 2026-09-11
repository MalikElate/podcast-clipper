import { ProviderError } from "../core/errors.js";

export class HttpTransport {
  constructor({ fetcher = fetch, clock = () => Date.now() } = {}) { this.fetcher = fetcher; this.clock = clock; }

  async request(url, { method = "GET", token, json, form, body, headers = {}, safeToRetry = method === "GET", timeoutMs = 60000, raw = false, acceptStatuses = [], ...options } = {}) {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") throw new ProviderError("The platform returned an insecure endpoint.");
    const requestHeaders = { ...headers, ...(token ? { Authorization: `Bearer ${token}` } : {}) };
    if (json !== undefined) { requestHeaders["Content-Type"] = "application/json"; body = JSON.stringify(json); }
    if (form) { body = new URLSearchParams(form); requestHeaders["Content-Type"] = "application/x-www-form-urlencoded"; }
    let response;
    try {
      response = await this.fetcher(url, { method, headers: requestHeaders, body, redirect: "error", signal: AbortSignal.timeout(timeoutMs), ...(body?.pipe ? { duplex: "half" } : {}), ...options });
    } catch {
      throw new ProviderError(safeToRetry ? "The platform did not respond. Bridge will try again." : "The platform did not confirm the request. Check its result before retrying.", { retryable: safeToRetry, uncertain: !safeToRetry, code: "provider_connection" });
    }
    if (response.status === 429) {
      const after = response.headers.get("retry-after");
      const reset = response.headers.get("x-rate-limit-reset") || response.headers.get("ratelimit-reset");
      let retryAt = after ? (/^\d+(\.\d+)?$/.test(after) ? this.clock() + Number(after) * 1000 : Date.parse(after)) : reset ? Number(reset) * 1000 : null;
      if (!Number.isFinite(retryAt) || retryAt <= this.clock()) retryAt = null;
      throw new ProviderError("The platform's posting allowance has been reached. This delivery is queued.", { retryable: true, retryAt, code: "rate_limited" });
    }
    if (response.status === 401) throw new ProviderError("Reconnect this social account to renew its permissions.", { reconnect: true, code: "reconnect_required" });
    if (response.status >= 500) throw new ProviderError("The platform is temporarily unavailable.", { retryable: safeToRetry, uncertain: !safeToRetry, code: "provider_unavailable" });
    if (raw && (response.ok || acceptStatuses.includes(response.status))) return response;
    let text;
    try { text = await response.text(); }
    catch { throw new ProviderError(safeToRetry ? "The platform response was interrupted. Bridge will try again." : "The platform response was interrupted. Check whether it published before retrying.", { retryable: safeToRetry, uncertain: !safeToRetry, code: "provider_connection" }); }
    let data;
    try { data = text ? JSON.parse(text) : {}; } catch {
      if (response.ok && text.trim()) throw new ProviderError("The platform returned an unreadable response.", { retryable: safeToRetry, uncertain: !safeToRetry, code: "provider_response" });
      data = {};
    }
    const providerCode = data?.error?.code || data?.errors?.[0]?.reason || data?.error;
    if (!response.ok) {
      const graphHost = ["graph.facebook.com", "graph.instagram.com", "graph.threads.net"].includes(parsed.hostname);
      const rateLimited = graphHost && [4, 17, 32, 341, 613, 80001, 80002, 80004, 80006].includes(Number(data?.error?.code)) || /quotaExceeded|dailyLimitExceeded|rate.limit|too_many|spam_risk_too_many_posts|publishing.limit|request.limit/i.test(JSON.stringify(data?.error || data?.errors || {}));
      const auth = graphHost && Number(data?.error?.code) === 190 || /permission|scope|expired|invalid_token/i.test(JSON.stringify(data?.error || data?.errors || {}));
      throw new ProviderError(rateLimited ? "The platform's allowance has been reached. This delivery is queued." : auth ? "This account needs additional publishing permissions. Reconnect it after enabling them." : `The platform rejected the request (HTTP ${response.status}). Check the account permissions and post settings.`, {
        code: rateLimited ? "rate_limited" : auth ? "reconnect_required" : "provider_rejected", retryable: rateLimited, reconnect: auth,
        details: typeof providerCode === "string" || typeof providerCode === "number" ? { providerCode } : null,
      });
    }
    // TikTok reports many failures in successful HTTP responses.
    if (data?.error?.code && data.error.code !== "ok") {
      const limited = /rate_limit|too_many|spam_risk_too_many_posts/.test(data.error.code);
      throw new ProviderError(limited ? "This account has reached its publishing allowance." : "The platform could not complete the request. Check this account's permissions and post settings.", { retryable: limited, code: limited ? "rate_limited" : "provider_rejected", details: { providerCode: data.error.code } });
    }
    return data;
  }
}
