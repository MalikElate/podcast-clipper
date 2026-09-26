import test from 'node:test';
import assert from 'node:assert/strict';
import { generateIdeas, handleFreeTools, hasProfileEvidence, lookupHandle, parseGeneration } from '../../cloudflare/freeTools.js';

const request = (action, data, options = {}) => new Request(`https://findmeadow.com/api/free-tools/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://findmeadow.com', 'CF-Connecting-IP': '192.0.2.1', ...options.headers }, body: JSON.stringify(data), ...options });
const env = { FREE_TOOLS_LIMITER: { limit: async () => ({ success: true }) } };
const data = { kind: 'captions', topic: 'Planting a balcony herb garden', tone: 'Helpful' };

test('generation validates bounded inputs and produces honest fallback without AI', async () => {
  assert.throws(() => parseGeneration({ ...data, topic: 'x'.repeat(1201) }));
  assert.throws(() => parseGeneration({ ...data, kind: 'unknown' }));
  const result = await generateIdeas(parseGeneration(data), {});
  assert.equal(result.source, 'template'); assert.equal(result.items.length, 3);
  const tags = await generateIdeas(parseGeneration({ ...data, kind: 'tags' }), {});
  assert.equal(tags.source, 'keywords'); assert.ok(tags.items.length > 0);
});
test('AI uses the shared budget and accepts only complete, structured suggestions', async () => {
  let calls = 0, key;
  const aiEnv = { ROAST_BUDGET: { getByName: name => { key = name; return { take: async () => true }; } }, ROAST_AI: { run: async () => { calls++; return { response: { items: ['Caption idea number one.', 'Caption idea number two.', 'Caption idea number three.'] } }; } } };
  assert.equal((await generateIdeas(parseGeneration(data), aiEnv)).source, 'ai');
  assert.equal(key, 'daily'); assert.equal(calls, 1);
  aiEnv.ROAST_BUDGET.getByName = () => ({ take: async () => false });
  const limited = await generateIdeas(parseGeneration(data), aiEnv);
  assert.equal(limited.source, 'template'); assert.equal(limited.reason, 'daily_limit'); assert.equal(calls, 1);
  aiEnv.ROAST_BUDGET.getByName = () => ({ take: async () => true });
  aiEnv.ROAST_AI.run = async () => ({ response: 'not json' });
  assert.equal((await generateIdeas(parseGeneration(data), aiEnv)).source, 'template');
  aiEnv.ROAST_AI.run = async () => ({ response: { items: ['Only one caption'] } });
  assert.equal((await generateIdeas(parseGeneration(data), aiEnv)).source, 'template');
});
test('missing budget or budget failure never spends on AI', async () => {
  let calls = 0;
  const ai = { run: () => { calls++; throw new Error(); } };
  await generateIdeas(parseGeneration(data), { ROAST_AI: ai });
  await generateIdeas(parseGeneration(data), { ROAST_AI: ai, ROAST_BUDGET: { getByName: () => ({ take: async () => { throw new Error(); } }) } });
  assert.equal(calls, 0);
});
test('generation uses a supported Workers binding model and bounded JSON schema', async () => {
  let request, model;
  const aiEnv = {
    ROAST_BUDGET: { getByName: () => ({ take: async () => true }) },
    ROAST_AI: { run: async (selectedModel, input) => {
      model = selectedModel;
      request = input;
      return { response: JSON.stringify({ items: ['One week of posts, one planning session.', 'Build a content plan you can stick to.', 'A practical way to plan your next week.'] }) };
    } },
  };
  const result = await generateIdeas(parseGeneration(data), aiEnv);
  assert.equal(model, '@cf/meta/llama-3.3-70b-instruct-fp8-fast');
  assert.equal(request.response_format.type, 'json_schema');
  assert.equal(request.response_format.json_schema.type, 'object');
  assert.deepEqual(request.response_format.json_schema.required, ['items']);
  assert.equal(request.response_format.json_schema.properties.items.minItems, 3);
  assert.equal(request.response_format.json_schema.properties.items.maxItems, 3);
  assert.equal(result.source, 'ai');
});
test('handle evidence requires an exact structured profile identity', () => {
  const tiktok = '<script id="__FRONTITY_CONNECT_STATE__">{"source":{"data":{"profile":{"userInfo":{"uniqueId":"brand","id":"1234"}}}}}</script>';
  assert.equal(hasProfileEvidence(tiktok, 'tiktok', 'brand'), true);
  assert.equal(hasProfileEvidence(tiktok, 'tiktok', 'other'), false);
  assert.equal(hasProfileEvidence('<h1>@brand not found</h1>', 'tiktok', 'brand'), false);
  assert.equal(hasProfileEvidence('<meta property="profile:username" content="brand">', 'instagram', 'brand'), true);
  assert.equal(hasProfileEvidence('<meta property="og:title" content="(@brand) • Instagram">', 'instagram', 'brand'), false);
  const instagram = '<meta content="profile" property="og:type"><meta property="og:title" content="Brand (@brand) • Instagram"><meta property="og:url" content="https://www.instagram.com/brand/">';
  assert.equal(hasProfileEvidence(instagram, 'instagram', 'brand'), true);
  assert.equal(hasProfileEvidence(instagram, 'instagram', 'other'), false);
});
test('blocked, missing, oversized, and failed upstream responses remain unconfirmed', async () => {
  const parsed = { handle: 'brand', platform: 'instagram', url: 'https://www.instagram.com/brand/' };
  for (const status of [404, 403, 429, 500]) assert.equal(await lookupHandle(parsed, async () => new Response('', { status })), 'unconfirmed');
  assert.equal(await lookupHandle(parsed, async () => new Response('Sign in to Instagram')), 'unconfirmed');
  assert.equal(await lookupHandle(parsed, async () => new Response('x'.repeat(1_500_001))), 'unconfirmed');
  assert.equal(await lookupHandle(parsed, async () => { throw new Error(); }), 'unconfirmed');
});
test('lookup fetches only the fixed platform URL and refuses redirects', async () => {
  let target, options;
  const result = await lookupHandle({ platform: 'tiktok', handle: 'brand' }, async (url, opts) => { target = url; options = opts; return new Response(''); });
  assert.equal(target, 'https://www.tiktok.com/@brand/embed'); assert.equal(options.redirect, 'error'); assert.ok(options.signal); assert.equal(result, 'unconfirmed');
});
test('public endpoints enforce method, origin, body, and platform validation', async () => {
  assert.equal((await handleFreeTools(new Request('https://findmeadow.com/api/free-tools/generate'), env)).status, 405);
  assert.equal((await handleFreeTools(request('generate', data, { headers: { Origin: 'https://evil.test', 'Content-Type': 'application/json' } }), env)).status, 403);
  assert.equal((await handleFreeTools(request('generate', data, { headers: { 'Content-Type': 'text/plain' } }), env)).status, 415);
  assert.equal((await handleFreeTools(request('generate', { ...data, extra: 'x'.repeat(9000) }), env)).status, 400);
  assert.equal((await handleFreeTools(request('check-handle', { platform: 'instagram', handle: 'https://127.0.0.1/admin' }), env)).status, 400);
  assert.equal((await handleFreeTools(request('unknown', data), env)).status, 404);
});
test('rate limits fail closed before AI or profile requests', async () => {
  let calls = 0;
  const blocked = { FREE_TOOLS_LIMITER: { limit: async () => ({ success: false }) } };
  const response = await handleFreeTools(request('check-handle', { platform: 'instagram', handle: 'brand' }), blocked, {}, { fetcher: () => { calls++; } });
  assert.equal(response.status, 429); assert.equal(response.headers.get('Retry-After'), '60'); assert.equal(calls, 0);
  assert.equal((await handleFreeTools(request('generate', data), {})).status, 503);
});
test('responses are private and unavailable profiles never return an available status', async () => {
  const response = await handleFreeTools(request('check-handle', { platform: 'instagram', handle: '@brand' }), env, {}, { fetcher: async () => new Response('', { status: 404 }) });
  assert.equal(response.status, 200); assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.deepEqual(await response.json(), { handle: 'brand', platform: 'instagram', status: 'unconfirmed' });
  const generated = await handleFreeTools(request('generate', data), env);
  assert.equal(generated.status, 200); assert.equal((await generated.json()).source, 'template');
});
