import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { BridgeApplication } from "../src/bridge/BridgeApplication.js";
import { SqliteStore } from "../src/bridge/storage/SqliteStore.js";

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

async function setup(t) {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "meadow-mcp-test-"));
  const application = new BridgeApplication({
    store: new SqliteStore(),
    env: {
      NODE_ENV: "test",
      BRIDGE_DATA_DIR: temporaryRoot,
      BRIDGE_APP_URL: "http://localhost:5173",
      BRIDGE_PUBLIC_URL: "http://localhost:8787",
      BRIDGE_MEDIA_SIGNING_KEY: "test-signing-key",
      BRIDGE_PUBLISHING_ENABLED: "false",
    },
  });
  const project = application.projects.create("alice", { name: "MCP project", timeZone: "Africa/Douala" });
  const { key } = application.apiKeys.create("alice", { name: "MCP test" });
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
  assert.deepEqual(listed.tools.flatMap(tool => [
    ...schemaPortabilityProblems(tool.inputSchema, `${tool.name}.inputSchema`),
    ...schemaPortabilityProblems(tool.outputSchema, `${tool.name}.outputSchema`),
  ]), []);
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
