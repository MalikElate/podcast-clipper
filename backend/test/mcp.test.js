import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { BridgeApplication } from "../src/bridge/BridgeApplication.js";
import { SqliteStore } from "../src/bridge/storage/SqliteStore.js";
import { generateKeyPair, exportJWK, createLocalJWKSet, SignJWT } from "jose";

function schemaPortabilityProblems(value, path = "$", problems = []) {
  if (!value || typeof value !== "object") return problems;
  if (Array.isArray(value)) {
    value.forEach((item, index) => schemaPortabilityProblems(item, `${path}[${index}]`, problems));
    return problems;
  }
  if (Array.isArray(value.type)) problems.push(`${path}.type uses an array`);
  if (value.additionalProperties && typeof value.additionalProperties === "object" && !Array.isArray(value.additionalProperties) && Object.keys(value.additionalProperties).length === 0) {
    problems.push(`${path}.additionalProperties is unconstrained`);
  }
  Object.entries(value).forEach(([key, child]) => schemaPortabilityProblems(child, `${path}.${key}`, problems));
  return problems;
}

async function setup(t, { oauthKeys } = {}) {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "meadow-mcp-test-"));
  const application = new BridgeApplication({
    store: new SqliteStore(),
    ...(oauthKeys ? { mcpOAuthKeyResolver: createLocalJWKSet({ keys: [oauthKeys.jwk] }) } : {}),
    env: {
      NODE_ENV: "test",
      BRIDGE_DATA_DIR: temporaryRoot,
      BRIDGE_APP_URL: "http://localhost:5173",
      BRIDGE_PUBLIC_URL: "http://localhost:8787",
      BRIDGE_MEDIA_SIGNING_KEY: "test-signing-key",
      BRIDGE_PUBLISHING_ENABLED: "false",
      ...(oauthKeys ? { CLERK_MCP_ISSUER: "https://clerk.example.com" } : {}),
    },
  });
  const owner = oauthKeys ? "user_alice" : "alice";
  const project = application.projects.create(owner, { name: "MCP project", timeZone: "Africa/Douala" });
  const { key } = application.apiKeys.create(owner, { name: "MCP test" });
  const server = await new Promise((resolve, reject) => {
    const listener = application.app.listen(0, "127.0.0.1", () => resolve(listener));
    listener.on("error", reject);
  });
  const endpoint = new URL(`http://127.0.0.1:${server.address().port}/mcp`);
  const transport = new StreamableHTTPClientTransport(endpoint, { requestInit: { headers: { Authorization: `Bearer ${key}` } } });
  const client = new Client({ name: "meadow-test-client", version: "1.0.0" });
  await client.connect(transport);
  t.after(async () => {
    await client.close().catch(() => {});
    await new Promise(resolve => server.close(resolve));
    application.close();
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  });
  return { application, project, endpoint, key, client };
}

test("MCP requires an API key and exposes Meadow's initial tool contract", async t => {
  const h = await setup(t);
  const unauthenticated = await fetch(h.endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
  });
  assert.equal(unauthenticated.status, 401);
  assert.match(unauthenticated.headers.get("www-authenticate"), /Bearer/);

  const malformed = await fetch(h.endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", Authorization: `Bearer ${h.key}` },
    body: "{not-json",
  });
  assert.equal(malformed.status, 400);
  assert.equal((await malformed.json()).error.code, -32700);

  const listed = await h.client.listTools();
  assert.deepEqual(listed.tools.map(tool => tool.name), [
    "get_profile",
    "list_projects",
    "list_accounts",
    "list_posts",
    "get_post",
    "create_draft",
    "get_analytics",
  ]);
  assert.equal(listed.tools.find(tool => tool.name === "create_draft").annotations.idempotentHint, true);
  assert.equal(listed.tools.find(tool => tool.name === "get_analytics").annotations.readOnlyHint, true);
  for (const tool of listed.tools) {
    assert.deepEqual(tool._meta.securitySchemes, [{ type: "oauth2", scopes: tool.name === "create_draft" ? ["meadow:read", "meadow:draft"] : ["meadow:read"] }]);
  }
  assert.deepEqual(listed.tools.flatMap(tool => [
    ...schemaPortabilityProblems(tool.inputSchema, `${tool.name}.inputSchema`),
    ...schemaPortabilityProblems(tool.outputSchema, `${tool.name}.outputSchema`),
  ]), []);
});

