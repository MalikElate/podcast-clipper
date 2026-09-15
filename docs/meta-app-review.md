# Meta publishing setup and review

## Verified status — September 15, 2026

- Meadow's production Clerk configuration enables Facebook sign-in. This is separate from the social publishing connection.
- Facebook Pages, Instagram Login, and Threads publishing adapters exist in `backend/src/bridge/platforms/MetaProviders.js`, and their environment variables are forwarded by the Cloudflare Worker.
- The initial `wrangler secret list` showed none of the six Meta publishing credential variables below. Live connection and publication have not been verified.
- The user completed Meta's developer-account confirmation; dashboard access is restored.
- The existing **Meadow** sign-in app is `1569928488203525`, unpublished/in development, and attached to **fast-transcriber.com** (`1203550331716935`). Its business verification page says **Incomplete**.
- The existing app's Add use cases dialog offers only app-install advertising. Facebook Pages, Instagram, and Threads publishing cannot be added through that dialog.
- Created a separate publishing app after the user approved Meta's terms. The user requested the customer-facing name **Meadow**, and both the main app and Threads display names were changed to Meadow and verified after reload.
- Publishing app ID: `1771791553715404`; business portfolio: **FindMeadow.com**, `1100668332315173` (unverified). Threads app ID: `1596383378937328`; Instagram Login app ID: `1808825473627302`.
- Meta's Instagram **Sync app name** control automatically appends ` - IG`; its current generated name is **Meadow - IG**. The exact customer-facing Instagram consent label has not yet been verified.
- Main app settings saved and verified after reload: domain `findmeadow.com`, contact email `woodbarksoftware@gmail.com`, public privacy/terms links, deletion-instructions link to the privacy policy, category **Business and pages**.
- All three OAuth redirect callbacks are saved. Meta's Facebook validator confirmed its redirect is valid; the Instagram settings show its redirect, and the Threads redirect persisted after reload.
- All permissions used by the three adapters show **Ready for testing**: Facebook `pages_show_list`, `pages_manage_posts`, `pages_read_engagement`, `read_insights`; Instagram `instagram_business_basic`, `instagram_business_content_publish`, `instagram_business_manage_insights`; Threads `threads_basic`, `threads_content_publish`, `threads_manage_insights`. These statuses do not grant public customer access.
- Resolved the Threads form's generic save error by providing the uninstall and deletion callback URLs alongside its OAuth redirect. All three products now have their `/api/meta/PLATFORM/deauthorize` and `/api/meta/PLATFORM/data-deletion` URLs saved. Facebook and Instagram showed save confirmations; Threads values persisted after reload.
- Implemented and deployed product-specific signed removal/deletion handlers, encrypted authorization identity mapping, stale-OAuth protection, durable acknowledgment, and private deletion-status receipts. The backend suite passed 173 tests; the final focused privacy tests passed 28 tests. Cloudflare build `6a9cc748-e617-4222-a6d2-880bef66edad` successfully deployed commit `0f48309`, production health returned 200, and the callback routes were reachable. This does not claim a live signed Meta callback or publication test.
- Identified Meadow as a **Tech Provider**, matching its customer-facing publishing use. The dashboard now exposes Review → Verification and App Review. Business verification, access verification, and App Review are still outstanding.
- Meta Business Suite says FindMeadow.com is **Eligible for verification**. Opened the verification flow, which is waiting at **Select a country**. The default United States has not been submitted. Asked the user for the registered business name and country. Access verification is explicitly blocked until business verification is complete.
- Both FindMeadow.com and the older fast-transcriber.com portfolio have no saved legal name, address, phone, website, or primary business location. The owner must provide the legal details; the website's product name alone does not establish a registered legal entity.
- Cloudflare now stores encrypted `FACEBOOK_CLIENT_ID` and `FACEBOOK_CLIENT_SECRET`. Instagram and Threads credentials remain pending Meta password confirmation; the open confirmation dialog rejected the previous attempt and has no available autofill credential. `BRIDGE_DISABLED_PLATFORMS=facebook,instagram,threads` preserves customer unavailability until review and testing are complete. No App Review submission is confirmed.
- App icon upload through the browser extension failed because file URL access is disabled. The prepared local icon is `meadow-logo-white-background.png` in the parent workspace.

## Next setup steps

1. Complete the open Meta password confirmation, retrieve the Instagram and Threads product secrets securely, and save their matching runtime credentials. A running container needs a restart or rollout to receive changed environment values; verify a configured callback rejects an unsigned request instead of returning an unconfigured error.
2. Complete business verification using the owner's actual registered legal details, then access verification. Keep the app display name Meadow regardless of the legal entity name.
3. Test the signed callbacks with the actual Meta product and eligible development accounts. Keep Meta platforms disabled for customers until review and acceptance are complete.
4. Upload the icon after extension file upload is enabled, and check the real Instagram consent screen. A direct preview reached Instagram sign-in, so the customer-facing label is still unverified.
5. Finish development-account OAuth and publishing tests before review submission or customer availability. The permissions' **Ready for testing** label is configuration status, not evidence of a successful API test.

## App values

| Field | Value |
| --- | --- |
| Display name | Meadow |
| Website | `https://findmeadow.com/` |
| App domain | `findmeadow.com` |
| Privacy policy | `https://findmeadow.com/privacy/` |
| Terms | `https://findmeadow.com/terms/` |
| Support | `hello@findmeadow.com` |
| Facebook publishing callback | `https://findmeadow.com/oauth/facebook/callback` |
| Instagram publishing callback | `https://findmeadow.com/oauth/instagram/callback` |
| Threads publishing callback | `https://findmeadow.com/oauth/threads/callback` |

