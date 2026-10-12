import { COMPETITOR_ALTERNATIVE_PAGES } from "./competitorAlternativePages.js";

// Competitor details are sourced from their own public pages, not comparison sites.
export const ALTERNATIVE_PAGES = [
  {
    path: "/hootsuite-alternative",
    kind: "alternative",
    footerLabel: "Hootsuite alternative",
    title: "Hootsuite Alternative for Social Media Publishing | Meadow",
    description: "Compare Meadow and Hootsuite for social publishing. Schedule across 11 platforms, including Telegram, use API and MCP workflows, and start with Meadow’s free plan.",
    headline: "A Hootsuite alternative built around publishing.",
    subtitle: "Bring your accounts, drafts, and publishing schedule into one Meadow workspace. Create posts yourself, work with your AI assistant, or connect your own tools through the API.",
    checkedAt: "2026-10-12",
    sources: [
      { label: "Hootsuite plans", href: "https://www.hootsuite.com/plans" },
      { label: "Hootsuite Standard features", href: "https://www.hootsuite.com/plans/standard" },
      { label: "Hootsuite API reference", href: "https://apidocs.hootsuite.com/docs/api/index.html" },
    ],
    comparison: [
      { feature: "Getting started", meadow: "An ongoing Free plan. No credit card required.", hootsuite: "A 14-day free trial. Paid plans after the trial." },
      { feature: "Paid pricing", meadow: "Choose a plan for your account allowance. See your local prices below.", hootsuite: "Advertised from US$99 per user/month, billed annually. Taxes extra." },
      { feature: "Connected accounts", meadow: "Starter: 10. Creator: 25. Pro: unlimited. Free allowance varies by region.", hootsuite: "Standard: 10. Professional and higher: unlimited." },
      { feature: "Scheduled posts", meadow: "Unlimited on paid plans, subject to each platform’s limits.", hootsuite: "Unlimited on paid plans. Trial posting limits apply." },
      { feature: "Publishing workflow", meadow: "Calendar, drafts, per-account versions, and delivery status for each destination.", hootsuite: "Content calendar, scheduling, and customization by social network." },
      { feature: "API and AI workflows", meadow: "REST API and MCP server for supported AI clients. Private keys from your workspace.", hootsuite: "REST API available. Wisdom includes an in-app assistant and MCP connectors." },
      { feature: "Analytics", meadow: "Creator and Pro include available metrics for posts published through Meadow.", hootsuite: "Reports and competitor benchmarking, with deeper reporting on higher plans." },
      { feature: "Unified social inbox", meadow: "No unified inbox for social DMs and comments.", hootsuite: "Included in Standard, with more customer-care workflows on higher plans." },
      { feature: "Social listening", meadow: "No brand or competitor listening suite.", hootsuite: "Standard includes seven-day mention searches. Higher plans extend listening." },
      { feature: "Content approvals", meadow: "Save and review drafts before publishing. No multistage approval chains.", hootsuite: "Approval workflows on Advanced and Enterprise." },
    ],
    reasons: [
      { title: "Keep your publishing calendar clear", text: "Prepare drafts, choose destinations, and schedule posts in one place. See what is queued and check the outcome for every account." },
      { title: "Give each account its own version", text: "Change a caption, format, or publishing setting for one destination without starting a new post. Connect several accounts on the same platform under your plan’s allowance." },
      { title: "Work from your assistant or application", text: "Use Meadow’s MCP server from a supported AI client, or the REST API from your own application. Preview content before submitting it and follow delivery afterward." },
      { title: "Start with a real Free plan", text: "Connect accounts and try the publishing workflow before choosing a paid plan. Paid plans include unlimited posts; the platform’s own limits still apply." },
    ],
    faqs: [
      { q: "Is Meadow a good Hootsuite alternative?", a: "Meadow is a good fit when your main job is creating, scheduling, and publishing across multiple accounts, including through an AI client or your own application. If you need a unified social inbox, brand listening, or formal approval chains, compare Hootsuite’s plans for those workflows." },
      { q: "Can I try Meadow before switching from Hootsuite?", a: "Yes. Meadow has an ongoing Free plan with no credit card required. Connect an account and try a draft or scheduled post before moving your publishing workflow. Your Free account allowance and paid prices are shown in the local pricing table." },
      { q: "Can I move my Hootsuite schedule into Meadow automatically?", a: "There is no automatic Hootsuite migration. Connect your social accounts to Meadow, then recreate the drafts and future posts you want to move. Review required settings and publishing times, and remove duplicate schedules in your previous tool before the same content is sent twice." },
      { q: "Does Meadow support API and AI-assisted publishing?", a: "Yes. Meadow provides a REST API and an MCP server for supported clients. Create a private key in API Keys, or use OAuth in a supported MCP client. Your assistant or application can prepare drafts, preview posts, schedule publishing, and read delivery statuses." },
      { q: "Which social platforms can I publish to?", a: "Meadow supports publishing to Instagram, TikTok, YouTube, Facebook, LinkedIn, X, Threads, Bluesky, Pinterest, Google Business Profile, and Telegram. Formats and connection availability depend on the platform. Twitch and Kick are separate chat integrations." },
      { q: "Can I publish to Telegram channels and groups?", a: "Yes. Connect through the Meadow bot and give it permission to post in your group or channel. Schedule supported text and media alongside other destinations. Meadow tracks delivery status; Telegram post-performance metrics are not available through the Bot API." },
      { q: "Does Meadow support Twitch and Kick?", a: "Meadow supports scheduled chat messages, replies, and follow-up threads, plus Twitch announcements. Connection availability depends on platform configuration. These integrations do not upload videos, broadcast live streams, or provide chat engagement analytics." },
      { q: "Does Meadow include a social inbox or social listening?", a: "No. Meadow focuses on content preparation, scheduling, publishing, and available post metrics. Hootsuite includes a unified social inbox and listening features if those are central to your work." },
    ],
  },
  ...COMPETITOR_ALTERNATIVE_PAGES,
];
