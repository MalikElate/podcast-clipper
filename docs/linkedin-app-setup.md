# LinkedIn posting setup

## Status — September 21, 2026

- Created the [Meadow company Page](https://www.linkedin.com/company/findmeadow/) (ID `146624010`) and the [Meadow developer app](https://www.linkedin.com/developers/apps/266523032/settings) (ID `266523032`). The app's association with the Page is verified.
- LinkedIn granted **Share on LinkedIn** (Default Tier) and **Sign In with LinkedIn using OpenID Connect** (Standard Tier). The Auth tab lists `openid`, `profile`, `w_member_social`, and `email`; Meadow requests only `openid profile w_member_social` by default.
- Saved the production callback `https://findmeadow.com/oauth/linkedin/callback`. Both the Page and developer app display **Meadow** and the existing flower logo. No personal phone or address was added to public app/Page fields.
- Production credential installation and the first live OAuth connection/publication remain pending. Never store the client secret in this file or frontend variables.
- Meadow implements LinkedIn OAuth, member discovery, text/image/video/document posting, multi-image posts, and delivery checkpoints in `backend/src/bridge/platforms/LinkedInProvider.js`.
- Member image status reads now omit the version header: LinkedIn documents that versioned Images GET rejects write-only `w_member_social`, while legacy Images GET accepts it. Publishing, organization images, and other media remain versioned. This still needs a live acceptance test.
- The Worker forwards optional `LINKEDIN_VERSION` and `LINKEDIN_SCOPES`. Defaults remain `202607` and `openid profile w_member_social`.
- Validation: `node --test backend/test/linkedin-provider.test.js` passed both tests, covering member image processing before publication and versioned organization image checks. `git diff --check` passed. No broader-suite or live publication pass is claimed.

## Developer app values

| Setting | Value |
| --- | --- |
| Display name | Meadow |
| Website | `https://findmeadow.com/` |
| Privacy policy | `https://findmeadow.com/privacy/` |
| Business contact | `woodbarksoftware@gmail.com` |
| OAuth redirect | `https://findmeadow.com/oauth/linkedin/callback` |
| Products for member posting | Share on LinkedIn; Sign In with LinkedIn using OpenID Connect |
| Requested scopes | `openid profile w_member_social` |
| App logo | `meadow-app-icon-transparent.png` in the parent workspace |

Inspect existing apps first. Associate Meadow with a LinkedIn company Page actually controlled by the owner; do not select an unrelated Page. Page super-admin verification establishes the app association. Do not substitute personal phone/address details into public app fields.

After app access is available, save the client ID and secret in Cloudflare's production secrets, never in this file or frontend build variables. Use a normal tested deployment/restart so the running container receives the credentials. Confirm the live authorization screen names Meadow and returns to the registered callback.

## Access and testing

Member posting uses LinkedIn's self-service products. Organization posting needs separately approved permissions, including `rw_organization_admin` and `w_organization_social`; request and configure those only after checking the relevant product access. Member analytics also need restricted read permissions and are not included in ordinary Share on LinkedIn access.

Complete a real member OAuth connection, verify the selected destination, and obtain the owner's exact test content/destination before a public test post. Exercise text and image posting, then the other offered formats. Unit tests do not establish app approval, live token validity, or a successful LinkedIn publication.

## Official references

- [API access and self-service permissions](https://learn.microsoft.com/en-us/linkedin/shared/authentication/getting-access)
- [OpenID Connect](https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/sign-in-with-linkedin-v2)
- [Share on LinkedIn](https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/share-on-linkedin)
- [Posts API](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api?view=li-lms-2026-07)
- [Images API permissions](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/images-api?view=li-lms-2026-07#permissions)
- [Company Page app verification](https://www.linkedin.com/help/learning/answer/a1665329)
