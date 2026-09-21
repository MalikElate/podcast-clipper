import test from "node:test";
import assert from "node:assert/strict";
import { tiktokAccountAnalytics, pinterestAccountAnalytics, xAccountAnalytics } from "../src/bridge/platforms/accountAnalytics.js";
import { HttpTransport } from "../src/bridge/platforms/HttpTransport.js";
import { AccountViewsService } from "../src/bridge/services/AccountViewsService.js";
import { XProvider } from "../src/bridge/platforms/XProvider.js";
const now = Date.parse('2026-09-21T12:00:00Z');
const clock = () => now;
const created = date => Date.parse(date) / 1000;

test('TikTok pages through all recent videos, deduplicates, and labels cumulative views honestly', async () => {
  const requests = [];
  const pages = [
    { videos: [{ id: 'one', create_time: created('2026-09-20'), view_count: 20 }], has_more: true, cursor: Date.parse('2026-09-19') },
    { videos: [{ id: 'one', create_time: created('2026-09-20'), view_count: 20 }, { id: 'two', create_time: created('2026-05-01'), view_count: 30 }, { id: 'old', create_time: created('2025-01-01'), view_count: 9000 }], has_more: true, cursor: 1 },
  ];
  const result = await tiktokAccountAnalytics({ clock, http: { request: async (url, options) => { requests.push({ url, options }); return { data: pages.shift() }; } } }, { accessToken: 'private-token' });
  assert.equal(result.value, 50); assert.equal(result.postCount, 2); assert.equal(result.partial, false);
  assert.equal(result.basis, 'recent_posts'); assert.equal(result.days, 180);
  assert.equal(result.metric, 'video_views'); assert.equal(requests.length, 2);
  assert.equal(requests[0].options.json.cursor, Date.parse('2026-09-21'));
  assert.equal(JSON.stringify(result).includes('private-token'), false);
});
test('TikTok rejects missing view counts and nonadvancing pagination; a successful empty list is zero', async () => {
  for (const data of [{ videos: [{ id: 'a', create_time: created('2026-09-20') }], has_more: false }, { videos: [], has_more: true, cursor: Date.parse('2026-09-21') }]) await assert.rejects(tiktokAccountAnalytics({ clock, http: { request: async () => ({ data }) } }, {}));
  assert.equal((await tiktokAccountAnalytics({ clock, http: { request: async () => ({ data: { videos: [], has_more: false } }) } }, {})).value, 0);
});
test('Pinterest requests only its real 90-day range and preserves impressions as impressions', async () => {
  let path;
  const result = await pinterestAccountAnalytics({ clock, request: async p => { path = p; return { all: { summary_metrics: { IMPRESSION: 45 }, daily_metrics: [] } }; } }, {});
  const url = new URL(path, 'https://api.pinterest.com/v5/');
  assert.equal(url.searchParams.get('start_date'), '2026-06-23');
  assert.equal(url.searchParams.get('end_date'), '2026-09-20');
  assert.equal(url.searchParams.get('metric_types'), 'IMPRESSION');
  assert.equal(result.value, 45); assert.equal(result.days, 90); assert.equal(result.metric, 'pin_impressions'); assert.equal(result.partial, true);
  await assert.rejects(pinterestAccountAnalytics({ clock, sandbox: true }, {}), e => e.code === 'analytics_sandbox');
  await assert.rejects(pinterestAccountAnalytics({ clock, request: async () => ({ all: { summary_metrics: {} } }) }, {}));
});
test('X includes older posts in actual period analytics and falls back to distinctly labeled recent-post impressions', async () => {
  const posts = [{ id: '1', created_at: '2025-01-01', public_metrics: { impression_count: 9000 } }, { id: '2', created_at: '2026-09-01', public_metrics: { impression_count: 100 } }];
  let rejectPeriod = false, query;
  const provider = { clock, request: async path => {
    if (path.startsWith('users/')) return { data: posts, meta: { result_count: 2 } };
    query = new URL(path, 'https://api.x.com/2/');
    if (rejectPeriod) throw new Error('not available for this account');
    return { data: [{ id: '1', impressions: 25 }, { id: '2', impressions: 50 }] };
  } };
  const result = await xAccountAnalytics(provider, { remoteId: 'owner' }, {});
  assert.equal(result.value, 75); assert.equal(result.basis, 'period'); assert.equal(result.partial, false);
  assert.equal(query.searchParams.get('ids'), '1,2');
  assert.equal(query.searchParams.get('start_time'), '2026-03-25T00:00:00.000Z');
  rejectPeriod = true;
  const fallback = await xAccountAnalytics(provider, { remoteId: 'owner' }, {});
  assert.equal(fallback.value, 100); assert.equal(fallback.basis, 'recent_posts'); assert.equal(fallback.source, 'x_post_metrics');
});
test('missing X metrics stay missing, and X API credit errors are actionable without response leakage', async () => {
  await assert.rejects(xAccountAnalytics({ clock, request: async path => path.startsWith('users/') ? { data: [{ id: '1', created_at: '2026-09-01' }], meta: { result_count: 1 } } : { errors: [{}] } }, { remoteId: 'owner' }, {}));
  const http = new HttpTransport({ fetcher: async () => new Response(JSON.stringify({ detail: 'private-token' }), { status: 402 }) });
  await assert.rejects(http.request('https://api.x.com/2/users/owner/tweets'), e => e.code === 'x_credits_required' && !e.message.includes('private-token'));
});
test('selected account analytics are scoped, cached, and separate from strict 180-day views', async () => {
  const record = { id: 'brand', projectId: 'p', ownerUid: 'owner', status: 'connected', platform: 'tiktok', authorizationId: 'grant' };
  const other = { ...record, id: 'personal' }; let calls = 0;
  const store = { get: (_, id) => [record, other].find(a => a.id === id), list: () => [record, other] };
  const service = new AccountViewsService({ store, projects: { require: () => {} }, accounts: { list: () => [record, other], withCredentials: async (_, cb) => cb({}) }, registry: { get: () => ({ availableAccountViews: async () => { calls++; return { value: 20, basis: 'recent_posts' }; } }) }, clock });
  const report = await service.report('owner', 'p', { accountIds: ['brand'] });
  assert.equal(report.accounts.length, 1); assert.equal(report.accounts[0].periodViews.value, null);
  assert.equal(report.accounts[0].availableViews.value, 20);
  await service.report('owner', 'p', { accountIds: ['brand'] }); assert.equal(calls, 1);
  await assert.rejects(service.report('owner', 'p', { accountIds: ['foreign'] }));
});

