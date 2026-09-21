const activeConnectionRetention = "Meadow keeps the encrypted authorization, selected account identity, delivery records, and available metrics while the connection is active. Disconnecting removes the stored connection data, delivery history, and metrics. Credentials kept only to retry a requested revocation are destroyed within seven days. Your original media and captions remain in your Meadow workspace until you delete them or your Meadow account.";

export const PLATFORM_PRIVACY = [
  {
    id: "instagram",
    name: "Instagram",
    intro: "Meadow connects to an Instagram professional account through Meta’s official authorization flow.",
    details: [
      { label: "Data Meadow accesses", text: "Professional account ID, username, profile image and profile link; publishing quota information; the media, captions and format you submit; container and published-media IDs, processing status and permalink; and available views, likes, comments, shares and saves." },
      { label: "How Meadow uses it", text: "To identify the selected professional account, validate its current publishing allowance, publish the content you request, confirm delivery and show available post performance." },
      { label: "Retention and removal", text: activeConnectionRetention },
    ],
    links: [{ label: "Instagram Privacy Policy", url: "https://privacycenter.instagram.com/policy/" }],
  },
  {
    id: "tiktok",
    name: "TikTok",
    intro: "Meadow connects to a TikTok creator account only after you approve the permissions shown by TikTok.",
    details: [
      { label: "Data Meadow accesses", text: "TikTok open ID, display name, username or nickname and avatar; available visibility and interaction options and maximum video duration; the videos or photos, captions, visibility, interaction and commercial-content choices you submit; publish IDs, status, links and rejection reasons; and available views, likes, comments and shares." },
      { label: "How Meadow uses it", text: "To show the correct account and publishing choices, deliver only the content you submit, track its status and display available performance. TikTok authorization-removal events let Meadow stop publishing and remove the affected connection data." },
      { label: "Retention and removal", text: activeConnectionRetention },
    ],
    links: [{ label: "TikTok Privacy Policy", url: "https://www.tiktok.com/legal/page/row/privacy-policy/en" }],
  },
  {
    id: "youtube",
    name: "YouTube",
    intro: "Meadow uses YouTube API Services. This section explains, in plain language, what Meadow receives from YouTube, how we use it, how we protect it, who else receives it, how long we keep it, and how you remove our access.",
    details: [
      { label: "What data Meadow receives", text: "When you connect YouTube, Meadow receives basic information about your channel, such as its name, image and channel ID. We also receive information about videos uploaded through Meadow, including their upload status, YouTube link, views, likes, comments and available analytics.", footer: "Meadow never receives your Google or YouTube password." },
      { label: "How Meadow uses the data", text: "We use this information only to:", items: [
        "Connect the YouTube channel you select.",
        "Upload and schedule videos you ask us to publish.",
        "Confirm whether an upload succeeded.",
        "Display the performance of your published videos.",
      ], footer: "Meadow does not request access to Gmail, Google Drive or Google Calendar." },
      { label: "How Meadow protects the data", text: "We use secure connections when information moves between Meadow and Google. Your Google authorization is stored in encrypted form. Access to your YouTube information is limited to your Meadow account and the systems needed to provide the features you request.", footer: "Meadow personnel may access specific information only when you ask for support, when necessary to protect the service, or when required by law." },
      { label: "Who receives the data", text: "When you publish a video, Meadow sends the video and the publishing choices you provide to YouTube. Cloudflare hosts Meadow and processes information on our behalf.", footer: "We do not sell Google or YouTube data. We do not share it with advertisers or data brokers, use it for advertising or credit decisions, or use it to train general-purpose AI models." },
      { label: "How long Meadow keeps the data", text: "YouTube information stored by Meadow is checked regularly, and Meadow deletes any information it cannot refresh within 30 days. When you disconnect YouTube, Meadow stops accessing the channel and begins deleting the stored authorization, channel information, publishing records and analytics. We aim to complete this deletion within seven days.", footer: "Videos already published on YouTube remain there until you delete them through YouTube. Original videos and captions stored in your Meadow workspace remain until you delete them or your Meadow account." },
      { label: "Removing access", text: "You can disconnect YouTube from Meadow at any time in Connections. You can also remove Meadow through Google’s security settings, linked below.", footer: "Meadow’s use of information received from Google APIs follows the Google API Services User Data Policy, including its Limited Use requirements." },
    ],
    links: [
      { label: "Google API Services User Data Policy", url: "https://developers.google.com/terms/api-services-user-data-policy" },
      { label: "Google Privacy Policy", url: "https://policies.google.com/privacy" },
      { label: "YouTube Terms of Service", url: "https://www.youtube.com/t/terms" },
      { label: "Google security settings", url: "https://security.google.com/settings/security/permissions" },
      { label: "Manage Google access", url: "https://myaccount.google.com/connections" },
    ],
  },
  {
    id: "facebook",
    name: "Facebook",
    intro: "Meadow connects to Facebook Pages that you are authorized to manage.",
    details: [
      { label: "Data Meadow accesses", text: "Page IDs, names, profile images and Page authorization; the text, titles, images and videos you submit; upload and post IDs, processing status and published links; and available reactions, comments, shares and impressions." },
      { label: "How Meadow uses it", text: "To list the Pages you can select, publish requested feed posts, photos, videos, Reels or Stories, confirm delivery and show available Page-post performance." },
      { label: "Retention and removal", text: activeConnectionRetention },
    ],
    links: [{ label: "Meta Privacy Policy", url: "https://www.facebook.com/privacy/policy/" }],
  },
  {
    id: "x",
    name: "X",
    intro: "Meadow connects to an X profile through X’s OAuth authorization flow.",
    details: [
      { label: "Data Meadow accesses", text: "X account ID, username, profile image and profile link; the text, images or videos you submit; media-upload and post IDs, processing status and published link; and available impressions, likes, replies, reposts, quotes and bookmarks." },
      { label: "How Meadow uses it", text: "To identify the selected profile, upload media, publish only the posts you request, confirm delivery and display available public post metrics." },
      { label: "Retention and removal", text: activeConnectionRetention },
    ],
    links: [{ label: "X Privacy Policy", url: "https://x.com/en/privacy" }],
  },
  {
    id: "linkedin",
    name: "LinkedIn",
    intro: "Meadow connects to a LinkedIn member profile and, when separately authorized, organizations the member administers.",
    details: [
      { label: "Data Meadow accesses", text: "Member or organization identifier, display name, profile image and available organization link; the text, title, images, videos or documents you submit; upload and post identifiers, processing status and published link; and available reactions, comments, shares, clicks and impressions according to the granted permissions." },
      { label: "How Meadow uses it", text: "To show eligible publishing destinations, upload and publish the content you request, verify delivery and display available post performance. Organization access is used only when the required organization permission is granted." },
      { label: "Retention and removal", text: activeConnectionRetention },
    ],
    links: [{ label: "LinkedIn Privacy Policy", url: "https://www.linkedin.com/legal/privacy-policy" }],
  },
  {
    id: "pinterest",
    name: "Pinterest",
    intro: "Meadow connects to a Pinterest account to show its boards, publish requested Pins and retrieve available Pin performance.",
    details: [
      { label: "Data Meadow accesses", text: "Account ID or username, profile image and link, and board IDs and names; the images or videos, title, description, destination link, board and schedule you submit; upload and Pin IDs, delivery status and published link; and available impressions, saves, Pin clicks and outbound clicks." },
      { label: "How Meadow uses it", text: "To identify the account, let you choose a board, create only the Pins you authorize, prevent duplicate publishing and display available performance." },
      { label: "Retention and removal", text: "Profile details, board lists and organic metrics are retrieved for the current screen or operation and are not saved as a reusable database cache. Authorization, routing identifiers, chosen publishing settings and delivery records remain until you disconnect. Also remove Meadow in Pinterest’s security settings to revoke Pinterest’s authorization." },
    ],
    links: [{ label: "Pinterest Privacy Policy", url: "https://policy.pinterest.com/en/privacy-policy" }],
  },
  {
    id: "threads",
    name: "Threads",
    intro: "Meadow connects to a Threads profile through Meta’s official authorization flow.",
    details: [
      { label: "Data Meadow accesses", text: "Threads profile ID, username, profile image and link; publishing quota information; the text, images or videos you submit; container and post IDs, processing status and permalink; and available views, likes, replies, reposts and quotes." },
      { label: "How Meadow uses it", text: "To identify the selected profile, validate its current publishing allowance, publish the content you request, confirm delivery and show available post performance." },
      { label: "Retention and removal", text: activeConnectionRetention },
    ],
    links: [
      { label: "Threads Supplemental Privacy Policy", url: "https://help.instagram.com/515230437301944" },
      { label: "Meta Privacy Policy", url: "https://www.facebook.com/privacy/policy/" },
    ],
  },
  {
    id: "bluesky",
    name: "Bluesky",
    intro: "Meadow uses AT Protocol OAuth to connect a Bluesky profile without receiving the profile’s password.",
    details: [
      { label: "Data Meadow accesses", text: "Decentralized identifier, handle, profile image and profile link; encrypted OAuth session material; the text, detected links, images, video and alternative text you submit; record URI and published link; and available likes, replies, reposts and quotes." },
      { label: "How Meadow uses it", text: "To restore the authorized session, identify the selected profile, upload media, create only the posts you request, confirm delivery and display available post performance." },
      { label: "Retention and removal", text: activeConnectionRetention },
    ],
    links: [{ label: "Bluesky Privacy Policy", url: "https://bsky.social/about/support/privacy-policy" }],
  },
  {
    id: "telegram",
    name: "Telegram",
    intro: "Meadow publishes to a Telegram channel or group through the Meadow Publisher bot after an administrator adds it.",
    details: [
      { label: "Data Meadow accesses", text: "Your numeric Telegram user ID during setup; the selected channel or group ID, type, title and public username when available; membership changes involving the bot; the text, images, videos, documents and captions you submit; and returned message IDs, delivery status and public message links when available." },
      { label: "How Meadow uses it", text: "To bind a short-lived setup request to you, identify the selected destination, publish only the posts you request, confirm delivery and stop publishing when Telegram reports that the bot was removed." },
      { label: "Retention and removal", text: "Temporary setup data expires after ten minutes or is removed when setup finishes. Destination routing data and delivery records remain while connected and are deleted when you disconnect. Also remove Meadow Publisher from the channel’s administrators or group’s members to end its access in Telegram." },
    ],
    links: [{ label: "Telegram Privacy Policy", url: "https://telegram.org/privacy" }],
  },
  {
    id: "google-business-profile",
    name: "Google Business Profile",
    intro: "Meadow connects to Google Business Profile accounts and locations that the selected Google Account manages.",
    details: [
      { label: "Data Meadow accesses", text: "Business account and location resource IDs and location names; the images, post text, language and schedule you submit; and the returned post ID, status and Google post link. Meadow does not collect retired Google Business Profile local-post analytics." },
      { label: "How Meadow uses it", text: "To list eligible locations, publish and schedule the business updates you request, and verify their delivery. This connection does not request Gmail, Drive or Calendar access." },
      { label: "Retention and removal", text: "Business routing IDs, location names, authorizations and delivery records remain while the connection is active and are removed when you disconnect. Credentials retained only to retry Google revocation are destroyed within seven days. Original images and text remain until you delete them or your Meadow account." },
    ],
    links: [
      { label: "Google Privacy Policy", url: "https://policies.google.com/privacy" },
      { label: "Google API Services User Data Policy", url: "https://developers.google.com/terms/api-services-user-data-policy" },
      { label: "Manage Google access", url: "https://security.google.com/settings/security/permissions" },
    ],
  },
  {
    id: "twitch", name: "Twitch",
    intro: "Meadow connects to your own channel through Twitch’s authorization screen.",
    details: [
      { label: "Data Meadow accesses", text: "Your channel ID, name, profile image and link, encrypted authorization, message text, reply IDs, publishing choices and delivery confirmations. Twitch supports colored announcements; chat messages during Shared Chat may appear in every participating channel." },
      { label: "How Meadow uses it", text: "To schedule and send your chat messages and replies, confirm delivery and avoid duplicate messages. Chat engagement metrics are unavailable." },
      { label: "Retention and removal", text: activeConnectionRetention + " Meadow requests token revocation when you disconnect. You can also remove Meadow in the platform’s connected-app settings. Sent messages remain on the platform." },
    ],
    links: [{ label: "Twitch Privacy Policy", url: "https://www.twitch.tv/p/en/legal/privacy-notice/" }],
  },
  {
    id: "kick", name: "Kick",
    intro: "Meadow connects to your own channel through Kick’s authorization screen.",
    details: [
      { label: "Data Meadow accesses", text: "Your channel ID, name, profile image and link, encrypted authorization, message text, reply IDs, publishing choices and delivery confirmations. Kick returns an email in its user response, but Meadow does not save it." },
      { label: "How Meadow uses it", text: "To schedule and send your chat messages and replies, confirm delivery and avoid duplicate messages. Chat engagement metrics are unavailable." },
      { label: "Retention and removal", text: activeConnectionRetention + " Meadow requests token revocation when you disconnect. You can also remove Meadow in the platform’s connected-app settings. Sent messages remain on the platform." },
    ],
    links: [{ label: "Kick Privacy Policy", url: "https://kick.com/privacy-policy" }],
  },
];
