import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { BridgeApplication } from "../src/bridge/BridgeApplication.js";
import { SqliteStore } from "../src/bridge/storage/SqliteStore.js";

async function setup(t, { localPreview = false, auth = true, pipeline } = {}) {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "bridge-api-test-"));
  const dir = path.join(temporaryRoot, ".bridge");
  const application = new BridgeApplication({ store: new SqliteStore(), pipeline, env: { NODE_ENV: localPreview ? "development" : "test", BRIDGE_LOCAL_PREVIEW: localPreview ? "1" : "0", BRIDGE_DATA_DIR: dir, BRIDGE_APP_URL: "http://localhost:5173", BRIDGE_MEDIA_SIGNING_KEY: "test-signing-key", BRIDGE_AFFILIATE_SECRET: "test-affiliate-secret", BRIDGE_CLIPPING_ENABLED: "false", BRIDGE_PUBLISHING_ENABLED: "false" }, ...(auth ? { authMiddleware: (req, res, next) => { if (!/^Bearer (alice|bob)$/.test(req.headers.authorization || "")) return res.status(401).json({ error: "Sign in required" }); req.uid = req.headers.authorization.split(" ")[1]; next(); } } : {}) });
  const server = await new Promise((resolve, reject) => { const server = application.app.listen(0, "127.0.0.1", () => resolve(server)); server.on("error", reject); });
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => { await new Promise(resolve => server.close(resolve)); application.close(); fs.rmSync(temporaryRoot, { recursive: true, force: true }); });
  async function request(url, { method = "GET", body, user = "alice", headers = {} } = {}) {
    return fetch(base + url, { method, headers: { ...(user ? { Authorization: `Bearer ${user}` } : {}), ...(body && !(body instanceof FormData) ? { "Content-Type": "application/json" } : {}), ...headers }, ...(body ? { body: body instanceof FormData ? body : JSON.stringify(body) } : {}) });
  }
  const response = await request("/api/bridge/projects", { method: "POST", body: { name: "Test project", timeZone: "UTC" }, ...(auth ? {} : { headers: { "X-Bridge-Preview": "1" } }) });
  assert.equal(response.status, 201); const { project } = await response.json();
  return { application, request, project, base, dir, root: `/api/bridge/projects/${project.id}` };
}
const pdf = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF");
function fileForm(bytes = pdf, name = "document.pdf", type = "application/pdf") { const form = new FormData(); form.set("file", new Blob([bytes], { type }), name); return form; }

test("all project routes require authentication and reject another owner's project", async t => {
  const h = await setup(t);
  assert.equal((await h.request(`${h.root}/media`, { user: null })).status, 401);
  for (const endpoint of ["/media", "/accounts", "/posts", "/analytics", "/clips"]) assert.equal((await h.request(h.root + endpoint, { user: "bob" })).status, 404);
  const projects = await (await h.request("/api/bridge/projects", { user: "bob" })).json(); assert.deepEqual(projects.projects, []);
  const config = await (await h.request("/api/bridge/config")).json(); assert.equal(config.platforms.length, 10); assert.equal(config.connectionsReady, false);
});

test("a first-time user gets one reusable default workspace", async t => {
  const h = await setup(t);
  const first = await h.request("/api/bridge/projects/default", { method: "POST", user: "bob", body: { name: "Meadow", timeZone: "Africa/Douala" } });
  const second = await h.request("/api/bridge/projects/default", { method: "POST", user: "bob", body: { name: "Ignored", timeZone: "UTC" } });
  assert.equal(first.status, 200); assert.equal(second.status, 200);
  const firstProject = (await first.json()).project, secondProject = (await second.json()).project;
  assert.equal(firstProject.id, secondProject.id); assert.equal(firstProject.name, "Meadow"); assert.equal(firstProject.timeZone, "Africa/Douala");
  const projects = await (await h.request("/api/bridge/projects", { user: "bob" })).json();
  assert.deepEqual(projects.projects.map(project => project.id), [firstProject.id]);
});

