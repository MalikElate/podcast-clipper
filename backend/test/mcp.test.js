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
import { randomBytes } from "node:crypto";
import { PlatformProvider } from "../src/bridge/platforms/PlatformProvider.js";
import { ProviderRegistry } from "../src/bridge/platforms/ProviderRegistry.js";

class FakeProvider extends PlatformProvider {
  constructor() { super("x"); }
  get configured() { return true; }
  async options() { return { limits: [], remaining: 12, note: "Test allowance." }; }
}

const pdf = Buffer.from("%PDF-1.4\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF\n");

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

async function setup(t, { oauthKeys, registry, downloadMedia } = {}) {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "meadow-mcp-test-"));
  const application = new BridgeApplication({
    store: new SqliteStore(),
    ...(registry ? { registry } : {}),
    ...(downloadMedia ? { downloadMedia } : {}),
    ...(oauthKeys ? { mcpOAuthKeyResolver: createLocalJWKSet({ keys: [oauthKeys.jwk] }) } : {}),
    env: {
      NODE_ENV: "test",
      BRIDGE_DATA_DIR: temporaryRoot,
      BRIDGE_APP_URL: "http://localhost:5173",
      BRIDGE_PUBLIC_URL: "http://localhost:8787",
      BRIDGE_MEDIA_SIGNING_KEY: "test-signing-key",
      BRIDGE_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
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
    "get_account_options",
    "upload_media",
    "create_upload_url",
    "preview_post",
    "publish_post",
    "publish_draft",
    "get_analytics",
  ]);
  assert.equal(listed.tools.find(tool => tool.name === "create_draft").annotations.idempotentHint, true);
  assert.equal(listed.tools.find(tool => tool.name === "get_analytics").annotations.readOnlyHint, true);
  assert.equal(listed.tools.find(tool => tool.name === "preview_post").annotations.readOnlyHint, true);
  assert.equal(listed.tools.find(tool => tool.name === "publish_post").annotations.openWorldHint, true);
  for (const name of ["publish_post", "publish_draft"]) {
    assert.equal(listed.tools.find(tool => tool.name === name).annotations.destructiveHint, true);
  }
  assert.deepEqual(listed.tools.find(tool => tool.name === "upload_media")._meta["openai/fileParams"], ["file"]);
  const extra = { create_draft: "meadow:draft", upload_media: "meadow:media", create_upload_url: "meadow:media", publish_post: "meadow:publish", publish_draft: "meadow:publish" };
  for (const tool of listed.tools) {
    assert.deepEqual(tool._meta.securitySchemes, [{ type: "oauth2", scopes: ["meadow:read", ...(extra[tool.name] ? [extra[tool.name]] : [])] }]);
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

async function oauthSetup(t, options = {}) {
  const pair = await generateKeyPair("RS256");
  const jwk = { ...await exportJWK(pair.publicKey), kid: "oauth-test", alg: "RS256" };
  const h = await setup(t, { ...options, oauthKeys: { jwk } });
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

test("OAuth discovery is public and anonymous MCP requests receive a 401 sign-in challenge", async t => {
  const h = await oauthSetup(t);
  const url = new URL("/.well-known/oauth-protected-resource/mcp", h.endpoint);
  const metadata = await fetch(url);
  assert.equal(metadata.status, 200);
  assert.equal((await metadata.json()).resource, "http://localhost:8787/mcp");
  assert.equal((await fetch(new URL("/.well-known/oauth-protected-resource", h.endpoint))).status, 200);
  const challenge = await fetch(h.endpoint);
  assert.equal(challenge.status, 401);
  assert.match(challenge.headers.get("www-authenticate"), /resource_metadata=/);
  for (const method of ["initialize", "tools/list", "tools/call"]) {
    const response = await fetch(h.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: method === "tools/call" ? { name: "list_projects", arguments: {} } : {} }),
    });
    assert.equal(response.status, 401, method);
    assert.match(response.headers.get("www-authenticate"), /resource_metadata="http:\/\/localhost:8787\/\.well-known\/oauth-protected-resource\/mcp"/);
    assert.match(response.headers.get("www-authenticate"), /scope="meadow:read meadow:draft meadow:media meadow:publish"/);
  }
  await assert.rejects(h.oauthClient());
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

function connectAccount(application, projectId, owner, id = "x-account") {
  return application.store.put("account", { id, ownerUid: owner, projectId, platform: "x", remoteId: id, label: "@meadow", rateKey: `x:${id}`, status: "connected", encryptedCredentials: application.vault.encrypt({ accessToken: "test-token" }, `account:${id}`) });
}

test("MCP uploads inline and linked media into the owner's project", async t => {
  const downloads = [];
  const h = await setup(t, { downloadMedia: async (url, destination) => { downloads.push(url); await fs.promises.writeFile(destination, pdf); return { filename: "remote.pdf", bytes: pdf.length }; } });
  const inline = await h.client.callTool({ name: "upload_media", arguments: { projectId: h.project.id, data: pdf.toString("base64"), filename: "inline.pdf" } });
  assert.equal(inline.isError, undefined, inline.content?.[0]?.text);
  assert.equal(inline.structuredContent.media.kind, "document");
  assert.equal(inline.structuredContent.media.filename, "inline.pdf");
  assert.equal(inline.structuredContent.media.status, "ready");

  const linked = await h.client.callTool({ name: "upload_media", arguments: { projectId: h.project.id, url: "https://cdn.example.com/deck.pdf" } });
  assert.equal(linked.structuredContent.media.filename, "remote.pdf");
  const attached = await h.client.callTool({ name: "upload_media", arguments: { projectId: h.project.id, file: { download_url: "https://files.example.com/abc", file_id: "file_123", file_name: "attached.pdf" } } });
  assert.equal(attached.structuredContent.media.filename, "attached.pdf");
  assert.deepEqual(downloads, ["https://cdn.example.com/deck.pdf", "https://files.example.com/abc"]);
  // Larger than the 2 MB JSON limit used elsewhere, which /mcp lifts once a client is authenticated.
  const large = await h.client.callTool({ name: "upload_media", arguments: { projectId: h.project.id, data: Buffer.concat([pdf, Buffer.alloc(3 * 1024 ** 2)]).toString("base64") } });
  assert.equal(large.isError, undefined, large.content?.[0]?.text);
  assert.equal(large.structuredContent.media.bytes, pdf.length + 3 * 1024 ** 2);
  assert.equal(h.application.media.list("alice", h.project.id).length, 4);
  assert.deepEqual(fs.readdirSync(h.application.incomingDirectory), []);

  const both = await h.client.callTool({ name: "upload_media", arguments: { projectId: h.project.id, url: "https://cdn.example.com/a.pdf", data: pdf.toString("base64") } });
  assert.equal(both.isError, true);
  assert.match(both.content[0].text, /exactly one of url, data or file/);
  const garbage = await h.client.callTool({ name: "upload_media", arguments: { projectId: h.project.id, data: "not base64!" } });
  assert.match(garbage.content[0].text, /base64/);
  const text = await h.client.callTool({ name: "upload_media", arguments: { projectId: h.project.id, data: Buffer.from("plain text").toString("base64") } });
  assert.match(text.content[0].text, /cannot be posted/);
  const other = h.application.projects.create("bob", { name: "Private", timeZone: "UTC" });
  const forbidden = await h.client.callTool({ name: "upload_media", arguments: { projectId: other.id, data: pdf.toString("base64") } });
  assert.match(forbidden.content[0].text, /project not found/i);
  assert.equal(h.application.media.list("bob", other.id).length, 0);
});

test("MCP upload links accept one file of the declared size", async t => {
  const h = await setup(t);
  const link = await h.client.callTool({ name: "create_upload_url", arguments: { projectId: h.project.id, bytes: pdf.length } });
  assert.equal(link.isError, undefined, link.content?.[0]?.text);
  const { uploadUrl, headers, fileField } = link.structuredContent;
  assert.equal(new URL(uploadUrl).pathname, `/api/bridge/projects/${h.project.id}/media`);
  assert.match(link.structuredContent.example, /curl -X POST/);
  const target = new URL(new URL(uploadUrl).pathname, h.endpoint);
  const form = () => { const body = new FormData(); body.append(fileField, new Blob([pdf], { type: "application/pdf" }), "linked.pdf"); return body; };
  const uploaded = await fetch(target, { method: "POST", headers, body: form() });
  assert.equal(uploaded.status, 201);
  assert.equal((await uploaded.json()).media.filename, "linked.pdf");
  const reused = await fetch(target, { method: "POST", headers, body: form() });
  assert.equal(reused.status, 401);
});

test("MCP previews and publishes posts, and publishes saved drafts once", async t => {
  const h = await setup(t, { registry: new ProviderRegistry([new FakeProvider()]) });
  const account = connectAccount(h.application, h.project.id, "alice");
  const options = await h.client.callTool({ name: "get_account_options", arguments: { projectId: h.project.id, accountId: account.id } });
  assert.deepEqual(options.structuredContent, { accountId: account.id, platform: "x", remainingPosts: 12, note: "Test allowance." });

  const empty = await h.client.callTool({ name: "preview_post", arguments: { projectId: h.project.id, accountIds: [account.id], caption: " " } });
  assert.equal(empty.structuredContent.preview.valid, false);
  assert.match(empty.structuredContent.preview.destinations[0].errors.join(" "), /caption or media/);
  const rejected = await h.client.callTool({ name: "publish_post", arguments: { projectId: h.project.id, requestId: "mcp-publish-empty-1234", accountIds: [account.id], caption: " " } });
  assert.equal(rejected.isError, true);
  assert.match(rejected.content[0].text, /invalid_content[\s\S]*caption or media/);
  assert.equal(h.application.store.list("delivery").length, 0);

  const input = { projectId: h.project.id, requestId: "mcp-publish-post-12345", accountIds: [account.id], caption: "Live from Meadow MCP", schedule: { mode: "scheduled", localDateTime: "2099-01-05T09:30" } };
  const preview = await h.client.callTool({ name: "preview_post", arguments: { ...input, requestId: undefined } });
  assert.equal(preview.structuredContent.preview.valid, true);
  const published = await h.client.callTool({ name: "publish_post", arguments: input });
  assert.equal(published.isError, undefined, published.content?.[0]?.text);
  assert.equal(published.structuredContent.post.status, "scheduled");
  assert.equal(published.structuredContent.post.deliveries.length, 1);
  assert.equal(published.structuredContent.duplicate, false);
  const retried = await h.client.callTool({ name: "publish_post", arguments: input });
  assert.equal(retried.structuredContent.duplicate, true);
  assert.equal(retried.structuredContent.post.id, published.structuredContent.post.id);
  assert.equal(h.application.store.list("delivery").length, 1);

  const draft = await h.client.callTool({ name: "create_draft", arguments: { projectId: h.project.id, requestId: "mcp-draft-to-publish-1", caption: "Saved first", accountIds: [account.id] } });
  const draftId = draft.structuredContent.post.id;
  const stale = await h.client.callTool({ name: "publish_draft", arguments: { projectId: h.project.id, postId: draftId, requestId: "mcp-publish-draft-stale", revision: draft.structuredContent.post.revision + 1 } });
  assert.match(stale.content[0].text, /revision_conflict/);
  const sent = await h.client.callTool({ name: "publish_draft", arguments: { projectId: h.project.id, postId: draftId, requestId: "mcp-publish-draft-12345" } });
  assert.equal(sent.isError, undefined, sent.content?.[0]?.text);
  assert.equal(sent.structuredContent.post.id, draftId);
  assert.equal(sent.structuredContent.post.status, "scheduled");
  const again = await h.client.callTool({ name: "publish_draft", arguments: { projectId: h.project.id, postId: draftId, requestId: "mcp-publish-draft-other1" } });
  assert.equal(again.isError, true);
  assert.equal(h.application.store.list("delivery").filter(item => item.postId === draftId).length, 1);
});

test("OAuth upload and publishing tools each need their own scope", async t => {
  const h = await oauthSetup(t, { registry: new ProviderRegistry([new FakeProvider()]) });
  const account = connectAccount(h.application, h.project.id, "user_alice");
  const upload = { projectId: h.project.id, data: pdf.toString("base64") };
  const publish = { projectId: h.project.id, requestId: "oauth-publish-post-123", accountIds: [account.id], caption: "Scoped" };

  const drafter = await h.oauthClient(await h.oauthToken("meadow:read meadow:draft"));
  for (const [name, args, scope] of [["upload_media", upload, "meadow:media"], ["create_upload_url", { projectId: h.project.id, bytes: 10 }, "meadow:media"], ["publish_post", publish, "meadow:publish"]]) {
    const denied = await drafter.callTool({ name, arguments: args });
    assert.equal(denied.isError, true, name);
    const challenge = denied._meta["mcp/www_authenticate"][0];
    assert.match(challenge, /error="insufficient_scope"/, name);
    assert.ok(challenge.includes(`scope="meadow:read ${scope}"`), name);
  }
  assert.equal(h.application.store.list("media").length, 0);
  assert.equal(h.application.store.list("delivery").length, 0);

  const uploader = await h.oauthClient(await h.oauthToken("meadow:read meadow:media"));
  assert.equal((await uploader.callTool({ name: "upload_media", arguments: upload })).structuredContent.media.kind, "document");
  assert.equal((await uploader.callTool({ name: "publish_post", arguments: publish })).isError, true);

  const publisher = await h.oauthClient(await h.oauthToken("meadow:read meadow:publish"));
  const published = await publisher.callTool({ name: "publish_post", arguments: publish });
  assert.equal(published.isError, undefined, published.content?.[0]?.text);
  assert.equal(published.structuredContent.post.deliveries.length, 1);
});
