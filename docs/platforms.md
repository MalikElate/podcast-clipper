# Native platform setup and supported formats

Bridge connects directly to each platform's API. Provider access depends on the application's approved products/scopes and the selected account's eligibility. Features available only in a platform's own app are not implied by an adapter entry. Live publication has not been verified with production credentials.

The following is the implemented Bridge capability set. Defaults live in `backend/src/bridge/platforms/catalog.js`; dynamic account information is checked again before delivery. The media library accepts JPEG, PNG, WebP, GIF, MP4, MOV, WebM, PDF, Word and PowerPoint files. Delivery adapters convert images to JPEG and videos to H.264 MP4 where needed. GIF animation is preserved by the X adapter; other image adapters send a still image. The default server upload limit is 1 GiB regardless of a platform's higher limit.

| Platform ID | Eligible destination | Implemented publishing formats |
| --- | --- | --- |
| `instagram` | Professional Instagram account through Instagram Login | Image, video/Reel, mixed carousel, Story when account/API eligible |
| `tiktok` | Authorized creator | Video, photo, photo carousel |
| `youtube` | Authorized channel | Video; Shorts classification is determined by YouTube |
| `facebook` | Managed Facebook Page | Text, image, photo carousel, video, Reel, image/video Story |
| `x` | Authorized profile | Text, image, animated GIF, video, photo carousel |
| `linkedin` | Member or approved organization administrator | Text, image, video, multi-image post, document |
| `pinterest` | Account with selected board | Image Pin, video Pin, multi-image Pin where API/account permits |
| `threads` | Authorized Threads profile | Text, image, video, mixed carousel |
| `bluesky` | Authorized AT Protocol identity | Text, images, video, multi-image post |
| `google_business` | Managed business location | Standard local post with text and optional photos |

API-native event/offer posts, polls, paid-ad flows, livestreaming, platform music catalogs, link-preview/card customization, article publishing, and interactive story elements are not part of this first implementation. Multi-image posts use the platform's supported API representation; not every platform exposes a native carousel product to every account. Provider errors remain visible per destination without re-posting successful destinations.

## OAuth and permissions

Register callback URLs using the exact production API origin and platform ID:

```text
https://your-bridge-domain.example/oauth/instagram/callback
https://your-bridge-domain.example/oauth/tiktok/callback
https://your-bridge-domain.example/oauth/youtube/callback
https://your-bridge-domain.example/oauth/facebook/callback
https://your-bridge-domain.example/oauth/x/callback
https://your-bridge-domain.example/oauth/linkedin/callback
https://your-bridge-domain.example/oauth/pinterest/callback
https://your-bridge-domain.example/oauth/threads/callback
https://your-bridge-domain.example/oauth/bluesky/callback
https://your-bridge-domain.example/oauth/google_business/callback
```

| Provider | Environment credentials | Requested scopes/configuration |
| --- | --- | --- |
| Instagram | `INSTAGRAM_CLIENT_ID`, `INSTAGRAM_CLIENT_SECRET` | `instagram_business_basic`, `instagram_business_content_publish`, `instagram_business_manage_insights` |
| Facebook | `FACEBOOK_CLIENT_ID`, `FACEBOOK_CLIENT_SECRET` | `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `read_insights` |
| Threads | `THREADS_CLIENT_ID`, `THREADS_CLIENT_SECRET` | `threads_basic`, `threads_content_publish`, `threads_manage_insights` |
| TikTok | `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET` | `user.info.basic`, `video.publish`, `video.list`; Direct Post enabled |
| YouTube | `YOUTUBE_CLIENT_ID` / `YOUTUBE_CLIENT_SECRET`, or shared `GOOGLE_*` | `youtube.upload`, `youtube.readonly`, `yt-analytics.readonly` as full Google scope URLs |
| X | `X_CLIENT_ID`, `X_CLIENT_SECRET` | `tweet.read`, `tweet.write`, `users.read`, `media.write`, `offline.access`; confidential OAuth 2.0 client with PKCE |
| LinkedIn | `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET` | Defaults: `openid profile w_member_social`; restricted read/organization scopes require separate access |
| Pinterest | `PINTEREST_CLIENT_ID`, `PINTEREST_CLIENT_SECRET` | `user_accounts:read`, `boards:read`, `pins:read`, `pins:write` |
| Bluesky | `BLUESKY_PRIVATE_KEY` and HTTPS origin | Official OAuth client, DPoP, ES256 private-key authentication, `atproto transition:generic` |
| Google Business | `GOOGLE_BUSINESS_CLIENT_ID` / `GOOGLE_BUSINESS_CLIENT_SECRET`, or shared `GOOGLE_*` | `https://www.googleapis.com/auth/business.manage`; relevant Business Profile APIs enabled and approved |

