import assert from "node:assert/strict";
import test from "node:test";
import { BridgeApi } from "../src/bridge/BridgeApi.js";

const rejectedSession = () => Response.json({ error: "Authentication required.", code: "authentication_required" }, { status: 401 });

test("uploads authorize first, refresh only the small grant request, then send the file once with its grant", async () => {
  const tokens = [], requests = [], progress = [];
  const file = new File(["fixture video bytes"], "recording.MP4", { type: "video/mp4" });
  let uploads = 0;
  const api = new BridgeApi({
    getToken: async options => { tokens.push(options); return `token-${tokens.length}`; },
    fetcher: async (path, options) => {
      assert.equal(path, "/api/bridge/projects/project/media/uploads");
      assert.equal(options.method, "POST");
      assert.deepEqual(JSON.parse(options.body), { bytes: file.size, filename: file.name, contentType: file.type, direct: true });
      requests.push(options.headers.Authorization);
      assert.equal(uploads, 0, "No file bytes may be sent before authorization succeeds");
      return requests.length === 1 ? rejectedSession() : Response.json({ uploadToken: "meadow_upload_fixture", expiresAt: Date.now() + 1800000 }, { status: 201 });
    },
    uploader: async (path, options) => {
      uploads++;
      assert.equal(path, "/api/bridge/projects/project/media");
      assert.equal(options.token, "meadow_upload_fixture");
      assert.equal(options.body.get("file").name, file.name);
      assert.equal(await options.body.get("file").text(), await file.text());
      options.onProgress({ stage: "processing" });
      return { ok: true, status: 201, data: { media: { id: "uploaded" } } };
    },
  });
  assert.deepEqual(await api.uploadMedia("project", file, { onProgress: event => progress.push(event.stage) }), { media: { id: "uploaded" } });
  assert.deepEqual(tokens, [{ skipCache: false }, { skipCache: true }]);
  assert.deepEqual(requests, ["Bearer token-1", "Bearer token-2"]);
  assert.equal(uploads, 1);
  assert.deepEqual(progress, ["authorizing", "uploading", "processing"]);
});

test("failed authorization prevents sending the file", async () => {
  const api = new BridgeApi({ getToken: async () => null, fetcher: async () => assert.fail("No anonymous grant request"), uploader: async () => assert.fail("No unauthorized file transfer") });
  await assert.rejects(api.uploadMedia("project", new File(["video"], "video.mp4")), error => error.code === "authentication_required");
});

test("file transfers never replay after authentication, server, or network failure", async () => {
  for (const failure of [
    () => ({ ok: false, status: 401, data: { error: "Retry your upload.", code: "invalid_upload_token" } }),
    () => ({ ok: false, status: 500, data: { error: "Processing failed." } }),
    () => { throw new TypeError("Network interrupted"); },
  ]) {
    let grants = 0, uploads = 0;
    const api = new BridgeApi({ getToken: async () => "session", fetcher: async () => { grants++; return Response.json({ uploadToken: "meadow_upload_fixture" }); }, uploader: async () => { uploads++; return failure(); } });
    await assert.rejects(api.uploadMedia("project", new File(["video"], "video.mp4")));
    assert.equal(grants, 1);
    assert.equal(uploads, 1);
  }
});

test("legacy multipart requests also stop after a rejected session without replaying the file", async () => {
  let attempts = 0;
  const api = new BridgeApi({ getToken: async () => "session", fetcher: async () => { attempts++; return rejectedSession(); } });
  await assert.rejects(api.project("project", "/media", { method: "POST", body: new FormData() }), error => error.code === "authentication_required");
  assert.equal(attempts, 1);
});

test("cancelling during grant issuance stops the file transfer", async () => {
  const controller = new AbortController();
  const api = new BridgeApi({ getToken: async () => "session", fetcher: async () => { controller.abort(); return Response.json({ uploadToken: "meadow_upload_fixture" }); }, uploader: async () => assert.fail("Cancelled upload must not start") });
  await assert.rejects(api.uploadMedia("project", new File(["video"], "video.mp4"), { signal: controller.signal }), { name: "AbortError" });
});

