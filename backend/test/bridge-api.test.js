import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createHmac, randomBytes } from "node:crypto";
import { BridgeApplication } from "../src/bridge/BridgeApplication.js";
import { SqliteStore } from "../src/bridge/storage/SqliteStore.js";
import { SecretVault } from "../src/bridge/core/SecretVault.js";
import { CONNECTION_PRIVACY_VERSION } from "../src/bridge/platforms/connectionPrivacy.js";

async function setup(t, { localPreview = false, auth = true, stripe, envOverrides = {} } = {}) {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "bridge-api-test-"));
  const dir = path.join(temporaryRoot, ".bridge");
  const application = new BridgeApplication({ store: new SqliteStore(), stripe, env: { NODE_ENV: localPreview ? "development" : "test", BRIDGE_LOCAL_PREVIEW: localPreview ? "1" : "0", BRIDGE_DATA_DIR: dir, BRIDGE_APP_URL: "http://localhost:5173", BRIDGE_MEDIA_SIGNING_KEY: "test-signing-key", BRIDGE_PUBLISHING_ENABLED: "false", ...envOverrides }, ...(auth ? { authMiddleware: (req, res, next) => { if (!/^Bearer (alice|bob)$/.test(req.headers.authorization || "")) return res.status(401).json({ error: "Sign in required" }); req.uid = req.headers.authorization.split(" ")[1]; next(); } } : {}) });
  const server = await new Promise((resolve, reject) => { const server = application.app.listen(0, "127.0.0.1", () => resolve(server)); server.on("error", reject); });
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => { await new Promise(resolve => server.close(resolve)); application.close(); fs.rmSync(temporaryRoot, { recursive: true, force: true }); });
  async function request(url, { method = "GET", body, user = "alice", headers = {} } = {}) {
    return fetch(base + url, { method, headers: { ...(user ? { Authorization: `Bearer ${user}` } : {}), ...(body && !(body instanceof FormData) ? { "Content-Type": "application/json" } : {}), ...headers }, ...(body ? { body: body instanceof FormData ? body : JSON.stringify(body) } : {}) });
  }
  const response = await request("/api/bridge/projects/default", { method: "POST", body: { name: "Test project", timeZone: "UTC" }, ...(auth ? {} : { headers: { "X-Bridge-Preview": "1" } }) });
  assert.equal(response.status, 200); const { project } = await response.json();
  return { application, request, project, base, dir, root: `/api/bridge/projects/${project.id}` };
}
const pdf = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF");
function fileForm(bytes = pdf, name = "document.pdf", type = "application/pdf") { const form = new FormData(); form.set("file", new Blob([bytes], { type }), name); return form; }