`BRIDGE_ENCRYPTION_KEY` is required for connections. Tokens and OAuth sessions are encrypted at rest. OAuth state expires, is consumed once, and remains bound to the authenticated initiating user and project. After authorization, the user selects which returned accounts to attach to that project.

For LinkedIn organizations, add the approved `rw_organization_admin`, `w_organization_social`, and required read scopes to `LINKEDIN_SCOPES`; the adapter then enumerates eligible organizations. Member read analytics require restricted access and are not granted merely by Share on LinkedIn. The current request header defaults to `LinkedIn-Version: 202607`; keep it on a supported version as the platform retires versions. [LinkedIn Posts API](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api?view=li-lms-2026-07)

For Bluesky, supply a PKCS#8 ES256 private PEM as a backend secret. The official client publishes its public metadata and JWKS at `/oauth/bluesky/client-metadata.json` and `/oauth/bluesky/jwks.json`. These addresses must be publicly readable over HTTPS. The database stores the client's state/session data encrypted; the browser never receives the private key. [Official AT Protocol OAuth client](https://github.com/bluesky-social/atproto/tree/main/packages/oauth/oauth-client-node)

## Publication constraints and quotas

TikTok requires the latest creator information, explicit privacy selection, permitted interaction choices, and posting consent. Bridge renders those controls without a default privacy value. Its URL-pull flow requires verification of the serving domain or URL prefix. Unaudited clients are restricted to private viewing; approval is necessary for public publishing. [TikTok Direct Post setup](https://developers.tiktok.com/docs/en/content-posting-api-get-started)

YouTube's API can restrict uploads from unverified API projects to private visibility. Bridge preserves the requested visibility and reports a restricted public upload for review rather than claiming public success. [YouTube video insertion](https://developers.google.com/youtube/v3/docs/videos/insert)

Instagram and Threads expose publishing allowance information that the adapters use when available. Other providers do not consistently return a reliable account-wide remaining-post count. Bridge does not invent a fixed “10 posts per day” rule for TikTok or any other platform. It plans known limits, tracks local submissions, respects reported blocks/resets, and queues uncertain allowances until the provider allows delivery. Reset estimates are conservative when remote usage timestamps are unavailable.

Provider application-wide quotas and account restrictions can change independently from Bridge. A 429 or recognizable quota rejection preserves the delivery and does not spend the normal five temporary-failure attempts. When no reset is supplied, Bridge checks again after a delay. The queue preview explains when an allowance is unknown. [X API rate limits](https://docs.x.com/x-api/fundamentals/rate-limits)

X media follows initialize, append, finalize and status checks before post creation. Pinterest video Pins use the provider's media registration/upload/status flow and a cover image before Pin creation. [X upload API](https://docs.x.com/x-api/media/initialize-media-upload), [Pinterest boards and Pins](https://developers.pinterest.com/docs/work-with-organic-content-and-users/create-boards-and-pins/)

## Analytics interpretation

| Platform | Implemented metric retrieval |
| --- | --- |
| Instagram | Media insights where supported; likes/comments and available views/shares/saves |
| TikTok | Public video views, likes, comments, shares; private posts may have no queryable public ID |
| YouTube | Views, likes, comments; shares from YouTube Analytics when available |
| Facebook | Reactions in the shared likes column, comments, shares; impressions where available |
| X | Public and available owner metrics; views/impressions/clicks depend on returned fields/access |
| LinkedIn | Member likes/comments with approved read access; organization share statistics where permitted |
| Pinterest | Pin impressions, engagements, saves, outbound clicks and available video views |
| Threads | Views, likes, replies, reposts/quotes and shares where returned |
| Bluesky | Likes, replies and reposts + quotes; no fabricated view count |
| Google Business | Local post views and call-to-action actions; no likes/comments/shares/saves |

Metrics are normalized into views, impressions, likes, comments, shares, saves and clicks. Engagement is the sum of available likes, comments, shares and saves. Components differ by provider, so comparisons are directional activity comparisons rather than identical measurements or deduplicated audience reach. Pinterest engagements are not relabeled as likes. Missing values are `null`, not zero. A provider failure preserves the last successful reading and displays its age/error.

Background synchronization handles up to ten eligible published deliveries per minute, normally at least fifteen minutes apart per delivery. Manual refresh handles up to fifty oldest eligible deliveries and is throttled per delivery. New, private, deleted or permission-restricted content may have no metrics. Google Business standard local posts and their insight resource are documented in the [Business Profile API](https://developers.google.com/my-business/reference/rest/v4/accounts.locations.localPosts).
