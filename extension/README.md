# FindMeadow for Chrome

Clip a web page, highlighted text, a link, or a public image; edit its caption; and continue to Meadow to review and save a draft. Publishing remains in Meadow’s normal composer with the user’s choice of social accounts and settings.

## Build and test

Use Node 22.12+ and Python 3 (ZIP packaging uses only Python’s standard library).

```sh
npm test --prefix extension
npm run build --prefix extension
```

Load `extension/dist/findmeadow` as an unpacked extension in Chrome 127 or newer. The Chrome Web Store upload is `extension/dist/findmeadow-chrome-1.0.0.zip`.

The build uses Meadow’s existing flower assets. Executable code is bundled in the ZIP. There are no external dependencies or remote scripts in the extension.

## User flow

1. Open the extension and read the clipping disclosure, then enable clipping.
2. Use the current page or highlighted text, or use a Meadow item in the page’s right-click menu.
3. Edit the caption and remove an unwanted image. Images are represented by their address; opening the editor does not download them.
4. Continue in Meadow. The user’s chosen content is carried in the URL fragment to `https://app.findmeadow.com/dashboard/import`, then consumed by that page.
5. Sign in to Meadow if necessary, review the content, and choose **Save draft**. This creates an unpublished draft with no social accounts selected.

Browser pages, local files, `data:`/`blob:` images, and URLs containing embedded credentials cannot be clipped. Public image import can also fail if the image host requires a login or blocks downloads; the user can exclude the image and save the text.

## Data and permissions

- `activeTab`: access the current page only after a user invokes the extension.
- `scripting`: read highlighted text in the active page after **Use selected text**. No content script runs automatically.
- `contextMenus`: page/text/link/image clipping actions, registered only after the user enables clipping.
- `storage`: a local on/off preference and a single clip in `chrome.storage.session`. Clips expire after one hour and do not sync. **Clear** removes the clip; **Turn off clipping** removes it and the context menus.

The extension does not make API requests, read cookies or browsing history, store login tokens, track usage, or publish social posts. It does not request host permissions. The selected content goes to Meadow only on **Continue in Meadow**, where the app’s normal signed-in session handles saving it. Read the live privacy notice at `https://findmeadow.com/privacy/#privacy-chrome-extension`.

## Release checklist

Automated tests cover the handoff contract, input limits, restricted URLs, clip expiry, consent-gated context menus, safe failure/fallback behavior, manifest permissions, and packaged script restrictions. Before store submission, run the complete clipping → sign-in → draft workflow in Chrome, test the image-error recovery, and capture screenshots of the real UI. Do not represent unit tests as Chrome integration testing.

Chrome Web Store submission also requires a developer account, store listing, accurate privacy declarations, required store images, and Google review. The store listing must not claim a post was published when only a draft was saved.
