import { normalizeCountryCode } from "../backend/src/bridge/shared/geography.js";

// Only Cloudflare's request metadata may set this internal header. A visitor's
// identically named header is removed before forwarding to the private backend.
export function withVisitorCountry(request) {
  const headers = new Headers(request.headers);
  headers.delete("x-meadow-visitor-country");
  const country = normalizeCountryCode(request.cf?.country);
  if (country) headers.set("x-meadow-visitor-country", country);
  return new Request(request, { headers });
}
