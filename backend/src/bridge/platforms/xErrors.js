import { ProviderError } from "../core/errors.js";

// X can return an HTTP 200 envelope containing only errors. Never turn that into
// zero metrics, and never pass response details (which may contain tokens) on.
export function assertXResponse(data, { allowPartial = false } = {}) {
  const errors = [...(Array.isArray(data?.errors) ? data.errors : []), ...(data?.type ? [data] : [])];
  if (!errors.length) return data;
  if (allowPartial && Array.isArray(data?.data) && data.data.length > 0) return data;
  const types = errors.map(error => {
    try { const url = new URL(error.type); return ["api.x.com", "api.twitter.com"].includes(url.hostname) ? url.pathname.split("/").pop() : "unknown"; }
    catch { return "unknown"; }
  });
  const known = [
    ["usage-capped", "x_credits_required", "X's API usage allowance is exhausted. Check the app's usage and credits."],
    ["rate-limit-exceeded", "rate_limited", "X has temporarily limited analytics requests."],
    ["client-forbidden", "x_app_access_required", "X has not granted Meadow's app access to these analytics."],
    ["not-authorized-for-resource", "provider_permissions", "X has not granted this connection access to these analytics."],
    ["resource-not-found", "x_resource_missing", "X could not find this account or its posts."],
    ["invalid-request", "x_invalid_request", "X rejected the analytics request parameters."],
  ].find(([type]) => types.includes(type));
  throw new ProviderError(known?.[2] || "X did not return the requested analytics.", { code: known?.[1] || "x_response_incomplete" });
}
