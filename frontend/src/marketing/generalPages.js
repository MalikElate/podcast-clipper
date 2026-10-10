// Public cross-platform pages. Platform-specific pages live in ../platformUseCases.js.
// Keep claims to what Meadow ships.

const SHARED_FAQS = [
  { q: "Does Meadow support Twitch and Kick?", a: "Meadow’s Twitch and Kick integrations are built for scheduled chat messages, replies, and follow-up threads; Twitch also supports colored announcements. Connection availability depends on platform configuration. These integrations do not upload videos, broadcast live streams, or provide chat engagement analytics." },
  { q: "How do I authorize my social media accounts?", a: "Most platforms connect through their own sign-in and authorization page. Bluesky uses an app password, and Telegram connects through the Meadow bot. You can disconnect an account at any time from Accounts." },
  { q: "Can I publish to Telegram channels and groups?", a: "Yes. Connect through the Meadow bot, then add it to your group or make it a channel administrator with permission to post messages. Publish or schedule text, photos, videos, albums, and documents alongside your other social posts. Meadow tracks delivery status; Telegram post-performance metrics are not available through the Bot API." },
  { q: "Can I connect more than one account on the same platform?", a: "Yes. Every plan supports multiple accounts per platform. The Free account limit varies by region; see the pricing table below for your local allowance. Starter includes 10, Creator includes 25, and Pro includes unlimited accounts. Those accounts can all be on one platform or spread across several." },
  { q: "How many posts can I publish?", a: "Posts are unlimited on every paid plan. Platforms still apply their own daily limits, and Meadow checks those allowances again before each delivery." },
  { q: "Can I cancel anytime?", a: "Yes. You can manage or cancel your subscription from Meadow’s Billing page, and the cancellation date is shown in the billing portal." },
  { q: "I have another question", a: "Email hello@findmeadow.com and a person on the Meadow team will get back to you." },
];