test("JSON requests refresh a cached session token after the authentication gate rejects it", async () => {
  const tokens = [], bodies = [];
  const api = new BridgeApi({
    getToken: async options => { tokens.push(options); return options.skipCache ? "fresh" : "cached"; },
    fetcher: async (path, options) => {
      bodies.push(JSON.parse(options.body));
      return options.headers.Authorization === "Bearer cached" ? rejectedSession() : Response.json({ saved: true });
    },
  });
  assert.deepEqual(await api.updateProject("project", { name: "Meadow" }), { saved: true });
  assert.deepEqual(tokens, [{ skipCache: false }, { skipCache: true }]);
  assert.deepEqual(bodies, [{ name: "Meadow" }, { name: "Meadow" }]);
});

test("repeated authentication rejection stops after one retry with an actionable session error", async () => {
  let requests = 0;
  const api = new BridgeApi({ getToken: async () => "rejected", fetcher: async () => { requests++; return rejectedSession(); } });
  await assert.rejects(api.getProjects(), error => error.status === 401 && error.code === "authentication_required" && /sign in again/i.test(error.message));
  assert.equal(requests, 2);
});

test("a missing cached token is refreshed before any authenticated request is sent", async () => {
  const options = [];
  const api = new BridgeApi({ getToken: async value => { options.push(value); return value.skipCache ? "fresh" : null; }, fetcher: async (path, request) => {
    assert.equal(request.headers.Authorization, "Bearer fresh");
    return Response.json({ projects: [] });
  } });
  assert.deepEqual(await api.getProjects(), { projects: [] });
  assert.deepEqual(options, [{ skipCache: false }, { skipCache: true }]);
});

test("an ended session never sends an anonymous upload", async () => {
  const api = new BridgeApi({ getToken: async () => null, fetcher: async () => assert.fail("Anonymous requests must not be sent") });
  await assert.rejects(api.project("project", "/media", { method: "POST", body: new FormData() }), error => error.code === "authentication_required" && /sign in again/i.test(error.message));
});

test("authorization, provider, server and network failures never replay a write", async () => {
  for (const failure of [
    () => Response.json({ error: "Provider rejected credentials", code: "provider_auth" }, { status: 401 }),
    () => Response.json({ error: "Unknown unauthorized response" }, { status: 401 }),
    () => Response.json({ error: "Access denied" }, { status: 403 }),
    () => Response.json({ error: "Request failed" }, { status: 500 }),
    () => { throw new TypeError("Network interrupted"); },
  ]) {
    let requests = 0;
    const api = new BridgeApi({ getToken: async () => "token", fetcher: async () => { requests++; return failure(); } });
    await assert.rejects(api.project("project", "/posts", { method: "POST", body: { caption: "Publish this once" } }));
    assert.equal(requests, 1);
  }
});

test("a read recovers from one dropped connection", async () => {
  let requests = 0, tokenRequests = 0;
  const api = new BridgeApi({
    getToken: async () => { tokenRequests++; return "token"; },
    fetcher: async () => {
      requests++;
      if (requests === 1) throw new TypeError("Failed to fetch");
      return Response.json({ accounts: [{ id: "connected-account" }] });
    },
  });
  assert.deepEqual(await api.project("project", "/accounts"), { accounts: [{ id: "connected-account" }] });
  assert.equal(requests, 2);
  assert.equal(tokenRequests, 1);
});

test("a recurring network failure stops after one read retry with an actionable error", async () => {
  let requests = 0, lastFailure;
  const api = new BridgeApi({ getToken: async () => "token", fetcher: async () => {
    requests++;
    lastFailure = new TypeError("Failed to fetch");
    throw lastFailure;
  } });
  await assert.rejects(api.project("project", "/accounts"), error => {
    assert.equal(error.code, "network_error");
    assert.match(error.message, /check your internet connection and try again/i);
    assert.equal(error.cause, lastFailure);
    return true;
  });
  assert.equal(requests, 2);
});

