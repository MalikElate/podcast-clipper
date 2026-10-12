# Competitor URL review and Meadow publishing map

Reviewed 12 October 2026 before application edits. These pages inform search intent and feature scope; Meadow's copy and implementation are original. All 20 reference pages were readable. Hootsuite's ten pages returned HTTP 200 with matching HTTPS canonicals. Visible forms were reviewed without submitting competitor generation requests or lead forms.

| Reference URL | Reviewed purpose | Meadow destination |
| --- | --- | --- |
| https://www.hootsuite.com/social-media-tools/youtube-name-generator | Account type, category, description to channel names | `/tools/youtube-name-generator/` |
| https://www.hootsuite.com/social-media-tools/username-generator | Platform-specific handle ideas | `/tools/username-generator/` |
| https://www.hootsuite.com/ | Product homepage, not a free tool | Existing `/` |
| https://www.hootsuite.com/social-media-tools/tiktok-username-generator | TikTok handle ideas | `/tools/tiktok-username-generator/` |
| https://www.hootsuite.com/social-media-tools/instagram-name-generator | Instagram handle ideas | `/tools/instagram-name-generator/` |
| https://www.hootsuite.com/social-media-tools/instagram-hashtag-generator | Hashtags from a description and keywords; optional image input | `/tools/instagram-hashtag-generator/` (text input) |
| https://www.hootsuite.com/trending-hashtags | Dynamic trend widget with a lead-form gate | `/tools/trending-hashtags/` (explicitly identified public data sources) |
| https://www.hootsuite.com/platform/analytics | Product analytics marketing | `/social-media-analytics/` (Meadow's shipped capabilities) |
| https://www.hootsuite.com/research/social-trends | Annual report summary with download flow | `/blog/social-media-trends/` (original sourced guide) |
| https://www.hootsuite.com/social-media-tools/youtube-channel-description-generator | Channel description, keywords and CTA to About-section copy | `/tools/youtube-channel-description-generator/` |
| https://www.post-bridge.com/blog/how-much-does-youtube-pay-for-1000-views | RPM/CPM, earnings examples, eligibility | `/blog/how-much-does-youtube-pay-for-1000-views/` |
| https://www.post-bridge.com/tools/instagram-handle-checker | Username validation and profile-link helper | Existing `/tools/instagram-handle-checker/` |
| https://www.post-bridge.com/blog/how-to-see-who-liked-a-comment-on-instagram | Comment likes and troubleshooting | `/blog/how-to-see-who-liked-a-comment-on-instagram/` |
| https://www.post-bridge.com/blog/instagram-disabled-account-appeal | Disabled-account review and recovery | `/blog/instagram-disabled-account-appeal/` |
| https://www.post-bridge.com/blog/how-to-see-your-youtube-subscribers | Subscriber counts versus visible names | `/blog/how-to-see-your-youtube-subscribers/` |
| https://www.post-bridge.com/blog/how-to-recover-youtube-account | Google account and YouTube channel recovery | `/blog/how-to-recover-youtube-account/` |
| https://www.post-bridge.com/blog/how-to-see-dislikes-on-youtube | Creator dislike data versus third-party estimates | `/blog/how-to-see-dislikes-on-youtube/` |
| https://www.post-bridge.com/blog/when-does-youtube-start-paying-you | YPP eligibility, revenue, payment thresholds | `/blog/when-does-youtube-start-paying-you/` |
| https://www.post-bridge.com/blog/how-to-make-twitter-account-public | X public/protected post settings | `/blog/how-to-make-twitter-account-public/` |
| https://www.post-bridge.com/blog/who-doesnt-follow-me-back-on-instagram | Manual and exported follower-list comparison | `/blog/who-doesnt-follow-me-back-on-instagram/` |

## Findings that change the implementation

- Meadow already has a working Instagram handle checker. A missing or blocked profile never proves registration availability; retain its existing `found`/`unconfirmed` distinction.
- Four naming pages can share the same engine while retaining distinct purposes, examples, and metadata. Channel names and account handles are different outputs.
- Hashtag suggestions do not establish popularity or reach. The trends tool must label the feed, geography or instance, metric definitions, and refresh time. Google's public RSS is Google Search interest, not Instagram/TikTok hashtag volume. Mastodon's public feed covers one instance, not every social platform.
- TikTok's full official hashtag analytics requires authorized access. Link to official TikTok research rather than reverse-engineering an access-controlled endpoint. Hootsuite's widget does not expose a verified public methodology or reusable feed.
- Product pages must describe Meadow's actual capabilities. Do not imply listening, competitor benchmarking, paid-ad analytics, or report exports simply because the reference page advertises them.
- Several reference articles overstate earnings rates, recovery timelines, or extension accuracy. Use official sources, hypothetical earnings calculations, and account-specific eligibility guidance.
- Subscriber privacy cannot be bypassed. Current YouTube mobile features differ from the competitor's blanket desktop-only claim.
- Instagram Help requests were rate limited during research. Avoid claiming one universal comment-like gesture, guaranteed export fields, or fixed appeal timelines. Follow the official flow presented to the affected account.

## Publishing and maintenance

New public pages have server-rendered content, dedicated titles/descriptions, one canonical trailing-slash URL, structured data, links from a hub, and sitemap entries. Articles include publication/review dates and original source links. The existing AI-agent publishing guide stays at its current address and is linked from the new blog hub.

Update article review dates only after rechecking their sources. Platform UI and monetization eligibility can change independently of Meadow releases. Public feed failures should produce a visible unavailable state, never invented replacement rankings.
