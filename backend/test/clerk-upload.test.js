import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { generateKeyPairSync, sign } from "node:crypto";
import { clerkMiddleware } from "@clerk/express";
import { requireAuth } from "../src/lib/clerkAuth.js";
import { BridgeApplication } from "../src/bridge/BridgeApplication.js";
import { SqliteStore } from "../src/bridge/storage/SqliteStore.js";

test("Clerk rejects an expired upload before saving media and accepts the file with a fresh token", async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "meadow-clerk-upload-"));
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const authenticate = clerkMiddleware({
    publishableKey: `pk_test_${Buffer.from("clerk.example.com$").toString("base64")}`,
    secretKey: "sk_test_fixture_only",
    jwtKey: publicKey.export({ type: "spki", format: "pem" }),
  });
  const app = new BridgeApplication({
    env: { NODE_ENV: "test", BRIDGE_DATA_DIR: dir, BRIDGE_MEDIA_SIGNING_KEY: "test-media-signing-key", BRIDGE_PUBLISHING_ENABLED: "false" },
    store: new SqliteStore(),
    authMiddleware: (req, res, next) => authenticate(req, res, error => error ? next(error) : requireAuth(req, res, next)),
  });
  const server = await new Promise((resolve, reject) => { const server = app.app.listen(0, "127.0.0.1", () => resolve(server)); server.on("error", reject); });
  t.after(async () => { await new Promise(resolve => server.close(resolve)); app.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  const project = app.projects.create("user_upload", { name: "Upload test", timeZone: "UTC" });
  const source = path.join(dir, "fixture.mp4");
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "color=c=blue:s=160x90:d=1", "-c:v", "libx264", "-pix_fmt", "yuv420p", source]);
  const bytes = fs.readFileSync(source);
  function token(expired) {
    const now = Math.floor(Date.now() / 1000);
    const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT", kid: "test-key" })).toString("base64url");
    const claims = Buffer.from(JSON.stringify({ iss: "https://clerk.example.com", sub: "user_upload", sid: "sess_upload", azp: "http://localhost:5173", iat: now - (expired ? 120 : 0), nbf: now - 120, exp: now + (expired ? -60 : 60) })).toString("base64url");
    const payload = `${header}.${claims}`;
    return `${payload}.${sign("RSA-SHA256", Buffer.from(payload), privateKey).toString("base64url")}`;
  }
  async function upload(authorization) {
    const body = new FormData();
    body.set("file", new Blob([bytes], { type: "video/mp4" }), "recording.MP4");
    return fetch(`http://127.0.0.1:${server.address().port}/api/bridge/projects/${project.id}/media`, { method: "POST", headers: authorization ? { Authorization: `Bearer ${authorization}` } : {}, body, redirect: "manual" });
  }

  const expired = await upload(token(true));
  assert.equal(expired.status, 401);
  assert.deepEqual(await expired.json(), { error: "Authentication required.", code: "authentication_required" });
  assert.equal(expired.headers.get("cache-control"), "no-store");
  assert.equal(app.store.list("media").length, 0);
  assert.deepEqual(fs.readdirSync(path.join(dir, "incoming")), []);

  const fresh = await upload(token(false));
  assert.equal(fresh.status, 201);
  const { media } = await fresh.json();
  assert.equal(media.filename, "recording.MP4");
  assert.equal(media.kind, "video");
  assert.equal(media.status, "ready");
  assert.equal(media.ownerUid, "user_upload");
  assert.equal(media.bytes, bytes.length);
  assert.equal(app.store.list("media").length, 1);

  const anonymous = await upload();
  assert.equal(anonymous.status, 401);
  assert.equal(app.store.list("media").length, 1);
});
