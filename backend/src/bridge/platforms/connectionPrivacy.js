// Keep these notices aligned with the fields and scopes used by each adapter.
// A compact summary and a link to the platform's public privacy section are shown before authorization.
export const CONNECTION_PRIVACY_VERSION = "2026-09-21-connections-6";

const authorization = {
  name: "Authorization and consent",
  detail: "Encrypted access and refresh tokens, granted permissions, token expiry, and this notice’s version and acceptance time. These keep your selected connection working and record what you agreed to. Meadow never receives your platform password.",
};
const sharing = "Meadow uses this data to operate your connection and the publishing or analytics you request. Cloudflare hosts the service. Your selected platform receives the media and publishing settings you submit; displaying a profile image can also contact that platform. We do not sell platform data or use it for advertising or general-purpose AI training. Product usage tracking is disabled.";
const removal = "Remove the account in Connections to stop new publishing and delete its stored connection data, delivery history, and metrics. Your original Meadow content stays until you delete it. Published posts stay on the platform, and a request already sent may still finish. Full account deletion is available in Settings → Privacy & Account. Contact hello@findmeadow.com for a privacy request.";
const googleUse = "Meadow’s use and transfer of Google API data follows the Google API Services User Data Policy, including Limited Use. Data is used for the connection and features you request. You can also remove access through Google’s security settings; revoking a Google grant can affect other channels or Google connections that share it.";
const googlePolicies = [
  { label: "Google Privacy Policy", url: "https://policies.google.com/privacy" },
  { label: "Google API Services User Data Policy", url: "https://developers.google.com/terms/api-services-user-data-policy" },
  { label: "Manage Google access", url: "https://security.google.com/settings/security/permissions" },
];

