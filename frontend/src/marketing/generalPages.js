// Public cross-platform pages. Platform-specific pages live in ../platformUseCases.js.
// Keep claims to what Meadow ships.

const SHARED_FAQS = [
  { q: "Do I need to share my social media passwords with Meadow?", a: "No. You connect each account through the platform’s own sign-in and authorization page. Meadow never asks for your password, and you can disconnect an account at any time from Connections." },
  { q: "Can I connect more than one account on the same platform?", a: "Yes. Every plan supports multiple accounts per platform. Free includes 5 connected social accounts, Starter includes 10, Creator includes 25, and Pro includes unlimited accounts. Those accounts can all be on one platform or spread across several." },
  { q: "How many posts can I publish?", a: "Posts are unlimited on every paid plan. Platforms still apply their own daily limits, and Meadow checks those allowances again before each delivery." },
  { q: "Can I cancel anytime?", a: "Yes. You can manage or cancel your subscription from Meadow’s Billing page, and the cancellation date is shown in the billing portal." },
  { q: "I have another question", a: "Email hello@findmeadow.com and a person on the Meadow team will get back to you." },
];

export const GENERAL_PAGES = [
  {
    path: "/social-media-scheduler", kind: "scheduler", footerLabel: "Social media scheduler",
    title: "Social Media Scheduler for 10 Platforms · Meadow",
    description: "Meadow is a social media scheduler for X, Instagram, LinkedIn, Facebook, TikTok, YouTube, Bluesky, Threads, Pinterest, and Google Business. Unlimited posts on every plan.",
    headline: "A social media scheduler for all ten of your platforms.",
    subtitle: "Write a post once and schedule it to every account you run. Unlimited posts on every plan, multiple accounts per platform, and API access so your tools and AI agents can post too.",
    steps: [
      { title: "Connect your accounts", text: "Sign in to each platform through its own authorization page. Connect more than one account per platform whenever you need to." },
      { title: "Write the post once", text: "Add your media and caption, then adjust the caption, title, format, and settings for any destination that needs its own version." },
      { title: "Publish now or schedule", text: "Choose a date and time in your workspace’s time zone. Meadow publishes each destination and tracks its delivery." },
    ],
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
      { q: "What is a social media scheduler?", a: "A social media scheduler lets you write posts once and publish them later across several platforms and accounts, instead of opening every app and posting by hand. Meadow schedules to ten platforms from one workspace." },
      { q: "Can I schedule video, carousels, and stories?", a: "Yes, wherever the destination supports them. Meadow publishes text, images, video, carousels, stories, reels, and documents, and checks each format against the platform before scheduling." },
      { q: "What happens if a post fails on one platform?", a: "Each destination is delivered independently. A failure on one platform is shown with its reason and does not stop the others from publishing." },
      { q: "Can an AI agent schedule posts for me?", a: "Yes. Create a private API key in Meadow and your scripts, server automations, or AI agent can create and schedule posts through the Meadow API." },
      ...SHARED_FAQS,
    ],
  },
  {
    path: "/cross-posting", kind: "cross-posting", footerLabel: "Cross posting",
    title: "Cross Posting to 10 Social Platforms · Meadow",
    description: "Cross post to X, Instagram, LinkedIn, Facebook, TikTok, YouTube, Bluesky, Threads, Pinterest, and Google Business with Meadow, with a tailored version for every platform.",
    headline: "Cross post everywhere without sounding copy-pasted.",
    subtitle: "Upload once and publish to ten platforms together, with a caption, format, and settings that fit each one.",
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
    platformText: "Pick any mix of connected accounts across ten platforms for each post.",
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
