import test from "node:test";
import assert from "node:assert/strict";
import { InstagramProvider, ThreadsProvider, FacebookProvider } from "../src/bridge/platforms/MetaProviders.js";
import { YouTubeProvider, GoogleBusinessProvider } from "../src/bridge/platforms/GoogleProviders.js";
import { TikTokProvider } from "../src/bridge/platforms/TikTokProvider.js";
import { XProvider } from "../src/bridge/platforms/XProvider.js";
import { LinkedInProvider } from "../src/bridge/platforms/LinkedInProvider.js";
import { PinterestProvider } from "../src/bridge/platforms/PinterestProvider.js";

const image = { id: "image", filename: "image.jpg", kind: "image", mime: "image/jpeg", status: "ready", bytes: 4, width: 1080, height: 1080 };
const video = { id: "video", filename: "video.mp4", kind: "video", mime: "video/mp4", status: "ready", bytes: 4, width: 1080, height: 1920, durationSec: 10 };
const turn = () => new Promise(resolve => setImmediate(resolve));

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function context(media = []) {
  const ctx = {
    account: { remoteId: "account", options: {} }, credentials: { accessToken: "token" },
    delivery: { id: "delivery", createdAt: Date.parse("2026-09-14T12:00:00Z") }, progress: {},
    content: { caption: "A caption", title: "A title", format: "auto", media, settings: { privacy: "SELF_ONLY", boardId: "board" } },
    media: {
      prepare: async item => ({ ...item, key: item.id }),
      url: item => `https://media.example/${item.id}`,
      storage: { stream: () => new Blob(["data"]).stream(), blob: async () => new Blob(["data"]) },
    },
  };
  ctx.checkpoint = async patch => { ctx.progress = { ...ctx.progress, ...structuredClone(patch) }; };
  return ctx;
}

function blockCheckpoint(ctx, matches) {
  const entered = deferred(), release = deferred(), saved = ctx.checkpoint;
  let blocked = false;
  ctx.checkpoint = async patch => {
    if (!blocked && matches(patch)) { blocked = true; entered.resolve(patch); await release.promise; }
    await saved(patch);
  };
  return { entered, release };
}

for (const Provider of [InstagramProvider, ThreadsProvider]) {
  test(`${Provider.name} saves its finalizing marker before publishing`, async () => {
    const ctx = context(); ctx.progress = { containerId: "container", phase: "container" };
    let publications = 0;
    const provider = new Provider({ transport: { request: async url => {
      if (url.includes("_publish")) {
        assert.equal(ctx.progress.phase, "finalizing");
        publications++; return { id: "post" };
      }
      return url.includes("permalink") ? { permalink: "https://example.com/post" } : { status: "FINISHED", status_code: "FINISHED" };
    } } });
    const gate = blockCheckpoint(ctx, patch => patch.phase === "finalizing");
    const pending = provider.poll(ctx);
    try {
      await gate.entered.promise; await turn();
      assert.equal(publications, 0, "publishing must wait until recovery can see the finalizing marker");
    } finally { gate.release.resolve(); }
    assert.equal((await pending).status, "published");
    assert.equal(publications, 1);
  });

  test(`${Provider.name} preserves finalizing if saving the confirmed publication fails`, async () => {
    const ctx = context(); ctx.progress = { containerId: "container", phase: "container" };
    let publications = 0;
    const provider = new Provider({ transport: { request: async url => {
      if (url.includes("_publish")) { publications++; return { id: "post" }; }
      return { status: "FINISHED", status_code: "FINISHED" };
    } } });
    ctx.checkpoint = async patch => {
      if (patch.publicationId) throw new Error("Durable storage unavailable");
      ctx.progress = { ...ctx.progress, ...patch };
    };
    await assert.rejects(provider.poll(ctx), /Durable storage unavailable/);
    assert.equal(publications, 1);
    assert.equal(ctx.progress.phase, "finalizing", "a persistence failure must not make a completed publication retryable");
    await assert.rejects(provider.poll(ctx), error => error.uncertain);
    assert.equal(publications, 1, "recovery must not publish a second time");
  });
}

