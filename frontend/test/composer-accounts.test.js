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

const catalog = [
  { id: "x", name: "X", formats: ["text", "image", "video", "carousel"], captionLimit: 280 },
  { id: "youtube", name: "YouTube", formats: ["video"], titleLimit: 100, titleRequired: true },
  { id: "instagram", name: "Instagram", formats: ["image", "video", "carousel"], mixedCarousel: true },
];
const account = (id, status = "connected", platform = "x") => ({ id, label: id, status, platform });
const post = (overrides = {}) => ({
  key: "draft-one", caption: "Text written while uploading", title: "", format: "video",
  mediaIds: [], accountIds: [], overrides: {}, schedule: { mode: "now", timeZone: "UTC" }, ...overrides,
});
const visibleText = html => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
const choiceLabels = html => [...html.matchAll(/<label class="bridge-account-choice">([\s\S]*?)<\/label>/g)].map(match => match[1]);
const choice = (html, name) => {
  const label = choiceLabels(html).find(value => value.includes(`<strong>${name}</strong>`));
  assert.ok(label, `Expected a destination checkbox for ${name}`);
  return label.match(/<input\b[^>]*>/)[0];
};
const field = (html, label) => {
  const markup = [...html.matchAll(/<label class="bridge-field">([\s\S]*?)<\/label>/g)]
    .map(match => match[1]).find(value => value.startsWith(`<span>${label}</span>`));
  assert.ok(markup, `Expected field ${label}`);
  return markup;
};
const isDisabled = markup => /\sdisabled(?:=|\s|\/?>)/.test(markup);
const isChecked = markup => /\schecked(?:=|\s|\/?>)/.test(markup);

