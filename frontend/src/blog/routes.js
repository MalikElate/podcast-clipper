// Keep the route allowlist small so loading the homepage does not download
// every article. The public HTML validator checks it against the full catalog.
export const CONTENT_PATHS = [
  '/blog', '/social-media-analytics',
  '/blog/how-much-does-youtube-pay-for-1000-views',
  '/blog/how-to-see-who-liked-a-comment-on-instagram',
  '/blog/instagram-disabled-account-appeal',
  '/blog/how-to-see-your-youtube-subscribers',
  '/blog/how-to-recover-youtube-account',
  '/blog/how-to-see-dislikes-on-youtube',
  '/blog/when-does-youtube-start-paying-you',
  '/blog/how-to-make-twitter-account-public',
  '/blog/who-doesnt-follow-me-back-on-instagram',
  '/blog/social-media-trends',
];
export const isContentPath = pathname => CONTENT_PATHS.includes(pathname.replace(/\/+$/, ''));
