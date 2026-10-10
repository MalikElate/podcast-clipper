# FindMeadow for Chrome

A Manifest V3 extension for cross-posting only. Clicking its toolbar icon opens a persistent, packaged composer tab. It reuses Meadow's existing post editor, format checks, destination settings, preview-before-submission flow, and delivery statuses. It does not include the wider dashboard, clipping tools, Dropper, or waterfall.

## Build

Use Node 22.12+ (22 series) and Python 3, with the repository's locked frontend dependencies installed:

```sh
npm ci --prefix frontend
npm test --prefix extension
npm run build --prefix extension
```

Outputs: `dist/findmeadow/` (unpacked), `dist/findmeadow-chrome-1.0.0.zip` (store upload, manifest at archive root). Build output is ignored by Git.

For local Chrome testing, open chrome://extensions, enable Developer mode, and use Load unpacked with the output directory. A Chrome Web Store installation should be used for normal distribution.

## What it does

- Compose text, image, video, and carousel posts.
- Choose the connected social accounts supported for the chosen format.
- Customize captions, titles, audience/privacy, and other destination settings.
- Save a Meadow draft, publish now, or schedule in the workspace time zone.
- Upload selected files (up to 90 MiB each in this version); use Meadow's web app for larger files.
- Show accepted delivery statuses and refresh them without automatically resubmitting.

A Meadow account is required. Social connections are managed on Meadow's website. Platform support, limits, and plan requirements remain the same as Meadow.

## Authentication and data

The extension discloses its data use before connecting. User-approved device sign-in creates a dedicated revocable Meadow key. The key is stored in this Chrome profile's local extension storage, restricted to trusted extension contexts, and is only transmitted over HTTPS to findmeadow.com. Disconnect clears the local credential; revoke the dedicated key in Meadow's API Keys settings to invalidate server-side access.

Only storage and https://findmeadow.com/* permissions are requested. There are no content scripts, activeTab/history/cookie/clipboard permissions, remote executable code, trackers, or credentials bundled in the ZIP. Files upload when selected; captions and publishing settings are sent when saving/submitting. Unsaved editor content lives in the tab, with an unload warning. Only explicit user actions submit posts. Preview validation is mandatory.

The packaged build aliases the shared composer's API and dashboard-link imports to extension-specific adapters. It does not import the website's Clerk scripts, analytics entrypoint, or other dashboard modules.

## Release checklist

Automated validation:
- Extension auth, API, lifecycle, permissions, and packaging checks.
- Existing frontend/backend tests and production website build.

Before store submission:
- Load the actual ZIP's unpacked build in Chrome and check runtime/CSP errors.
- Complete device sign-in using a dedicated reviewer/test Meadow account.
- Verify workspace/account loading, text/image/video/carousel composition, media ordering, settings, draft save, validation errors, and scheduled-time display.
- Verify no posts are sent until the explicit Publish/Schedule action; use an approved test account for any actual publishing.
- Verify cancellation, reload/close warnings, expired/revoked connection recovery, and disconnect.
- Capture real 1280×800 or 640×400 screenshots in Chrome. The promotional tile is a designed graphic, not a screenshot.
- Provide reviewer access privately when needed, not in the source tree.
- Complete Chrome Web Store registration/privacy/trader fields, upload, and submit for Google review.
- Record the listing ID, review outcome, and public URL only after verified.

Current build work does not itself establish Chrome Web Store publication.