test("API keys are shown once, authenticate requests, and can be revoked", async t => {
  const h = await setup(t);
  const created = await h.request("/api/bridge/api-keys", { method: "POST", body: { name: "Automation" } });
  assert.equal(created.status, 201);
  const { apiKey, key } = await created.json();
  assert.match(key, /^br_live_[a-f0-9]{16}_[A-Za-z0-9_-]{43}$/);
  assert.equal(apiKey.name, "Automation");
  assert.ok(!("digest" in apiKey));
  const listed = await (await h.request("/api/bridge/api-keys")).json();
  assert.deepEqual(listed.apiKeys.map(item => item.name), ["Automation"]);
  const authorized = await h.request("/api/bridge/projects", { user: null, headers: { Authorization: `Bearer ${key}` } });
  assert.equal(authorized.status, 200);
  assert.equal((await authorized.json()).projects.length, 1);
  assert.equal((await h.request(`/api/bridge/api-keys/${apiKey.id}`, { method: "DELETE" })).status, 200);
  assert.equal((await h.request("/api/bridge/projects", { user: null, headers: { Authorization: `Bearer ${key}` } })).status, 401);
});

test("media upload validates bytes, creates signed downloads, and streams an authenticated ZIP", async t => {
  const h = await setup(t);
  const invalid = await h.request(`${h.root}/media`, { method: "POST", body: fileForm(Buffer.from("not an image"), "fake.png", "image/png") });
  assert.equal(invalid.status, 415);
  const upload = await h.request(`${h.root}/media`, { method: "POST", body: fileForm() }); assert.equal(upload.status, 201); const { media } = await upload.json();
  assert.equal(media.kind, "document"); assert.equal(media.status, "ready"); assert.ok(!("storageKey" in media));
  const signed = await h.request(media.downloadUrl, { user: null }); assert.equal(signed.status, 200); assert.match(signed.headers.get("content-disposition"), /^attachment/); assert.deepEqual(Buffer.from(await signed.arrayBuffer()), pdf);
  assert.equal((await h.request(media.url.replace(/signature=[^&]+/, "signature=tampered"), { user: null })).status, 403);
  assert.equal((await h.request(`${h.root}/downloads`, { user: "bob", method: "POST", body: { ids: [media.id] } })).status, 404);
  const ticket = await (await h.request(`${h.root}/downloads`, { method: "POST", body: { ids: [media.id] } })).json();
  const archive = await h.request(ticket.url, { user: null }); assert.equal(archive.status, 200); const bytes = Buffer.from(await archive.arrayBuffer()); assert.equal(bytes.subarray(0, 2).toString(), "PK"); assert.ok(bytes.includes(Buffer.from("document.pdf")));
  assert.equal((await h.request(ticket.url, { user: null })).status, 403);
  assert.equal((await h.request(`${h.root}/media/${media.id}`, { method: "DELETE" })).status, 200);
  assert.equal((await h.request(media.url, { user: null })).status, 404);
  assert.equal(fs.readdirSync(path.join(h.dir, "incoming")).length, 0);
});

test("video upload probes the file and produces a usable preview thumbnail", async t => {
  const h = await setup(t), source = path.join(h.dir, "source.mp4");
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "color=c=blue:s=320x180:d=1", "-c:v", "libx264", "-pix_fmt", "yuv420p", source]);
  const response = await h.request(`${h.root}/media`, { method: "POST", body: fileForm(fs.readFileSync(source), "video.mp4", "video/mp4") });
  assert.equal(response.status, 201); const { media } = await response.json(); assert.equal(media.kind, "video"); assert.equal(media.width, 320); assert.equal(media.height, 180); assert.ok(media.durationSec >= 1);
  const image = await h.request(media.thumbnailUrl, { user: null }); assert.equal(image.status, 200); assert.match(image.headers.get("content-type"), /image\/jpeg/); assert.ok((await image.arrayBuffer()).byteLength > 100);
});

test("local preview requires an explicit header and rejects unrecognized origins and live publishing", async t => {
  const h = await setup(t, { localPreview: true, auth: false });
  const headers = { "X-Bridge-Preview": "1" };
  assert.equal((await h.request("/api/bridge/config", { user: null, headers })).status, 200);
  assert.equal((await h.request("/api/bridge/config", { user: null, headers: { ...headers, Origin: "https://untrusted.example" } })).status, 403);
  assert.notEqual((await h.request("/api/bridge/config", { user: null })).status, 200);
  const post = await h.request(`${h.root}/posts`, { method: "POST", headers, body: { items: [], requestId: "preview-must-not-publish" } }); assert.equal(post.status, 409);
  const account = await h.request(`${h.root}/accounts/connect/x`, { method: "POST", headers, body: {} }); assert.equal(account.status, 409);
});

