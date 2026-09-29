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

    const privateAccount = { ...account, options: { ...account.options, tiktokDirectPostPrivateOnly: true, creator: { ...account.options.creator, privacyOptions: ["PUBLIC_TO_EVERYONE", "SELF_ONLY"] } } };
    const privateEmpty = render({}, { account: privateAccount });
    assert.match(privateEmpty, /limited to Only me during testing/);
    assert.match(privateEmpty, /<option value="" selected="">Choose an audience<\/option>/);
    assert.match(privateEmpty, /<option value="SELF_ONLY">Only me<\/option>/);
    assert.doesNotMatch(privateEmpty, /PUBLIC_TO_EVERYONE|Everyone/);
    const staleAudience = render({ privacy: "PUBLIC_TO_EVERYONE" }, { account: privateAccount });
    assert.match(staleAudience, /previous audience is no longer available/);
    assert.match(staleAudience, /<option value="" selected="">Choose an audience<\/option>/);
    assert.doesNotMatch(staleAudience, /<option value="SELF_ONLY" selected/);
    const privateSelected = render({ privacy: "SELF_ONLY" }, { account: privateAccount });
    assert.match(privateSelected, /<option value="SELF_ONLY" selected="">Only me<\/option>/);
    const restrictedUpload = render({ deliveryMode: "inbox" }, { account: privateAccount });
    assert.doesNotMatch(restrictedUpload, /limited to Only me|Choose an audience/);
    const approvedAccount = { ...privateAccount, options: { ...privateAccount.options, tiktokDirectPostPrivateOnly: false } };
    const approvedAudience = render({ privacy: "PUBLIC_TO_EVERYONE" }, { account: approvedAccount });
    assert.match(approvedAudience, /<option value="PUBLIC_TO_EVERYONE" selected="">Everyone<\/option>/);
    assert.doesNotMatch(approvedAudience, /limited to Only me/);
  } finally {
    await server.close();
  }
});

test("TikTok review makes every Direct Post choice visible before publishing", async () => {
  const server = await createServer({
    root: fileURLToPath(new URL("..", import.meta.url)), configFile: false, plugins: [react()],
    server: { middlewareMode: true, hmr: false, ws: false }, appType: "custom", optimizeDeps: { noDiscovery: true, include: [] },
  });
  try {
    const { TikTokReviewSummary } = await server.ssrLoadModule("/src/bridge/Composer.jsx");
    const html = renderToStaticMarkup(createElement(TikTokReviewSummary, {
      settings: { privacy: "SELF_ONLY", allowComments: true, allowDuet: false, allowStitch: true, ownBrand: true, brandedContent: false, aiGenerated: false, consent: true },
      caption: "Quiet moments in motion.", hasVideo: true,
    }));
    for (const text of ["Publish directly from Meadow", "Only me", "Comments", "Allowed", "Duet", "Off", "Stitch", "Own-brand promotion", "Disclosed", "Paid partnership", "AI-generated content", "Music Usage Confirmation", "Accepted", "Quiet moments in motion."]) assert.match(html, new RegExp(text));
    assert.match(renderToStaticMarkup(createElement(TikTokReviewSummary, { settings: {}, hasVideo: true })), /Not selected|Not accepted/);
    const photo = renderToStaticMarkup(createElement(TikTokReviewSummary, { settings: { privacy: "SELF_ONLY", autoMusic: true, consent: true }, title: "Morning light", caption: "A photo post", hasImages: true }));
    assert.match(photo, /Recommended music|Morning light|A photo post/);
    assert.doesNotMatch(photo, /Duet|Stitch/);
  } finally {
    await server.close();
  }
});
