import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

test("TikTok settings render only the consent and controls required by each delivery mode", async () => {
  const server = await createServer({
    root: fileURLToPath(new URL("..", import.meta.url)), configFile: false, plugins: [react()],
    server: { middlewareMode: true, hmr: false, ws: false }, appType: "custom", optimizeDeps: { noDiscovery: true, include: [] },
  });
  try {
    const { DestinationSettings } = await server.ssrLoadModule("/src/bridge/DestinationSettings.jsx");
    const account = { platform: "tiktok", options: { tiktokPermissions: { canUpload: true, canPublish: true }, creator: { privacyOptions: ["SELF_ONLY"], nickname: "Demo", username: "demo", maxVideoSeconds: 600 } } };
    const render = (settings, extra = {}) => renderToStaticMarkup(createElement(DestinationSettings, { account, settings, onChange() {}, hasVideo: true, ...extra }));
    const upload = render({ deliveryMode: "inbox", uploadConsent: true });
    assert.match(upload, /inbox notification/);
    assert.match(upload, /not sent with this video/);
    assert.match(upload, /checked=""/);
    assert.doesNotMatch(upload, /Choose an audience|Allow Duet|Music Usage Confirmation|Paid partnership/);
    assert.doesNotMatch(upload, /Reconnect this TikTok account/);
    const photos = render({ deliveryMode: "inbox" }, { hasVideo: false, hasImages: true });
    assert.match(photos, /photo title and caption are sent/);
    assert.doesNotMatch(photos, /not sent with this video/);
    const oldAccount = render({ deliveryMode: "inbox" }, { account: { platform: "tiktok", options: {} } });
    assert.match(oldAccount, /Reconnect this TikTok account/);
    assert.match(oldAccount, /Publish directly from Meadow/);
    const publish = render({});
    assert.match(publish, /Choose an audience|Allow Duet/);
    assert.match(publish, /Music Usage Confirmation/);
    assert.doesNotMatch(publish, /I agree to send this media/);
  } finally {
    await server.close();
  }
});
