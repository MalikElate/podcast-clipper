import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { BridgeApplication } from "../src/bridge/BridgeApplication.js";
import { SqliteStore } from "../src/bridge/storage/SqliteStore.js";

async function setup(t) {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "agent-login-test-"));
  let now = Date.now();
  const application = new BridgeApplication({
    store: new SqliteStore(), clock: () => now,
    env: { NODE_ENV: "test", BRIDGE_DATA_DIR: path.join(temporaryRoot, ".bridge"), BRIDGE_APP_URL: "https://app.meadow.example", BRIDGE_PUBLIC_URL: "https://meadow.example", BRIDGE_MEDIA_SIGNING_KEY: "test-signing-key", BRIDGE_PUBLISHING_ENABLED: "false" },
    authMiddleware: (req, res, next) => { if (!/^Bearer (alice|bob)$/.test(req.headers.authorization || "")) return res.status(401).json({ error: "Sign in required" }); req.uid = req.headers.authorization.split(" ")[1]; next(); },
  });
  const server = await new Promise((resolve, reject) => { const server = application.app.listen(0, "127.0.0.1", () => resolve(server)); server.on("error", reject); });
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => { await new Promise(resolve => server.close(resolve)); application.close(); fs.rmSync(temporaryRoot, { recursive: true, force: true }); });
  const request = async (url, { method = "GET", body, user, authorization } = {}) => {
    const response = await fetch(base + url, { method, headers: { ...(user ? { Authorization: `Bearer ${user}` } : authorization ? { Authorization: authorization } : {}), ...(body ? { "Content-Type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, body: await response.json().catch(() => ({})) };
  };
  const start = async (agentName = "Codex cloud") => (await request("/api/agent-login", { method: "POST", body: { agentName } })).body;
  return { application, base, request, start, advance: ms => { now += ms; } };
}

test("an approved agent sign-in mints one named API key that works for REST and MCP", async t => {
  const h = await setup(t);
  const started = await h.start("Claude Code on build server");
  assert.match(started.deviceCode, /^meadow_agent_login_/);
  assert.match(started.userCode, /^[B-DF-HJ-NP-TV-XZ]{4}-[B-DF-HJ-NP-TV-XZ]{4}$/);
  assert.equal(started.verificationUrl, "https://app.meadow.example/dashboard/connect-agent");
  assert.equal(started.verificationUrlComplete, `https://app.meadow.example/dashboard/connect-agent?code=${started.userCode}`);
  assert.equal(started.interval, 5);

  const pending = await h.request("/api/agent-login/poll", { method: "POST", body: { deviceCode: started.deviceCode } });
  assert.equal(pending.status, 202);
  assert.equal(pending.body.status, "pending");

  const lowercase = started.userCode.toLowerCase().replace("-", " ");
  const described = await h.request(`/api/bridge/agent-logins/${encodeURIComponent(lowercase)}`, { user: "alice" });
  assert.equal(described.body.agentName, "Claude Code on build server");
  assert.equal((await h.request(`/api/bridge/agent-logins/${started.userCode}/approve`, { method: "POST", body: {}, user: "alice" })).body.status, "approved");

  const approved = await h.request("/api/agent-login/poll", { method: "POST", body: { deviceCode: started.deviceCode } });
  assert.equal(approved.status, 200);
  assert.match(approved.body.apiKey, /^br_live_/);
  assert.equal(approved.body.keyName, "Claude Code on build server");
  const keys = h.application.apiKeys.list("alice");
  assert.deepEqual(keys.map(key => key.name), ["Claude Code on build server"]);

  const projects = await h.request("/api/bridge/projects", { authorization: `Bearer ${approved.body.apiKey}` });
  assert.equal(projects.status, 200);
  const mcp = await fetch(`${h.base}/mcp`, { method: "POST", headers: { Authorization: `Bearer ${approved.body.apiKey}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "list_projects", arguments: {} } }) });
  assert.equal(mcp.status, 200);
  assert.equal((await mcp.json()).result.isError, undefined);

  const again = await h.request("/api/agent-login/poll", { method: "POST", body: { deviceCode: started.deviceCode } });
  assert.equal(again.status, 410);
  assert.equal(again.body.code, "expired_token");
  assert.equal((await h.request(`/api/bridge/agent-logins/${started.userCode}/approve`, { method: "POST", body: {}, user: "bob" })).status, 404);
  assert.equal(h.application.apiKeys.list("bob").length, 0);
});

test("declined, expired and unknown sign-ins never produce a key", async t => {
  const h = await setup(t);
  const declined = await h.start();
  assert.equal((await h.request(`/api/bridge/agent-logins/${declined.userCode}/deny`, { method: "POST", body: {}, user: "alice" })).body.status, "denied");
  const denied = await h.request("/api/agent-login/poll", { method: "POST", body: { deviceCode: declined.deviceCode } });
  assert.equal(denied.status, 403);
  assert.equal(denied.body.code, "access_denied");

  const expired = await h.start();
  h.advance(10 * 60000 + 1);
  assert.equal((await h.request(`/api/bridge/agent-logins/${expired.userCode}`, { user: "alice" })).status, 404);
  assert.equal((await h.request("/api/agent-login/poll", { method: "POST", body: { deviceCode: expired.deviceCode } })).status, 410);

  assert.equal((await h.request("/api/agent-login/poll", { method: "POST", body: { deviceCode: "meadow_agent_login_unknown" } })).status, 410);
  assert.equal((await h.request("/api/agent-login/poll", { method: "POST", body: {} })).status, 400);
  assert.equal((await h.request("/api/agent-login", { method: "POST", body: { agentName: " " } })).status, 400);
  assert.equal((await h.request("/api/agent-login", { method: "POST", body: { agentName: "x".repeat(61) } })).status, 400);
  assert.equal(h.application.apiKeys.list("alice").length, 0);
});

test("only a signed-in session can view or approve an agent sign-in", async t => {
  const h = await setup(t);
  const started = await h.start();
  assert.equal((await h.request(`/api/bridge/agent-logins/${started.userCode}`)).status, 401);
  assert.equal((await h.request(`/api/bridge/agent-logins/${started.userCode}/approve`, { method: "POST", body: {} })).status, 401);
  const { key } = h.application.apiKeys.create("alice", { name: "Existing agent" });
  for (const [method, suffix] of [["GET", ""], ["POST", "/approve"], ["POST", "/deny"]]) {
    const result = await h.request(`/api/bridge/agent-logins/${started.userCode}${suffix}`, { method, authorization: `Bearer ${key}`, ...(method === "POST" ? { body: {} } : {}) });
    assert.equal(result.status, 403, `${method} ${suffix}`);
    assert.equal(result.body.code, "session_required");
  }
  assert.equal((await h.request("/api/agent-login/poll", { method: "POST", body: { deviceCode: started.deviceCode } })).body.status, "pending");
});

test("approval respects the API key limit", async t => {
  const h = await setup(t);
  for (let i = 0; i < 20; i++) h.application.apiKeys.create("alice", { name: `Key ${i}` });
  const started = await h.start();
  const result = await h.request(`/api/bridge/agent-logins/${started.userCode}/approve`, { method: "POST", body: {}, user: "alice" });
  assert.equal(result.status, 400);
  assert.match(result.body.error, /API key limit/);
  assert.equal((await h.request("/api/agent-login/poll", { method: "POST", body: { deviceCode: started.deviceCode } })).body.status, "pending");
});
