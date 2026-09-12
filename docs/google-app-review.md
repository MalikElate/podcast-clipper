# Google review preparation

Meadow's Google integrations cover YouTube publishing and analytics, plus Google Business Profile local posts. Google sign-in to Meadow is handled separately by Clerk.

## Current setup

Checked in Google Cloud project `meadow-508114` on September 12, 2026:

- YouTube Data API v3 and YouTube Analytics API are enabled.
- The consent screen contains `youtube.upload`, `youtube.readonly`, and `yt-analytics.readonly`. The upload and account-read scopes are awaiting verification.
- Branding contains Meadow's name, `https://findmeadow.com`, `/privacy`, `/terms`, and the developer's support email.
- Google's branding check requires the home page domain to be verified as owned by the project's Google account in Search Console.
- The scope justification and demo video URL still need to be supplied.
- Business Profile APIs and server credentials need configuration. Its API access approval has not been confirmed.
- YouTube's separate API compliance audit status has not been confirmed. OAuth verification alone does not establish permission to make API uploads public.

## Domain ownership verification

Google's branding check returned one issue: the home page domain is not registered to the Google account. Search Console generated this record for `woodbarksoftware@gmail.com` and `findmeadow.com`:

| Field | Value |
| --- | --- |
| Type | `TXT` |
| Name | `@` (domain root) |
| Content | `google-site-verification=TmIHdPgeCgjOqfOpxT4FVYluORtrdblAXmCEX0CInQM` |
| TTL | Auto |

This is a public ownership record, not an API credential. It has not been added to DNS. The saved Cloudflare account is `malik.e1955@gmail.com` via GitHub. Sign-in requires user authorization before this task can continue there. Add the record without removing existing TXT records, verify the domain in Search Console, then retry Google Auth Platform's branding verification.

## YouTube scope justification

Draft for the Google Cloud Data Access justification field (under 1,000 characters):

> Meadow lets users connect their own YouTube channel, upload videos they select, schedule publishing, and review delivery status and metrics. youtube.upload enables resumable uploads using the user's chosen title, description, visibility, and audience setting. youtube.readonly identifies the connected channel and reads video processing status, visibility, views, likes, and comments shown in Meadow. yt-analytics.readonly retrieves share counts for the user's published videos. Read-only scopes cannot upload videos, while the upload scope alone does not provide the channel discovery and analytics needed by these features. Uploads follow the user's Publish or Schedule action. Users can disconnect their channel in Meadow.

## Recording outline

Use a test channel and a short video the demonstrator owns. Show the real behavior of the deployed version. Do not claim publication succeeded if Meadow or YouTube reports a restriction.

1. Show `https://findmeadow.com`, its description of Meadow, and its public privacy policy.
2. Sign in to Meadow, open Connections, and select Connect YouTube. Show the consent flow and requested permissions, including Google's unverified-app notice if it appears. Show the OAuth client identity without exposing passwords or tokens. Google asks that all OAuth clients assigned to this project be covered.
3. Select the authorized channel and show its name in Meadow's Connections page. Explain that the read-only permission identifies the channel the user selected.
4. Upload the test video in Meadow. Set the title, description, audience, and visibility explicitly. Use private visibility for testing until the project's YouTube upload audit status is established.
5. Publish the test video, show the processing state, then verify the resulting video and visibility in YouTube Studio. Explain how `youtube.upload` and `youtube.readonly` support these steps.
6. Open Meadow's analytics for the video and refresh them. Explain the counts actually returned and the unavailable values. Explain that `yt-analytics.readonly` supplies share counts when YouTube has data for that account and reporting period; do not fabricate metrics for a new or private video.
7. Show the channel disconnection control and explain how the user ends Meadow's connection.

Upload the recording to YouTube with a visibility that lets Google's reviewer access it, then supply its URL in Data Access. Complete branding verification before preparing the sensitive-scope submission. A test video uploaded by Meadow and the screen recording submitted to Google are separate videos.

## Google Business Profile follow-up

Enable and obtain access to the Business Profile APIs used by the adapter. Configure `GOOGLE_BUSINESS_CLIENT_ID` and `GOOGLE_BUSINESS_CLIENT_SECRET` (or the shared `GOOGLE_*` pair), register `https://findmeadow.com/oauth/google_business/callback`, and configure the `business.manage` permission for that OAuth client. A separate client/project may be used. Do not describe Business Profile as verified or available merely because YouTube's OAuth flow works.

Individual local-post analytics are unavailable: Google discontinued `accounts.locations.localPosts.reportInsights` with no replacement. Location-level performance metrics are a different feature and are not reported as individual post results.

## References

- [OAuth branding requirements](https://support.google.com/cloud/answer/13807376)
- [Google OAuth verification guidance](https://support.google.com/cloud/answer/13463073)
- [YouTube upload restrictions and audit requirement](https://developers.google.com/youtube/v3/docs/videos/insert)
- [Business Profile prerequisites](https://developers.google.com/my-business/content/prereqs)
- [Business Profile API retirement schedule](https://developers.google.com/my-business/content/sunset-dates)