export const GENERAL_PAGES = [
  {
    path: "/social-media-scheduler", kind: "scheduler", footerLabel: "Social media scheduler",
    title: "Social Media Scheduler — Post to 11 Platforms Free | Meadow",
    description: "Schedule posts across TikTok, Instagram, YouTube, LinkedIn, Telegram and 6 more from one calendar. Free plan, no credit card needed.",
    headline: "A social media scheduler for every account you run.",
    subtitle: "Plan posts in one calendar, tailor each destination, and choose when they go live. Connect multiple accounts per platform, with unlimited posts on paid plans and API access for your tools and AI agents.",
    primaryAction: { label: "Start scheduling", path: "/dashboard" },
    platformHeading: "Schedule to every platform you actually use",
    platformText: "Each platform has its own rules for formats, lengths, and file sizes. Meadow checks them before a post is queued, so nothing quietly fails on one network.",
    features: [
      { title: "Multiple accounts per platform", text: "Run several brands, clients, or channels on the same platform under one plan." },
      { title: "Unlimited posts", text: "Every paid plan includes unlimited posts. Only your number of connected accounts changes." },
      { title: "Per-platform versions", text: "Change the caption, title, format, or settings for a single destination without rewriting the whole post." },
      { title: "Calendar and queue", text: "See scheduled, published, and failed posts in a calendar or list, and edit anything that has not gone out yet." },
      { title: "Delivery you can follow", text: "Each destination publishes on its own. If one platform needs attention, the others still go out." },
      { title: "Performance in one place", text: "View available metrics for posts published through Meadow across the platforms that provide them." },
    ],
    faqs: [
      { q: "What is a social media scheduler?", a: "A social media scheduler lets you write posts once and publish them later across several platforms and accounts, instead of opening every app and posting by hand. Meadow schedules to eleven platforms, including Telegram, from one workspace." },
      { q: "Can I schedule video, carousels, and stories?", a: "Yes, wherever the destination supports them. Meadow publishes text, images, video, carousels, stories, reels, and documents, and checks each format against the platform before scheduling." },
      { q: "What happens if a post fails on one platform?", a: "Each destination is delivered independently. A failure on one platform is shown with its reason and does not stop the others from publishing." },
      { q: "Can an AI agent schedule posts for me?", a: "Yes. Create a private API key in Meadow and your scripts, server automations, or AI agent can create and schedule posts through the Meadow API." },
      ...SHARED_FAQS,
    ],
  },
  {
    path: "/social-media-scheduling-api", kind: "scheduling-api", footerLabel: "Social media scheduling API",
    title: "Social Media Scheduling API for 11 Platforms | Meadow",
    description: "Schedule social posts from your application, automation or AI agent. Meadow connects Instagram, TikTok, LinkedIn, Telegram and more through its API and MCP server.",
    headline: "A social media scheduling API for your tools and agents.",
    subtitle: "Send your content, connected account IDs, and publishing time to Meadow. Use the REST API from your application or MCP from a supported AI client, and follow delivery for each destination.",
    primaryAction: { label: "Get an API key", path: "/dashboard/api-keys" },
    secondaryAction: { label: "Read API and MCP docs", path: "/developers/" },
    featureHeading: "Control what gets scheduled.",
    platformHeading: "One integration for your connected accounts",
    platformText: "Reach eleven publishing platforms, including Telegram channels and groups, plus Twitch and Kick chat. Each destination keeps its own format requirements and publishing settings.",
    features: [
      { title: "Preview before queueing", text: "Check the same post against every selected account before submitting it. Resolve format, media, and platform-setting errors before scheduling." },
      { title: "Choose the time zone", text: "Supply a local date and time with an IANA time zone. Give individual accounts a different publishing time when your campaign needs it." },
      { title: "Retry without duplicate posts", text: "Send a stable requestId with your submission. Retrying the same request returns the original result instead of queueing it again." },
      { title: "Track each delivery", text: "Read the post’s destination statuses or subscribe to signed webhooks. A queued post is only live once its delivery is confirmed as published." },
    ],
    faqs: [
      { q: "What is a social media scheduling API?", a: "It lets an application or automation submit content and a future publishing time without operating a browser. Meadow’s REST API and MCP tools use the same connected accounts, validation, and delivery system as the dashboard." },
      { q: "How do I authenticate REST API requests?", a: "Create a private key in Meadow’s API Keys page and send it as an Authorization: Bearer header. The key has your full workspace access, so keep it on your server or in a secret manager, never in public browser code." },
      { q: "Can an AI agent schedule posts through MCP?", a: "Yes. Connect a supported MCP client to https://findmeadow.com/mcp, then use preview_post to validate content and publish_post or publish_draft to schedule it. Supported clients can sign in through OAuth; private clients can use a Meadow API key." },
      { q: "Can I schedule images and videos through the API?", a: "Yes, where the selected platform supports them. Upload media first and use the returned media IDs in your post. Some destinations also require settings, such as YouTube audience choices, TikTok consent, or a Pinterest board." },
      { q: "Does a successful API response mean the post is live?", a: "No. Submission queues deliveries for the accounts you selected. Check each delivery’s status or its webhook outcome to confirm publication. A TikTok inbox transfer still requires you to finish posting in TikTok." },
      ...SHARED_FAQS,
    ],
  },
  {
    path: "/manage-social-media-accounts", kind: "accounts", footerLabel: "Manage social media accounts",
    title: "Manage Social Media Accounts Across 11 Platforms | Meadow",
    description: "Manage social media accounts in one Meadow workspace. Connect Instagram, TikTok, LinkedIn, Telegram and more, choose destinations, and track every post’s delivery.",
    headline: "Manage social media accounts in one place.",
    subtitle: "Bring your profiles, pages, and channels into one workspace. See which accounts are connected, choose the right destinations for each post, and keep separate versions for every brand or audience.",
    primaryAction: { label: "Manage your accounts", path: "/dashboard/connections" },
    featureHeading: "Keep each account ready to publish.",
    platformHeading: "Connect the accounts your audience follows",
    platformText: "Manage accounts across eleven publishing platforms, including Telegram channels and groups, plus Twitch and Kick chat. Available connections and formats depend on each platform’s configuration.",
    features: [
      { title: "Multiple accounts on the same platform", text: "Connect several profiles, pages, or channels without creating a separate Meadow login for each one. Your plan determines the total connected-account allowance." },
      { title: "Clear connection status", text: "Use Accounts to see connected profiles and accounts that need reauthorization. Reconnect through the platform’s authorization flow when access expires." },
      { title: "Choose destinations per post", text: "Select the accounts that should receive a post and adjust captions, formats, and settings for each destination before publishing or scheduling." },
      { title: "Keep track of the outcome", text: "Follow scheduled posts in the calendar and review the result for each account. A destination that needs attention has its own status." },
    ],
    faqs: [
      { q: "How do I manage social media accounts with Meadow?", a: "Open Accounts in your Meadow workspace, connect a platform, and choose the profiles, pages, or channels you want to use. Those accounts become available as destinations when you create a post." },
      { q: "Can I manage accounts for several brands?", a: "Yes. Connect multiple accounts on the same platform and choose the appropriate destinations for each post. The connected-account allowance applies to your plan’s total, across all platforms." },
      { q: "What should I do when an account needs reconnecting?", a: "Open Accounts and use the reconnect action for that account. Complete the platform’s sign-in and authorization flow, then check the account’s status before scheduling more posts." },
      { q: "Can each account have its own version of a post?", a: "Yes. You can change the caption, format, and supported platform settings per account. Scheduled posts can also use different local publishing times for individual destinations." },
      { q: "Can I remove an account from Meadow?", a: "Yes. Use the disconnect action in Accounts when you no longer want Meadow to access that account. Review its pending posts before disconnecting, since they depend on that connection to publish." },
      ...SHARED_FAQS,
    ],
  },
  {
    path: "/cross-posting", kind: "cross-posting", footerLabel: "Cross posting",
    title: "Cross Post to 11 Social Platforms at Once | Meadow",
    description: "Cross post to Instagram, TikTok, YouTube, X, LinkedIn, Telegram and more, with a version tailored to each platform instead of one shared caption.",
    headline: "Cross post everywhere without sounding copy-pasted.",
    subtitle: "Upload once and publish to eleven platforms together, including Telegram channels and groups, with a caption, format, and settings that fit each one.",
    problem: {
      heading: "Cross posting done badly is obvious",
      text: "Hashtag walls on LinkedIn. A caption cut off at 280 characters on X. A post that silently never went out on one network. Meadow is built so the same idea looks native everywhere it lands.",
    },
    features: [
      { title: "Captions per platform", text: "Write the main caption once, then override it for any destination. Keep hashtags on Instagram, go longer on LinkedIn, and stay short on X and Bluesky." },
      { title: "Platform rules checked first", text: "Character limits, media counts, file sizes, video length, and required fields such as YouTube titles and Pinterest boards are checked before the post is queued." },
      { title: "Settings each platform needs", text: "Set YouTube visibility and audience, TikTok audience and interaction settings, Pinterest boards and links, and Bluesky alt text in the same flow." },
      { title: "Results for each platform", text: "Every destination publishes on its own and reports its own status. One failure never holds back the rest of your post." },
    ],
    platformHeading: "Choose where your post goes",
    platformText: "Pick any mix of connected accounts across eleven platforms for each post, including your Telegram channels and groups.",
    faqs: [
      { q: "What is cross posting?", a: "Cross posting means sharing the same content on several social platforms. Meadow lets you publish once to all of them while giving each platform its own version." },
      { q: "Will cross posting hurt my reach?", a: "Meadow publishes through each platform’s official API, the same way the platform’s approved partners do. Tailoring the caption and format for each network helps your post feel native wherever it appears." },
      { q: "Can I cross post a video to TikTok, YouTube, and Instagram at once?", a: "Yes. Select all three destinations, then add a YouTube title and the TikTok settings in the same post. Meadow checks the video against each platform’s limits before scheduling." },
      { q: "Can an AI agent cross post for me?", a: "Yes. With a Meadow API key, an AI agent or script can publish your content to your connected accounts. It posts what you give it, in your voice." },
      ...SHARED_FAQS,
    ],
  },
];

export const findMarketingPage = pathname => GENERAL_PAGES.find(page => page.path === pathname) || null;