test("cancellation after a dropped connection prevents the read retry", async () => {
  const controller = new AbortController();
  let requests = 0;
  const api = new BridgeApi({ getToken: async () => "token", fetcher: async () => {
    requests++;
    controller.abort();
    throw new TypeError("Failed to fetch");
  } });
  await assert.rejects(api.getProjects(controller.signal), error => error === controller.signal.reason && error.name === "AbortError");
  assert.equal(requests, 1);
});

test("fetch cancellation stays an AbortError without retrying", async () => {
  const cancellation = new DOMException("Request cancelled", "AbortError");
  let requests = 0;
  const api = new BridgeApi({ getToken: async () => "token", fetcher: async () => { requests++; throw cancellation; } });
  await assert.rejects(api.getProjects(), error => error === cancellation);
  assert.equal(requests, 1);
});

test("provider authorization errors do not retry reads", async () => {
  let requests = 0;
  const api = new BridgeApi({ getToken: async () => "token", fetcher: async () => {
    requests++;
    return Response.json({ error: "Provider access denied", code: "provider_auth" }, { status: 403 });
  } });
  await assert.rejects(api.project("project", "/accounts/account/options"), error => error.status === 403 && error.code === "provider_auth" && error.message === "Provider access denied");
  assert.equal(requests, 1);
});

test("token-provider network failures are actionable without sending an API request", async () => {
  const failure = new TypeError("Failed to fetch");
  let tokenRequests = 0;
  const api = new BridgeApi({ getToken: async () => { tokenRequests++; throw failure; }, fetcher: async () => assert.fail("No API request without a token") });
  await assert.rejects(api.getProjects(), error => error.code === "network_error" && error.cause === failure && /check your internet connection and try again/i.test(error.message));
  assert.equal(tokenRequests, 1);
});

test("multipart requests never replay after a dropped connection", async () => {
  let requests = 0;
  const failure = new TypeError("Failed to fetch");
  const api = new BridgeApi({ getToken: async () => "token", fetcher: async () => { requests++; throw failure; } });
  await assert.rejects(api.project("project", "/media", { method: "POST", body: new FormData() }), error => error.code === "network_error" && error.cause === failure);
  assert.equal(requests, 1);
});

test("cancelling a request during token refresh prevents the retry", async () => {
  const controller = new AbortController();
  let requests = 0;
  const api = new BridgeApi({ getToken: async ({ skipCache }) => { if (skipCache) controller.abort(); return "token"; }, fetcher: async () => { requests++; return rejectedSession(); } });
  await assert.rejects(api.getProjects(controller.signal), { name: "AbortError" });
  assert.equal(requests, 1);
});

test("local preview uses its preview header without calling Clerk", async () => {
  const api = new BridgeApi({ preview: true, getToken: async () => assert.fail("Preview does not use Clerk"), fetcher: async (path, options) => {
    assert.equal(options.headers["X-Bridge-Preview"], "1");
    assert.equal(options.headers.Authorization, undefined);
    return Response.json({ projects: [] });
  } });
  assert.deepEqual(await api.getProjects(), { projects: [] });
});

function directGrant(file, partSize = 4) {
  return { mode: "r2-multipart", id: "upload-fixture", expiresAt: Date.now() + 1800000, partSize,
    parts: Array.from({ length: Math.ceil(file.size / partSize) }, (_, index) => ({ partNumber: index + 1, bytes: Math.min(partSize, file.size - index * partSize), url: `https://account.r2.cloudflarestorage.com/bucket/key?partNumber=${index + 1}&signature=fixture` })) };
}

