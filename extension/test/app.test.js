import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(new URL("../../frontend/package.json", import.meta.url));
const { createServer } = await import(pathToFileURL(require.resolve("vite")));
const { default: react } = await import(pathToFileURL(require.resolve("@vitejs/plugin-react")));
const { createElement } = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const text = markup => markup.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

test("the extension shell connects explicitly and only reuses cross-posting", async t => {
  const cacheDir = await mkdtemp(join(tmpdir(), "meadow-extension-ui-"));
  const root = fileURLToPath(new URL("../../frontend", import.meta.url));
  const appId = join(root, "src", "extension-ui-test-App.jsx");
  // Resolve React through the installed frontend runtime without creating or
  // changing any frontend source files. The compiled source is the real App.
  const appSource = (await readFile(new URL("../src/App.jsx", import.meta.url), "utf8")).replaceAll("../../frontend/src/", "./");
  const server = await createServer({
    root, configFile: false, cacheDir,
    plugins: [react(), {
      name: "extension-ui-test-contract", enforce: "pre",
      resolveId(source, importer) {
        if (source === "/src/extension-ui-test-App.jsx") return appId;
        if (source.endsWith("/BridgeApi.js") || source === "./BridgeApi.js" || source === "./api.js" && importer === appId) return "\0extension-ui-test-api";
        if (source === "./auth.js" && importer === appId) return "\0extension-ui-test-auth";
        if (source === "./app.css" && importer === appId) return "\0extension-ui-test.css";
      },
      load(id) {
        if (id === appId) return appSource;
        if (id === "\0extension-ui-test-api") return "export const MAX_UPLOAD_BYTES=90*1024**2; export const api={};";
        if (id === "\0extension-ui-test-auth") return "export const auth={};";
        if (id === "\0extension-ui-test.css") return "";
      },
    }],
    server: { middlewareMode: true, hmr: false, ws: false }, appType: "custom", optimizeDeps: { noDiscovery: true, include: [] },
  });
  try {
    const ui = await server.ssrLoadModule("/src/extension-ui-test-App.jsx");
    const render = (component, props) => renderToStaticMarkup(createElement(component, props));

    await t.test("initial loading only reads configuration and accessible workspaces", async () => {
      const calls = [], controller = new AbortController();
      const client = {
        request: async (path, options) => { calls.push([path, options]); return { platforms: [], features: { publishing: true } }; },
        getProjects: async signal => { calls.push(["/projects", { signal }]); return { projects: [] }; },
      };
      const result = await ui.loadWorkspaces(client, controller.signal);
      assert.deepEqual(result.projects, []);
      assert.deepEqual(calls.map(([path]) => path), ["/config", "/projects"]);
      assert.ok(calls.every(([, options]) => options.signal === controller.signal && !options.method && !options.body));
    });

    await t.test("resource loads are scoped and reject incomplete or cancelled refreshes", async () => {
      const calls = [], controller = new AbortController();
      const client = { project: async (id, path, options) => {
        calls.push([id, path, options.signal]);
        if (path === "/media") throw new Error("Media could not load");
        return { accounts: [{ id: "account-one" }] };
      } };
      await assert.rejects(ui.loadProjectResources(client, "workspace-one", controller.signal), /Media could not load/);
      assert.deepEqual(calls.map(([id, path]) => [id, path]), [["workspace-one", "/accounts"], ["workspace-one", "/media"]]);
      const abortedClient = { project: async () => { controller.abort(); return {}; } };
      await assert.rejects(ui.loadProjectResources(abortedClient, "workspace-one", controller.signal), { name: "AbortError" });
    });

    await t.test("credentials and workspace membership must be validated before enabling a preserved composer", () => {
      const state = {
        connection: { status: "connected", keyId: "key-one" }, acknowledged: true,
        workspace: { keyId: "key-one", projects: [{ id: "workspace-one" }], loading: false, error: "" },
        projectId: "workspace-one", resources: { keyId: "key-one", projectId: "workspace-one" },
        resourcesLoading: false, resourcesError: "",
      };
      assert.equal(ui.canCompose(state), true);
      assert.equal(ui.canCompose({ ...state, connection: { status: "disconnected" } }), false);
      assert.equal(ui.canCompose({ ...state, acknowledged: false }), false);
      assert.equal(ui.canCompose({ ...state, connection: { status: "connected", keyId: "key-two" } }), false);
      assert.equal(ui.canCompose({ ...state, workspace: { ...state.workspace, keyId: "key-two" } }), false);
      assert.equal(ui.canCompose({ ...state, resourcesError: "Could not refresh" }), false);
      assert.equal(ui.canCompose({ ...state, workspace: { ...state.workspace, projects: [] } }), false);
      assert.equal(ui.canCompose({ ...state, connection: { status: "connected", keyId: "key-two" }, workspace: { ...state.workspace, keyId: "key-two" }, resources: { ...state.resources, keyId: "key-two" } }), true);
    });

    await t.test("partial uploads keep successful media and never publish or replay failures", async () => {
      const calls = [], events = [], files = [{ name: "first.jpg", size: 1 }, { name: "second.jpg", size: 2 }, { name: "large.jpg", size: 101 }];
      const client = { uploadMedia: async (id, file, options) => {
        calls.push([id, file.name]); options.onProgress({ stage: "uploading", loaded: 1 });
        if (file.name === "second.jpg") throw new Error("Upload interrupted");
        return { media: { id: "first", kind: "image", status: "ready" } };
      } };
      const result = await ui.uploadFiles(client, "workspace-one", files, 100, { onProgress: event => events.push(event) });
      assert.deepEqual(result.uploaded.map(media => media.id), ["first"]);
      assert.deepEqual(calls, [["workspace-one", "first.jpg"], ["workspace-one", "second.jpg"]]);
      assert.match(result.error, /second.jpg: Upload interrupted/);
      assert.match(result.error, /large.jpg: exceeds/);
      assert.deepEqual(events[0], { stage: "uploading", loaded: 1, filename: "first.jpg", fileIndex: 1, fileCount: 3 });
      assert.equal(events.at(-1).stage, "failed");
    });

    await t.test("cancelled or unauthorized uploads stop before sending later files", async () => {
      for (const unauthorized of [false, true]) {
        const controller = new AbortController(), calls = [];
        const result = await ui.uploadFiles({ uploadMedia: async (_id, file) => {
          calls.push(file.name);
          if (unauthorized) throw Object.assign(new Error("Reconnect Meadow"), { status: 401 });
          controller.abort(); controller.signal.throwIfAborted();
        } }, "workspace-one", [{ name: "first.jpg", size: 1 }, { name: "later.jpg", size: 1 }], 100, { signal: controller.signal });
        assert.deepEqual(calls, ["first.jpg"]);
        assert.deepEqual(result.uploaded, []);
        assert.match(result.error, unauthorized ? /Reconnect Meadow/ : /Upload cancelled/);
      }
    });

    await t.test("delivery refreshes only replace accepted IDs with backend evidence", () => {
      const original = [{ id: "accepted", deliveries: [{ id: "one", status: "queued" }] }, { id: "missing", deliveries: [{ id: "two", status: "scheduled" }] }];
      const latest = [{ id: "other-post", deliveries: [{ status: "published" }] }, { id: "accepted", deliveries: [{ id: "one", status: "published" }] }];
      const result = ui.mergeSubmissionStatuses(original, latest);
      assert.deepEqual(result.map(post => post.id), ["accepted", "missing"]);
      assert.equal(result[0].deliveries[0].status, "published");
      assert.equal(result[1].deliveries[0].status, "scheduled");
      assert.equal(original[0].deliveries[0].status, "queued");
    });

    await t.test("first connection explains full access and local storage before an explicit action", () => {
      const props = { acknowledged: false, connecting: false, onAcknowledge() {}, onConnect() {}, onCancel() {} };
      const initial = render(ui.ConnectionPanel, props);
      assert.match(text(initial), /full access to your Meadow workspaces/);
      assert.match(text(initial), /Disconnecting removes the local key; it does not revoke it/);
      assert.match(initial, /href="https:\/\/findmeadow.com\/privacy\/#privacy-chrome-extension"/);
      assert.match(initial, /<button\b[^>]*disabled=""[^>]*>Connect Meadow/);
      assert.doesNotMatch(initial, /<img|<iframe|<script/);
      const agreed = render(ui.ConnectionPanel, { ...props, disclosureAccepted: true });
      assert.doesNotMatch(agreed, /<button\b[^>]*disabled/);
      const returning = render(ui.ConnectionPanel, { ...props, disclosureAccepted: true, alreadyConnected: true });
      assert.match(text(returning), /Continue/);
    });

    await t.test("reauthentication keeps the unsent-post message and uses approval only in a separate user-opened tab", () => {
      const html = render(ui.ConnectionPanel, {
        preserving: true, acknowledged: true, pending: { userCode: "ABCD-EFGH", verificationUrlComplete: "https://app.findmeadow.com/dashboard/connect-agent?code=ABCD-EFGH" },
        onCancel() {},
      });
      assert.match(text(html), /Your unsent post is kept in this tab/);
      assert.match(html, /href="https:\/\/app.findmeadow.com\/dashboard\/connect-agent\?code=ABCD-EFGH" target="_blank"/);
      assert.match(text(html), /Waiting for your approval/);
      assert.equal(ui.pollDelay({ interval: 5 }, 1000), 5000);
      assert.equal(ui.pollDelay({ interval: 5 }, 20000), 20000);
    });

    await t.test("queued and TikTok inbox results are never represented as published", () => {
      const html = render(ui.SubmissionStatus, {
        posts: [{ id: "post-one", caption: "<script>unsafe</script>", deliveries: [{ id: "one", platform: "instagram", accountName: "My Instagram", status: "queued" }, { id: "two", platform: "tiktok", accountName: "My TikTok", status: "awaiting_publish" }] }], catalog: [], projectId: "workspace-one", onRefresh() {},
      });
      assert.match(text(html), /A queued post has not been published yet/);
      assert.match(text(html), /queued/);
      assert.match(text(html), /Finish in TikTok/);
      assert.match(text(html), /Open the inbox notification in TikTok to finish publishing/);
      assert.doesNotMatch(html, /<script>/);
      assert.match(html, /&lt;script&gt;unsafe/);
      assert.match(html, /href="https:\/\/app.findmeadow.com\/dashboard\/posts\?project=workspace-one"/);
    });

    await t.test("website links remain fixed Meadow destinations and uploads respect the extension limit", () => {
      assert.equal(ui.websiteUrl("/dashboard/connections", "space & one"), "https://app.findmeadow.com/dashboard/connections?project=space+%26+one");
      for (const path of ["https://evil.test/dashboard", "//evil.test/dashboard", "/sign-in"]) assert.throws(() => ui.websiteUrl(path), /Invalid Meadow page/);
      assert.equal(ui.uploadLimit({ maxUploadBytes: 1024 ** 3 }), 90 * 1024 ** 2);
      assert.equal(ui.uploadLimit({ maxUploadBytes: 1234 }), 1234);
      assert.equal(ui.uploadLimit({}), 90 * 1024 ** 2);
    });
  } finally { await server.close(); await rm(cacheDir, { recursive: true, force: true }); }
});