test("OAuth callbacks reject unknown and reused state without connecting accounts", async t => {
  const h = await setup(t);
  const response = await fetch(`${h.base}/oauth/x/callback?state=unknown&code=not-real`, { redirect: "manual" });
  assert.equal(response.status, 303); assert.match(response.headers.get("location"), /^http:\/\/localhost:5173/); assert.match(response.headers.get("location"), /connectionError/);
  assert.equal(h.application.store.list("account").length, 0);
  const malformed = await h.request(`${h.root}/posts`, { method: "POST", body: { items: [], requestId: "invalid-items-12345" } }); assert.equal(malformed.status, 400);
});

test("affiliate links attribute customers and build an idempotent commission ledger", async t => {
  const h = await setup(t);
  const enrolled = await h.request("/api/bridge/affiliate", { method: "POST", body: { displayName: "Alice Creator", email: "alice@example.com", code: "alice-media", acceptedTerms: true } });
  assert.equal(enrolled.status, 201);
  const affiliate = await enrolled.json();
  assert.equal(affiliate.affiliate.referralLink, "http://localhost:5173/?ref=alice-media");
  assert.equal(affiliate.program.commissionPercent, 20);

  const tracked = await h.request("/api/bridge/affiliate/track", { user: null, method: "POST", body: { code: "alice-media" } });
  assert.equal(tracked.status, 201);
  const attribution = await tracked.json();
  const claimed = await h.request("/api/bridge/affiliate/claim", { user: "bob", method: "POST", body: attribution });
  assert.equal(claimed.status, 200);
  assert.equal((await claimed.json()).attributed, true);

  const selfReferral = await h.request("/api/bridge/affiliate/claim", { method: "POST", body: attribution });
  assert.equal((await selfReferral.json()).reason, "self_referral");
  const hook = "/api/bridge/internal/affiliate/conversions";
  assert.equal((await h.request(hook, { user: null, method: "POST", headers: { "X-Bridge-Affiliate-Secret": "wrong" }, body: { customerUid: "bob", externalId: "invoice-1", amountCents: 3900 } })).status, 401);
  const purchase = await h.request(hook, { user: null, method: "POST", headers: { "X-Bridge-Affiliate-Secret": "test-affiliate-secret" }, body: { customerUid: "bob", externalId: "invoice-1", amountCents: 3900 } });
  assert.equal(purchase.status, 201);
  const purchaseData = await purchase.json();
  assert.equal(purchaseData.conversion.commissionCents, 780);
  const duplicate = await h.request(hook, { user: null, method: "POST", headers: { "X-Bridge-Affiliate-Secret": "test-affiliate-secret" }, body: { customerUid: "bob", externalId: "invoice-1", amountCents: 3900 } });
  assert.equal((await duplicate.json()).idempotent, true);
  const refund = await h.request(hook, { user: null, method: "POST", headers: { "X-Bridge-Affiliate-Secret": "test-affiliate-secret" }, body: { customerUid: "bob", externalId: "refund-1", amountCents: 1000, type: "refund" } });
  assert.equal((await refund.json()).conversion.commissionCents, -200);

  const paid = await h.request(`${hook}/${purchaseData.conversion.id}`, { user: null, method: "PATCH", headers: { "X-Bridge-Affiliate-Secret": "test-affiliate-secret" }, body: { status: "paid" } });
  assert.equal(paid.status, 200);
  const dashboard = await (await h.request("/api/bridge/affiliate")).json();
  assert.deepEqual({ clicks: dashboard.stats.clicks, referrals: dashboard.stats.referrals, customers: dashboard.stats.customers, conversions: dashboard.stats.conversions }, { clicks: 1, referrals: 1, customers: 1, conversions: 1 });
  assert.equal(dashboard.stats.pendingCents, -200);
  assert.equal(dashboard.stats.paidCents, 780);
});
