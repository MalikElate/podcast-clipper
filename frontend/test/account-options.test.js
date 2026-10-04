import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { accountOptionsVersion, createAccountOptionsRequests, mergeAccountOptions } from "../src/bridge/accountOptions.js";

const account = { id: "tiktok-one", platform: "tiktok", label: "TikTok creator", status: "connected", updatedAt: 10, optionsUpdatedAt: null };
const options = { tiktokPermissions: { canPublish: true, canUpload: true }, tiktokDirectPostPrivateOnly: false, creator: { nickname: "Creator", username: "creator", privacyOptions: ["PUBLIC_TO_EVERYONE", "SELF_ONLY"], maxVideoSeconds: 600 } };
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

test("failed TikTok settings can be refreshed in both editors without changing the draft", async () => {
  const cacheDir = await mkdtemp(join(tmpdir(), "meadow-account-options-test-"));
  const server = await createServer({
    root: fileURLToPath(new URL("..", import.meta.url)), configFile: false, cacheDir, plugins: [react()],
    server: { middlewareMode: true, hmr: false, ws: false }, appType: "custom", optimizeDeps: { noDiscovery: true, include: [] },
  });
  try {
    const { PostEditor } = await server.ssrLoadModule("/src/bridge/Composer.jsx");
    for (const compact of [false, true]) {
      const calls = [], responses = [];
      let cached;
      const requests = createAccountOptionsRequests({
        request(projectId, path, init) { calls.push({ projectId, path, ...init }); const response = deferred(); responses.push(response); return response.promise; },
        onChange(context, patch) { cached = { ...cached, ...context, ...patch }; },
      });
      const post = {
        key: "saved-draft", caption: "Keep this caption", title: "", format: "video", mediaIds: ["video-one"], accountIds: [account.id],
        overrides: { [account.id]: { caption: "Keep this account caption", settings: { privacy: "PUBLIC_TO_EVERYONE", consent: false, allowComments: true } } },
        schedule: { mode: "now", timeZone: "UTC" },
      };
      const original = structuredClone(post);
      const refresh = id => requests.load("project-one", account, { force: true });
      const render = () => renderToStaticMarkup(createElement(PostEditor, {
        post, compact, accounts: [mergeAccountOptions(account, cached, "project-one")],
        media: [{ id: "video-one", kind: "video", filename: "keep.mp4", url: "/video-one" }],
        catalog: [{ id: "tiktok", name: "TikTok", formats: ["video"], captionLimit: 2200 }],
        onChange() { assert.fail("Refreshing options must not edit post content or grant consent"); }, onPickMedia() {}, onRefreshOptions: refresh,
      }));
      const first = requests.load("project-one", account);
      responses[0].reject(new Error("The platform rejected the request (HTTP 401)."));
      await first;
      const failed = render();
      assert.match(failed, /HTTP 401/);
      assert.match(failed, /Refresh TikTok settings/);
      assert.doesNotMatch(failed, /<option value="PUBLIC_TO_EVERYONE"/);

      const retry = refresh(account.id);
      assert.equal(calls[1].path, `/accounts/${account.id}/options?refresh=1`);
      const pending = render();
      assert.match(pending, /<button type="button" class="bridge-text-button" disabled="">[\s\S]*?Refreshing settings…<\/button>/);
      responses[1].resolve({ options });
      await retry;
      const recovered = render();
      assert.doesNotMatch(recovered, /HTTP 401|Refresh TikTok settings|Refreshing settings/);
      assert.match(recovered, /<option value="PUBLIC_TO_EVERYONE" selected="">Everyone<\/option>/);
      assert.match(recovered, /<textarea[^>]*aria-label="Caption"[^>]*>Keep this caption<\/textarea>/);
      assert.match(recovered, /Keep this account caption/);
      assert.match(recovered, /keep.mp4/);
      assert.match(recovered, /By posting, I agree/);
      assert.deepEqual(post, original);
      assert.equal(post.overrides[account.id].settings.consent, false);
      assert.equal(cached.optionsError, null);
      assert.equal(cached.optionsLoading, false);
    }
  } finally { await server.close(); await rm(cacheDir, { recursive: true, force: true }); }
});

test("a newer retry wins even when an aborted request resolves late", async () => {
  const calls = [], changes = [];
  const requests = createAccountOptionsRequests({
    request(projectId, path, { signal }) { const response = deferred(); calls.push({ ...response, signal }); return response.promise; },
    onChange(context, patch) { changes.push({ context, patch }); },
  });
  const first = requests.load("one", account), retry = requests.load("one", account, { force: true });
  assert.equal(calls[0].signal.aborted, true);
  calls[1].resolve({ options }); await retry;
  calls[0].resolve({ options: { stale: true } }); await first;
  assert.equal(changes.filter(change => change.patch.options).length, 1);
  assert.deepEqual(changes.at(-1).patch.options, options);
  assert.equal(changes.at(-1).patch.optionsLoading, false);
});

test("selection or workspace cleanup rejects late reads and allows the new scope", async () => {
  const calls = [], changes = [];
  const requests = createAccountOptionsRequests({
    request(projectId, path, { signal }) { const response = deferred(); calls.push({ ...response, signal }); return response.promise; },
    onChange(context, patch) { changes.push({ context, patch }); },
  });
  const first = requests.load("old-project", account, { scope: "old" });
  requests.cancelAll();
  const next = requests.load("new-project", account, { scope: "new" });
  calls[0].reject(new Error("Old account failure")); await first;
  assert.equal(calls[0].signal.aborted, true);
  assert.equal(changes.some(change => change.patch.optionsError), false);
  calls[1].resolve({ options }); await next;
  assert.equal(changes.at(-1).context.projectId, "new-project");
  assert.equal(changes.at(-1).context.scope, "new");
  assert.deepEqual(changes.at(-1).patch.options, options);
});

test("newer polled options replace cached successes or failures without a stale overlay", () => {
  const firstAccount = { ...account, optionsUpdatedAt: 20, options: { old: true } };
  const cached = { projectId: "one", version: accountOptionsVersion(firstAccount), options: { stale: true }, optionsError: "Old failure" };
  const refreshed = { ...firstAccount, optionsUpdatedAt: 30, options };
  assert.equal(refreshed.updatedAt, firstAccount.updatedAt);
  assert.deepEqual(mergeAccountOptions(refreshed, cached, "one"), refreshed);
  assert.deepEqual(mergeAccountOptions(firstAccount, cached, "different-project"), firstAccount);
  assert.deepEqual(mergeAccountOptions({ ...firstAccount, status: "reconnect_required" }, cached, "one"), { ...firstAccount, status: "reconnect_required" });
});