test("direct uploads send exact raw parts, aggregate file progress and complete with ETags and fresh authentication", async () => {
  const file = new File(["0123456789"], "clip.mp4", { type: "video/mp4" }), grant = directGrant(file);
  const progress = [], tokens = [], transfers = [], requests = [];
  const api = new BridgeApi({
    getToken: async options => { tokens.push(options); return `session-${tokens.length}`; },
    fetcher: async (path, options) => {
      requests.push({ path, options });
      if (path.endsWith("/uploads")) {
        assert.deepEqual(JSON.parse(options.body), { bytes: 10, filename: "clip.mp4", contentType: "video/mp4", direct: true });
        return Response.json(grant);
      }
      assert.equal(path, "/api/bridge/projects/project/media/uploads/upload-fixture/complete");
      assert.equal(options.headers.Authorization, "Bearer session-2");
      assert.deepEqual(JSON.parse(options.body), { parts: [{ partNumber: 1, etag: '"etag-1"' }, { partNumber: 2, etag: '"etag-2"' }, { partNumber: 3, etag: '"etag-3"' }] });
      assert.equal(transfers.length, 3);
      assert.deepEqual(progress.at(-1), { stage: "processing", loaded: 10, total: 10 });
      return Response.json({ media: { id: "uploaded" } });
    },
    uploader: () => assert.fail("A direct grant must not transfer through Meadow"),
    partUploader: async (url, options) => {
      const index = transfers.length;
      assert.equal(url, grant.parts[index].url);
      assert.deepEqual(Object.keys(options).sort(), ["body", "onProgress", "signal"]);
      assert.equal(options.body.type, "application/octet-stream");
      assert.equal(options.body.size, grant.parts[index].bytes);
      assert.equal(progress.some(event => event.stage === "processing"), false);
      transfers.push(await options.body.text());
      options.onProgress({ stage: "uploading", loaded: options.body.size / 2, total: options.body.size });
      return { ok: true, status: 200, etag: `"etag-${index + 1}"` };
    },
  });
  assert.deepEqual(await api.uploadMedia("project", file, { onProgress: event => progress.push(event) }), { media: { id: "uploaded" } });
  assert.deepEqual(transfers, ["0123", "4567", "89"]);
  assert.deepEqual(tokens, [{ skipCache: false }, { skipCache: true }]);
  assert.equal(requests.length, 2);
  assert.deepEqual(progress.filter(event => event.stage === "uploading").map(event => event.loaded), [0, 2, 4, 6, 8, 9, 10]);
  assert.ok(progress.every(event => event.total === file.size));
});

test("retrying a direct part reuses the same URL and slice without double-counting progress or restarting initialization", async () => {
  const file = new File(["012345"], "clip.mp4"), grant = directGrant(file), sends = [], progress = [];
  let grants = 0, completions = 0;
  const api = new BridgeApi({ getToken: async () => "session", retryWait: async () => {}, fetcher: async (path, options) => {
    if (path.endsWith("/uploads")) { grants++; return Response.json(grant); }
    assert.equal(options.method, "POST"); completions++;
    return Response.json({ media: { id: "uploaded" } });
  }, partUploader: async (url, options) => {
    sends.push({ url, body: options.body });
    options.onProgress({ loaded: sends.length === 1 ? 3 : options.body.size, total: options.body.size });
    if (sends.length === 1) throw Object.assign(new Error("Connection interrupted"), { code: "network_error" });
    if (sends.length === 2) return { ok: false, status: 503 };
    return { ok: true, status: 200, etag: `etag-${sends.length}` };
  } });
  await api.uploadMedia("project", file, { onProgress: event => progress.push(event) });
  assert.equal(grants, 1); assert.equal(completions, 1); assert.equal(sends.length, 4);
  assert.equal(sends[0].url, sends[1].url); assert.equal(sends[1].url, sends[2].url);
  assert.equal(sends[0].body, sends[1].body); assert.equal(sends[1].body, sends[2].body);
  const loaded = progress.filter(event => event.stage === "uploading").map(event => event.loaded);
  assert.ok(loaded.every((value, index) => value >= (loaded[index - 1] || 0) && value <= file.size));
  assert.equal(loaded.at(-1), file.size);
});