test("MCP exposes a TikTok inbox handoff without calling it published", async t => {
  const h = await setup(t), now = Date.now();
  const { posts: [draft] } = h.application.posts.createDrafts("alice", h.project.id, { requestId: "mcp-tiktok-inbox-history", items: [{ caption: "Finish editing in TikTok", mediaIds: [], accountIds: [], schedule: { mode: "now", timeZone: "UTC" } }] });
  h.application.store.put("post", { ...h.application.store.get("post", draft.id), accountIds: ["tiktok"], overrides: { tiktok: { settings: { deliveryMode: "inbox", uploadConsent: true } } } });
  h.application.store.put("delivery", { id: "inbox-handoff", postId: draft.id, accountId: "tiktok", ownerUid: "alice", projectId: h.project.id, platform: "tiktok", status: "awaiting_publish", requestedAt: now, dueAt: now, deliveredAt: now, externalId: "transfer-id" });
  const result = await h.client.callTool({ name: "list_posts", arguments: { projectId: h.project.id, status: "awaiting_publish" } });
  assert.ok(!result.isError);
  const post = result.structuredContent.posts[0];
  assert.equal(post.status, "awaiting_publish");
  assert.equal(post.deliveries[0].deliveryMode, "inbox");
  assert.equal(post.deliveries[0].deliveredAt, now);
  assert.equal(post.editable, false);
  const analytics = await h.client.callTool({ name: "get_analytics", arguments: { projectId: h.project.id } });
  assert.equal(analytics.structuredContent.publishedCount, 0);
});

test("MCP lists the authenticated owner's project and creates one idempotent non-empty draft", async t => {
  const h = await setup(t);
  const profile = await h.client.callTool({ name: "get_profile", arguments: {} });
  assert.deepEqual(profile.structuredContent, { id: "alice", nickname: "Meadow workspace" });

  const projects = await h.client.callTool({ name: "list_projects", arguments: {} });
  assert.equal(projects.structuredContent.projects.length, 1);
  assert.equal(projects.structuredContent.projects[0].id, h.project.id);

  const input = {
    projectId: h.project.id,
    requestId: "mcp-draft-create-12345",
    caption: "Created through Meadow MCP",
  };
  const first = await h.client.callTool({ name: "create_draft", arguments: input });
  assert.equal(first.isError, undefined);
  assert.equal(first.structuredContent.post.status, "draft");
  assert.equal(first.structuredContent.duplicate, false);

  const duplicate = await h.client.callTool({ name: "create_draft", arguments: input });
  assert.equal(duplicate.structuredContent.duplicate, true);
  assert.equal(duplicate.structuredContent.post.id, first.structuredContent.post.id);
  assert.equal(h.application.store.list("post", { projectId: h.project.id }).length, 1);

  const posts = await h.client.callTool({ name: "list_posts", arguments: { projectId: h.project.id, status: "draft" } });
  assert.equal(posts.structuredContent.total, 1);
  assert.equal(posts.structuredContent.posts[0].caption, input.caption);

  const empty = await h.client.callTool({ name: "create_draft", arguments: { ...input, requestId: "mcp-empty-draft-12345", caption: " " } });
  assert.equal(empty.isError, true);
  assert.match(empty.content[0].text, /add text, a title, or media/i);
  assert.equal(h.application.store.list("post", { projectId: h.project.id }).length, 1);
});

test("MCP API keys cannot read another owner's project", async t => {
  const h = await setup(t);
  const other = h.application.projects.create("bob", { name: "Private project", timeZone: "UTC" });
  const response = await h.client.callTool({ name: "list_posts", arguments: { projectId: other.id } });
  assert.equal(response.isError, true);
  assert.match(response.content[0].text, /project not found/i);
});