test('X errors inside successful responses remain explicit and never leak request details', async () => {
  for (const [type, code] of [['resource-not-found', 'x_resource_missing'], ['client-forbidden', 'x_app_access_required'], ['usage-capped', 'x_credits_required'], ['not-authorized-for-resource', 'provider_permissions'], ['unknown', 'x_response_incomplete']]) {
    const error = { type: 'https://api.x.com/2/problems/' + type, detail: 'private-token' };
    const provider = new XProvider({ env: {}, http: { request: async () => ({ errors: [error] }) }, clock });
    await assert.rejects(provider.metrics({ credentials: {}, delivery: { externalId: 'one' } }), e => e.code === code && !JSON.stringify(e).includes('private-token'));
    const http = new HttpTransport({ fetcher: async () => new Response(JSON.stringify(error), { status: 403 }) });
    await assert.rejects(http.request('https://api.x.com/2/users/owner/tweets'), e => e.code === code && !JSON.stringify(e).includes('private-token'));
  }
});

test('X preserves measured impressions when some post metrics are missing, with explicit partial coverage', async () => {
  const provider = new XProvider({ env: {}, clock, http: { request: async url => url.includes('/users/') ? {
    data: [{ id: 'one', created_at: '2026-09-01', public_metrics: { impression_count: 42 } }, { id: 'two', created_at: '2026-09-02' }],
    errors: [{ type: 'https://api.x.com/2/problems/resource-not-found' }], meta: { result_count: 2 },
  } : { errors: [{ type: 'https://api.x.com/2/problems/client-forbidden' }] } } });
  const result = await xAccountAnalytics(provider, { remoteId: 'owner' }, {});
  assert.equal(result.value, 42); assert.equal(result.partial, true); assert.equal(result.postCount, 1);
  assert.equal(result.basis, 'recent_posts');
});

test('X retries one transient read failure, never permission failures or invalid empty timelines', async () => {
  let attempts = 0;
  const provider = { clock, request: async () => {
    attempts++;
    if (attempts === 1) throw Object.assign(new Error('Temporary outage'), { code: 'provider_unavailable' });
    return { data: [], meta: { result_count: 0 } };
  } };
  assert.equal((await xAccountAnalytics(provider, { remoteId: 'owner' }, {})).value, 0);
  assert.equal(attempts, 2);
  attempts = 0;
  provider.request = async () => { attempts++; throw Object.assign(new Error('Denied'), { code: 'provider_permissions' }); };
  await assert.rejects(xAccountAnalytics(provider, { remoteId: 'owner' }, {})); assert.equal(attempts, 1);
  provider.request = async () => ({ meta: { result_count: 3 } });
  await assert.rejects(xAccountAnalytics(provider, { remoteId: 'owner' }, {}), e => e.code === 'x_timeline_incomplete');
});
