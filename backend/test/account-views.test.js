import test from "node:test";
import assert from "node:assert/strict";
import { AccountViewsService, accountViewWindow } from "../src/bridge/services/AccountViewsService.js";
import { YouTubeProvider } from "../src/bridge/platforms/GoogleProviders.js";

function setup() {
  let now = Date.parse("2026-09-21T12:00:00Z"), calls = 0;
  const records = new Map([['one', { id: 'one', ownerUid: 'alice', projectId: 'project', authorizationId: 'grant', remoteId: 'channel-one', status: 'connected', platform: 'youtube' }]]);
  let behavior = async () => ({ value: 12500, throughDate: '2026-09-18' });
  const projects = { require: (uid, projectId) => { assert.equal(uid, 'alice'); assert.equal(projectId, 'project'); } };
  const store = { get: (_, id) => records.get(id), list: () => [...records.values()] };
  const accounts = { withCredentials: async (_, operation) => operation({ accessToken: 'private-token' }), list: () => [...records.values()] };
  const provider = { accountViews: async ctx => { calls++; return behavior(ctx); } };
  const registry = { get: platform => platform === 'youtube' ? provider : {} };
  const service = new AccountViewsService({ store, accounts, projects, registry, clock: () => now });
  return { service, records, accounts, behavior: next => { behavior = next; }, calls: () => calls, advance: ms => { now += ms; } };
}

test('window is exactly 180 completed Pacific calendar days across DST and leap years', () => {
  for (const now of ['2026-09-21T00:30:00Z', '2024-03-11T12:00:00Z', '2024-11-04T12:00:00Z']) {
    const window = accountViewWindow(Date.parse(now));
    assert.equal((Date.parse(window.endDate) - Date.parse(window.startDate)) / 86400000, 179);
    assert.equal(window.days, 180);
  }
  assert.equal(accountViewWindow(Date.parse('2026-09-21T00:30:00Z')).endDate, '2026-09-19');
});

test('account reports are owner scoped, cached, and never substitute lifetime metrics', async () => {
  const h = setup();
  h.records.set('other', { ...h.records.get('one'), id: 'other', platform: 'tiktok', totals: { views: 99999999 } });
  const result = await h.service.report('alice', 'project');
  assert.equal(result.accounts[0].periodViews.value, 12500);
  assert.equal(result.accounts[1].periodViews.value, null);
  assert.equal(result.accounts[1].periodViews.status, 'unavailable');
  assert.equal(JSON.stringify(result).includes('private-token'), false);
  await h.service.report('alice', 'project', { refresh: true });
  assert.equal(h.calls(), 1);
  h.advance(61000); await h.service.report('alice', 'project', { refresh: true });
  assert.equal(h.calls(), 2);
  await assert.rejects(h.service.report('bob', 'project'));
  await assert.rejects(h.service.report('alice', 'project', { days: 30 }));
});

test('successful zero is distinct from provider errors and missing permissions', async () => {
  const h = setup(); h.behavior(async () => ({ value: 0 }));
  assert.equal((await h.service.report('alice', 'project')).accounts[0].periodViews.value, 0);
  h.advance(310000); h.behavior(async () => { throw new Error('private-token'); });
  const result = await h.service.report('alice', 'project');
  assert.equal(result.accounts[0].periodViews.value, null);
  assert.equal(result.accounts[0].periodViews.status, 'error');
  assert.equal(JSON.stringify(result).includes('private-token'), false);
  assert.equal(h.records.get('one').status, 'connected');
});

test('disconnect, authorization replacement, and privacy deletion discard pending results', async () => {
  for (const change of ['disconnect', 'grant', 'delete', 'privacy']) {
    const h = setup();
    h.behavior(async () => {
      if (change === 'disconnect') h.records.get('one').status = 'disconnected';
      if (change === 'grant') h.records.get('one').authorizationId = 'new-grant';
      if (change === 'delete') h.records.delete('one');
      if (change === 'privacy') h.accounts.privacy = { blocked: () => true };
      return { value: 500 };
    });
    const result = await h.service.report('alice', 'project');
    assert.ok(result.accounts.every(account => account.periodViews.value === null));
  }
});

test('YouTube requests the selected whole channel and sums daily activity inside the exact window', async () => {
  let request;
  const provider = new YouTubeProvider({});
  provider.http = { request: async (url, options) => { request = { url: new URL(url), options }; return { columnHeaders: [{ name: 'views' }, { name: 'day' }], rows: [[50, '2026-09-18'], [0, '2026-09-19'], [123, '2026-09-20']] }; } };
  const window = accountViewWindow(Date.parse('2026-09-21T12:00:00Z'));
  const result = await provider.accountViews({ account: { remoteId: 'UC-selected-channel' }, credentials: { accessToken: 'secret' }, window });
  assert.deepEqual(result, { value: 173, throughDate: '2026-09-20' });
  assert.equal(request.url.searchParams.get('ids'), 'channel==UC-selected-channel');
  assert.equal(request.url.searchParams.get('startDate'), window.startDate);
  assert.equal(request.url.searchParams.get('endDate'), window.endDate);
  assert.equal(request.url.searchParams.get('metrics'), 'views');
  assert.equal(request.url.searchParams.has('filters'), false);
  assert.equal(request.options.token, 'secret');
});

test('YouTube rejects out-of-window, repeated, negative and malformed rows', async () => {
  const provider = new YouTubeProvider({}), window = accountViewWindow(Date.parse('2026-09-21T12:00:00Z'));
  for (const rows of [[['2025-01-01', 2]], [['2026-09-20', -1]], [['2026-09-20', 1], ['2026-09-20', 2]], [['2026-09-20', '20']]]) {
    provider.http = { request: async () => ({ columnHeaders: [{ name: 'day' }, { name: 'views' }], rows }) };
    await assert.rejects(provider.accountViews({ account: { remoteId: 'channel' }, credentials: {}, window }));
  }
  provider.http = { request: async () => ({ columnHeaders: [{ name: 'day' }, { name: 'views' }], rows: [] }) };
  assert.deepEqual(await provider.accountViews({ account: { remoteId: 'channel' }, credentials: {}, window }), { value: 0, throughDate: null });
});
