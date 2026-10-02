import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { gzipSync } from "node:zlib";
import { handlePosthogProxy, isPosthogProxyPath, POSTHOG_PROXY_PATH } from "../../cloudflare/posthogProxy.js";

test("proxy owns only its prefix and runs before Cloudflare assets on every production host", async () => {
  const config = JSON.parse(await readFile(new URL("../../wrangler.jsonc", import.meta.url), "utf8"));
  assert.ok(config.assets.run_worker_first.includes(POSTHOG_PROXY_PATH));
  assert.ok(config.assets.run_worker_first.includes(`${POSTHOG_PROXY_PATH}/*`));
  for (const path of ["/sprout", "/sprout/", "/sprout/i/v0/e/"]) assert.equal(isPosthogProxyPath(path), true);
  for (const path of ["/sprouting", "/api/sprout", "/dashboard", "/assets/app.js"]) assert.equal(isPosthogProxyPath(path), false);
  for (const hostname of ["findmeadow.com", "www.findmeadow.com", "app.findmeadow.com"]) {
    let upstream;
    await handlePosthogProxy(new Request(`https://${hostname}/sprout/flags/?v=2`), async request => {
      upstream = request.url;
      return Response.json({ flags: {} });
    });
    assert.equal(upstream, "https://us.i.posthog.com/flags/?v=2");
  }
});

test("compressed event bytes, query encoding, and trusted IP survive without Meadow credentials", async () => {
  const body = gzipSync(JSON.stringify({ event: "$pageview", properties: { token: "public-token" } }));
  const request = new Request("https://app.findmeadow.com/sprout/i/v0/e/?ip=0&compression=gzip-js&data=a%2Bb%2Fc%3D", {
    method: "POST", body,
    headers: {
      "Content-Type": "text/plain", "Content-Encoding": "gzip", "User-Agent": "Test browser",
      Cookie: "__session=private", Authorization: "Bearer secret", "Proxy-Authorization": "secret",
      Referer: "https://app.findmeadow.com/oauth/callback?code=secret", "X-Internal-Token": "secret",
      "CF-Connecting-IP": "203.0.113.10", "X-Forwarded-For": "198.51.100.99", Forwarded: "for=198.51.100.99",
    },
  });
  const response = await handlePosthogProxy(request, async upstream => {
    assert.equal(upstream.url, "https://us.i.posthog.com/i/v0/e/?ip=0&compression=gzip-js&data=a%2Bb%2Fc%3D");
    assert.equal(upstream.method, "POST");
    assert.equal(upstream.redirect, "manual");
    assert.deepEqual(Buffer.from(await upstream.arrayBuffer()), body);
    assert.equal(upstream.headers.get("content-type"), "text/plain");
    assert.equal(upstream.headers.get("content-encoding"), "gzip");
    assert.equal(upstream.headers.get("user-agent"), "Test browser");
    assert.equal(upstream.headers.get("x-forwarded-for"), "203.0.113.10");
    for (const name of ["cookie", "authorization", "proxy-authorization", "referer", "x-internal-token", "forwarded", "cf-connecting-ip"]) assert.equal(upstream.headers.has(name), false);
    return Response.json({ status: 1 }, { headers: { "Set-Cookie": "upstream=value", "Cache-Control": "public, max-age=3600" } });
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 1 });
  assert.equal(response.headers.has("set-cookie"), false);
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("SDK and remote configuration use the asset origin and preserve upstream cache policy", async () => {
  for (const path of ["/static/array.js?v=1", "/array/phc_public/config?v=2"]) {
    const response = await handlePosthogProxy(new Request(`https://findmeadow.com/sprout${path}`, {
      headers: { Cookie: "private", "If-None-Match": '"version-1"', "X-Forwarded-For": "198.51.100.99" },
    }), async upstream => {
      assert.equal(upstream.url, `https://us-assets.i.posthog.com${path}`);
      assert.equal(upstream.headers.has("cookie"), false);
      assert.equal(upstream.headers.has("x-forwarded-for"), false);
      assert.equal(upstream.headers.get("if-none-match"), '"version-1"');
      return new Response("configuration", { headers: { "Cache-Control": "public, max-age=60", "Set-Cookie": "private=value" } });
    });
    assert.equal(response.headers.get("cache-control"), "public, max-age=60");
    assert.equal(response.headers.has("set-cookie"), false);
    assert.equal(await response.text(), "configuration");
  }
  const unchanged = await handlePosthogProxy(new Request("https://findmeadow.com/sprout/static/array.js"), async () => new Response(null, {
    status: 304, headers: { "Cache-Control": "public, max-age=60", ETag: '"version-1"' },
  }));
  assert.equal(unchanged.status, 304);
  assert.equal(unchanged.headers.get("cache-control"), "public, max-age=60");
  assert.equal(unchanged.headers.get("etag"), '"version-1"');
});

test("paths cannot choose another upstream and redirects stay behind the proxy", async () => {
  const fixedOrigin = await handlePosthogProxy(new Request("https://findmeadow.com/sprout//attacker.example/e/"), async upstream => {
    assert.equal(new URL(upstream.url).origin, "https://us.i.posthog.com");
    return new Response(null, { status: 204 });
  });
  assert.equal(fixedOrigin.status, 204);
  const redirected = await handlePosthogProxy(new Request("https://findmeadow.com/sprout/e"), async () => new Response(null, {
    status: 307, headers: { Location: "https://us.i.posthog.com/e/?ip=0" },
  }));
  assert.equal(redirected.status, 307);
  assert.equal(redirected.headers.get("location"), "/sprout/e/?ip=0");
  const escaped = await handlePosthogProxy(new Request("https://findmeadow.com/sprout/e/"), async () => new Response(null, {
    status: 307, headers: { Location: "https://attacker.example/collect" },
  }));
  assert.equal(escaped.status, 502);
  assert.equal(escaped.headers.has("location"), false);
});

test("failures are not cached or exposed and unrelated paths and methods never reach PostHog", async () => {
  let called = false;
  const fetcher = async () => { called = true; throw new Error("private upstream detail"); };
  assert.equal((await handlePosthogProxy(new Request("https://findmeadow.com/sprouting"), fetcher)).status, 404);
  assert.equal((await handlePosthogProxy(new Request("https://findmeadow.com/sprout/e/", { method: "DELETE" }), fetcher)).status, 405);
  assert.equal(called, false);
  const failed = await handlePosthogProxy(new Request("https://findmeadow.com/sprout/e/"), fetcher);
  assert.equal(failed.status, 502);
  assert.equal(failed.headers.get("cache-control"), "no-store");
  assert.doesNotMatch(await failed.text(), /private/);
  const missingAsset = await handlePosthogProxy(new Request("https://findmeadow.com/sprout/static/missing.js"), async () => new Response("Not found", {
    status: 404, headers: { "Cache-Control": "public, max-age=3600" },
  }));
  assert.equal(missingAsset.status, 404);
  assert.equal(missingAsset.headers.get("cache-control"), "no-store");
});
