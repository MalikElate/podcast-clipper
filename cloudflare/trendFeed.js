import { TREND_CACHE_SECONDS, TREND_REGIONS, topicHashtag, trendSource } from '../shared/trendSources.js';
import { limitedText } from './roast/core.js';

const MAX_FEED_BYTES = 400_000;
const origins = new Set(['https://findmeadow.com', 'https://www.findmeadow.com', 'https://app.findmeadow.com']);
const headers = { 'Cache-Control': 'no-store', 'Content-Type': 'application/json; charset=utf-8', 'X-Content-Type-Options': 'nosniff' };
const reply = (data, status = 200) => Response.json(data, { status, headers: { ...headers, ...(status === 429 ? { 'Retry-After': '60' } : {}) } });
const clean = value => typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim() : '';
const validDate = value => { const time = Date.parse(value); return Number.isFinite(time) ? new Date(time).toISOString() : null; };

export function parseTrendQuery(url) {
  const params = new URL(url).searchParams;
  for (const key of params.keys()) if (!['source', 'region'].includes(key) || params.getAll(key).length !== 1) throw new Error('Choose a supported source and country.');
  const source = params.get('source') || 'mastodon';
  const region = params.get('region') || 'US';
  if (!Object.hasOwn(TREND_REGIONS, region)) throw new Error('Choose a supported country.');
  return trendSource(source, region);
}

// These feeds have a fixed RSS format. Do not interpret XML entities or fetch referenced documents.
function xmlText(value) {
  const text = value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
  return clean(text.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (match, entity) => {
    const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
    if (Object.hasOwn(named, entity)) return named[entity];
    if (entity[0] !== '#') return match;
    const code = entity[1].toLowerCase() === 'x' ? Number.parseInt(entity.slice(2), 16) : Number.parseInt(entity.slice(1), 10);
    return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : '';
  }));
}
const rssValue = (item, tag) => xmlText(item.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'))?.[1] || '');

export function parseGoogleTrends(xml, region) {
  if (typeof xml !== 'string' || !/<rss\b/i.test(xml) || !/<\/rss\s*>/i.test(xml) || !/<channel\b/i.test(xml) || !/<\/channel\s*>/i.test(xml) || /<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('Invalid trend feed.');
  const blocks = [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)];
  if ((xml.match(/<item\b/gi) || []).length !== blocks.length) throw new Error('Incomplete trend feed.');
  const seen = new Set();
  const items = [];
  for (const [, block] of blocks.slice(0, 100)) {
    const title = rssValue(block, 'title');
    const publishedAt = validDate(rssValue(block, 'pubDate'));
    const searchTraffic = rssValue(block, 'ht:approx_traffic');
    if (!title || title.length > 180 || !publishedAt || seen.has(title.toLowerCase())) continue;
    seen.add(title.toLowerCase());
    items.push({
      id: title, title, hashtag: topicHashtag(title), kind: 'suggestion', publishedAt,
      url: `https://trends.google.com/trends/explore?geo=${region}&q=${encodeURIComponent(title)}`,
      searchTraffic: /^\d[\d,.]*[KMB]?\+?$/i.test(searchTraffic) ? searchTraffic : null,
    });
    if (items.length === 20) break;
  }
  if (blocks.length && !items.length) throw new Error('Invalid trend items.');
  return items;
}

export function parseMastodonTrends(json) {
  if (!Array.isArray(json)) throw new Error('Invalid trend feed.');
  const items = [], seen = new Set();
  for (const tag of json.slice(0, 100)) {
    const name = clean(tag?.name);
    if (!name || name.length > 100 || !/^[\p{L}\p{M}\p{N}_]+$/u.test(name) || seen.has(name.toLowerCase()) || !Array.isArray(tag.history)) continue;
    const days = new Set();
    const history = tag.history.slice(0, 14).flatMap(entry => {
      if (!entry || !/^\d{10}$/.test(String(entry.day)) || !/^\d{1,12}$/.test(String(entry.uses)) || !/^\d{1,12}$/.test(String(entry.accounts))) return [];
      const time = Number(entry.day) * 1000;
      if (time % 86_400_000 !== 0 || days.has(time)) return [];
      days.add(time);
      return [{ date: new Date(time).toISOString(), uses: Number(entry.uses), accounts: Number(entry.accounts) }];
    }).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 7);
    if (!history.length) continue;
    seen.add(name.toLowerCase());
    items.push({ id: name, title: `#${name}`, hashtag: `#${name}`, kind: 'hashtag', publishedAt: null, url: `https://mastodon.social/tags/${encodeURIComponent(name)}`, history });
    if (items.length === 20) break;
  }
  if (json.length && !items.length) throw new Error('Invalid trend items.');
  return items;
}