test("all project routes require authentication and reject another owner's project", async t => {
  const h = await setup(t);
  assert.equal((await h.request(`${h.root}/media`, { user: null })).status, 401);
  for (const endpoint of ["/media", "/accounts", "/posts", "/analytics"]) assert.equal((await h.request(h.root + endpoint, { user: "bob" })).status, 404);
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

test("media upload validates bytes and creates signed downloads", async t => {
  const h = await setup(t);
  const invalid = await h.request(`${h.root}/media`, { method: "POST", body: fileForm(Buffer.from("not an image"), "fake.png", "image/png") });
  assert.equal(invalid.status, 415);
  const upload = await h.request(`${h.root}/media`, { method: "POST", body: fileForm() }); assert.equal(upload.status, 201); const { media } = await upload.json();
  assert.equal(media.kind, "document"); assert.equal(media.status, "ready"); assert.ok(!("storageKey" in media));
  const signed = await h.request(media.downloadUrl, { user: null }); assert.equal(signed.status, 200); assert.match(signed.headers.get("content-disposition"), /^attachment/); assert.deepEqual(Buffer.from(await signed.arrayBuffer()), pdf);
  assert.equal((await h.request(media.url.replace(/signature=[^&]+/, "signature=tampered"), { user: null })).status, 403);
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
  assert.equal(response.status, 303); assert.match(response.headers.get("location"), /^http:\/\/localhost:5173\/dashboard\/connections/); assert.match(response.headers.get("location"), /connectionError/);
  assert.equal(h.application.store.list("account").length, 0);
  const malformed = await h.request(`${h.root}/posts`, { method: "POST", body: { items: [], requestId: "invalid-items-12345" } }); assert.equal(malformed.status, 400);
});

test("deferred feature endpoints are absent from the launch application", async t => {
  const h = await setup(t);
  const checks = [
    h.request("/api/bridge/projects", { method: "POST", body: { name: "Second", timeZone: "UTC" } }),
    h.request("/api/bridge/affiliate"),
    h.request("/api/bridge/affiliate/track", { method: "POST", body: { code: "future" } }),
    h.request(`${h.root}/clips`),
    h.request(`${h.root}/downloads`, { method: "POST", body: { ids: [] } }),
  ];
  for (const response of await Promise.all(checks)) assert.equal(response.status, 404);
});

test("Stripe checkout, webhooks, subscription state, and billing portal stay linked to the signed-in user", async t => {
  const calls = { checkout: [], portal: [], retrieved: [] };
  const subscription = {
    id: "sub_creator_yearly",
    customer: "cus_alice",
    status: "active",
    cancel_at_period_end: false,
    metadata: { meadowUserId: "alice", meadowPlanId: "creator", meadowBillingCycle: "yearly" },
    items: { data: [{ price: { id: "price_creator_yearly" }, current_period_end: 1800000000 }] },
  };
  const stripe = {
    checkout: { sessions: { create: async input => { calls.checkout.push(input); return { url: "https://checkout.stripe.test/session" }; } } },
    billingPortal: { sessions: { create: async input => { calls.portal.push(input); return { url: "https://billing.stripe.test/portal" }; } } },
    subscriptions: { retrieve: async id => { calls.retrieved.push(id); return subscription; } },
    webhooks: { constructEvent: (body, signature) => {
      assert.ok(Buffer.isBuffer(body));
      if (signature !== "valid_signature") throw new Error("bad signature");
      return { type: "checkout.session.completed", data: { object: { mode: "subscription", client_reference_id: "alice", subscription: subscription.id } } };
    } },
  };
  const h = await setup(t, { stripe, envOverrides: {
    STRIPE_WEBHOOK_SECRET: "whsec_test",
    STRIPE_PRICE_STARTER_MONTHLY: "price_starter_monthly", STRIPE_PRICE_STARTER_YEARLY: "price_starter_yearly",
    STRIPE_PRICE_CREATOR_MONTHLY: "price_creator_monthly", STRIPE_PRICE_CREATOR_YEARLY: "price_creator_yearly",
    STRIPE_PRICE_GROWTH_MONTHLY: "price_growth_monthly", STRIPE_PRICE_GROWTH_YEARLY: "price_growth_yearly",
    STRIPE_PRICE_PRO_MONTHLY: "price_pro_monthly", STRIPE_PRICE_PRO_YEARLY: "price_pro_yearly",
  } });

  const before = await (await h.request("/api/bridge/billing")).json();
  assert.deepEqual(before, { configured: true, planId: null, cycle: null, status: "free", cancelAtPeriodEnd: false, currentPeriodEnd: null, canManage: false });
  const checkout = await h.request("/api/bridge/billing/checkout", { method: "POST", body: { planId: "creator", cycle: "yearly" } });
  assert.equal(checkout.status, 200); assert.equal((await checkout.json()).url, "https://checkout.stripe.test/session");
  assert.equal(calls.checkout[0].line_items[0].price, "price_creator_yearly");
  assert.equal(calls.checkout[0].client_reference_id, "alice");
  assert.equal(calls.checkout[0].subscription_data.metadata.meadowPlanId, "creator");

  const unsigned = await fetch(`${h.base}/api/stripe/webhook`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  assert.equal(unsigned.status, 400);
  const webhook = await fetch(`${h.base}/api/stripe/webhook`, { method: "POST", headers: { "Content-Type": "application/json", "Stripe-Signature": "valid_signature" }, body: "{}" });
  assert.equal(webhook.status, 200); assert.deepEqual(await webhook.json(), { received: true }); assert.deepEqual(calls.retrieved, [subscription.id]);

  const after = await (await h.request("/api/bridge/billing")).json();
  assert.equal(after.planId, "creator"); assert.equal(after.cycle, "yearly"); assert.equal(after.status, "active"); assert.equal(after.canManage, true); assert.equal(after.currentPeriodEnd, 1800000000000);
  const duplicate = await h.request("/api/bridge/billing/checkout", { method: "POST", body: { planId: "pro", cycle: "monthly" } });
  assert.equal(duplicate.status, 409);
  const portal = await h.request("/api/bridge/billing/portal", { method: "POST", body: {} });
  assert.equal(portal.status, 200); assert.equal((await portal.json()).url, "https://billing.stripe.test/portal"); assert.equal(calls.portal[0].customer, "cus_alice");
});

test("workspace access needs no policy agreement while account deletion still requires the owner's session", async t => {
  const h = await setup(t), { application: app } = h;
  app.privacy.deleteIdentity = async () => {};
  app.privacy.deleteAnalytics = async () => true;
  const other = app.projects.create("bob", { name: "Keep Bob" });
  const { key } = app.apiKeys.create("alice", { name: "Agent" });
  assert.deepEqual(app.store.list("privacyConsent"), []);
  assert.equal((await h.request("/api/bridge/projects")).status, 200);
  assert.equal((await h.request("/api/bridge/config")).status, 200);
  const privacy = await h.request("/api/bridge/privacy");
  assert.equal(privacy.headers.get("cache-control"), "no-store");
  assert.equal((await privacy.json()).deletion, null);
  const keyHeaders = { Authorization: `Bearer ${key}` };
  assert.equal((await h.request("/api/bridge/projects", { headers: keyHeaders })).status, 200);
  assert.equal((await h.request("/api/bridge/privacy/account", { method: "DELETE", headers: keyHeaders, body: { confirmation: "DELETE" } })).status, 403);
  assert.equal((await h.request("/api/bridge/privacy/account", { method: "DELETE", body: { confirmation: "delete" } })).status, 400);
  const deleted = await h.request("/api/bridge/privacy/account", { method: "DELETE", body: { confirmation: "DELETE", uid: "bob" } });
  assert.equal(deleted.status, 202);
  const reference = (await deleted.json()).deletion.reference;
  assert.equal((await h.request("/api/bridge/projects")).status, 410);
  assert.equal((await h.request("/api/bridge/projects", { headers: keyHeaders })).status, 401);
  await app.privacy.tick();
  assert.equal(app.store.get("project", h.project.id), null);
  assert.equal(app.store.get("project", other.id).name, "Keep Bob");
  assert.equal((await (await h.request("/api/bridge/privacy")).json()).deletion.status, "complete");
  assert.equal((await (await h.request("/api/bridge/privacy/account", { method: "DELETE", body: { confirmation: "DELETE" } })).json()).deletion.reference, reference);
});

for (const platform of ["pinterest", "youtube", "google_business", "tiktok"]) test(`${platform} requires fresh, specific session consent and binds it to the OAuth account`, async t => {
  const h = await setup(t, { envOverrides: {
    BRIDGE_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
    PINTEREST_CLIENT_ID: "test", PINTEREST_CLIENT_SECRET: "test",
    GOOGLE_CLIENT_ID: "test", GOOGLE_CLIENT_SECRET: "test",
    TIKTOK_CLIENT_KEY: "test", TIKTOK_CLIENT_SECRET: "test",
  } });
  const { application: app } = h, provider = app.registry.get(platform);
  let authorizations = 0, exchanges = 0;
  provider.authorizationUrl = async ({ state }) => { authorizations++; return `https://provider.example/authorize?state=${state}`; };
  provider.exchange = async () => { exchanges++; return { accessToken: "fixture-token", refreshToken: "fixture-refresh" }; };
  provider.accounts = async () => [{ remoteId: "selected-account", label: "Selected account" }];
  const config = await (await h.request("/api/bridge/config")).json();
  assert.equal(config.platforms.find(item => item.id === platform).privacyDisclosure, true);
  assert.equal(config.platforms.find(item => item.id === "x").privacyDisclosure, false);
  const noticeResponse = await h.request(`/api/bridge/privacy/connections/${platform}`);
  assert.equal(noticeResponse.headers.get("cache-control"), "no-store");
  const { disclosure } = await noticeResponse.json();
  assert.equal(disclosure.platform, platform);
  assert.equal(disclosure.version, CONNECTION_PRIVACY_VERSION);
  assert.equal((await (await h.request("/api/bridge/privacy/connections")).json()).disclosures.length, 4);
  assert.equal((await h.request(`/api/bridge/privacy/connections/${platform}`, { user: null })).status, 401);

  const endpoint = `${h.root}/accounts/connect/${platform}`;
  const consent = { accepted: true, platform, version: disclosure.version };
  for (const input of [undefined, { ...consent, accepted: false }, { ...consent, version: "old" }, { ...consent, platform: platform === "tiktok" ? "pinterest" : "tiktok" }]) {
    const response = await h.request(endpoint, { method: "POST", body: { consent: input } });
    assert.equal(response.status, 400); assert.equal((await response.json()).code, "connection_consent_required");
  }
  const { key } = app.apiKeys.create("alice", { name: "Automation" });
  assert.equal((await h.request(endpoint, { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: { consent } })).status, 403);
  assert.equal(authorizations, 0);

  const before = Date.now();
  const response = await h.request(endpoint, { method: "POST", body: { consent: { ...consent, acceptedAt: 1 }, uid: "bob" } });
  assert.equal(response.status, 200); assert.equal(authorizations, 1);
  const state = new URL((await response.json()).url).searchParams.get("state");
  const saved = app.store.peekState(SecretVault.hash(state));
  assert.equal(saved.uid, "alice"); assert.ok(saved.privacyConsent.acceptedAt >= before);
  const pending = await app.accounts.callback(platform, new URLSearchParams({ code: "fixture-code", state }));
  assert.equal(exchanges, 1);
  assert.equal((await h.request(`${h.root}/connections/${pending.connectionId}`, { method: "POST", user: "bob", body: { selectedIds: ["selected-account"] } })).status, 404);
  const attached = await h.request(`${h.root}/connections/${pending.connectionId}`, { method: "POST", body: { selectedIds: ["selected-account"], consent: { accepted: false } } });
  assert.equal(attached.status, 200);
  const account = (await attached.json()).accounts[0];
  assert.deepEqual(account.privacyConsent, saved.privacyConsent);
  assert.equal((await h.request(endpoint, { method: "POST", body: {} })).status, 400);
  assert.equal(authorizations, 1, "An earlier agreement cannot authorize another connection attempt");
  assert.deepEqual(app.store.list("privacyConsent"), [], "Consent is attached to the connection, not a workspace-wide flag");

  for (const receipt of [null, { ...consent, version: "old" }, { ...consent, platform: "x" }]) {
    const oldState = randomBytes(16).toString("hex");
    app.store.saveState(SecretVault.hash(oldState), { uid: "alice", projectId: h.project.id, platform, verifier: "fixture", privacyConsent: receipt }, Date.now() + 60000);
    await assert.rejects(app.accounts.callback(platform, new URLSearchParams({ code: "fixture-code", state: oldState })), error => error.code === "connection_consent_required");
  }
  assert.equal(exchanges, 1, "Missing or stale callback consent is rejected before token exchange");
});

test("Clerk deletion webhooks verify the raw signature and erase the deleted identity's workspaces", async t => {
  const signingKey = Buffer.from("meadow-test-clerk-webhook-secret");
  const h = await setup(t, { envOverrides: { CLERK_WEBHOOK_SIGNING_SECRET: `whsec_${signingKey.toString("base64")}` } });
  h.application.privacy.deleteAnalytics = async () => true;
  h.application.privacy.deleteIdentity = async () => assert.fail("Clerk already deleted this identity");
  const body = { type: "user.deleted", data: { id: "alice", deleted: true } }, timestamp = String(Math.floor(Date.now() / 1000)), id = "msg_test_privacy";
  const signature = createHmac("sha256", signingKey).update(`${id}.${timestamp}.${JSON.stringify(body)}`).digest("base64");
  const headers = { "svix-id": id, "svix-timestamp": timestamp, "svix-signature": `v1,${signature}` };
  assert.equal((await h.request("/api/clerk/webhook", { method: "POST", user: null, body, headers: { ...headers, "svix-signature": "v1,invalid" } })).status, 400);
  assert.equal(h.application.privacy.blocked("alice"), false);
  assert.equal((await h.request("/api/clerk/webhook", { method: "POST", user: null, body, headers })).status, 200);
  await h.application.privacy.tick();
  assert.equal(h.application.store.get("project", h.project.id), null);
  assert.equal(h.application.privacy.status("alice").deletion.status, "complete");
});