Preserve the existing Clerk Facebook sign-in callback when adding the publishing callback. Inspect the current Meta app and its supported use cases before deciding whether publishing belongs in the same app. Do not replace an existing production app or change its secret merely to enable publishing.

The public privacy policy contains disconnection and account-deletion instructions. If Meta offers a deletion-instructions URL field, the public policy is suitable. Signed POST callbacks are implemented at `/api/meta/PLATFORM/deauthorize` and `/api/meta/PLATFORM/data-deletion` for `facebook`, `instagram`, and `threads`. Each requires its product's app secret. Live Meta delivery still needs verification.

## Credentials and permissions used by the implementation

| Integration | Cloudflare secret names | OAuth permissions |
| --- | --- | --- |
| Facebook Pages | `FACEBOOK_CLIENT_ID`, `FACEBOOK_CLIENT_SECRET` | `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `read_insights` |
| Instagram with Instagram Login | `INSTAGRAM_CLIENT_ID`, `INSTAGRAM_CLIENT_SECRET` | `instagram_business_basic`, `instagram_business_content_publish`, `instagram_business_manage_insights` |
| Threads | `THREADS_CLIENT_ID`, `THREADS_CLIENT_SECRET` | `threads_basic`, `threads_content_publish`, `threads_manage_insights` |

Obtain each integration's credentials from its actual product setup. Instagram Login credentials must not be assumed to equal the parent Facebook app credentials. Store secrets in Cloudflare's production secrets, never in source control, review recordings, or frontend `VITE_*` variables. Verify runtime configuration after applying them.

Business verification, permission review, live availability, and each user's OAuth authorization are distinct checks. Confirm the exact requirements and approval status in the restored Meta dashboard; enabling Facebook sign-in does not establish publishing approval.

## Draft review description

Meadow is a social publishing workspace for creators and businesses. Users sign in to Meadow, connect an account they are authorized to manage through the platform's authorization screen, and choose a destination. They upload their own media, write a caption, review the destination and content, and choose to publish immediately or schedule publication. Meadow sends the requested content to the selected account, reports processing and delivery status, links to the published post, and displays available performance metrics. Users can disconnect an account in Connections or request account deletion in Settings → Privacy & Account.

### Facebook permission explanations

- **pages_show_list:** List the Pages available to the authorizing user so they can choose the Page to connect. The adapter calls `/me/accounts` and stores the selected Page's authorization for requested publication.
- **pages_manage_posts:** Publish user-selected text, images, and videos to the connected Facebook Page when the user publishes or schedules a post in Meadow.
- **pages_read_engagement:** Retrieve reactions, comment counts, shares, and supported metadata for posts published through Meadow so the user can inspect delivery and performance.
- **read_insights:** Retrieve available post impressions for the user's published Page posts. Meadow displays unavailable metrics as unavailable rather than inventing values.

### Instagram permission explanations

- **instagram_business_basic:** Identify the authorized professional account and show its username and profile image for destination selection.
- **instagram_business_content_publish:** Create and publish media containers for the image, Reel, carousel, or eligible Story the user selected in Meadow.
- **instagram_business_manage_insights:** Retrieve available metrics for the user's published media and show them in Meadow's analytics.

### Threads permission explanations

- **threads_basic:** Identify the authorized Threads profile and show its username and profile image.
- **threads_content_publish:** Publish text, images, videos, or carousels the user selects and requests through Meadow.
- **threads_manage_insights:** Retrieve available performance metrics for posts published through Meadow.

These are draft explanations grounded in the code, not evidence of Meta approval or a successful live test.

## Review recording and acceptance

After restoring developer access and configuring credentials:

1. Inspect the existing app's business association, use cases, access levels, and current review requirements.
2. Register the exact callbacks above and required public app details while preserving sign-in settings.
3. Configure the matching production credentials and verify that Meadow offers the connections.
4. Use an eligible account with the required app role for development testing. Complete real OAuth and select the intended Page or profile.
5. Record Meadow's public website and privacy policy, the connection flow, the provider's consent screen, and the return to Meadow.
6. Demonstrate composition and destination selection. Obtain approval for the exact test post and destination before posting publicly; setup authorization alone does not specify public test content.
7. Show a confirmed publication in Meadow and on the provider, then retrieve available analytics. Record actual results, including unavailable metrics.
8. Demonstrate disconnection using a dedicated test connection. Do not remove a production connection as part of a demo without checking queued work.
9. Provide reviewer access and reproducible steps through Meta's designated review fields. Do not bypass ordinary Meadow account protections or put reviewer credentials in this file.
10. Submit the relevant permission review only with truthful live evidence. Verify approval and reconnect an eligible non-role user before describing public customer publishing as available.

## Reference locations

Meta's public developer documentation initially returned HTTP 429. The authenticated browser subsequently loaded the current Threads setup and data-deletion callback documentation:

- [Threads setup](https://developers.facebook.com/documentation/development/create-an-app/threads-use-case)
- [Data-deletion callback](https://developers.facebook.com/documentation/development/create-an-app/app-dashboard/data-deletion-callback)
- [Meta app dashboard](https://developers.facebook.com/apps/)
- [Facebook Page posts](https://developers.facebook.com/docs/pages-api/posts/)
- [Business verification](https://developers.facebook.com/docs/development/release/business-verification/)
- [Graph API access levels](https://developers.facebook.com/docs/graph-api/overview/access-levels/)
- [Meta's Instagram Login collection](https://www.postman.com/meta/instagram/folder/6raa77c/instagram-api-with-instagram-login)
