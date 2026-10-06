import { createRemoteJWKSet, jwtVerify } from "jose";

export const meadowMcpScopes = Object.freeze({ read: "meadow:read", draft: "meadow:draft", media: "meadow:media", publish: "meadow:publish" });
export const meadowMcpMetadataPaths = Object.freeze([
  "/.well-known/oauth-protected-resource/mcp",
  "/.well-known/oauth-protected-resource",
]);

/** Clerk owns sign-in, consent, PKCE, code exchange and refresh. Meadow verifies
 * resource-bound OAuth access tokens; session and ID tokens are not accepted. */
export function createMeadowMcpOAuth({ issuer, resource, keyResolver } = {}) {
  if (!issuer) return null;
  const issuerUrl = new URL(issuer);
  if (issuerUrl.protocol !== "https:" || issuerUrl.username || issuerUrl.password || issuerUrl.search || issuerUrl.hash || issuerUrl.pathname !== "/") {
    throw new Error("CLERK_MCP_ISSUER must be the HTTPS Clerk issuer origin.");
  }
  issuer = issuerUrl.origin;
  const resourceUrl = new URL(resource);
  const metadataUrl = new URL(meadowMcpMetadataPaths[0], resourceUrl).href;
  const keys = keyResolver || createRemoteJWKSet(new URL("/.well-known/jwks.json", issuer), { timeoutDuration: 5000 });
  const metadata = {
    resource,
    resource_name: "Meadow",
    authorization_servers: [issuer],
    scopes_supported: Object.values(meadowMcpScopes),
    bearer_methods_supported: ["header"],
    resource_policy_uri: new URL("/privacy", resourceUrl).href,
    resource_tos_uri: new URL("/terms", resourceUrl).href,
  };

  function challenge({ error, scopes = [meadowMcpScopes.read] } = {}) {
    const description = error === "insufficient_scope" ? "Authorize the required Meadow permissions." : "Sign in to Meadow to continue.";
    return `Bearer resource_metadata="${metadataUrl}", scope="${scopes.join(" ")}"${error ? `, error="${error}", error_description="${description}"` : ""}`;
  }

  return {
    metadata,
    challenge,
    async verify(token) {
      const { payload, protectedHeader } = await jwtVerify(token, keys, {
        issuer,
        audience: resource,
        algorithms: ["RS256"],
        requiredClaims: ["sub", "exp", "iat"],
        clockTolerance: 5,
      });
      // Clerk's OAuth access tokens use these RFC 9068 types. This rejects
      // browser sessions and OIDC ID tokens signed by the same Clerk keys.
      if (!["at+jwt", "application/at+jwt"].includes(protectedHeader.typ) || typeof payload.sub !== "string" || !payload.sub.startsWith("user_")) {
        throw new Error("A Meadow OAuth access token is required.");
      }
      const scopes = Array.isArray(payload.scp) ? payload.scp : typeof payload.scope === "string" ? payload.scope.split(/\s+/) : [];
      if (!scopes.every(scope => typeof scope === "string") || !scopes.includes(meadowMcpScopes.read)) {
        throw new Error("The OAuth token does not grant Meadow read access.");
      }
      return { uid: payload.sub, scopes };
    },
    toolError(scopes, authenticated) {
      return {
        isError: true,
        content: [{ type: "text", text: authenticated ? "Authorize the required Meadow permissions before using this tool." : "Sign in to Meadow before using this tool." }],
        _meta: { "mcp/www_authenticate": [challenge({ error: authenticated ? "insufficient_scope" : "invalid_token", scopes })] },
      };
    },
  };
}