test("Facebook saves its finishing marker before finishing a Reel", async () => {
  const ctx = context([video]); ctx.progress = { publicationId: "video-id", phase: "short_uploaded", format: "reel" };
  let finishes = 0;
  const provider = new FacebookProvider({ transport: { request: async () => { finishes++; return { success: true }; } } });
  const gate = blockCheckpoint(ctx, patch => patch.phase === "short_finishing");
  const pending = provider.poll(ctx);
  try {
    await gate.entered.promise; await turn();
    assert.equal(finishes, 0);
  } finally { gate.release.resolve(); }
  assert.equal((await pending).status, "processing");
  assert.equal(finishes, 1);
});

test("Facebook cannot repeat a successful finish when its completion checkpoint fails", async () => {
  const ctx = context([video]); ctx.progress = { publicationId: "video-id", phase: "short_uploaded", format: "reel" };
  let finishes = 0;
  const provider = new FacebookProvider({ transport: { request: async (url, options) => {
    if (options.method === "POST") { finishes++; return { success: true }; }
    return { status: { video_status: "ready" } };
  } } });
  ctx.checkpoint = async patch => {
    if (patch.finishAccepted) throw new Error("Durable storage unavailable");
    ctx.progress = { ...ctx.progress, ...patch };
  };
  await assert.rejects(provider.poll(ctx), /Durable storage unavailable/);
  assert.equal(ctx.progress.phase, "short_finishing");
  assert.equal((await provider.poll(ctx)).status, "processing");
  assert.equal(finishes, 1);
});

test("YouTube durably saves the resumable upload URL before sending media bytes", async () => {
  const ctx = context([video]);
  let uploads = 0;
  const provider = new YouTubeProvider({ transport: { request: async (url, options) => {
    if (options.method === "POST") return { headers: new Headers({ location: "https://www.googleapis.com/upload/session" }) };
    uploads++; return { id: "video-id" };
  } } });
  const gate = blockCheckpoint(ctx, patch => patch.phase === "upload");
  const pending = provider.publish(ctx);
  try {
    await gate.entered.promise; await turn();
    assert.equal(uploads, 0, "media upload must wait for the resumable URL to be durable");
  } finally { gate.release.resolve(); }
  assert.equal((await pending).externalId, "video-id");
  assert.equal(uploads, 1);
});

test("YouTube sends no media bytes when saving the upload session fails", async () => {
  const ctx = context([video]);
  let uploads = 0;
  const provider = new YouTubeProvider({ transport: { request: async (url, options) => {
    if (options.method === "POST") return { headers: new Headers({ location: "https://www.googleapis.com/upload/session" }) };
    uploads++; return { id: "video-id" };
  } } });
  ctx.checkpoint = async () => { throw new Error("Durable storage unavailable"); };
  await assert.rejects(provider.publish(ctx), /Durable storage unavailable/);
  assert.equal(uploads, 0);
});

test("providers wait for their publication identifier checkpoint before returning", async t => {
  const cases = [
    { Provider: XProvider, run: (provider, ctx) => provider.finish(ctx, []), response: { data: { id: "post" } } },
    { Provider: LinkedInProvider, run: (provider, ctx) => provider.finish(ctx, []), response: { headers: new Headers({ "x-restli-id": "urn:li:share:post" }) } },
    { Provider: PinterestProvider, media: [image], response: { id: "pin" } },
    { Provider: GoogleBusinessProvider, response: { name: "accounts/account/locations/location/localPosts/post", state: "LIVE" } },
    { Provider: FacebookProvider, response: { id: "post" } },
    { Provider: TikTokProvider, media: [image], response: { data: { publish_id: "publish-id" } } },
    { Provider: YouTubeProvider, media: [video], response: { id: "video-id" }, progress: { uploadUrl: "https://www.googleapis.com/upload/session" } },
  ];
  for (const item of cases) {
    await t.test(item.Provider.name, async () => {
      const ctx = context(item.media); ctx.progress = item.progress || {};
      const provider = new item.Provider({ transport: { request: async () => item.response } });
      const gate = blockCheckpoint(ctx, patch => Boolean(patch.publicationId || patch.publishId || patch.videoId));
      let returned = false;
      const pending = (item.run ? item.run(provider, ctx) : provider.publish(ctx)).then(result => { returned = true; return result; });
      try {
        await gate.entered.promise; await turn();
        assert.equal(returned, false, "the worker must not advance before the platform identifier is durable");
      } finally { gate.release.resolve(); }
      const result = await pending;
      assert.ok(["published", "processing"].includes(result.status));
      assert.equal(returned, true);
    });
  }
});
