import { ProviderError } from "../core/errors.js";

const messages = new Map([
  ["unaudited_client_can_only_post_to_private_accounts", "TikTok has not approved Meadow for public Direct Post. For testing, make your TikTok account private and select Only me for this post. Public posting requires TikTok's approval."],
  ["url_ownership_unverified", "TikTok has not verified the address hosting this media. Meadow's administrator must verify the media domain or URL prefix in the TikTok developer app before posting."],
  ["privacy_level_option_mismatch", "This TikTok audience setting is no longer available. Reload the account's posting options and choose an available audience before trying again."],
  ["scope_not_authorized", "TikTok has not granted permission for this action. Reconnect TikTok and allow the required permission. If it is unavailable, Meadow's administrator must check the app's approved scopes."],
  ["spam_risk_user_banned_from_posting", "TikTok has restricted this account from making new posts. Resolve the account restriction in TikTok before trying again."],
  ["reached_active_user_cap", "Meadow has reached TikTok's daily allowance for active publishing users. Try again after the allowance resets."],
  ["spam_risk_too_many_posts", "This TikTok account has reached its daily posting allowance. Meadow will retry when posting capacity is available."],
  ["spam_risk_too_many_pending_share", "TikTok allows at most five pending uploads within 24 hours. Finish existing uploads from your TikTok inbox and wait for upload capacity before sending more."],
  ["app_version_check_failed", "Update the TikTok app to version 31.8 or newer to receive photos in your TikTok inbox."],
  ["rate_limit_exceeded", "TikTok's request allowance has been reached. Meadow will retry this request."],
  ["invalid_param", "TikTok rejected a post setting or media parameter. Check the selected media and TikTok settings before trying again."],
  ["invalid_params", "TikTok rejected a request parameter. Check the selected media and TikTok settings before trying again."],
]);
const invalidAccessTokens = new Set(["invalid_token", "access_token_invalid", "access_token_expired", "token_expired"]);
const limitedCodes = new Set(["spam_risk_too_many_posts", "spam_risk_too_many_pending_share", "rate_limit_exceeded"]);

// Response messages and unknown codes can contain echoed request data. Retain
// only known codes and TikTok's timestamp-prefixed hexadecimal request IDs.
export function assertTikTokResponse(data, { status, ok }) {
  const code = typeof data?.error === "string" ? data.error : data?.error?.code;
  if (ok && (!code || code === "ok")) return;
  const knownCode = messages.has(code) || invalidAccessTokens.has(code) ? code : null;
  const logId = data?.error?.log_id;
  const details = {
    provider: "tiktok", httpStatus: status,
    ...(knownCode ? { providerCode: knownCode } : {}),
    ...(typeof logId === "string" && /^\d{14}[A-F0-9]{12,50}$/.test(logId) ? { logId } : {}),
  };
  const reference = ` (HTTP ${status}${knownCode ? `, TikTok code: ${knownCode}` : ""}${details.logId ? `, reference: ${details.logId}` : ""})`;
  if (knownCode === "scope_not_authorized") {
    // Refreshing an otherwise valid token cannot add a missing user grant.
    throw new ProviderError(messages.get(knownCode) + reference, { code: "provider_permissions", details });
  }
  if (invalidAccessTokens.has(code) || status === 401 && !knownCode) {
    throw Object.assign(new ProviderError("TikTok rejected this account's access token. Meadow needs to renew its authorization." + reference, { reconnect: true, code: "reconnect_required", details }), { authFailure: "access_token" });
  }
  const limited = limitedCodes.has(knownCode);
  const message = messages.get(knownCode) || "TikTok rejected the request without a recognized error code. Check the account permissions, media, and post settings.";
  throw new ProviderError(message + reference, { code: limited ? "rate_limited" : "provider_rejected", retryable: limited, details });
}
