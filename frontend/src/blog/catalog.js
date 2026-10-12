import { BLOG_ARTICLES } from './articles.js';

export const BLOG_HUB = {
  kind: 'blog-hub', path: '/blog', headline: 'Social media, explained.',
  title: 'Social Media Guides for Creators & Teams | Meadow',
  description: 'Practical guides to social media accounts, YouTube monetization, Instagram, publishing, and content research. Clear answers with links to original sources.',
  intro: 'Clear answers for the accounts you run and the content you make. Start with a question, then put the answer to work.',
};

export const ANALYTICS_PAGE = {
  kind: 'analytics', path: '/social-media-analytics', headline: 'Make sense of your social posts.',
  title: 'Social Media Analytics Tools for Your Posts | Meadow',
  description: 'Review available post metrics in Meadow. Filter by account, platform, and publishing period, compare performance, and see where data is unavailable.',
  intro: 'Bring available post metrics into the same workspace as your publishing schedule. Find the posts worth learning from and use that context when you plan the next one.',
  sections: [
    { id: 'metrics', heading: 'Read the numbers each platform provides.', paragraphs: [
      'A useful report starts with knowing what was measured. Meadow displays supported views, impressions, likes, comments, shares, saves, and clicks where the connected platform makes them available. A missing metric stays unavailable; it is not silently turned into zero.',
      'Availability depends on the platform, account type, permissions, post format, and connection. Publishing support does not mean every platform supplies the same analytics. Telegram and streaming chat destinations, for example, do not provide the same post-performance data as a social feed.',
    ], table: { headers: ['Look at', 'Use it to ask', 'Keep in mind'], rows: [
      ['Views and impressions', 'Was the content seen?', 'Platforms define and count exposure differently.'],
      ['Likes, comments, shares, and saves', 'How did people respond?', 'Not every destination supplies every interaction.'],
      ['Clicks', 'Did viewers take the next step?', 'Clicks are only shown where the platform returns them.'],
      ['Publication date and sync time', 'Which posts am I comparing?', 'The publishing date and the last metrics refresh are different.'],
    ] } },
    { id: 'filters', heading: 'Compare a useful set of posts.', paragraphs: [
      'Filter by platform, account, and publishing period to narrow the question. Compare a brand’s Instagram posts with its own recent Instagram posts before drawing conclusions from a mixed-platform total. Use the post list to connect a number with the actual content and destination.',
      'The overview groups posts by their publication date. Metrics are the available totals for those posts at the last refresh, rather than a promise that every interaction happened during the selected dates. This distinction matters when an older post continues to collect views.',
    ] },
    { id: 'coverage', heading: 'Keep the gaps visible.', paragraphs: [
      'Platform access can expire, refreshes can lag, and some historical metrics may not be supplied. Meadow keeps unavailable values distinct from measured values. Review connection status and the last update before interpreting an empty result as poor performance.',
      'YouTube metrics are kept out of the cross-platform overview totals. Review available YouTube information in its own context instead of treating a combined engagement number as a universal score. Historical coverage also depends on the account’s analytics provider.',
    ] },
    { id: 'workflow', heading: 'Turn a result into your next post.', paragraphs: [
      'Choose one question for a review: which opening worked, which subject brought comments, or which format earned saves. Find a few comparable posts, read the responses, and write down what you would change. A useful comparison leads to an experiment, not just a larger dashboard.',
      'Prepare that experiment in Meadow, tailor the caption to each destination, and place it in your calendar. Keep the topic, audience, and call to action clear enough that the next review can tell you something specific.',
    ], links: [{ label: 'Plan posts in the social media calendar', href: '/social-media-calendar/' }, { label: 'Build campaign links with the free UTM builder', href: '/tools/utm-builder/' }] },
  ],
  faq: [
    { q: 'Does Meadow show the same metrics for every platform?', a: 'No. Meadow shows the metrics available from each connected platform and account. An unavailable field is not proof that a post received no engagement.' },
    { q: 'Is this a public competitor analytics tool?', a: 'No. Meadow’s analytics workspace is for connected accounts and the post data those integrations make available. It does not promise unrestricted analytics for competitors or private accounts.' },
    { q: 'Can analytics guarantee the best time to post?', a: 'No. Review your own comparable posts and test a schedule for your audience. Meadow’s analytics page does not guarantee reach or automatically establish a universal best posting time.' },
    { q: 'Where do I open analytics?', a: 'Sign in to Meadow, connect the accounts you manage, and open Analytics in your workspace. Available data depends on the connection and the platform’s permissions.' },
  ],
};

export const CONTENT_PAGES = [BLOG_HUB, ...BLOG_ARTICLES, ANALYTICS_PAGE];
export const findContentPage = pathname => CONTENT_PAGES.find(page => page.path === pathname.replace(/\/+$/, ''));
