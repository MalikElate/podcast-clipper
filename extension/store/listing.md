# Chrome Web Store submission copy

## Listing

**Name:** FindMeadow — Cross-post to social media

**Summary:** Write once, choose your social accounts, and publish or schedule with Meadow. Share text, images, videos, and carousels from Chrome.

**Category:** Workflow & Planning / Productivity (use the matching dashboard category)

**Language:** English

**Website:** https://findmeadow.com

**Support:** https://findmeadow.com/contact/
**Privacy policy:** https://findmeadow.com/privacy/#privacy-chrome-extension

## Detailed description

Create once. Share on your connected social accounts with Meadow.

FindMeadow gives you a focused social post composer right in Chrome. Write a caption, add your photos or video, choose your accounts, and publish now or schedule for later.

• Create text, image, video, and carousel posts.
• Choose multiple connected accounts for cross-posting.
• Tailor captions, titles, and platform settings for each account.
• Pick audience and privacy settings where the destination requires them.
• Save drafts in Meadow or schedule posts in your workspace's time zone.
• Check delivery status after submitting.

The composer opens in its own extension tab, so you can switch tabs without interrupting an upload. This version supports files up to 90 MiB each; use the Meadow website for larger uploads.

A Meadow account is required. Connect and manage your social accounts on Meadow's website. Available platforms and publishing limits depend on your connected accounts and Meadow plan. The extension is free to install; Meadow service charges may apply.

Your control, your content: the extension does not read the pages you browse, browsing history, clipboard, or social passwords. It sends your chosen content to Meadow for the draft, schedule, or publishing action you request. It contains no advertising or usage analytics.

## Single purpose

Create and cross-post social content through the user's Meadow workspace, including media upload, per-account settings, draft saving, immediate publishing, scheduling, and delivery status.

## Permission justifications

**storage:** Store the dedicated Meadow access key and disclosure preference in the local Chrome profile. Credential storage is restricted to trusted extension contexts. Disconnect clears the local key.

**https://findmeadow.com/*:** Authenticate using Meadow's user-approved device sign-in and call Meadow's workspace, connected account/options, media upload, post preview, draft, submission, and status endpoints. Also display signed Meadow media thumbnails/previews. No other website access is requested.

No remote code: all executable JavaScript is bundled with the extension. API responses are data only.

## Privacy tab declarations to review against the final package

- Authentication information: a dedicated Meadow access key, stored locally and sent only to Meadow.
- Personally identifiable information: connected account identifiers and display names are retrieved to select destinations.
- User-provided content: captions, titles, chosen media, schedules, and platform settings are sent to Meadow. Include Website content if this is the closest category in the current form; content is entered/selected by the user, not scraped from web pages.
- The extension does not collect browsing history, web-page content, financial/health information, precise location, or unrelated user activity.
- Use is limited to the single purpose above. No sale, unrelated advertising/profiling, or creditworthiness/lending use.
- Server retention and deletion follow the linked Meadow privacy policy.
- Disconnect removes local credentials; server-side revocation is available in Meadow API Keys.

The first-run screen explains access before connecting. A separate Meadow page requires the user's approval before the extension receives a key.

## Reviewer instructions

1. Install the extension and click its toolbar icon.
2. Read the disclosure, then choose Connect Meadow.
3. Open the displayed Meadow verification link, sign in with the reviewer account supplied privately, and approve the displayed code. Return to the extension tab.
4. Select a Meadow workspace. Connect test social accounts on Meadow's Accounts page if none are supplied.
5. Choose a post format, enter text/add media, and select destinations. Review the per-platform privacy, consent, title, and other settings.
6. Save a draft to exercise account/media/draft functionality without publishing.
7. The Publish now or scheduling action first calls Meadow's preview validator. Only use an explicitly approved test destination for a real publication.
8. Check returned status; queued/processing means accepted, not already published.
9. Disconnect locally and revoke the dedicated key in Meadow API Keys.

No paid purchase is necessary merely to inspect the installed interface. Full publishing needs an eligible Meadow account and connected destinations; supply adequate reviewer access.

## Assets and submission status

- Package: extension/dist/findmeadow-chrome-1.0.0.zip
- Store icon: extension/assets/icon-128.png
- Promotional tile: extension/store/promotional-tile.png (440×280)
- Required actual UI screenshot(s): pending Chrome integration testing.
- Reviewer credentials: provide privately; never commit.
- Publisher registration/trader/contact/2-step-verification: verify in the real developer dashboard.
- Upload, Google review, and public store listing: not yet verified.

Do not mark the extension published based on ZIP creation or repository deployment.