async function oauthSetup(t) {
  const pair = await generateKeyPair("RS256");
  const jwk = { ...await exportJWK(pair.publicKey), kid: "oauth-test", alg: "RS256" };
  const h = await setup(t, { oauthKeys: { jwk } });
  h.oauthToken = (scope = "meadow:read meadow:draft", claims = {}) => new SignJWT({ scope, client_id: "https://chatgpt.com/oauth/client.json", ...claims })
    .setProtectedHeader({ alg: "RS256", typ: "at+jwt", kid: "oauth-test" })
    .setIssuer("https://clerk.example.com").setSubject("user_alice")
    .setAudience("http://localhost:8787/mcp").setIssuedAt().setExpirationTime("5m").sign(pair.privateKey);
  h.oauthClient = async token => {
    const client = new Client({ name: "oauth-test", version: "1.0.0" });
    await client.connect(new StreamableHTTPClientTransport(h.endpoint, token ? { requestInit: { headers: { Authorization: `Bearer ${token}` } } } : {}));
    t.after(() => client.close().catch(() => {}));
    return client;
  };
  return h;
}

test("OAuth discovery is public but anonymous tools return a linking challenge without workspace data", async t => {
  const h = await oauthSetup(t);
  const url = new URL("/.well-known/oauth-protected-resource/mcp", h.endpoint);
  const metadata = await fetch(url);
  assert.equal(metadata.status, 200);
  assert.equal((await metadata.json()).resource, "http://localhost:8787/mcp");
  assert.equal((await fetch(new URL("/.well-known/oauth-protected-resource", h.endpoint))).status, 200);
  const challenge = await fetch(h.endpoint);
  assert.equal(challenge.status, 401);
  assert.match(challenge.headers.get("www-authenticate"), /resource_metadata=/);
  const anonymous = await h.oauthClient();
  assert.equal((await anonymous.listTools()).tools.length, 7);
  const result = await anonymous.callTool({ name: "list_projects", arguments: {} });
  assert.equal(result.isError, true);
  assert.equal(result.structuredContent, undefined);
  assert.match(result._meta["mcp/www_authenticate"][0], /error_description=/);
  assert.equal(h.application.store.list("post").length, 0);
});

test("OAuth read access cannot create drafts and full access keeps drafts isolated and idempotent", async t => {
  const h = await oauthSetup(t);
  const readClient = await h.oauthClient(await h.oauthToken("meadow:read"));
  const listed = await readClient.callTool({ name: "list_projects", arguments: {} });
  assert.equal(listed.structuredContent.projects[0].id, h.project.id);
  const input = { projectId: h.project.id, requestId: "oauth-draft-test-123456", caption: "OAuth draft" };
  const denied = await readClient.callTool({ name: "create_draft", arguments: input });
  assert.equal(denied.isError, true);
  assert.match(denied._meta["mcp/www_authenticate"][0], /insufficient_scope/);
  assert.equal(h.application.store.list("post").length, 0);
  const client = await h.oauthClient(await h.oauthToken());
  const created = await client.callTool({ name: "create_draft", arguments: input });
  assert.equal(created.structuredContent.post.status, "draft");
  const repeated = await client.callTool({ name: "create_draft", arguments: input });
  assert.equal(repeated.structuredContent.post.id, created.structuredContent.post.id);
  assert.equal(repeated.structuredContent.duplicate, true);
  assert.equal(h.application.store.list("delivery").length, 0);
  const other = h.application.projects.create("user_bob", { name: "Private", timeZone: "UTC" });
  const forbidden = await client.callTool({ name: "list_posts", arguments: { projectId: other.id } });
  assert.equal(forbidden.isError, true);
  assert.match(forbidden.content[0].text, /project not found/i);
});

test("OAuth rejects invalid credentials while existing API keys still work", async t => {
  const h = await oauthSetup(t);
  const response = await fetch(h.endpoint, { headers: { Authorization: "Bearer invalid-token" } });
  assert.equal(response.status, 401);
  assert.match(response.headers.get("www-authenticate"), /invalid_token/);
  const profile = await h.client.callTool({ name: "get_profile", arguments: {} });
  assert.equal(profile.structuredContent.id, "user_alice");
});
