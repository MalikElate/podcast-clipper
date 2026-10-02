import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createHmac, randomBytes } from "node:crypto";
import { SqliteStore } from "../src/bridge/storage/SqliteStore.js";
import { SecretVault } from "../src/bridge/core/SecretVault.js";
import { LockService } from "../src/bridge/core/LockService.js";
import { WebhookService, publicWebhookAddress, sendWebhook, webhookUrl } from "../src/bridge/services/WebhookService.js";

function fixture(t, overrides = {}) {
  let now = Date.parse("2026-10-02T20:00:00Z");
  const store = new SqliteStore(), vault = new SecretVault(randomBytes(32).toString("base64")), sent = [];
  const service = new WebhookService({ store, vault, locks: new LockService(store, { clock: () => now }), clock: () => now, send: async (url, body, headers) => { sent.push({ url, body, headers }); return 204; }, ...overrides });
  t.after(() => store.close());
  return { service, store, vault, sent, advance: ms => { now += ms; } };
}

test("webhook configuration is owner-isolated, encrypted and reveals new secrets only", t => {
  const h = fixture(t), created = h.service.save("alice", { url: "https://receiver.example/events" });
  assert.match(created.secret, /^whsec_/);
  assert.equal(h.service.get("bob").webhook, null);
  assert.ok(!JSON.stringify(h.service.get("alice")).includes(created.secret));
  assert.ok(!h.service.record("alice").encryptedSecret.includes(created.secret));
  assert.ok(!h.service.save("alice", { url: created.webhook.url }).secret);
  const rotated = h.service.rotate("alice"); assert.notEqual(rotated.secret, created.secret);
  const changed = h.service.save("alice", { url: "https://new-receiver.example/events" }); assert.notEqual(changed.secret, rotated.secret);
});

test("only public HTTPS endpoints are accepted, including normalized IPv4 and IPv6", () => {
  for (const url of ["http://example.com", "https://alice:secret@example.com", "https://example.com/#fragment", "https://example.com:8443", "https://localhost", "https://host.internal.", "https://10.1.2.3", "https://2130706433", "https://0x7f000001", "https://[::1]", "https://[::ffff:127.0.0.1]", "https://[2001::1]", "https://[2002:7f00:1::]", "https://[2001:db8::1]"]) assert.throws(() => webhookUrl(url), undefined, url);
  for (const address of ["0.0.0.0", "127.0.0.1", "169.254.169.254", "100.64.0.1", "172.16.0.1", "192.168.1.1", "192.0.2.1", "198.18.0.1", "203.0.113.1", "224.0.0.1", "::1", "fc00::1", "fe80::1", "ff02::1", "3fff::1"]) assert.equal(publicWebhookAddress(address), false, address);
  for (const address of ["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111", "2001:4860:4860::8888"]) assert.equal(publicWebhookAddress(address), true, address);
  assert.equal(webhookUrl(" https://receiver.example/events "), "https://receiver.example/events");
});

test("DNS rebinding is blocked and HTTPS uses only the checked address without redirects", async () => {
  let requests = 0;
  for (const addresses of [[{ address: "127.0.0.1", family: 4 }], [{ address: "8.8.8.8", family: 4 }, { address: "10.0.0.1", family: 4 }]]) await assert.rejects(sendWebhook("https://receiver.example/events", "{}", {}, { resolve: async () => addresses, request: () => { requests++; } }), /public internet address/);
  assert.equal(requests, 0);
  const code = await sendWebhook("https://receiver.example/events", "{}", {}, {
    resolve: async () => [{ address: "8.8.8.8", family: 4 }],
    request(url, options, callback) {
      requests++; assert.equal(url.hostname, "receiver.example"); assert.equal(options.agent, false);
      options.lookup("receiver.example", {}, (error, address, family) => { assert.equal(error, null); assert.equal(address, "8.8.8.8"); assert.equal(family, 4); });
      options.lookup("receiver.example", { all: true }, (error, addresses) => { assert.equal(error, null); assert.deepEqual(addresses, [{ address: "8.8.8.8", family: 4 }]); });
      const req = new EventEmitter(); req.destroy = () => req.emit("close");
      req.end = body => { assert.equal(body, "{}"); callback({ statusCode: 302, headers: { location: "https://127.0.0.1" }, destroy() {} }); req.emit("close"); }; return req;
    },
  });
  assert.equal(code, 302); assert.equal(requests, 1);
});

