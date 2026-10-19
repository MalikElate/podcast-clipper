import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { generateKeyPairSync, randomBytes } from "node:crypto";
import { blueskyOAuthDocument, isBlueskyOAuthDocument } from "../../cloudflare/blueskyOAuth.js";
import { BlueskyProvider } from "../src/bridge/platforms/BlueskyProvider.js";
import { SqliteStore } from "../src/bridge/storage/SqliteStore.js";
import { SecretVault } from "../src/bridge/core/SecretVault.js";
import { LockService } from "../src/bridge/core/LockService.js";

const publicUrl = "https://bridge.example";
const pemKey = () => generateKeyPairSync("ec", { namedCurve: "P-256", privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } }).privateKey;
const get = (path, method = "GET") => new Request(`${publicUrl}${path}`, { method });

test("the Worker serves the Bluesky client metadata and JWKS the official client publishes", async t => {
  const privateKey = pemKey();
  // Cloudflare stores the secret with escaped newlines, as the backend expects.
  const workerEnv = { BRIDGE_PUBLIC_URL: `${publicUrl}/`, BLUESKY_PRIVATE_KEY: privateKey.replaceAll("\n", "\\n") };
  const store = new SqliteStore(); t.after(() => store.close());
  const provider = new BlueskyProvider({ env: { BLUESKY_PRIVATE_KEY: workerEnv.BLUESKY_PRIVATE_KEY }, publicUrl, store, vault: new SecretVault(randomBytes(32).toString("base64")), locks: new LockService(store) });
  const client = await provider.client();
  const served = async path => {
    const response = await blueskyOAuthDocument(get(path), workerEnv);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("Content-Type"), /^application\/json/);
    return response.json();
  };
  assert.deepEqual(await served("/oauth/bluesky/client-metadata.json"), JSON.parse(JSON.stringify(client.clientMetadata)));
  const jwks = await served("/oauth/bluesky/jwks.json");
  assert.deepEqual(jwks, JSON.parse(JSON.stringify(client.jwks)));
  assert.equal(jwks.keys[0].kid, "bridge-1"); assert.ok(!("d" in jwks.keys[0]));
  const head = await blueskyOAuthDocument(get("/oauth/bluesky/jwks.json", "HEAD"), workerEnv);
  assert.equal(head.status, 200); assert.equal(await head.text(), "");
});

test("the backend still answers Bluesky documents the Worker cannot", async () => {
  const workerEnv = { BRIDGE_PUBLIC_URL: publicUrl, BLUESKY_PRIVATE_KEY: pemKey() };
  assert.equal(await blueskyOAuthDocument(get("/oauth/bluesky/callback"), workerEnv), null);
  assert.equal(await blueskyOAuthDocument(get("/oauth/bluesky/jwks.json", "POST"), workerEnv), null);
  assert.equal(await blueskyOAuthDocument(get("/oauth/bluesky/jwks.json"), { ...workerEnv, BLUESKY_PRIVATE_KEY: "" }), null);
  assert.equal(await blueskyOAuthDocument(get("/oauth/bluesky/client-metadata.json"), { ...workerEnv, BRIDGE_PUBLIC_URL: "http://bridge.example" }), null);
  assert.equal(await blueskyOAuthDocument(get("/oauth/bluesky/jwks.json"), { ...workerEnv, BLUESKY_PRIVATE_KEY: '{"kty":"EC"}' }), null);
  assert.ok(isBlueskyOAuthDocument("/oauth/bluesky/jwks.json"));
  assert.ok(!isBlueskyOAuthDocument("/oauth/bluesky/jwks.json/"));
});

test("the Worker answers Bluesky documents before the container and never forwards /internal/", async () => {
  const worker = await readFile(new URL("../../cloudflare/worker.js", import.meta.url), "utf8");
  const wrangler = await readFile(new URL("../../wrangler.jsonc", import.meta.url), "utf8");
  assert.ok(wrangler.includes('"/oauth/*"'), "the Worker must run before assets for /oauth/*");
  assert.ok(worker.indexOf("blueskyOAuthDocument(request, workerEnv)") < worker.indexOf("const backendPath ="));
  const forwarded = worker.match(/const backendPath = (.+);/)[1];
  assert.ok(!forwarded.includes("/internal"), "the container's activity endpoint must stay private");
});
