// Keep these notices aligned with the fields and scopes used by each adapter.
// A compact summary and a link to the platform's public privacy section are shown before OAuth.
export const CONNECTION_PRIVACY_VERSION = "2026-09-16-connections-3";

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
    revokeSummary: "You can disconnect in Meadow and revoke access from your Google Account settings at any time.",
    shortAgreement: "I agree to Meadow’s Privacy Policy and the YouTube Terms of Service and allow the access described above.",
    introduction: "Meadow uses YouTube API Services. Choose whether Meadow may access your selected channel to upload the videos you submit, check their status, and show available performance.",
    data: [
      { name: "Channel identity", detail: "Your channel ID, channel name, profile image, and channel link, so you can identify and select the right publishing destination." },
      { name: "Videos you submit", detail: "Your video file, title, description, visibility, audience and synthetic-content settings, and schedule. We receive upload-session and video IDs, processing and visibility status, and the published video link to complete and verify your uploads." },
      { name: "Video performance", detail: "Available views, likes, comment counts, and authorized share counts for videos published through Meadow. These are shown as individual video statistics." },
      authorization,
    ],
    retention: "Meadow checks stored YouTube information at least once every 30 days. If Meadow loses access to your channel or a video is removed from YouTube, Meadow deletes the related information within 30 days of that change. Connection removal starts deletion immediately. Meadow deletes its stored YouTube information as soon as possible and no later than seven calendar days. Credentials retained only to retry Google revocation are destroyed within seven days. Your original uploads and captions remain until you delete them or your Meadow account.",
    platformNote: googleUse,
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
