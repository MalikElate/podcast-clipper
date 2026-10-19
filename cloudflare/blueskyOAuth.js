import { BLUESKY_CLIENT_METADATA_PATH, BLUESKY_JWKS_PATH, BLUESKY_KEY_ID, blueskyClientMetadata } from "../backend/src/bridge/shared/blueskyOAuth.js";

// Bluesky fetches both documents each time the backend refreshes a Bluesky
// session. Served by the backend, those fetches renewed the container's sleep
// timer, so its own refreshes kept it running around the clock.
export const isBlueskyOAuthDocument = pathname => pathname === BLUESKY_CLIENT_METADATA_PATH || pathname === BLUESKY_JWKS_PATH;

// The same public key @atproto/jwk-jose publishes for a PKCS8 private key.
const PUBLIC_KEY_OPS = ["verify", "encrypt", "wrapKey"];
let cachedJwks;

export async function blueskyPublicJwks(privateKey) {
  const pem = String(privateKey || "").replaceAll("\\n", "\n").trim();
  if (!pem.startsWith("-----BEGIN PRIVATE KEY-----")) throw new Error("Expected a PKCS8 private key.");
  const der = Uint8Array.from(atob(pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "")), char => char.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", der, { name: "ECDSA", namedCurve: "P-256" }, true, ["sign"]);
  const { kty, crv, x, y } = await crypto.subtle.exportKey("jwk", key);
  return { keys: [{ kty, kid: BLUESKY_KEY_ID, key_ops: PUBLIC_KEY_OPS, crv, x, y }] };
}

/** Returns null when the backend should answer instead, as it did before. */
export async function blueskyOAuthDocument(request, workerEnv) {
  const { pathname } = new URL(request.url);
  if (!isBlueskyOAuthDocument(pathname) || !["GET", "HEAD"].includes(request.method)) return null;
  const publicUrl = String(workerEnv.BRIDGE_PUBLIC_URL || "").replace(/\/$/, "");
  if (!publicUrl.startsWith("https://") || !workerEnv.BLUESKY_PRIVATE_KEY) return null;
  let body;
  if (pathname === BLUESKY_CLIENT_METADATA_PATH) body = blueskyClientMetadata(publicUrl);
  else {
    if (cachedJwks?.privateKey !== workerEnv.BLUESKY_PRIVATE_KEY) cachedJwks = { privateKey: workerEnv.BLUESKY_PRIVATE_KEY, jwks: blueskyPublicJwks(workerEnv.BLUESKY_PRIVATE_KEY) };
    try { body = await cachedJwks.jwks; }
    catch { cachedJwks = null; return null; }
  }
  return new Response(request.method === "HEAD" ? null : JSON.stringify(body), { headers: { "Content-Type": "application/json; charset=utf-8" } });
}