test("direct part failure retries are bounded and clean up without the caller's signal", async () => {
  for (const status of [403, 500]) {
    const file = new File(["part"], "clip.mp4"), grant = directGrant(file), controller = new AbortController();
    let sends = 0, cleanups = 0;
    const api = new BridgeApi({ getToken: async () => "session", retryWait: async () => {}, fetcher: async (path, options) => {
      if (path.endsWith("/uploads")) return Response.json(grant);
      assert.equal(path, "/api/bridge/projects/project/media/uploads/upload-fixture");
      assert.equal(options.method, "DELETE"); assert.equal(options.signal, undefined); cleanups++;
      return Response.json({ aborted: true });
    }, partUploader: async () => { sends++; return { ok: false, status }; } });
    await assert.rejects(api.uploadMedia("project", file, { signal: controller.signal }), error => error.status === status);
    assert.equal(sends, status === 403 ? 1 : 3); assert.equal(cleanups, 1);
  }
});

test("direct uploads never complete without a readable ETag", async () => {
  const file = new File(["part"], "clip.mp4");
  let cleanups = 0;
  const api = new BridgeApi({ getToken: async () => "session", fetcher: async (path, options) => {
    if (path.endsWith("/uploads")) return Response.json(directGrant(file));
    assert.equal(options.method, "DELETE"); cleanups++; return Response.json({ aborted: true });
  }, partUploader: async () => ({ ok: true, status: 200, etag: null }) });
  await assert.rejects(api.uploadMedia("project", file), /could not confirm/);
  assert.equal(cleanups, 1);
});

test("idempotent completion refreshes rejected authentication and recovers from a lost response without sending parts again", async () => {
  const file = new File(["part"], "clip.mp4"), tokens = [], bodies = [];
  let sends = 0, completions = 0;
  const api = new BridgeApi({ getToken: async options => { tokens.push(options); return "session"; }, retryWait: async () => {}, fetcher: async (path, options) => {
    if (path.endsWith("/uploads")) return Response.json(directGrant(file));
    assert.ok(path.endsWith("/complete")); completions++; bodies.push(options.body);
    if (completions === 1) return rejectedSession();
    if (completions === 2) throw new TypeError("Response lost");
    return Response.json({ media: { id: "uploaded" } });
  }, partUploader: async () => { sends++; return { ok: true, status: 200, etag: '"etag"' }; } });
  assert.deepEqual(await api.uploadMedia("project", file), { media: { id: "uploaded" } });
  assert.equal(sends, 1); assert.equal(completions, 3);
  assert.equal(new Set(bodies).size, 1);
  assert.deepEqual(tokens, [{ skipCache: false }, { skipCache: true }, { skipCache: true }, { skipCache: true }]);
});

test("direct completion waits through a surviving server lease without replaying parts or aborting the upload", async () => {
  const file = new File(["part"], "clip.mp4"), bodies = [], waits = [];
  let sends = 0, completions = 0;
  const api = new BridgeApi({ getToken: async () => "session", retryWait: async ms => waits.push(ms), fetcher: async (path, options) => {
    if (path.endsWith("/uploads")) return Response.json(directGrant(file));
    assert.ok(path.endsWith("/complete"));
    assert.equal(options.method, "POST", "Recoverable completion must not delete the upload");
    bodies.push(options.body); completions++;
    return completions < 3
      ? Response.json({ code: "account_busy", error: "This upload is still being completed." }, { status: 409 })
      : Response.json({ media: { id: "uploaded" } });
  }, partUploader: async () => { sends++; return { ok: true, status: 200, etag: '"etag"' }; } });
  assert.deepEqual(await api.uploadMedia("project", file), { media: { id: "uploaded" } });
  assert.equal(sends, 1); assert.equal(completions, 3);
  assert.equal(new Set(bodies).size, 1);
  assert.deepEqual(waits, [500, 1000]);
});

