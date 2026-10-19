// Bluesky identifies Meadow by the URL of its client metadata document and
// fetches it, with the JWKS it names, on every token refresh. The backend's
// OAuth client and the Cloudflare Worker that serves both documents (so those
// fetches do not keep the backend container awake) share this definition.
export const BLUESKY_CLIENT_METADATA_PATH = "/oauth/bluesky/client-metadata.json";
export const BLUESKY_JWKS_PATH = "/oauth/bluesky/jwks.json";
export const BLUESKY_KEY_ID = "bridge-1";

export function blueskyClientMetadata(publicUrl) {
  return {
    client_id: `${publicUrl}${BLUESKY_CLIENT_METADATA_PATH}`, client_name: "Meadow", client_uri: publicUrl,
    policy_uri: new URL("/privacy", publicUrl).href, tos_uri: new URL("/terms", publicUrl).href,
    redirect_uris: [`${publicUrl}/oauth/bluesky/callback`], grant_types: ["authorization_code", "refresh_token"], response_types: ["code"],
    scope: "atproto transition:generic", application_type: "web", token_endpoint_auth_method: "private_key_jwt",
    token_endpoint_auth_signing_alg: "ES256", dpop_bound_access_tokens: true, jwks_uri: `${publicUrl}${BLUESKY_JWKS_PATH}`,
    // Defaults the official client fills in; stated so the Worker serves the same document.
    subject_type: "public", authorization_signed_response_alg: "RS256",
  };
}
