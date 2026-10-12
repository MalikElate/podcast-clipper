// Original editorial content. Platform instructions and sources were reviewed on
// the dates below; account-specific controls can differ by app version and region.
const article = (content) => ({ published: '2026-10-12', updated: '2026-10-12', ...content, path: `/blog/${content.slug}` });
const link = (label, href) => ({ label, href: href.startsWith('/') && !href.endsWith('/') ? `${href}/` : href });

export const BLOG_ARTICLES = [
  article({
    slug: 'how-much-does-youtube-pay-for-1000-views',
    title: 'How Much Does YouTube Pay for 1,000 Views? | Meadow',
    headline: 'How much does YouTube pay for 1,000 views?',
    description: 'Understand YouTube RPM, CPM, Shorts revenue, and how to estimate earnings from your own channel instead of an unreliable average.',
    category: 'YouTube',
    intro: 'YouTube has no fixed payment for 1,000 views. Your channel’s RPM is a more useful starting point than an internet-wide average: it connects the views you actually received with the revenue recorded for the same period.',
    sections: [
      {
        id: 'rpm-and-cpm', heading: 'Start with RPM, not the advertiser’s CPM',
        paragraphs: [
          'RPM describes creator revenue per thousand views after YouTube’s revenue share. It can include several income sources recorded in Analytics, including ads, Premium, memberships, and Supers. For Shorts, the denominator is engaged views. CPM describes advertiser spending per thousand ad impressions before revenue sharing. They answer different questions.',
          'A video view does not necessarily contain an ad, and a playback can contain more than one ad. That is why multiplying a public view count by somebody else’s CPM does not produce a trustworthy earnings estimate. Also avoid deducting YouTube’s share again from RPM: that adjustment is already reflected in the metric.',
        ],
        links: [link('YouTube’s explanation of revenue metrics', 'https://support.google.com/youtube/answer/9314357?hl=en')],
      },
      {
        id: 'estimate', heading: 'Estimate revenue with a clearly stated assumption',
        paragraphs: [
          'For a planning scenario, use revenue = views ÷ 1,000 × assumed RPM. The table below is arithmetic, not a forecast or a list of typical rates. Replace the assumption with a recent RPM from a comparable format and time period on your own channel.',
          'For example, 25,000 views at an assumed $4 RPM produces a $100 scenario. If that RPM includes membership revenue, the result is not an estimate of advertising income alone. Keep the metric definition next to any forecast you share with a partner or teammate.',
        ],
        table: { headers: ['Illustrative views', 'Assumed RPM', 'Calculated revenue'], rows: [['1,000', '$1', '$1'], ['1,000', '$4', '$4'], ['25,000', '$4', '$100'], ['100,000', '$4', '$400']] },
      },
      {
        id: 'variation', heading: 'Why two videos with equal views can earn differently',
        paragraphs: [
          'YouTube identifies advertiser demand, viewer geography, seasonality, and available ad formats as reasons CPM changes. The proportion of views that can be monetized also matters. A niche label such as finance or gaming cannot capture all of those conditions.',
          'Compare like with like before diagnosing a change. Separate long-form videos from Shorts, choose matching date ranges, and check whether the audience or revenue mix changed. A lower RPM alongside higher total revenue is possible; the rate alone does not tell you whether the channel earned more money.',
        ],
      },
      {
        id: 'shorts', heading: 'Treat Shorts and watch-page ads as different models',
        paragraphs: [
          'YouTube’s published partner terms describe a 55% share of net Watch Page advertising revenue and a 45% share of the revenue allocated to a creator from the Shorts Creator Pool. Neither percentage is a guaranteed payment per view. The allocation and measurement systems differ.',
          'Build separate scenarios for each format. A short clip can serve discovery, a longer tutorial can answer a detailed question, and either can support a broader business. Decide what the video is meant to accomplish before comparing its revenue rate with a different format.',
        ],
        links: [link('YouTube partner earnings overview', 'https://support.google.com/youtube/answer/72902?hl=en')],
      },
      {
        id: 'your-channel', heading: 'Use your own channel to make the next decision',
        paragraphs: [
          'Open YouTube Studio, choose Analytics, and inspect Revenue for a consistent period. Record the format, views, revenue, and major changes in your publishing activity. Keep sponsorships and other off-platform income in a separate line so you do not silently mix unlike numbers.',
          'Use that baseline to test one change: a clearer topic, a stronger introduction, or a better explanation of the problem viewers came to solve. Evaluate audience response alongside revenue. An earnings forecast should help you choose a sustainable production budget, not pressure you into padding videos or making claims the content cannot deliver.',
        ],
      },
    ],
    faq: [
      { q: 'Does YouTube pay a fixed amount for a million views?', a: 'No. Apply the same views ÷ 1,000 × assumed RPM calculation, and label the assumption. Public view counts alone do not reveal a channel’s earnings.' },
      { q: 'Is RPM the amount deposited into my bank?', a: 'No. Analytics is useful for measuring performance, while finalized earnings, payment thresholds, holds, and applicable deductions affect the eventual payment.' },
    ],
    sources: [link('YouTube revenue analytics', 'https://support.google.com/youtube/answer/9314357?hl=en'), link('YouTube partner earnings', 'https://support.google.com/youtube/answer/72902?hl=en')],
    relatedTools: [link('YouTube Title Checker', '/tools/youtube-title-checker'), link('YouTube Channel Description Generator', '/tools/youtube-channel-description-generator')],
  }),
  article({
    slug: 'how-to-see-who-liked-a-comment-on-instagram',
    title: 'How to See Who Liked an Instagram Comment | Meadow',
    headline: 'How to see who liked a comment on Instagram',
    description: 'Find the comment’s likes control, understand why a list may be unavailable, and avoid confusing post likes with comment likes.',
    category: 'Instagram',
    intro: 'Open the original Instagram post, find the exact comment, and look for a selectable likes count beside or beneath it. The available control varies by app version and account. Tapping the heart can like or unlike the comment rather than open a list.',
    sections: [
      {
        id: 'find-the-comment', heading: 'Find the comment before checking its likes',
        paragraphs: [
          'A post’s likes, a comment’s likes, and likes on a reply are separate interactions. Start from the post containing the comment rather than the overall likes count under the photo or video. If the comment is part of a reply thread, expand the relevant replies and check the author and text.',
          'This distinction is especially useful on busy posts. A nearby number may belong to the original post or another comment. Before drawing a conclusion about who reacted to your words, confirm that you are looking at the right item.',
        ],
        steps: ['Open the original post or Reel in Instagram.', 'Open its comments and expand the relevant replies if needed.', 'Locate the exact comment and its visible likes count.', 'Use a selectable count or likes control if Instagram offers one; inspect the list that opens.'],
      },
      {
        id: 'controls', heading: 'Use the controls your version actually shows',
        paragraphs: [
          'There is no single gesture we can verify for every current Instagram interface. Some guides prescribe a long press on the heart as though it always works. Do not keep tapping or holding an unlabeled control if it only changes your own reaction.',
          'If a likes count is visible and selectable, try that control first. If no list opens, move to the checks below instead of treating the absence of a list as evidence about a particular person. The web interface and mobile app can expose different controls, so instructions for one should not be assumed to apply to the other.',
        ],
      },
      {
        id: 'troubleshooting', heading: 'If the liker list does not appear',
        paragraphs: [
          'First make sure the post and comment are still accessible to your account. Then check whether the comment shows any likes and whether you are in the original thread rather than a notification preview. Close and reopen the app, and check for an app update if its controls are not responding normally.',
          'You can also compare the same comment in another official Instagram interface you already use. A difference between web and mobile is an interface difference, not proof that data has been deleted. If Instagram does not expose the list to your account, there is no verified step in this guide that reveals it.',
        ],
      },
      {
        id: 'exports', heading: 'Do not assume a data export contains comment likers',
        paragraphs: [
          'Meta provides account-information access and download controls, but that does not mean every visible interaction is included in every export. We have not verified that Instagram supplies a complete list of people who liked each of your comments. A file named comments.json is not, by itself, evidence that it contains those names.',
          'If you request an export for your own records, inspect the categories and fields actually supplied. Keep the archive private: it can contain more personal information than the one question you are trying to answer. Avoid giving a third-party website your Instagram password to obtain an alleged hidden liker list.',
        ],
        links: [link('Meta’s account-information controls', 'https://about.fb.com/news/2023/10/manage-your-information-across-apps/')],
      },
      {
        id: 'interpretation', heading: 'Use a visible reaction as a small piece of feedback',
        paragraphs: [
          'A like shows that someone interacted with a particular comment. It does not establish why they did so, whether they follow you, or whether they want a direct message. For a creator, the more useful question is often which subject prompted a thoughtful conversation.',
          'Save the topic or question, not a list of people to pursue. A useful follow-up post can answer what the thread left unresolved. Assess the quality of replies and the relevance to your audience alongside the visible like count; one popular comment is a weak basis for a whole content strategy.',
        ],
      },
    ],
    faq: [
      { q: 'Will tapping the heart show everyone who liked the comment?', a: 'It may simply toggle your own like. Look for the comment’s selectable likes count or another explicit likes control; the interface varies.' },
      { q: 'Can Meadow reveal hidden Instagram comment likes?', a: 'No. Meadow does not bypass Instagram’s privacy or interface limits and does not offer a hidden-liker lookup.' },
    ],
    sources: [link('Instagram Help Center', 'https://help.instagram.com/'), link('Meta account-information controls', 'https://about.fb.com/news/2023/10/manage-your-information-across-apps/'), link('Meta account-access security guidance', 'https://about.fb.com/news/2022/12/designing-account-security-across-our-apps/')],
    relatedTools: [link('Instagram Hashtag Generator', '/tools/instagram-hashtag-generator'), link('Instagram Handle Checker', '/tools/instagram-handle-checker')],
  }),
  article({
    slug: 'instagram-disabled-account-appeal',
    title: 'Instagram Disabled Account Appeal: What to Do | Meadow',
    headline: 'How to appeal a disabled Instagram account',
    description: 'Identify the account issue, use Instagram’s official review or recovery flow, and prepare a factual appeal without false promises.',
    category: 'Instagram',
    intro: 'If Instagram says your account is suspended or disabled, start with the review instructions shown when you try to sign in. Follow the deadline and verification steps in that notice. A forgotten password, a compromised account, and an enforcement decision can require different routes.',
    sections: [
      {
        id: 'identify', heading: 'Read the actual account notice',
        paragraphs: [
          'Before searching for an appeal form, record what Instagram tells you: the account name, stated reason, date, any deadline, and the review option offered. A screenshot can help you avoid mixing up a login error with an account decision. Keep verification codes and personal documents out of any public screenshot.',
          'Try to sign in through the official app or website you normally use. If you can sign in but a particular feature is restricted, read the relevant account-status message. If you simply cannot remember your password, begin with login recovery instead of assuming the entire account was disabled.',
        ],
        table: { headers: ['What you see', 'Starting point'], rows: [['Suspended or disabled notice', 'The review option and deadline shown in the notice'], ['Forgotten password or inaccessible login method', 'Instagram’s official login-recovery prompts'], ['Changes you did not make', 'The official account-access recovery flow'], ['A restriction while still signed in', 'The account or content status message']] },
      },
      {
        id: 'appeal', heading: 'Submit a specific, truthful review request',
        paragraphs: [
          'Use the review flow attached to your account. Availability and wording can differ, so an old form linked in a tutorial is not a reliable substitute for the instructions Instagram presents now. Complete the fields requested and retain any confirmation or reference number.',
          'If there is a text field, explain the decision you are asking Instagram to review and the relevant facts. For example: “My account @example was disabled on [date]. The notice refers to [reason]. I believe this was a mistake because [specific explanation]. Please review the decision.” Replace every placeholder and include only statements you can support.',
          'A short factual explanation is more useful than a generic promise that you never broke any rule. Do not claim that your account was hacked unless that is what happened, and do not invent a business relationship or identity to reach a different support route.',
        ],
        links: [link('Instagram’s disabled-account help', 'https://help.instagram.com/366993040048856')],
      },
      {
        id: 'verification', heading: 'Complete verification inside the official flow',
        paragraphs: [
          'Account recovery can involve checks intended to establish who controls an account. Follow the exact request presented to you rather than sending identity documents to addresses found in comments or unsolicited messages. Meta describes verification as part of protecting accounts against unauthorized access.',
          'Keep access to the email address and phone number you use for the process. Check the destination carefully before entering a password or code. A person who promises to restore an account for a fee is not made trustworthy by showing a logo or a screenshot of another person’s recovery.',
        ],
      },
      {
        id: 'compromised', heading: 'If someone else accessed the account',
        paragraphs: [
          'Meta provides instagram.com/hacked as an official starting point for account-access problems. Choose the option that accurately describes your situation. If a compromised email account is also involved, secure that email account through its provider so someone else cannot intercept subsequent recovery messages.',
          'After regaining access, review unfamiliar account changes and connected access, update your security settings, and protect the account with the authentication options Instagram offers. An appeal about content enforcement and recovery of control are related problems, but success at one does not guarantee a particular outcome for the other.',
        ],
        links: [link('Instagram account-access recovery', 'https://www.instagram.com/hacked/'), link('Meta’s explanation of account recovery', 'https://about.fb.com/news/2022/12/designing-account-security-across-our-apps/')],
      },
      {
        id: 'waiting', heading: 'Keep a record while the request is reviewed',
        paragraphs: [
          'There is no reliable universal response time to promise here. Save the submission date, confirmation, and any subsequent requests. Revisit the status and follow-up options Instagram makes available to you, and respond to a genuine request for additional information.',
          'If the decision says no further review is available, do not assume an unofficial email address can override it. For a business, separately preserve the materials and customer contact channels you still control. Keeping a record of the incident helps you make practical decisions without repeatedly rebuilding the same appeal from memory.',
        ],
      },
    ],
    faq: [
      { q: 'Is there one appeal form that works for every disabled account?', a: 'No universal form is established here. Use the current review route and deadline shown for your account, with Instagram’s Help Center as the reference.' },
      { q: 'Can an appeal guarantee that my account returns?', a: 'No. The outcome depends on Instagram’s review. Be accurate, complete the requested steps, and avoid anyone offering guaranteed reinstatement.' },
    ],
    sources: [link('Instagram disabled-account help', 'https://help.instagram.com/366993040048856'), link('Meta account security and recovery', 'https://about.fb.com/news/2022/12/designing-account-security-across-our-apps/'), link('Instagram account-access recovery', 'https://www.instagram.com/hacked/')],
    relatedTools: [link('Instagram Handle Checker', '/tools/instagram-handle-checker'), link('Instagram Name Generator', '/tools/instagram-name-generator')],
  }),
  article({
    slug: 'how-to-see-your-youtube-subscribers',
    title: 'How to See Your YouTube Subscribers | Meadow',
    headline: 'How to see your YouTube subscribers',
    description: 'Find subscriber names and counts in YouTube, understand private subscriptions, and use subscriber data without expecting a complete identity list.',
    category: 'YouTube',
    intro: 'On desktop, open YouTube Studio and choose See all on the Recent subscribers card. The list only includes eligible public subscriptions, so it will not contain every person in your total subscriber count.',
    sections: [
      {
        id: 'desktop', heading: 'Open the recent-subscriber list on desktop',
        paragraphs: [
          'Make sure you are viewing the right channel before looking for subscriber information. This is easy to miss when one Google account manages multiple channels. The channel name and avatar in Studio should match the channel you want to inspect.',
          'YouTube’s official desktop instructions place the list on the Dashboard. Its date and sort controls help you explore the subscribers that are visible. A list of names and a total subscriber number are different reports; neither should be used as a substitute for the other.',
        ],
        steps: ['Sign in to YouTube Studio for the correct channel.', 'On the Dashboard, find the Recent subscribers card.', 'Select See all to expand it.', 'Use the available timeframe and sorting controls to inspect the public subscribers shown.'],
        links: [link('YouTube’s recent-subscriber instructions', 'https://support.google.com/youtube/answer/7280745?hl=en')],
      },
      {
        id: 'mobile', heading: 'Check the mobile options for your device',
        paragraphs: [
          'Current YouTube Help for Android documents a subscriber view in the main YouTube app: You → View channel → See your subscribers. It is available to the channel owner. In the Android Studio app, Analytics → Overview → Realtime provides subscriber-count information.',
          'Mobile features and labels can differ by device and rollout. If your app does not show the same control, check that it is updated and that you are signed in as the channel owner. Use Studio on a computer for the documented desktop list instead of installing an unrelated subscriber-viewer app.',
        ],
        links: [link('Official Android subscriber-count and subscriber-view guidance', 'https://support.google.com/youtube/answer/6051134?co=GENIE.Platform%3DAndroid&hl=en')],
      },
      {
        id: 'missing-names', heading: 'Why the list is smaller than your subscriber count',
        paragraphs: [
          'YouTube subscriptions are private by default. Someone can be a real subscriber without appearing by name in your recent-subscriber list. YouTube also excludes accounts that are suspended or identified as spam from that list.',
          'Suppose your channel shows 800 subscribers but the selected list contains 30 names. Those figures do not establish that the other 770 are fake or inactive. You are comparing an aggregate count with a list limited by visibility and the report’s timeframe. Do not turn that difference into a claim about individual people.',
        ],
        links: [link('YouTube subscription privacy', 'https://support.google.com/youtube/answer/7280190?hl=en')],
      },
      {
        id: 'growth', heading: 'Use the count to study growth over time',
        paragraphs: [
          'For a publishing decision, a consistent time series is usually more useful than a list of names. Compare subscriber changes across similar reporting periods and note what you published. A one-day spike can prompt a closer look, but it does not tell you which single factor caused the increase.',
          'Keep a simple record with the date, video or campaign, subscriber change, and the audience response you observed. Review watch time and relevant comments alongside growth. This helps distinguish a topic that attracts the right audience from a post that draws attention without explaining what the channel offers next.',
        ],
        table: { headers: ['Question', 'Useful view'], rows: [['Who is publicly visible as a recent subscriber?', 'Recent subscribers list'], ['How large is the audience now?', 'Subscriber count'], ['Is the channel growing across comparable periods?', 'Analytics over time'], ['Why did someone subscribe?', 'Not established by a subscriber list alone']] },
      },
      {
        id: 'next-step', heading: 'Turn the information into better channel communication',
        paragraphs: [
          'A clear channel description helps someone decide whether future uploads fit their interests. Explain the subject, who the videos are for, and what viewers can expect. Review the promise against the videos you actually publish so new subscribers are not left guessing.',
          'If you recognize a fellow creator in a public list, treat that as context rather than permission to send a sales pitch. A relevant collaboration idea should stand on the value of the project. Never buy a service that promises to expose private subscribers; this guide offers no way around their privacy choice.',
        ],
      },
    ],
    faq: [
      { q: 'Can I see the name of every subscriber?', a: 'No. Private subscriptions are not exposed through the recent-subscriber list. The total count can therefore be much larger than the visible list.' },
      { q: 'Does a missing name mean someone unsubscribed?', a: 'No. Privacy settings, the selected timeframe, and account status can affect visibility. A missing name alone does not establish an unsubscribe.' },
    ],
    sources: [link('Check recent subscribers', 'https://support.google.com/youtube/answer/7280745?hl=en'), link('Check subscriber counts on Android', 'https://support.google.com/youtube/answer/6051134?co=GENIE.Platform%3DAndroid&hl=en'), link('Subscription privacy settings', 'https://support.google.com/youtube/answer/7280190?hl=en')],
    relatedTools: [link('YouTube Channel Description Generator', '/tools/youtube-channel-description-generator'), link('YouTube Name Generator', '/tools/youtube-name-generator')],
  }),
  article({
    slug: 'how-to-recover-youtube-account',
    title: 'How to Recover Your YouTube Account | Meadow',
    headline: 'How to recover access to your YouTube account',
    description: 'Choose the right official recovery route for a forgotten Google login, a hacked YouTube channel, or a channel enforcement decision.',
    category: 'YouTube',
    intro: 'YouTube access is tied to a Google account. If you cannot sign in, begin with Google Account recovery. If the account was compromised, recover and secure it before repairing unauthorized changes to the YouTube channel.',
    sections: [
      {
        id: 'which-problem', heading: 'Choose the recovery route that matches the problem',
        paragraphs: [
          'First separate a login problem from a channel problem. Being signed into the wrong Google account can look like a missing channel, while a channel termination can happen even when the Google login still works. Write down the channel URL and the exact message you see.',
          'If several people manage the channel, clarify which account lost access. Another authorized manager may still be able to confirm the channel identity or review permissions. That does not replace the affected person’s Google recovery process, and passwords should not be shared between teammates.',
        ],
        table: { headers: ['Problem', 'Start here'], rows: [['Forgotten password or unavailable verification method', 'Google Account recovery'], ['Forgotten sign-in email', 'Google’s username recovery flow'], ['Unfamiliar uploads or account changes', 'Google recovery and YouTube hacked-channel guidance'], ['Channel termination notice', 'The official appeal instructions for that decision']] },
      },
      {
        id: 'google-recovery', heading: 'Recover the Google login through Google',
        paragraphs: [
          'Use the official recovery flow and answer the ownership questions as accurately as possible. If you forgot the email address, Google’s username-recovery process asks for a recovery phone number or email and the full name on the account. For work or school accounts, your administrator may be the appropriate contact.',
          'Follow the alternatives offered on the screen if your usual verification method is unavailable. Avoid inventing a recovery method that the account never had. There is no universal waiting period or shortcut to promise; the prompts and outcome depend on the account’s circumstances.',
        ],
        links: [link('Google Account recovery help', 'https://support.google.com/accounts/answer/7682439?hl=en'), link('Start Google Account recovery', 'https://accounts.google.com/signin/recovery')],
      },
      {
        id: 'hacked-channel', heading: 'For a hacked channel, recover control before cleanup',
        paragraphs: [
          'YouTube’s hacked-channel guidance starts with recovering the associated Google account. It then calls for undoing unauthorized channel changes and improving account security. Eligible creators can contact Creator Support after recovering their Google account; the official help page also describes other support options.',
          'Keep a private incident record: when you noticed the issue, which uploads or account details changed, and the channel URL. This makes it easier to explain the sequence accurately. If multiple owners or managers could be affected, each should review their own account security.',
        ],
        links: [link('Recover a hacked YouTube channel', 'https://support.google.com/youtube/answer/76187?hl=en')],
      },
      {
        id: 'cleanup', heading: 'Review the channel carefully after access returns',
        paragraphs: [
          'YouTube provides cleanup guidance for unfamiliar uploads, permissions, branding, and other changes. Where available, its Studio cleanup tool can help review suspicious activity. Follow the specific guidance for uploads with strikes or claims rather than deleting evidence indiscriminately.',
          'Make a checklist of the channel elements you know: name, description, links, thumbnails, uploaded videos, managers, and monetization associations. Review each against your records. Do the same for recovery details and unfamiliar access in the Google account, then use the security recommendations offered there.',
        ],
        links: [link('YouTube’s channel-cleanup instructions', 'https://support.google.com/youtube/answer/14849770?hl=en')],
      },
      {
        id: 'protection', heading: 'Avoid recovery promises and prepare for next time',
        paragraphs: [
          'Google says it does not work with services claiming to provide account or password support. Do not give a stranger passwords, backup codes, or verification codes. A paid “recovery expert” cannot be assumed to have a special path into your account.',
          'Once the incident is resolved, review recovery methods, authentication, and who needs channel access. Keep ownership information in a secure place your team can find. A current recovery plan and clear individual permissions are easier to maintain before a crisis than reconstruct during one.',
        ],
        links: [link('Secure your YouTube channel', 'https://support.google.com/youtube/answer/9701986?hl=en')],
      },
    ],
    faq: [
      { q: 'Can I recover YouTube without recovering Google?', a: 'For a compromised Google account associated with a YouTube channel, YouTube’s official guidance starts with recovering that Google account. A separate channel permissions or enforcement issue can require a different process.' },
      { q: 'Will recovery restore deleted videos or remove a termination automatically?', a: 'Do not assume so. Regaining a login, repairing the channel, and appealing an enforcement decision are separate steps. Follow YouTube’s instructions for the remaining issue.' },
    ],
    sources: [link('Google Account recovery', 'https://support.google.com/accounts/answer/7682439?hl=en'), link('Hacked YouTube channel recovery', 'https://support.google.com/youtube/answer/76187?hl=en'), link('Clean up a hacked channel', 'https://support.google.com/youtube/answer/14849770?hl=en'), link('YouTube channel security', 'https://support.google.com/youtube/answer/9701986?hl=en')],
    relatedTools: [link('YouTube Channel Description Generator', '/tools/youtube-channel-description-generator'), link('YouTube Title Checker', '/tools/youtube-title-checker')],
  }),
  article({
    slug: 'how-to-see-dislikes-on-youtube',
    title: 'How to See YouTube Dislikes: Counts and Estimates | Meadow',
    headline: 'How to see dislikes on YouTube',
    description: 'Understand the difference between your own YouTube Studio dislike data and third-party estimates for other people’s videos.',
    category: 'YouTube',
    intro: 'Creators can see their own videos’ dislike data in YouTube Studio. Viewers cannot get another video’s exact private count from YouTube’s normal public interface. Tools such as Return YouTube Dislike can display estimates, which should be labeled and interpreted accordingly.',
    sections: [
      {
        id: 'what-changed', heading: 'The button and the public count are different things',
        paragraphs: [
          'YouTube announced the removal of public dislike counts in November 2021 while retaining the dislike button. Its announcement says creators retain access to exact counts in Studio, and viewers can still use dislikes to provide feedback and influence recommendations.',
          'That distinction explains why clicking the button still works without revealing a number. It also means an extension that adds a number is supplying information from another system. The number’s appearance beside YouTube’s buttons does not turn it into an official YouTube measurement.',
        ],
        links: [link('YouTube’s announcement about dislike counts', 'https://blog.youtube/news-and-events/update-to-youtube/')],
      },
      {
        id: 'own-videos', heading: 'For your own videos, use YouTube Studio',
        paragraphs: [
          'Sign in to Studio for the channel that owns the video, open Content, and locate the video’s likes-versus-dislikes information or its engagement analytics. Check the available table columns and analytics controls if your layout differs. Make sure you are inspecting the right video and reporting period.',
          'For a useful review, record the number alongside the audience size and the context. Two dislikes after a handful of views and two dislikes after a large audience are different situations. Look for specific feedback in comments and review the content before assuming a count proves that a topic or format failed.',
        ],
        steps: ['Open YouTube Studio as the channel owner or an authorized user.', 'Find the video in Content.', 'Inspect its available likes/dislikes or engagement reporting.', 'Compare the result with similar videos and read relevant feedback before changing your approach.'],
      },
      {
        id: 'estimates', heading: 'For other videos, understand what an estimate means',
        paragraphs: [
          'Return YouTube Dislike describes its backend as combining collected historical dislike statistics with estimates extrapolated from extension-user data. Its source repository explains the method and links to supported installation options. That is a useful disclosure to preserve whenever you refer to its results.',
          'A sample of extension users is not the entire audience of a video. Coverage, timing, and audience differences can affect the estimate. Do not present the displayed number as an exact private count, and do not promise a fixed accuracy percentage without evidence for that particular measurement.',
        ],
        links: [link('Return YouTube Dislike project and method', 'https://github.com/Anarios/return-youtube-dislike'), link('Return YouTube Dislike website', 'https://returnyoutubedislike.com/')],
      },
      {
        id: 'tool-choice', heading: 'Check a tool before installing or trusting it',
        paragraphs: [
          'Start from a project’s own website or repository and inspect its current browser support, permissions, and privacy information. A tool being open source does not by itself guarantee that every download using its name is safe or that its results are exact.',
          'Be especially cautious with websites that demand a Google password just to show a public video estimate. Your creator dashboard should be opened through YouTube itself. If a browser or mobile app does not support an extension, do not assume a similarly named app provides the same implementation or data.',
        ],
        table: { headers: ['Data source', 'What it can tell you'], rows: [['Your channel’s Studio reporting', 'YouTube’s own data for the video you control'], ['A disclosed third-party estimate', 'An approximation based on that provider’s method'], ['A screenshot shared without context', 'Only what the image claims; provenance still matters']] },
      },
      {
        id: 'quality', heading: 'Do not use a dislike ratio as a fact-check',
        paragraphs: [
          'A reaction count measures reactions, not whether an instruction is correct. For a tutorial, inspect whether the steps are current and reproducible. For a product claim, look for evidence and clearly disclosed limitations. An estimated ratio can be one clue, but it cannot replace that work.',
          'Creators can use their own feedback to identify a confusing introduction, a mismatched title, or a missing explanation. Make the correction where it helps the viewer: update an inaccurate description, clarify a follow-up, or improve the next video. Do not redesign a whole channel around one isolated response.',
        ],
      },
    ],
    faq: [
      { q: 'Does Return YouTube Dislike show the exact number?', a: 'Its project describes estimates based partly on extension-user data and historical statistics. Treat its displayed counts as third-party estimates, not exact private YouTube analytics.' },
      { q: 'Can I see who disliked my video?', a: 'The aggregate dislike information discussed here does not identify individual viewers who clicked the button.' },
    ],
    sources: [link('YouTube’s dislike-count announcement', 'https://blog.youtube/news-and-events/update-to-youtube/'), link('Return YouTube Dislike’s published implementation', 'https://github.com/Anarios/return-youtube-dislike')],
    relatedTools: [link('YouTube Title Checker', '/tools/youtube-title-checker'), link('YouTube Tag Generator', '/tools/youtube-tag-generator')],
  }),
  article({
    slug: 'when-does-youtube-start-paying-you',
    title: 'When Does YouTube Start Paying You? | Meadow',
    headline: 'When does YouTube start paying you?',
    description: 'Separate YouTube Partner Program eligibility, earning revenue, the payment threshold, and the monthly payout schedule.',
    category: 'YouTube',
    intro: 'Qualifying for monetization, earning revenue, and receiving a payment are separate milestones. YouTube pays through AdSense for YouTube after the relevant requirements are met, finalized earnings reach your currency’s payment threshold, and there are no blocking payment issues.',
    sections: [
      {
        id: 'eligibility', heading: 'First, qualify for the features you want to use',
        paragraphs: [
          'As reviewed on October 12, 2026, YouTube’s standard ad-revenue eligibility page lists 1,000 subscribers plus either 4,000 qualified public watch hours in the preceding 12 months or 10 million qualified public Shorts views in 90 days. Shorts-feed watch time does not count toward the 4,000-hour route.',
          'Those numbers are only part of eligibility. You also need to meet YouTube’s policy and account requirements and pass review. Use the Earn area of YouTube Studio for your own channel’s progress and the current rules; a public subscriber count is not an approval notice.',
        ],
        links: [link('Current YouTube Partner Program requirements', 'https://support.google.com/youtube/answer/72851?hl=en')],
      },
      {
        id: 'early-access', heading: 'The earlier-access tier is a different milestone',
        paragraphs: [
          'In eligible countries, expanded YPP provides earlier access to selected fan-funding and Shopping features. Its published entry requirements include 500 subscribers, three valid public uploads in 90 days, and either 3,000 qualified watch hours in 12 months or 3 million qualified Shorts views in 90 days.',
          'This earlier tier is not the same as qualifying for Watch Page or Shorts ad-revenue sharing. Individual features also have requirements. When planning income, name the feature you intend to use rather than treating the word “monetized” as a guarantee that every revenue option is active.',
        ],
        links: [link('Expanded YouTube Partner Program', 'https://support.google.com/youtube/answer/13429240?hl=en')],
      },
      {
        id: 'activation', heading: 'Complete review and activate eligible revenue features',
        paragraphs: [
          'Follow Studio’s application steps, connect the appropriate AdSense for YouTube account, and review the terms for the features you intend to enable. Reaching a numerical target does not mean a payment starts that day. Keep track of which step is actually complete: eligibility, application, review, or activation.',
          'For a small channel, a simple checklist prevents confusing progress with cash flow. Record the date of each completed step and any action requested in Studio or AdSense. If a step is pending, resolve that specific item before assuming that low earnings are caused by a problem with the videos.',
        ],
      },
      {
        id: 'threshold', heading: 'Reach the payment threshold in your account’s currency',
        paragraphs: [
          'The USD payment threshold is $100. Other reporting currencies have their own thresholds, so “YouTube always pays at $100” is incomplete. Check the currency and payment-account details in AdSense instead of converting the USD figure with today’s exchange rate.',
          'Here is a simplified USD example: a $40 balance followed by $70 in additional finalized earnings gives a $110 balance. Crossing the threshold makes a payment possible in the relevant cycle if the other conditions are satisfied. It does not mean a transfer happens at the moment a video pushes an estimated dashboard number above $100.',
        ],
        links: [link('AdSense payment thresholds by currency', 'https://support.google.com/adsense/answer/1709871?hl=en')],
      },
      {
        id: 'payment-cycle', heading: 'Allow for finalization and the monthly payment cycle',
        paragraphs: [
          'YouTube says the previous month’s finalized earnings are normally added to AdSense between the 7th and 12th. Eligible payments are issued between the 21st and 26th when the threshold and payment conditions are satisfied. The arrival date can also depend on the payment method.',
          'Before forecasting a first payment, check required account verification, payment setup, tax information, and any holds shown in AdSense. A first payout could take longer simply because earnings accumulate slowly. There is no universal “two months after approval” rule that fits every channel.',
        ],
        table: { headers: ['Milestone', 'What it means'], rows: [['YPP eligibility', 'You may be able to apply'], ['Approval and feature activation', 'Eligible activity can generate revenue'], ['Finalized balance reaches the threshold', 'The payment balance meets one payout condition'], ['Payment issued', 'A transfer has entered the payment process']] },
        links: [link('YouTube earnings and payment timing', 'https://support.google.com/youtube/answer/72902?hl=en')],
      },
    ],
    faq: [
      { q: 'Does reaching 1,000 subscribers trigger a payment?', a: 'No. Subscribers are part of certain eligibility requirements. Application, review, feature activation, earnings, and payment conditions are separate.' },
      { q: 'Why can estimated revenue differ from the payment balance?', a: 'YouTube Analytics shows estimates. AdSense shows finalized payment-account earnings, and adjustments or deductions can change the amount.' },
    ],
    sources: [link('YPP requirements', 'https://support.google.com/youtube/answer/72851?hl=en'), link('Expanded YPP requirements', 'https://support.google.com/youtube/answer/13429240?hl=en'), link('Payment thresholds', 'https://support.google.com/adsense/answer/1709871?hl=en'), link('YouTube earnings and payments', 'https://support.google.com/youtube/answer/72902?hl=en')],
    relatedTools: [link('YouTube Title Checker', '/tools/youtube-title-checker'), link('YouTube Channel Description Generator', '/tools/youtube-channel-description-generator')],
  }),
  article({
    slug: 'how-to-make-twitter-account-public',
    title: 'How to Make Your Twitter (X) Account Public | Meadow',
    headline: 'How to make your Twitter (X) account public',
    description: 'Turn off protected posts on X, understand what happens to earlier posts, and verify the account’s audience setting.',
    category: 'X',
    intro: 'In X, open Settings and privacy → Privacy and safety → Audience and tagging, then turn off Protect your posts. Before changing it, review earlier posts: unprotecting the account makes previously protected posts public too.',
    sections: [
      {
        id: 'settings', heading: 'Change the protected-posts setting',
        paragraphs: [
          'Twitter is now called X, and its current help uses the word “posts.” The relevant setting controls whether posts are public or limited to approved followers. Use the account whose audience you want to change, especially if you switch between a personal profile and a business profile.',
          'On the web, the control may be a checkbox; in the mobile app, it may appear as a slider. Follow any confirmation shown and then revisit the setting. The goal is to confirm the saved state, not simply assume that one tap took effect.',
        ],
        steps: ['Open Settings and privacy in the correct X account.', 'Select Privacy and safety.', 'Open Audience and tagging.', 'Turn off or uncheck Protect your posts, then complete any confirmation shown.'],
        links: [link('X’s official protection-setting instructions', 'https://help.x.com/en/safety-and-security/how-to-make-x-private-and-public')],
      },
      {
        id: 'old-posts', heading: 'Review earlier posts before opening the audience',
        paragraphs: [
          'X says unprotecting posts makes earlier protected posts public. This change is broader than choosing a larger audience for your next update. Review the history with that scope in mind, including replies, images, and details that only made sense in a smaller circle.',
          'For a personal-to-professional transition, read your profile as someone encountering it for the first time. Check whether the bio, pinned content, and earlier conversations communicate what you intend. Make any necessary content decisions before changing the audience instead of expecting the visibility setting to rewrite the account’s history.',
        ],
      },
      {
        id: 'followers', heading: 'Understand the effect on followers and sharing',
        paragraphs: [
          'Public posts are generally visible beyond approved followers and can be shared more broadly. X also says pending follow requests are not automatically accepted when you unprotect the account; those accounts may need to follow again if their requests remain pending.',
          'Review outstanding requests if they matter to your community. For an organization, tell the people responsible for replies and publishing when the intended audience changes. A support answer or casual reply can now reach people who have none of the earlier conversation’s context.',
        ],
        links: [link('Public versus protected posts on X', 'https://help.x.com/en/safety-and-security/public-and-protected-posts')],
      },
      {
        id: 'verify', heading: 'Verify the setting without promising search visibility',
        paragraphs: [
          'Return to Audience and tagging and confirm protection is off. You can also ask someone who is not an approved follower to check the intended post. A logged-out browser may encounter login prompts, so it is not always a clean test of whether a post is protected.',
          'Public visibility does not guarantee that a post will appear prominently in search, reach a particular number of people, or be indexed immediately by an external search engine. Separate the account setting you can verify from the distribution outcome you hope to achieve.',
        ],
        table: { headers: ['Question', 'How to approach it'], rows: [['Is protection switched off?', 'Check the saved account setting'], ['Can someone outside my approved followers view the post?', 'Check with that audience directly'], ['Will the post get more reach?', 'Measure after publishing; the setting alone cannot guarantee it']] },
      },
      {
        id: 'publishing', heading: 'Prepare the first posts for a wider audience',
        paragraphs: [
          'Give a new reader enough context to understand what you share and why it might be useful. A clear bio, a relevant pinned post, and an accurate link are practical starting points. Preview images and read the opening sentence on a phone before publishing.',
          'Choose one outcome to measure, such as relevant replies or visits to a linked resource. If you use tracking parameters, keep their naming consistent across the campaign. Public posting works best as a deliberate communication choice; the privacy toggle by itself is not a content strategy.',
        ],
      },
    ],
    faq: [
      { q: 'Will my old protected posts become public?', a: 'Yes. X explicitly says that unprotecting your posts makes previously protected posts public.' },
      { q: 'Can I switch protection back on?', a: 'X provides the same setting to protect posts again. That cannot retrieve screenshots, copies, or information someone already saw while the posts were public.' },
    ],
    sources: [link('Protect and unprotect posts', 'https://help.x.com/en/safety-and-security/how-to-make-x-private-and-public'), link('Public and protected posts', 'https://help.x.com/en/safety-and-security/public-and-protected-posts')],
    relatedTools: [link('Social Media Username Generator', '/tools/username-generator'), link('UTM Builder', '/tools/utm-builder')],
  }),
  article({
    slug: 'who-doesnt-follow-me-back-on-instagram',
    title: 'Who Doesn’t Follow You Back on Instagram? | Meadow',
    headline: 'How to check who does not follow you back on Instagram',
    description: 'Compare followers and following using manual checks or your own exported lists, with clear limits and no password-sharing requirement.',
    category: 'Instagram',
    intro: 'For one person, search your Instagram followers list for their current username. For a larger review, compare a current following list with a current followers list from your own account information. Accounts present only in following are non-mutual in that snapshot—not necessarily recent unfollowers.',
    sections: [
      {
        id: 'manual', heading: 'Check one account directly in Instagram',
        paragraphs: [
          'Open your profile’s followers list and search for the person’s current username. Distinguish the username from the display name, which can be shared by multiple accounts. If the result is unclear, open the relevant profile and confirm that you are checking the account you intended.',
          'A missing result is a reason to double-check, not immediately accuse someone of unfollowing. A renamed account or an incomplete interface result can make an old name misleading. For an occasional question, a careful manual check is simpler than giving an unrelated app broad access to your account.',
        ],
      },
      {
        id: 'export', heading: 'Request your own account information for a larger comparison',
        paragraphs: [
          'Meta provides information-download controls in its account settings. It announced that Accounts Center is gradually moving to Meta Account during 2026, so the name you see can differ. Look for the information and permissions area and the download or export option for the correct Instagram profile.',
          'If the export offers followers and following, request both for the same account and date range. Choose all time where available to avoid treating a partial list as a complete relationship history. HTML can be easier to read manually; JSON may be more convenient for a compatible comparison tool. Inspect what the export actually includes before relying on it.',
        ],
        links: [link('Meta’s information-download controls', 'https://about.fb.com/news/2023/10/manage-your-information-across-apps/'), link('Meta Account rollout', 'https://about.fb.com/news/2026/04/meta-account/')],
      },
      {
        id: 'compare', heading: 'Compare usernames, not entire exported records',
        paragraphs: [
          'Create one column for accounts you follow and another for accounts that follow you. Use the same representation in both: for example, usernames without the leading @ symbol. Remove extra spaces and duplicate entries, and do not compare profile URLs against display names.',
          'The operation is a set difference: following minus followers. In a spreadsheet, you can test whether each following username appears anywhere in the followers column. If following is in A and followers in B, a basic row formula is =IF(COUNTIF(B:B,A2)=0,"Not in followers","In followers"). Start with a few known accounts to check your import.',
        ],
        table: { headers: ['Following', 'Followers', 'Result'], rows: [['studio.example', 'studio.example', 'Mutual in these lists'], ['daily.example', 'Not present', 'Following only in this snapshot'], ['Not present', 'reader.example', 'Follower only in this snapshot']] },
      },
      {
        id: 'snapshot', heading: 'A snapshot does not show when a relationship changed',
        paragraphs: [
          'Finding an account in following but not followers tells you about the lists you compared. It does not show whether the person ever followed you, when they stopped, or why. To study changes over time, you would need comparable records from different dates and still account for renames or missing data.',
          'Record the export date and preserve the raw files privately while you validate the result. Spot-check a few rows inside Instagram before acting on a large comparison. If the counts look unexpectedly small, revisit the selected account, time range, and whether the export split the data into multiple files.',
        ],
      },
      {
        id: 'privacy', heading: 'Keep the comparison proportional to your goal',
        paragraphs: [
          'A full account archive may contain much more than follower names. Do not upload the entire archive when a task only needs two lists. If you choose a tool that claims local processing, inspect that claim and its privacy information rather than assuming every “unfollowers” app works the same way.',
          'No one needs to follow you back for their posts to be useful. Use the result to make deliberate choices about your feed, not to trigger mass follow/unfollow actions or unwanted messages. For a creator, relevant conversations and returning viewers can be more useful questions to investigate than whether every connection is reciprocal.',
        ],
        links: [link('Meta account-access security guidance', 'https://about.fb.com/news/2022/12/designing-account-security-across-our-apps/')],
      },
    ],
    faq: [
      { q: 'Does this identify everyone who unfollowed me?', a: 'No. A current comparison identifies non-mutual relationships in the supplied lists. Identifying a change requires an earlier comparable snapshot and careful interpretation.' },
      { q: 'Do I need to give a follower app my password?', a: 'No. Manual checks and comparisons of your own exported lists do not require sharing your Instagram password with a third-party follower app.' },
    ],
    sources: [link('Meta information-download controls', 'https://about.fb.com/news/2023/10/manage-your-information-across-apps/'), link('Accounts Center to Meta Account transition', 'https://about.fb.com/news/2026/04/meta-account/'), link('Meta account security', 'https://about.fb.com/news/2022/12/designing-account-security-across-our-apps/')],
    relatedTools: [link('Instagram Handle Checker', '/tools/instagram-handle-checker'), link('Instagram Hashtag Generator', '/tools/instagram-hashtag-generator')],
  }),
  article({
    slug: 'social-media-trends',
    title: 'Social Media Trends 2026: Practical Creator Priorities | Meadow',
    headline: 'Social media trends for 2026: what to test next',
    description: 'A practical 2026 planning guide grounded in official platform updates: original content, creative testing, community, localization, and measurement.',
    category: 'Strategy',
    intro: 'For 2026, useful priorities include original work, deliberate creative tests, community participation, and content that travels across languages. This is an editorial interpretation of the platform updates linked below, not a survey, a live popularity ranking, or a prediction that every account will see the same results.',
    sections: [
      {
        id: 'originality', heading: 'Original work gives your account a clearer reason to exist',
        paragraphs: [
          'Meta’s January 2026 update describes an increased emphasis on original content in Instagram recommendations. YouTube’s monetization policy also distinguishes original, substantive work from generic or repetitive production. Those are platform signals worth considering, not proof that any one original post will succeed.',
          'Our practical recommendation is to make your contribution visible: demonstrate the process, explain what you learned, show an example you created, or answer a question from actual experience. Repurposing your own idea across formats can be useful, but each version should communicate something clearly to the audience receiving it.',
        ],
        links: [link('Meta’s January 2026 platform update', 'https://about.fb.com/news/2026/01/2026-ai-drives-performance/'), link('YouTube channel monetization policy', 'https://support.google.com/youtube/answer/1311392?hl=en')],
      },
      {
        id: 'testing', heading: 'Use new creative tools to ask a specific question',
        paragraphs: [
          'Instagram’s 2025 creator update discusses investment in tools such as Edits and trial reels. The useful planning implication is not “use every new feature.” It is that a creator can look for appropriate ways to test an idea before making it the basis of an entire publishing calendar.',
          'Pick one variable: the opening sentence, the visual demonstration, or the level of detail. Decide what a helpful response would look like, then review comparable results. Changing the topic, format, length, and call to action together makes it difficult to learn why one post performed differently.',
        ],
        links: [link('Instagram’s creative-tool and trial-reel update', 'https://about.fb.com/news/2025/06/inspiring-creativity-that-brings-people-together/')],
      },
      {
        id: 'community', heading: 'Plan for participation as well as distribution',
        paragraphs: [
          'Instagram has introduced broadcast-channel replies, prompts, and insights, along with reposts and a Friends area in Reels. These features illustrate investment in interactions between people, not just one-way publishing. Eligibility and availability still depend on the feature and account.',
          'For your own plan, give the audience a reason to participate. Ask a question connected to the content, invite examples, and make time to respond. A prompt that produces a useful conversation can supply a better next topic than a broad request for comments with no purpose.',
        ],
        links: [link('Instagram broadcast-channel participation and insights', 'https://about.fb.com/news/2024/12/get-closer-to-your-community-with-replies-prompts-and-insights/'), link('Instagram reposts and Friends features', 'https://about.fb.com/news/2025/08/new-instagram-features-help-you-connect/')],
      },
      {
        id: 'localization', heading: 'Consider language access before multiplying production',
        paragraphs: [
          'YouTube announced a wider rollout of multi-language audio in September 2025. The feature makes localization a practical consideration for more creators, but a platform’s rollout announcement does not guarantee that every channel has every option today.',
          'Start with evidence of interest from the audience you already reach. Choose one useful evergreen video, review its captions, and consider whether a translated description or reviewed audio track would help. Have a fluent reviewer check meaning, names, and tone. Translation should make the content understandable, not merely create more versions.',
        ],
        links: [link('YouTube’s multi-language audio expansion', 'https://blog.youtube/news-and-events/multi-language-audio/')],
      },
      {
        id: 'measurement', heading: 'Turn these signals into a small, measurable plan',
        paragraphs: [
          'Choose one audience problem, one format, and one measurable outcome for the next publishing cycle. Write down the baseline and what you intend to change. Review comparable periods instead of comparing an old mature post with a video uploaded this morning.',
          'This is a suggested experiment plan, not industry benchmark data. Keep the work small enough to finish, and preserve what you learn even when a test underperforms. A trend is useful when it helps you make a better decision for your audience; it does not need to become your whole brand.',
        ],
        table: { headers: ['Priority', 'Small experiment', 'Question to review'], rows: [['Originality', 'Publish a first-hand demonstration', 'Did the audience understand the distinctive value?'], ['Creative testing', 'Change one opening approach', 'Did the response improve for a comparable audience?'], ['Community', 'Ask a focused follow-up question', 'Did useful examples or questions emerge?'], ['Localization', 'Review one translated evergreen resource', 'Did it help the intended language audience?']] },
      },
    ],
    faq: [
      { q: 'Are these the most popular hashtags or sounds today?', a: 'No. This guide covers editorial priorities informed by platform updates. It does not claim live trend measurements or rank current hashtags, sounds, or creators.' },
      { q: 'Should I move every post to the newest format?', a: 'No. Test a format where it fits the audience and purpose. Keep evaluating whether it improves communication or results for your own account.' },
    ],
    sources: [link('Meta’s 2026 platform update', 'https://about.fb.com/news/2026/01/2026-ai-drives-performance/'), link('YouTube monetization policy', 'https://support.google.com/youtube/answer/1311392?hl=en'), link('Instagram creative tools', 'https://about.fb.com/news/2025/06/inspiring-creativity-that-brings-people-together/'), link('Instagram broadcast-channel updates', 'https://about.fb.com/news/2024/12/get-closer-to-your-community-with-replies-prompts-and-insights/'), link('Instagram sharing features', 'https://about.fb.com/news/2025/08/new-instagram-features-help-you-connect/'), link('YouTube multi-language audio', 'https://blog.youtube/news-and-events/multi-language-audio/')],
    relatedTools: [link('Instagram Hashtag Generator', '/tools/instagram-hashtag-generator'), link('UTM Builder', '/tools/utm-builder'), link('Social Media Image Cropper', '/tools/social-media-image-cropper')],
  }),
];