test("an ordinary direct completion conflict remains fatal and cleans up without retrying", async () => {
  const file = new File(["part"], "clip.mp4");
  let completions = 0, cleanups = 0;
  const api = new BridgeApi({ getToken: async () => "session", retryWait: async () => assert.fail("Ordinary conflicts are not transient"), fetcher: async (path, options) => {
    if (path.endsWith("/uploads")) return Response.json(directGrant(file));
    if (path.endsWith("/complete")) {
      completions++;
      return Response.json({ code: "upload_conflict", error: "The uploaded parts changed." }, { status: 409 });
    }
    assert.equal(options.method, "DELETE"); cleanups++;
    return Response.json({ aborted: true });
  }, partUploader: async () => ({ ok: true, status: 200, etag: '"etag"' }) });
  await assert.rejects(api.uploadMedia("project", file), error => error.status === 409 && error.code === "upload_conflict");
  assert.equal(completions, 1); assert.equal(cleanups, 1);
});

test("cancelling during direct authorization or a part cleans up and never completes", async () => {
  for (const cancelAt of ["authorization", "part"]) {
    const file = new File(["012345"], "clip.mp4"), controller = new AbortController();
    let sends = 0, cleanups = 0;
    const api = new BridgeApi({ getToken: async () => "session", fetcher: async (path, options) => {
      if (path.endsWith("/uploads")) {
        if (cancelAt === "authorization") controller.abort();
        return Response.json(directGrant(file));
      }
      assert.equal(options.method, "DELETE"); assert.equal(options.signal, undefined); cleanups++;
      return Response.json({ aborted: true });
    }, partUploader: async () => { sends++; controller.abort(); throw controller.signal.reason; } });
    await assert.rejects(api.uploadMedia("project", file, { signal: controller.signal }), error => error === controller.signal.reason);
    assert.equal(sends, cancelAt === "part" ? 1 : 0); assert.equal(cleanups, 1);
  }
});

test("a truncated completion response retries the same completion instead of reporting a missing media record as success", async () => {
  const file = new File(["part"], "clip.mp4");
  let completions = 0, sends = 0;
  const api = new BridgeApi({ getToken: async () => "session", retryWait: async () => {}, fetcher: async (path, options) => {
    if (path.endsWith("/uploads")) return Response.json(directGrant(file));
    assert.ok(path.endsWith("/complete")); completions++;
    if (completions === 1) return { ok: true, status: 200, json: async () => { throw new TypeError("Body stream interrupted"); } };
    return Response.json({ media: { id: "uploaded" } });
  }, partUploader: async () => { sends++; return { ok: true, status: 200, etag: '"etag"' }; } });
  assert.deepEqual(await api.uploadMedia("project", file), { media: { id: "uploaded" } });
  assert.equal(completions, 2); assert.equal(sends, 1);
});

test("direct initialization is never replayed after a lost response", async () => {
  let requests = 0;
  const api = new BridgeApi({ getToken: async () => "session", fetcher: async () => { requests++; throw new TypeError("Response lost"); }, partUploader: async () => assert.fail("No grant was received") });
  await assert.rejects(api.uploadMedia("project", new File(["part"], "clip.mp4")), error => error.code === "network_error");
  assert.equal(requests, 1);
});

test("invalid direct grants cannot send media to another host or mismatch the signed part sizes", async () => {
  const file = new File(["part"], "clip.mp4");
  for (const modify of [grant => { grant.parts[0].url = "https://attacker.example/upload"; }, grant => { grant.parts[0].bytes--; }, grant => { grant.parts[0].partNumber = 2; }]) {
    const grant = directGrant(file); modify(grant);
    const api = new BridgeApi({ getToken: async () => "session", fetcher: async (path, options) => {
      if (path.endsWith("/uploads")) return Response.json(grant);
      assert.equal(options.method, "DELETE"); return Response.json({ aborted: true });
    }, partUploader: async () => assert.fail("Invalid grant must not transfer media") });
    await assert.rejects(api.uploadMedia("project", file), /could not start/);
  }
});