const notices = {
  telegram: {
    name: "Telegram",
    connectionSummary: "Connect a Telegram channel or group to publish and schedule posts through the Meadow Publisher bot.",
    requirement: "You must be allowed to add the Meadow Publisher bot to the destination. Channels must grant it permission to post messages.",
    revokeSummary: "You can disconnect in Meadow at any time. Also remove Meadow Publisher from the Telegram channel or group to end its access there.",
    shortAgreement: "I agree to connect this Telegram destination and allow the access described above.",
    introduction: "Choose whether Meadow may use its Telegram bot in a channel or group you select to deliver the posts you submit.",
    data: [
      { name: "Telegram identity and destination", detail: "Telegram supplies your numeric user ID during setup and the selected channel or group ID, type, title, and public username when available. Meadow uses them to complete the connection and identify where a post should be sent." },
      { name: "Posts you submit", detail: "Meadow sends the text, images, videos, documents, captions, and schedule you choose to the connected destination. We keep Telegram message IDs, delivery status, and a public message link when Telegram provides one." },
      { name: "Membership changes", detail: "Telegram tells Meadow when the bot is added to or removed from a connected destination. Meadow uses removal events to stop publishing and delete the affected connection data." },
      { name: "Bot authorization", detail: "Meadow stores the selected destination ID and type in encrypted connection credentials. Telegram does not give Meadow your Telegram password or a personal Telegram access token." },
    ],
    retention: "The temporary setup link and Telegram user ID expire after ten minutes or are removed when setup finishes. The destination identity, encrypted routing data, and delivery records remain while the connection is active and are removed when you disconnect. Original media and captions remain until you delete them or your Meadow account.",
    platformNote: "Disconnecting in Meadow stops new deliveries and removes Meadow’s stored connection data, but it cannot remove a bot from a Telegram chat. Remove Meadow Publisher from the channel’s administrators or the group’s members to end its access in Telegram. Posts already published remain until a Telegram administrator deletes them.",
    agreement: "I agree to this Telegram connection privacy notice and Meadow’s Privacy Policy and Terms of Service, and allow the data access described above.",
    policies: [{ label: "Telegram Privacy Policy", url: "https://telegram.org/privacy" }],
  },
  pinterest: {
    name: "Pinterest",
    connectionSummary: "Connect a Pinterest account to publish and schedule Pins and view available performance.",
    requirement: "Your Pinterest account must have a board where Meadow can publish Pins.",
    revokeSummary: "You can disconnect in Meadow and revoke access from Pinterest’s security settings at any time.",
    shortAgreement: "I agree to connect Pinterest and allow the access described above.",
    introduction: "Choose whether Meadow may access this Pinterest account to show your boards, publish the Pins you submit, and retrieve available Pin performance.",
    data: [
      { name: "Account and boards", detail: "Your account ID or username, profile image and profile link, plus board IDs and names. We retrieve these to identify your account and let you choose where each Pin goes." },
      { name: "Pins you submit", detail: "Your images or videos, title, description, destination link, selected board, and schedule. We keep upload and Pin identifiers, delivery status, and the published Pin link to deliver your requests and avoid duplicate posts." },
      { name: "Pin performance", detail: "Available impressions, saves, Pin clicks, and outbound clicks for Pins published through Meadow. These are fetched when you refresh analytics; Pinterest Sandbox does not provide organic analytics." },
      authorization,
    ],
    retention: "Profile details, board lists, and organic metrics are retrieved for the current screen or operation and are not saved as a reusable database cache. Authorization and routing identifiers, your chosen publishing settings, and delivery records remain until you remove the connection. Original uploads and captions remain until you delete them or your Meadow account.",
    platformNote: "After removing the connection in Meadow, also remove Meadow in Pinterest’s security and app settings to revoke Pinterest’s authorization. Pinterest does not provide direct revocation for the regular user tokens this connection uses.",
    agreement: "I agree to this Pinterest connection privacy notice and Meadow’s Privacy Policy and Terms of Service, and allow the data access described above.",
    policies: [{ label: "Pinterest Privacy Policy", url: "https://policy.pinterest.com/en/privacy-policy" }, { label: "Manage Pinterest access", url: "https://www.pinterest.com/settings/security" }],
  },
  youtube: {
    name: "YouTube",
    connectionSummary: "Connect a YouTube channel to upload and schedule videos and view available performance.",
    requirement: "Your Google Account must be associated with a YouTube channel.",
    revokeSummary: "You can disconnect YouTube from Meadow at any time in Connections. You can also remove Meadow through Google’s security settings.",
    shortAgreement: "I agree to Meadow’s Privacy Policy and the YouTube Terms of Service and allow the access described above.",
    introduction: "Meadow uses YouTube API Services. We use this information only to connect the YouTube channel you select, upload and schedule videos you ask us to publish, confirm whether an upload succeeded, and display the performance of your published videos.",
    data: [
      { name: "Channel information", detail: "When you connect YouTube, Meadow receives basic information about your channel, such as its name, image and channel ID." },
      { name: "Videos uploaded through Meadow", detail: "We receive information about videos uploaded through Meadow, including their upload status and YouTube link." },
      { name: "Video performance", detail: "For videos uploaded through Meadow, we receive views, likes, comments and available analytics." },
      authorization,
    ],
    retention: "YouTube information stored by Meadow is checked regularly, and Meadow deletes any information it cannot refresh within 30 days. When you disconnect YouTube, Meadow stops accessing the channel and begins deleting the stored authorization, channel information, publishing records and analytics. We aim to complete this deletion within seven days. Videos already published on YouTube remain there until you delete them through YouTube. Original videos and captions stored in your Meadow workspace remain until you delete them or your Meadow account.",
    platformNote: "Meadow’s use of information received from Google APIs follows the Google API Services User Data Policy, including its Limited Use requirements. Meadow does not request access to Gmail, Google Drive or Google Calendar. We do not sell Google or YouTube data. We do not share it with advertisers or data brokers, use it for advertising or credit decisions, or use it to train general-purpose AI models. Revoking a Google grant can affect other channels or Google connections that share it.",
    agreement: "I agree to this YouTube connection privacy notice, Meadow’s Privacy Policy and Terms of Service, and the YouTube Terms of Service, and allow the data access described above.",
    policies: [{ label: "YouTube Terms of Service", url: "https://www.youtube.com/t/terms" }, ...googlePolicies],
  },
  google_business: {
    name: "Google Business Profile",
    connectionSummary: "Connect Google Business Profile to publish and schedule updates for selected locations.",
    requirement: "Your Google Account must manage at least one Business Profile location.",
    revokeSummary: "You can disconnect in Meadow and revoke access from your Google Account settings at any time.",
    shortAgreement: "I agree to connect Google Business Profile and allow the access described above.",
    introduction: "Choose whether Meadow may access your Google Business Profile accounts and locations to publish the business updates you submit.",
    data: [
      { name: "Business accounts and locations", detail: "Business account and location resource IDs and location names, so you can select and identify the location receiving each post." },
      { name: "Business updates you submit", detail: "Your images, post text, language setting, and schedule. We receive the post resource ID, publishing status, and Google post link to deliver and verify your updates." },
      { name: "Post performance", detail: "Meadow does not collect Google Business Profile post analytics. Google’s retired local-post metrics are shown as unavailable." },
      authorization,
    ],
    retention: "Business routing IDs, location names, authorizations, and delivery records remain while the connection is active and are removed when you disconnect it. Credentials retained only to retry Google revocation are destroyed within seven days. Your original images and text remain until you delete them or your Meadow account.",
    platformNote: `${googleUse} Google labels the permission as managing your business; Meadow uses it to list your locations and publish and check the updates you submit. This connection does not request Gmail, Google Drive, or Calendar access.`,
    agreement: "I agree to this Google Business Profile connection privacy notice and Meadow’s Privacy Policy and Terms of Service, and allow the data access described above.",
    policies: googlePolicies,
  },
  tiktok: {
    name: "TikTok",
    connectionSummary: "Connect a TikTok account to publish and schedule content and view available performance.",
    requirement: "Your TikTok account must be eligible for the publishing options you select.",
    revokeSummary: "You can disconnect in Meadow and revoke access from TikTok’s app-permissions settings at any time.",
    shortAgreement: "I agree to connect TikTok and allow the access described above.",
    introduction: "Choose whether Meadow may access this TikTok creator account to show its publishing choices, deliver the content you submit, and retrieve available video performance.",
    data: [
      { name: "Creator identity and publishing choices", detail: "Your TikTok open ID, display name, avatar, and creator nickname or username. We also retrieve available visibility options, comment, Duet and Stitch restrictions, and maximum video duration to present valid publishing settings." },
      { name: "Content you submit", detail: "Your videos or photos, caption or title, visibility and interaction choices, commercial-content disclosures, and schedule. We receive upload and publish IDs, delivery status, published video IDs and links, and any platform rejection reason to track your submission." },
      { name: "Performance and authorization changes", detail: "Available views, likes, comment counts, and shares for videos published through Meadow. TikTok also sends authorization-removal events containing your app-specific account ID so we can stop publishing and remove the connection data." },
      authorization,
    ],
    retention: "Creator details, publishing choices, authorizations, delivery records, and available video metrics remain while the connection is active. Removing it starts deletion of that data. Credentials retained only to retry TikTok revocation are destroyed within seven days. Original uploads and captions remain until you delete them or your Meadow account.",
    platformNote: "You can also remove Meadow from TikTok’s security and app-permissions settings. Connecting does not publish anything by itself: you choose the content, visibility, and other settings before submitting each post.",
    agreement: "I agree to this TikTok connection privacy notice and Meadow’s Privacy Policy and Terms of Service, and allow the data access described above.",
    policies: [{ label: "TikTok Privacy Policy", url: "https://www.tiktok.com/legal/page/row/privacy-policy/en" }],
  },
};

export const connectionDisclosures = Object.entries(notices).map(([platform, notice]) => ({ platform, version: CONNECTION_PRIVACY_VERSION, ...notice, sharing, removal }));
export const connectionDisclosure = platform => connectionDisclosures.find(item => item.platform === platform) || null;
