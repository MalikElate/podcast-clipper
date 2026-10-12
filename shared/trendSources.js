export const TREND_REGIONS = Object.freeze({ US: 'United States', GB: 'United Kingdom', CA: 'Canada', AU: 'Australia', IN: 'India', FR: 'France', DE: 'Germany', BR: 'Brazil', NG: 'Nigeria', ZA: 'South Africa' });
export const TREND_CACHE_SECONDS = 900;
export const TIKTOK_TRENDS_URL = 'https://ads.tiktok.com/creative/creativeCenter/trends?deviceType=pc&locale=en&region=US';

export function trendSource(source, region = 'US') {
  if (source === 'mastodon') return {
    source, sourceName: 'Mastodon', scope: 'mastodon.social', region: null,
    sourceUrl: 'https://mastodon.social/explore/tags',
    feedUrl: 'https://mastodon.social/api/v1/trends/tags?limit=20',
  };
  if (source === 'google' && Object.hasOwn(TREND_REGIONS, region)) return {
    source, sourceName: 'Google Trends', scope: `Google Search in ${TREND_REGIONS[region]}`, region,
    sourceUrl: `https://trends.google.com/trending?geo=${region}`,
    feedUrl: `https://trends.google.com/trending/rss?geo=${region}`,
  };
  throw new Error('Choose a supported source and country.');
}

export function topicHashtag(topic) {
  const words = String(topic).normalize('NFKC').match(/[\p{L}\p{M}\p{N}]+/gu) || [];
  const tag = words.map(word => word[0].toLocaleUpperCase('en-US') + word.slice(1)).join('');
  return tag && /\p{L}/u.test(tag) ? `#${Array.from(tag).slice(0, 80).join('')}` : '';
}
