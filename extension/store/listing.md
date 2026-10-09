# Chrome Web Store listing draft

## Name

FindMeadow — Save ideas for social posts

## Summary

Clip a page, selected text, or an image. Edit your caption and turn it into a Meadow draft, ready to share on your social accounts.

## Description

FindMeadow turns something you find on the web into the start of a social post.

Save the page you’re reading, highlight a useful passage, or right-click a public image. Open FindMeadow to edit the caption and review exactly what you want to send. Continue to Meadow, sign in, and save it as an unpublished draft.

In Meadow, you can add media, choose your connected social accounts, and decide when to publish. The extension keeps your idea close while you browse, and Meadow gives you room to finish the post.

Features:
- Clip the current page with its title and source link.
- Turn highlighted text into an editable caption.
- Clip a link or public image from Chrome’s right-click menu.
- Review and change the caption before sending it to Meadow.
- Keep your current clip locally for up to one hour in the browser session.
- Clear a clip or turn clipping off whenever you want.

FindMeadow reads only content you explicitly choose to clip. It does not scan pages in the background, read your browsing history, or store your Meadow password. Content is sent to Meadow only when you continue there. Private or temporary image addresses may need to be uploaded manually in Meadow.

The extension is free to install. A Meadow account is required to save and publish posts. Meadow’s service plans and usage limits apply.

## URLs and identity

- Homepage: https://findmeadow.com
- Privacy: https://findmeadow.com/privacy/#privacy-chrome-extension
- Support: https://findmeadow.com/contact/
- Publisher business: WoodBark Software LLC (confirm against the Chrome publisher account)
- Suggested category: Workflow & Planning / Productivity, according to the categories available in the dashboard
- Language: English

## Single purpose

Capture user-selected web content, review its caption, and prepare it as an unpublished draft in the user’s Meadow social publishing workspace.

## Permission justifications

- **activeTab:** Read the current tab’s page address and title only when the user chooses to clip that page or selection. No general browsing access is requested.
- **scripting:** Run a small packaged function to read the selected text in the active tab after the user clicks Use selected text. No persistent content scripts are injected.
- **contextMenus:** Provide user-invoked clipping commands for pages, links, selected text, and images. These commands are enabled only after the user accepts the in-extension clipping disclosure.
- **storage:** Remember whether clipping is enabled and keep one editable clip in session-only Chrome storage. Clips expire after one hour; no content is synced to a Google account.
- **Remote code:** None. All executable code is in the submitted package.

## Privacy declarations to review in the dashboard

- Website content: the chosen title, highlighted text, typed caption, and selected image address.
- Web history / URLs: the single chosen page or link address; the extension does not access Chrome’s browsing-history API or monitor browsing.
- Purpose: the extension’s user-facing clipping and draft preparation feature.
- Transmission: only to Meadow after Continue in Meadow. Meadow retrieves a selected public image only after Save draft in the app.
- Extension authentication data: none; authentication takes place in the existing Meadow web app.
- Extension analytics, advertising, sale of data, creditworthiness use: none.
- The publisher must review the actual store declarations and required attestations before submitting.

## Reviewer instructions

1. Open the extension and enable clipping after reading its data disclosure.
2. On a public article, choose Use current page. Edit the caption. Confirm that the source address and title are visible.
3. Select a short passage and use the right-click Meadow command. Confirm that the editor contains the selected text.
4. Right-click a public PNG/JPEG/WebP/GIF image and clip it. The editor displays the address without loading the remote image.
5. Choose Continue in Meadow, sign in with the provided reviewer account, and inspect the import page. Save draft, then confirm it opens in Meadow’s composer with no social accounts selected.
6. Test Clear and Turn off clipping. On a restricted Chrome page, confirm that the extension explains that the page cannot be captured while still permitting a manually typed caption.

Dedicated reviewer account details must be supplied securely in the store’s reviewer instructions, not committed to this repository. A reviewer should not need access to the publisher’s real social accounts to test draft creation. Do not publish a live social post as a routine test.

## Assets and submission status

- Packaged 128×128 icon: generated from Meadow’s existing logo by the build.
- Promotional tile: `promotional-tile.png`, 440×280 PNG, prepared.
- Actual extension screenshots: capture at least one 1280×800 (or 640×400) image after Chrome integration testing; do not substitute a fabricated screenshot.
- Developer account, contact verification, legal/trader declaration, fee, and store review are checked in the live dashboard.
- This file is prepared listing copy. It is not a submission or publication receipt.
