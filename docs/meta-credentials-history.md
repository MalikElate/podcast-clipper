# Meta credential history

This file records identifiers and secret locations only. Meta app secrets must remain in Cloudflare encrypted secrets and must never be written to Markdown, source control, review notes, frontend variables, or command output.

## Previous production credentials

| Integration | Meta app ID | Cloudflare secret names | Status |
| --- | --- | --- | --- |
| Facebook Pages publishing | `1771791553715404` | `FACEBOOK_CLIENT_ID`, `FACEBOOK_CLIENT_SECRET` | Retained for rollback; value is not copied into this file. |
| Instagram Login publishing | `1808825473627302` | `INSTAGRAM_CLIENT_ID`, `INSTAGRAM_CLIENT_SECRET` | Retained for rollback; the secret was still pending in the prior setup. |
| Threads publishing | `1596383378937328` | `THREADS_CLIENT_ID`, `THREADS_CLIENT_SECRET` | Retained and unchanged; Threads remains a separate Meta app. |

The previous publishing app was associated with the **FindMeadow.com** business portfolio (`1100668332315173`).

## Current Facebook and Instagram app

| Field | Value |
| --- | --- |
| Display name | Meadow |
| App ID | `1105923055425142` |
| Contact email | `62maneh@gmail.com` |
| Business portfolio | None selected during creation |
| Facebook callback | `https://findmeadow.com/oauth/facebook/callback` |
| Facebook Login configuration | `1758250408777427` (`Meadow Facebook Pages`) |
| Instagram callback | `https://findmeadow.com/oauth/instagram/callback` |
| Active versioned Cloudflare secrets | `FACEBOOK_CLIENT_ID_V2`, `FACEBOOK_CLIENT_SECRET_V2` |
| Reserved Instagram secret names | `INSTAGRAM_CLIENT_ID_V2`, `INSTAGRAM_CLIENT_SECRET_V2` |

The Cloudflare Worker prefers the versioned Facebook and Instagram credentials when they exist and falls back to the previous secret names otherwise. This keeps the old encrypted values available without exposing them.

The app was created on September 24, 2026. Its production domain, website, privacy policy, terms, deletion-instructions URL, and **Business and pages** category were saved successfully. Facebook permissions `pages_show_list`, `pages_manage_posts`, `pages_read_engagement`, and `read_insights` are ready for development testing. The Facebook OAuth, deauthorization, and data-deletion callbacks are saved. Instagram setup, development-account testing, business verification, access verification, and App Review remain separate steps.
