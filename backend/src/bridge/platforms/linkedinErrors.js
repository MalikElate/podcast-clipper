import { ProviderError } from "../core/errors.js";

// LinkedIn REST errors look like { status, serviceErrorCode, code, message }.
// Keep the status and codes so a failed delivery says why LinkedIn refused it,
// but never store the message itself: it can echo the post's text.
export function assertLinkedInResponse(data, { status, method = "GET" }) {
  const message = typeof data?.message === "string" ? data.message : "";
  const details = {
    provider: "linkedin",
    httpStatus: status,
    ...(typeof data?.code === "string" ? { providerCode: data.code } : {}),
    ...(Number.isInteger(data?.serviceErrorCode) ? { serviceErrorCode: data.serviceErrorCode } : {}),
  };
  const reference = ` (LinkedIn HTTP ${status}${details.serviceErrorCode !== undefined ? `, code ${details.serviceErrorCode}` : ""})`;
  if (/duplicate/i.test(message) || data?.code === "DUPLICATE_POST") {
    throw new ProviderError(`LinkedIn blocks posting the same text twice from one account. Change the text and try again.${reference}`, { code: "linkedin_duplicate", details });
  }
  // LinkedIn answers 401 for an expired or revoked token. A 403 on a read means
  // Meadow's app lacks that read permission (r_member_social, for example), which
  // reconnecting cannot grant, so it must not mark the account for reconnection.
  if (status === 403 && method === "GET") {
    throw new ProviderError(`LinkedIn does not let Meadow read this for the account. The connection is unaffected.${reference}`, { code: "linkedin_read_permission", details });
  }
  if (status === 403) {
    throw Object.assign(new ProviderError(`LinkedIn has not given Meadow permission to post as this account. Reconnect LinkedIn and approve sharing.${reference}`, { reconnect: true, code: "reconnect_required", details }), { authFailure: "access_token" });
  }
  throw new ProviderError(`LinkedIn rejected the post. Check its text and media.${reference}`, { code: "provider_rejected", details });
}
