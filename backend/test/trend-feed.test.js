import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchTrendFeed, handleTrendFeed, parseGoogleTrends, parseMastodonTrends, parseTrendQuery } from '../../cloudflare/trendFeed.js';
import { topicHashtag, trendSource } from '../../shared/trendSources.js';

const now = Date.parse('2026-10-12T14:00:00Z');
const rss = `<rss xmlns:ht="https://trends.google.com/trending/rss"><channel><item><title><![CDATA[summer & winter]]></title><ht:approx_traffic>2K+</ht:approx_traffic><link>https://untrusted.example/</link><pubDate>Mon, 12 Oct 2026 06:50:00 -0700</pubDate><ht:news_item><ht:news_item_title>Unrelated story</ht:news_item_title></ht:news_item></item><item><title>caf&#233; &amp; tea</title><ht:approx_traffic>500+</ht:approx_traffic><pubDate>Mon, 12 Oct 2026 06:40:00 -0700</pubDate></item></channel></rss>`;
const mastodon = [{ name: 'Café', url: 'javascript:alert(1)', history: [{ day: '1791763200', uses: '12', accounts: '7' }, { day: '1791676800', uses: '20', accounts: '9' }] }];
const env = { FREE_TOOLS_LIMITER: { limit: async () => ({ success: true }) } };
const request = (query = 'source=google&region=US', options = {}) => new Request(`https://findmeadow.com/api/free-tools/trends?${query}`, options);
const deps = { fetcher: async () => new Response(rss), now: () => now };

test('query parsing accepts only fixed sources, known regions, and unique parameters', () => {
  assert.equal(parseTrendQuery(request().url).feedUrl, 'https://trends.google.com/trending/rss?geo=US');
  assert.equal(parseTrendQuery(request('').url).feedUrl, 'https://mastodon.social/api/v1/trends/tags?limit=20');
  for (const query of ['source=https://127.0.0.1', 'source=google&region=XX', 'source=google&url=https://127.0.0.1', 'source=google&source=mastodon', 'source=google&region=US&region=GB', 'source=mastodon&region=XX']) assert.throws(() => parseTrendQuery(request(query).url));
});

test('RSS parsing retains publication dates, distinguishes suggestions, and constructs safe source links', () => {
  const items = parseGoogleTrends(rss, 'US');
  assert.equal(items.length, 2);
  assert.equal(items[0].title, 'summer & winter');
  assert.equal(items[0].hashtag, '#SummerWinter');
  assert.equal(items[0].kind, 'suggestion');
  assert.equal(items[0].publishedAt, '2026-10-12T13:50:00.000Z');
  assert.equal(items[0].searchTraffic, '2K+');
  assert.equal(items[1].title, 'café & tea');
  assert.equal(items[0].url, 'https://trends.google.com/trends/explore?geo=US&q=summer%20%26%20winter');
  assert.equal(topicHashtag('1234'), '');
  assert.equal(topicHashtag('東京 live!'), '#東京Live');
  assert.equal(Array.from(topicHashtag('a'.repeat(200))).length, 81);
});

test('parsers reject invalid feeds and bound/deduplicate the useful data', () => {
  for (const invalid of ['<html>Sign in</html>', '<rss><channel>', '<rss><channel><item>Incomplete</channel></rss>', '<!DOCTYPE rss [<!ENTITY a "text">]><rss></rss>']) assert.throws(() => parseGoogleTrends(invalid, 'US'));
  assert.throws(() => parseGoogleTrends('<rss><item><title>Missing publication time</title></item></rss>', 'US'));
  assert.throws(() => parseMastodonTrends({ error: 'unavailable' }));
  assert.throws(() => parseMastodonTrends([{ name: 'good', history: [{ day: 'bad', uses: 'x', accounts: '4' }] }]));
  assert.throws(() => parseMastodonTrends([{ name: 'bad/<script>', history: mastodon[0].history }]));
  assert.deepEqual(parseMastodonTrends([]), []);
  const duplicates = [...mastodon, ...mastodon];
  assert.equal(parseMastodonTrends(duplicates).length, 1);
  assert.equal(parseMastodonTrends(Array.from({ length: 40 }, (_, i) => ({ ...mastodon[0], name: `Tag${i}` }))).length, 20);
});

test('Mastodon uses bounded numeric history and never trusts supplied URLs or sums daily distinct accounts', () => {
  const items = parseMastodonTrends([{ ...mastodon[0], history: [...mastodon[0].history, { ...mastodon[0].history[0] }, { day: '1791763201', uses: '2', accounts: '1' }, { day: '1791590400', uses: '-2', accounts: '5' }] }]);
  assert.equal(items[0].hashtag, '#Café');
  assert.equal(items[0].kind, 'hashtag');
  assert.equal(items[0].url, 'https://mastodon.social/tags/Caf%C3%A9');
  assert.equal(items[0].publishedAt, null);
  assert.deepEqual(items[0].history, [{ date: '2026-10-12T00:00:00.000Z', uses: 12, accounts: 7 }, { date: '2026-10-11T00:00:00.000Z', uses: 20, accounts: 9 }]);
  assert.equal(items[0].accounts, undefined);
});