test("composer destinations remain usable during uploads and reflect connection availability", async t => {
  const cacheDir = await mkdtemp(join(tmpdir(), "meadow-composer-accounts-test-"));
  const server = await createServer({
    root: fileURLToPath(new URL("..", import.meta.url)), configFile: false, cacheDir, plugins: [react()],
    server: { middlewareMode: true, hmr: false, ws: false }, appType: "custom", optimizeDeps: { noDiscovery: true, include: [] },
  });
  try {
    const { PostEditor } = await server.ssrLoadModule("/src/bridge/Composer.jsx");
    const render = (props = {}) => renderToStaticMarkup(createElement(PostEditor, {
      post: post(), accounts: [], media: [], catalog, onChange() {}, onPickMedia() {}, ...props,
    }));

    await t.test("removed connections disappear while expired authorization remains visible", () => {
      const accounts = [
        account("Live account"), account("Expired account", "reconnect_required"),
        ...["removed", "deleting", "deleted", "disconnected", "unknown"].map(status => account(`${status} account`, status)),
      ];
      const html = render({ accounts, post: post({ accountIds: [...accounts.map(item => item.id), "Missing account"] }) });
      assert.deepEqual(choiceLabels(html).map(value => value.match(/<strong>(.*?)<\/strong>/)[1]), ["Live account", "Expired account"]);
      assert.match(visibleText(html), /Expired account X · reconnect required/);
      assert.doesNotMatch(visibleText(html), /(?:removed|deleting|deleted|disconnected|unknown|Missing) account/);
    });

    await t.test("an expired selection can be removed but cannot be newly selected, with a separate-tab refresh action", () => {
      const accounts = [account("Live account"), account("Expired account", "reconnect_required")];
      const unselected = render({ accounts });
      assert.equal(isDisabled(choice(unselected, "Live account")), false);
      assert.equal(isDisabled(choice(unselected, "Expired account")), true);
      assert.equal(isChecked(choice(unselected, "Expired account")), false);
      const selected = render({ accounts, post: post({ accountIds: ["Expired account"] }) });
      assert.equal(isChecked(choice(selected, "Expired account")), true);
      assert.equal(isDisabled(choice(selected, "Expired account")), false, "An existing expired destination can still be deselected");
      const refresh = [...selected.matchAll(/<a\b[^>]*>[\s\S]*?<\/a>/g)].map(match => match[0]).filter(value => visibleText(value) === "Refresh connection");
      assert.equal(refresh.length, 1);
      assert.match(refresh[0], /href="\/dashboard\/connections"/);
      assert.match(refresh[0], /target="_blank"/);
      assert.match(refresh[0], /aria-label="Refresh connection for Expired account \(opens Connections in a new tab\)"/);
    });

    await t.test("initial account loading is distinguished from an authoritative empty list", () => {
      const loading = visibleText(render({ accountsReady: false, post: post({ accountIds: ["Not loaded yet"] }) }));
      assert.match(loading, /Loading accounts…/);
      assert.doesNotMatch(loading, /Connect a social account|None of your connected accounts/);
      const empty = visibleText(render({ accountsReady: true, accounts: [account("Removed account", "disconnected")] }));
      assert.match(empty, /Connect a social account in this project to choose a destination/);
      assert.doesNotMatch(empty, /Loading accounts|Removed account/);
    });

    await t.test("uploading and preparation keep text, destination choices, and account settings editable", () => {
      for (const stage of ["uploading", "processing"]) {
        const html = render({
          accounts: [account("Video channel", "connected", "youtube"), account("Other account")],
          post: post({ accountIds: ["Video channel"], overrides: { "Video channel": { title: "Title entered during upload", caption: "Channel-specific text", settings: { privacy: "unlisted" } } } }),
          uploading: true, uploadProgress: { stage, loaded: 50, total: 100, filename: "clip.mp4" },
        });
        const textArea = html.match(/<textarea\b[^>]*aria-label="Text"[^>]*>[\s\S]*?<\/textarea>/)?.[0];
        assert.ok(textArea);
        assert.equal(isDisabled(textArea), false);
        assert.match(textArea, /Text written while uploading/);
        assert.equal(isDisabled(choice(html, "Video channel")), false);
        assert.equal(isDisabled(choice(html, "Other account")), false);
        assert.equal(isChecked(choice(html, "Video channel")), true);
        assert.equal(isDisabled(field(html, "YouTube title (required)")), false);
        assert.match(field(html, "YouTube title (required)"), /value="Title entered during upload"/);
        assert.equal(isDisabled(field(html, "Visibility")), false);
        assert.match(field(html, "Visibility"), /<option value="unlisted" selected="">/);
        assert.match(html, /<button\b[^>]*class="bridge-upload-zone"[^>]*disabled=""/);
        assert.doesNotMatch(html, /<fieldset\b[^>]*disabled/);
        assert.match(visibleText(html), stage === "processing" ? /Preparing media…/ : /Uploading 50%/);
      }
    });

    await t.test("adding another carousel file stays disabled during upload without locking its caption or destinations", () => {
      const html = render({
        accounts: [account("Live account")],
        post: post({ format: "carousel", mediaIds: ["first-image"] }),
        media: [{ id: "first-image", kind: "image", filename: "first.jpg", url: "/media/first.jpg" }],
        uploading: true,
      });
      assert.match(html, /<button\b[^>]*class="bridge-add-media"[^>]*disabled=""/);
      assert.equal(isDisabled(choice(html, "Live account")), false);
      assert.equal(isDisabled(html.match(/<textarea\b[^>]*aria-label="Text"[^>]*>/)[0]), false);
    });

    await t.test("completed destinations stay immutable in both composer and queued-post layouts", () => {
      for (const compact of [false, true]) {
        const completed = ["published", "awaiting_publish", "cancelled"];
        const accounts = completed.map(status => account(`${status} channel`, "connected", "youtube"));
        const accountIds = accounts.map(item => item.id);
        const html = render({
          compact, accounts,
          post: post({
            format: "image", accountIds,
            overrides: Object.fromEntries(accountIds.map(id => [id, { title: "Immutable title", caption: "Immutable custom text" }])),
            deliveries: accounts.map((item, index) => ({ accountId: item.id, status: completed[index] })),
          }),
        });
        for (const id of accountIds) {
          assert.equal(isChecked(choice(html, id)), true);
          assert.equal(isDisabled(choice(html, id)), true);
        }
        assert.match(visibleText(html), /Finish in TikTok/);
        assert.doesNotMatch(html, /bridge-account-customize/);
        assert.doesNotMatch(visibleText(html), /Immutable title|Immutable custom text|Select all connected accounts/);
      }
    });

    await t.test("select all counts only connected, compatible destinations that are still editable", () => {
      const accounts = [account("First live"), account("Second live"), account("Expired", "reconnect_required"), account("Already published"), account("Video only", "connected", "youtube")];
      const html = render({ accounts, post: post({
        format: "text", accountIds: ["First live", "Second live", "Already published"],
        deliveries: [{ accountId: "Already published", status: "published" }],
      }) });
      const selectAll = html.match(/<label class="bridge-select-all">([\s\S]*?)<\/label>/)?.[1];
      assert.ok(selectAll);
      assert.match(visibleText(selectAll), /Select all connected accounts 2 accounts/);
      assert.equal(isChecked(selectAll.match(/<input\b[^>]*>/)[0]), true);
      assert.equal(isDisabled(selectAll), false);
      assert.doesNotMatch(visibleText(html), /Video only/);
      assert.equal(isDisabled(choice(html, "Expired")), true);
      assert.equal(isDisabled(choice(html, "Already published")), true);
    });
  } finally {
    await server.close();
    await rm(cacheDir, { recursive: true, force: true });
  }
});
