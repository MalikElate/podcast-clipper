import { ProviderError } from "../core/errors.js";

// LinkedIn REST errors look like { status, serviceErrorCode, code, message }.
// Keep the status and codes so a failed delivery says why LinkedIn refused it,
// but never store the message itself: it can echo the post's text.
export function assertLinkedInResponse(data, { status }) {
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
  if (status === 403) {
    throw Object.assign(new ProviderError(`LinkedIn has not given Meadow permission to post as this account. Reconnect LinkedIn and approve sharing.${reference}`, { reconnect: true, code: "reconnect_required", details }), { authFailure: "access_token" });
  }
  throw new ProviderError(`LinkedIn rejected the post. Check its text and media.${reference}`, { code: "provider_rejected", details });
}
