# TikTok app review

## Review explanation

Paste the following text into the product/scope explanation field (982 characters, including line breaks). It describes the implemented integration; it does not claim a review recording or production approval already exists.

```text
Meadow is a social publishing workspace. Login Kit connects users' own TikTok accounts through TikTok's consent screen. user.info.basic reads open ID, display name and avatar to identify the account.
Content Posting API / video.publish: Users select a video or photos, caption and TikTok destination, review privacy and interaction options, disclosures and consent, then publish now or schedule. Meadow sends the media and settings, tracks the publish ID and shows status.
Content Posting API / video.upload: Users choose inbox delivery to send a video or photos to TikTok. Meadow shows transfer status and asks them to open TikTok's inbox notification, finish editing and publish manually. This does not access phone-local drafts.
Display API / video.list: Meadow reads public video IDs and views for account analytics, plus likes, comments and shares for public posts published through Meadow.
This revision adds inbox delivery. Existing users reconnect to authorize video.upload.
```

## Prepare the review environment

- Enable Login Kit, Content Posting API and the requested scopes in the TikTok app configuration: `user.info.basic`, `video.publish`, `video.upload`, and `video.list`. Check that the configured products cover every requested scope, including public-video analytics through Display API.
- For a first review, record using the TikTok Sandbox configuration and a permitted test account. Deploy the implemented flow to the environment being demonstrated before recording.
- Meadow's public website is `https://findmeadow.com/`; its authenticated workspace is `https://app.findmeadow.com/dashboard`. Explain this domain transition in the review notes. Check the registered website, Login Kit redirect URI and the verified media-serving domain or URL prefix against the actual deployment. A registered website address alone does not verify media URLs or OAuth callbacks.
- Reconnect accounts authorized before inbox upload was added and approve `video.upload`. An existing token does not gain the new permission automatically.
- For unaudited Direct Post testing, the TikTok test account itself must be private and the post visibility must be **Only me** (`SELF_ONLY`). Choosing **Everyone**, or choosing **Only me** on a public account, does not satisfy this restriction. The creator-info response can still list other visibility options; it is not proof that the app has passed its audit.
- Prepare your own short video and a small photo carousel. Keep an existing public video on the authorized account for the analytics demonstration; private Sandbox posts and unfinished inbox uploads cannot demonstrate public-video metrics.

## Demo checklist

1. **Login Kit and user.info.basic:** Open Connections, review Meadow's TikTok data notice, connect the test account, show TikTok's consent screen, then return to the visible account name and avatar in Meadow.
2. **Content Posting API and video.publish:** In Create Post, select the account and media. Under **TikTok delivery**, leave **Publish directly from Meadow** selected. Show the account, audience choice, available comment/Duet/Stitch controls, applicable commercial-content and AI-content disclosures, and consent. Preview and publish, or demonstrate a short scheduled delivery. Show the returned status and verify the post in TikTok. Respect the visibility restrictions actually returned for the test account; do not promise public posting from an unaudited client.
3. **Content Posting API and video.upload:** Create a separate post and choose **Send to TikTok to finish editing**. Show the explanation and explicit upload consent, then preview and click **Send to TikTok**. Once TikTok confirms the inbox handoff, show Meadow's **Finish in TikTok** status. On the same account in the TikTok mobile app, open the inbox notification, continue editing and complete the post manually. For a video, add the caption in TikTok; Meadow's caption is not transferred through the video upload endpoint.
4. **Photo/carousel inbox delivery:** Repeat the inbox handoff with photos and verify that their title and caption appear in TikTok's editor. Choose the final audience and publishing settings there.
5. **video.list:** Open analytics and refresh the authorized account's public-video data. Show available account views and, where a public post published through Meadow is available, its engagement counts. Explain any unavailable private-post metrics without substituting demo values.
6. **Scheduling and drafts:** Show that scheduling an inbox delivery schedules its transfer to TikTok, not automatic publication. Explain that **Save draft in Meadow** keeps content in Meadow, whereas inbox upload sends media to TikTok's servers. Neither feature reads drafts saved locally on the user's phone.

All selected products and scopes must be covered across the submitted recordings; a separate recording for every scope is unnecessary. The phone handoff should be visible, not just narrated. `awaiting_publish` confirms transfer, not final publication: Meadow does not mark the inbox item published when the user later completes it in TikTok. No publishing metrics or public post link are inferred from an inbox handoff.

## When a TikTok request is rejected

Check TikTok's specific error code before reconnecting or retrying. `unaudited_client_can_only_post_to_private_accounts` means the private-account/Only-me audit restriction above. `url_ownership_unverified` means the media-serving domain or URL prefix needs verification under the app configuration being used. `privacy_level_option_mismatch` means the audience must be selected again from refreshed creator options. `scope_not_authorized` means the required scope was not granted; check the app's enabled scopes and reconnect. An HTTP 403 alone does not distinguish these conditions.

## References

- [App Review Guidelines](https://developers.tiktok.com/docs/en/app-review-guidelines)
- [Upload video reference](https://developers.tiktok.com/docs/en/content-posting-api-reference-upload-video)
- [Photo Direct Post and Upload reference](https://developers.tiktok.com/docs/en/content-posting-api-reference-photo-post)
- [Direct Post guide](https://developers.tiktok.com/docs/en/content-posting-api-get-started)
- [Content sharing guidelines and unaudited-client restrictions](https://developers.tiktok.com/docs/en/content-sharing-guidelines)
- [Display API overview](https://developers.tiktok.com/docs/en/display-api-overview)
