import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPair, exportJWK, createLocalJWKSet, SignJWT } from "jose";
import { createMeadowMcpOAuth, meadowMcpScopes } from "../src/bridge/mcp/MeadowMcpOAuth.js";
import { createMeadowMcpServer } from "../src/bridge/mcp/MeadowMcpServer.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { z } from "zod";

const issuer = "https://clerk.findmeadow.com";
const resource = "https://findmeadow.com/mcp";
const keys = await generateKeyPair("RS256");
const jwk = { ...await exportJWK(keys.publicKey), kid: "test-key", alg: "RS256", use: "sig" };
const oauth = createMeadowMcpOAuth({ issuer, resource, keyResolver: createLocalJWKSet({ keys: [jwk] }) });

function token({ claims = {}, type = "at+jwt", signingKey = keys.privateKey } = {}) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ iss: issuer, aud: resource, sub: "user_alice", iat: now, exp: now + 300, scope: "meadow:read meadow:draft", ...claims })
    .setProtectedHeader({ alg: "RS256", typ: type, kid: "test-key" }).sign(signingKey);
}

test("MCP OAuth advertises canonical resource, issuer and scoped permissions", () => {
  assert.equal(oauth.metadata.resource, resource);
  assert.deepEqual(oauth.metadata.authorization_servers, [issuer]);
  assert.deepEqual(oauth.metadata.scopes_supported, ["meadow:read", "meadow:draft", "meadow:media", "meadow:publish"]);
  assert.match(oauth.challenge(), /resource_metadata="https:\/\/findmeadow.com\/\.well-known\/oauth-protected-resource\/mcp"/);
  assert.equal(createMeadowMcpOAuth({ resource }), null);
  assert.throws(() => createMeadowMcpOAuth({ issuer: "http://clerk.findmeadow.com", resource }));
  assert.throws(() => createMeadowMcpOAuth({ issuer: "https://clerk.findmeadow.com/other", resource }));
});

test("MCP verifies signed resource-bound OAuth JWTs and both Clerk scope encodings", async () => {
  assert.deepEqual(await oauth.verify(await token()), { uid: "user_alice", scopes: ["meadow:read", "meadow:draft"] });
  assert.deepEqual(await oauth.verify(await token({ claims: { scope: undefined, scp: ["meadow:read"] }, type: "application/at+jwt" })), { uid: "user_alice", scopes: ["meadow:read"] });
});

test("MCP rejects expired, premature, wrong-issuer and wrong-resource credentials", async () => {
  const now = Math.floor(Date.now() / 1000);
  for (const claims of [
    { exp: now - 30 }, { nbf: now + 60 }, { iss: "https://another.clerk.accounts.dev" },
    { aud: "https://another.example/mcp" }, { aud: undefined }, { exp: undefined },
    { sub: "mch_machine" }, { scope: "openid profile" }, { scope: undefined }, { scp: ["meadow:read", 42] },
  ]) {
    await assert.rejects(oauth.verify(await token({ claims })));
  }
});

test("MCP rejects forged signatures, session tokens and OIDC ID tokens", async () => {
  const attacker = await generateKeyPair("RS256");
  await assert.rejects(oauth.verify(await token({ signingKey: attacker.privateKey })));
  await assert.rejects(oauth.verify(await token({ type: "JWT" })));
  await assert.rejects(oauth.verify("oat_not-a-resource-bound-jwt"));
});

test("MCP tool authorization errors carry the exact re-linking scope challenge", () => {
  const denied = oauth.toolError([meadowMcpScopes.read, meadowMcpScopes.draft], true);
  assert.equal(denied.isError, true);
  assert.match(denied._meta["mcp/www_authenticate"][0], /error="insufficient_scope"/);
  assert.match(denied._meta["mcp/www_authenticate"][0], /scope="meadow:read meadow:draft"/);
  assert.match(oauth.toolError([meadowMcpScopes.read], false)._meta["mcp/www_authenticate"][0], /error_description=/);
});

test("real MCP transport exposes OAuth descriptors and prevents unauthorized handlers from running", async t => {
  for (const identity of [undefined, "user_alice"]) {
    const server = createMeadowMcpServer({ mcpOAuth: oauth }, identity, { authType: "oauth_token", scopes: [meadowMcpScopes.read] });
    const client = new Client({ name: "oauth-transport-test", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    t.after(async () => { await client.close(); await server.close(); });
    // The current SDK client's standard ToolSchema strips extension fields.
    // Inspect the response with a permissive schema to check what is on the wire.
    const tools = (await client.request({ method: "tools/list" }, z.object({ tools: z.array(z.looseObject({ name: z.string() })) }))).tools;
    assert.equal(tools.length, 7);
    for (const tool of tools) assert.deepEqual(tool.securitySchemes, tool._meta.securitySchemes);
    const draft = await client.callTool({ name: "create_draft", arguments: { projectId: "project", requestId: "scope-test-123456789", caption: "Test" } });
    assert.equal(draft.isError, true);
    assert.match(draft._meta["mcp/www_authenticate"][0], identity ? /insufficient_scope/ : /invalid_token/);
    const profile = await client.callTool({ name: "get_profile", arguments: {} });
    if (identity) assert.equal(profile.structuredContent.id, identity);
    else assert.equal(profile.isError, true);
  }
});