test("signed events persist before dispatch, retries preserve IDs and stop after five attempts", async t => {
  const h = fixture(t), { secret } = h.service.save("alice", { url: "https://receiver.example/events" });
  const event = h.service.enqueue("alice", "post.completed", { post_id: "post-one", status: "published" });
  let persisted = false; h.store.flush = async () => { persisted = true; };
  h.service.send = async (url, body, headers) => { assert.ok(persisted); h.sent.push({ url, body, headers }); return 503; };
  for (let attempt = 1; attempt <= 5; attempt++) {
    await h.service.tick(); const item = h.store.get("webhookDelivery", event.id);
    assert.equal(item.attempts, attempt); assert.equal(item.status, attempt === 5 ? "failed" : "pending");
    const { body, headers } = h.sent.at(-1), match = /^t=(\d+),v1=([a-f0-9]{64})$/.exec(headers["X-Meadow-Signature"]);
    assert.ok(match); assert.equal(headers["X-Meadow-Event-Id"], event.id); assert.equal(JSON.parse(body).id, event.id);
    assert.equal(match[2], createHmac("sha256", secret).update(`${match[1]}.${body}`).digest("hex"));
    h.advance(60000 * 2 ** (attempt - 1));
  }
  await h.service.tick(); assert.equal(h.sent.length, 5); assert.notEqual(h.sent[0].headers["X-Meadow-Signature"], h.sent[1].headers["X-Meadow-Signature"]);
});

test("successful deliveries are never retried and test events report the receiver result", async t => {
  const h = fixture(t); h.service.save("alice", { url: "https://receiver.example/events" });
  const result = await h.service.test("alice"); assert.equal(result.webhook.lastDelivery.status, "delivered"); assert.equal(JSON.parse(h.sent[0].body).type, "webhook.test");
  await h.service.tick(); assert.equal(h.sent.length, 1);
});

test("outbox persistence failure prevents the external request", async t => {
  const h = fixture(t); h.service.save("alice", { url: "https://receiver.example/events" }); h.service.enqueue("alice", "post.completed", {});
  h.store.flush = async () => { throw new Error("storage unavailable"); }; await assert.rejects(h.service.tick(), /storage unavailable/);
  assert.equal(h.sent.length, 0); assert.equal(h.service.running, false);
});

test("changing, rotating or removing a destination discards previous pending deliveries", async t => {
  const h = fixture(t); h.service.save("alice", { url: "https://receiver.example/events" }); const enqueue = () => h.service.enqueue("alice", "post.completed", {});
  enqueue(); h.service.rotate("alice"); assert.equal(h.store.list("webhookDelivery").length, 0);
  enqueue(); h.service.save("alice", { url: "https://other.example/events" }); assert.equal(h.store.list("webhookDelivery").length, 0);
  enqueue(); h.service.remove("alice"); await h.service.tick(); assert.equal(h.sent.length, 0);
});

test("workspace deletion blocks enqueue and dispatch, and expired records are pruned", async t => {
  let blocked = false; const h = fixture(t, { privacy: { blocked: () => blocked } }); h.service.save("alice", { url: "https://receiver.example/events" });
  h.service.enqueue("alice", "post.completed", {}); blocked = true; assert.equal(h.service.enqueue("alice", "post.completed", {}), null);
  await h.service.tick(); assert.equal(h.sent.length, 0); assert.equal(h.store.list("webhookDelivery").length, 0);
  blocked = false; h.service.enqueue("alice", "post.completed", {}); h.advance(8 * 86400000); await h.service.tick(); assert.equal(h.sent.length, 0); assert.equal(h.store.list("webhookDelivery").length, 0);
});

test("a settings change during an in-flight delivery cannot restore the old endpoint", async t => {
  let begin, finish; const started = new Promise(resolve => { begin = resolve; }), response = new Promise(resolve => { finish = resolve; });
  const h = fixture(t, { send: async () => { begin(); return response; } }); h.service.save("alice", { url: "https://receiver.example/events" });
  const pending = h.service.test("alice"); await started; h.service.remove("alice"); finish(204); await pending;
  assert.equal(h.service.get("alice").webhook, null); assert.equal(h.store.list("webhookDelivery").length, 0);
});

test("local preview configures endpoints but cannot deliver or send a test", async t => {
  const h = fixture(t, { enabled: false }); h.service.save("alice", { url: "https://receiver.example/events" }); h.service.enqueue("alice", "post.completed", {}); await h.service.tick();
  await assert.rejects(h.service.test("alice"), /disabled in local preview/); assert.equal(h.sent.length, 0);
});