export async function fetchTrendFeed(input, fetcher = fetch, now = Date.now()) {
  const response = await fetcher(input.feedUrl, {
    // Workers supports manual/follow only. Reject 3xx below without following it.
    redirect: 'manual', signal: AbortSignal.timeout(8000),
    headers: { Accept: input.source === 'google' ? 'application/rss+xml, application/xml, text/xml' : 'application/json', 'User-Agent': 'Meadow-Trend-Research/1.0 (+https://findmeadow.com/tools/trending-hashtags)' },
  });
  if (!response.ok) throw new Error('Trend source unavailable.');
  const body = await limitedText(response, MAX_FEED_BYTES);
  const items = input.source === 'google' ? parseGoogleTrends(body, input.region) : parseMastodonTrends(JSON.parse(body));
  const dates = items.flatMap(item => item.publishedAt ? [item.publishedAt] : item.history.map(day => day.date)).sort();
  const { feedUrl, ...source } = input;
  return {
    ...source, fetchedAt: new Date(now).toISOString(), expiresAt: new Date(now + TREND_CACHE_SECONDS * 1000).toISOString(),
    sourceTimestamp: { at: dates.at(-1) || null, label: input.source === 'google' ? 'Latest trend publication' : 'Latest activity day (UTC)' },
    items,
  };
}

export async function handleTrendFeed(request, env, ctx, deps = {}) {
  if (new URL(request.url).pathname !== '/api/free-tools/trends') return reply({ error: 'Tool not found.' }, 404);
  if (request.method !== 'GET') return Response.json({ error: 'Use GET for trends.' }, { status: 405, headers: { ...headers, Allow: 'GET' } });
  const origin = request.headers.get('Origin');
  if (origin && !origins.has(origin)) return reply({ error: 'Open this tool on findmeadow.com.' }, 403);
  let input;
  try { input = parseTrendQuery(request.url); }
  catch (error) { return reply({ error: error.message }, 400); }
  if (!env.FREE_TOOLS_LIMITER) return reply({ error: 'Trend research is temporarily unavailable.' }, 503);
  try {
    const rate = await env.FREE_TOOLS_LIMITER.limit({ key: request.headers.get('CF-Connecting-IP') || 'unknown' });
    if (rate?.success !== true) return reply({ error: 'Please wait a minute before loading trends again.' }, 429);
  } catch { return reply({ error: 'Trend research is temporarily unavailable.' }, 503); }
  const now = deps.now?.() ?? Date.now();
  const cache = deps.cache || globalThis.caches?.default;
  const key = new Request(`https://findmeadow.com/__free-tools/trends-v1/${input.source}/${input.region || 'instance'}`);
  try {
    const cached = await cache?.match(key);
    if (cached) {
      const result = await cached.json();
      if (Date.parse(result.expiresAt) > now) return reply(result);
    }
  } catch { /* A cache failure must not prevent a fresh source request. */ }
  try {
    const result = await fetchTrendFeed(input, deps.fetcher, now);
    if (cache) {
      const save = Promise.resolve().then(() => cache.put(key, Response.json(result, { headers: { 'Cache-Control': `public, max-age=${TREND_CACHE_SECONDS}` } }))).catch(() => {});
      if (ctx?.waitUntil) ctx.waitUntil(save); else await save;
    }
    return reply(result);
  } catch {
    return reply({ error: `${input.sourceName} is not returning a usable trend feed right now. Try again later or open the source directly.`, source: input.source, sourceUrl: input.sourceUrl }, 503);
  }
}