test('upstream requests are credential-free fixed URLs with timeout and redirect protection', async () => {
  let target, options;
  const result = await fetchTrendFeed(trendSource('google', 'GB'), async (url, opts) => { target = url; options = opts; return new Response(rss); }, now);
  assert.equal(target, 'https://trends.google.com/trending/rss?geo=GB');
  assert.equal(options.redirect, 'manual');
  assert.ok(options.signal instanceof AbortSignal);
  assert.equal(options.headers.Authorization, undefined);
  assert.equal(options.headers.Cookie, undefined);
  assert.equal(result.scope, 'Google Search in United Kingdom');
  assert.equal(result.fetchedAt, '2026-10-12T14:00:00.000Z');
  assert.equal(result.expiresAt, '2026-10-12T14:15:00.000Z');
  assert.deepEqual(result.sourceTimestamp, { at: '2026-10-12T13:50:00.000Z', label: 'Latest trend publication' });
  assert.equal(result.feedUrl, undefined);
  const social = await fetchTrendFeed(trendSource('mastodon'), async () => Response.json(mastodon), now);
  assert.equal(social.scope, 'mastodon.social');
  assert.equal(social.region, null);
  assert.deepEqual(social.sourceTimestamp, { at: '2026-10-12T00:00:00.000Z', label: 'Latest activity day (UTC)' });
});

test('method, origin, and parameter checks reject requests before any upstream call', async () => {
  let calls = 0;
  const noFetch = { fetcher: () => { calls++; throw new Error(); } };
  const method = await handleTrendFeed(request('', { method: 'POST' }), env, null, noFetch);
  assert.equal(method.status, 405); assert.equal(method.headers.get('Allow'), 'GET');
  assert.equal((await handleTrendFeed(request('', { headers: { Origin: 'https://evil.example' } }), env, null, noFetch)).status, 403);
  assert.equal((await handleTrendFeed(request('source=google&region=XX'), env, null, noFetch)).status, 400);
  assert.equal((await handleTrendFeed(new Request('https://findmeadow.com/api/free-tools/not-trends'), env, null, noFetch)).status, 404);
  assert.equal(calls, 0);
});

test('rate limits fail closed, including missing or broken bindings, before cache and upstream access', async () => {
  let reads = 0;
  const none = { cache: { match: () => { reads++; } }, fetcher: () => { reads++; } };
  const blocked = await handleTrendFeed(request(), { FREE_TOOLS_LIMITER: { limit: async () => ({ success: false }) } }, null, none);
  assert.equal(blocked.status, 429); assert.equal(blocked.headers.get('Retry-After'), '60');
  assert.equal((await handleTrendFeed(request(), {}, null, none)).status, 503);
  assert.equal((await handleTrendFeed(request(), { FREE_TOOLS_LIMITER: { limit: async () => { throw new Error(); } } }, null, none)).status, 503);
  assert.equal(reads, 0);
});

test('source and region snapshots cache for fifteen minutes without moving the source timestamps', async () => {
  const stored = new Map();
  const cache = { match: async key => stored.get(key.url)?.clone(), put: async (key, response) => stored.set(key.url, response.clone()) };
  let calls = 0, rateKey;
  const active = { FREE_TOOLS_LIMITER: { limit: async ({ key }) => { rateKey = key; return { success: true }; } } };
  const setup = { ...deps, cache, fetcher: async () => { calls++; return new Response(rss); } };
  const first = await handleTrendFeed(request(undefined, { headers: { Origin: 'https://app.findmeadow.com', 'CF-Connecting-IP': '192.0.2.20' } }), active, null, setup);
  assert.equal(first.status, 200); assert.equal(first.headers.get('Cache-Control'), 'no-store');
  assert.equal(rateKey, '192.0.2.20');
  const second = await handleTrendFeed(request(), env, null, { ...setup, now: () => now + 1000 });
  assert.deepEqual(await first.json(), await second.json()); assert.equal(calls, 1);
  assert.equal(stored.values().next().value.headers.get('Cache-Control'), 'public, max-age=900');
  await handleTrendFeed(request('source=google&region=GB'), env, null, setup); assert.equal(calls, 2);
  await handleTrendFeed(request(), env, null, { ...setup, now: () => now + 900_001 }); assert.equal(calls, 3);
});

test('upstream errors, redirects, oversized bodies, and malformed content never become invented or cached trends', async () => {
  let writes = 0;
  for (const fetcher of [async () => new Response('Denied', { status: 403 }), async () => new Response('', { status: 302 }), async () => new Response('<html>Sign in</html>'), async () => new Response('x'.repeat(400_001)), async () => new Response('', { headers: { 'Content-Length': '400001' } }), async () => { throw new Error('Aborted'); }]) {
    const response = await handleTrendFeed(request(), env, null, { ...deps, fetcher, cache: { match: async () => undefined, put: async () => { writes++; } } });
    assert.equal(response.status, 503);
    const data = await response.json();
    assert.equal(data.items, undefined);
    assert.equal(data.sourceUrl, 'https://trends.google.com/trending?geo=US');
    assert.match(data.error, /not returning a usable trend feed/);
  }
  assert.equal(writes, 0);
});

test('optional cache failure does not block a valid anonymous response', async () => {
  const result = await handleTrendFeed(request(), env, null, { ...deps, cache: { match: async () => { throw new Error(); }, put: async () => { throw new Error(); } } });
  assert.equal(result.status, 200);
  assert.equal((await result.json()).items.length, 2);
});
