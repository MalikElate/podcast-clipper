import test from 'node:test';
import assert from 'node:assert/strict';
import { generateIdeas, handleFreeTools, parseGeneration } from '../../cloudflare/freeTools.js';

const inputs = [
  { kind: 'names', topic: 'Beginner pottery lessons', platform: 'tiktok', brand: 'Cedar' },
  { kind: 'instagram-hashtags', topic: 'Ceramic mugs thrown on a pottery wheel', keywords: 'ceramics, handmade mugs', count: 5, language: 'French' },
  { kind: 'channel-description', topic: 'Beginner pottery lessons', audience: 'new potters', cta: 'Watch the beginner series.' },
];
const responses = [
  ['cedar.clay', 'cedarstudio', 'cedar_wheel', 'cedarpottery', 'learnwithcedar'],
  ['#Poterie', '#Céramique', '#Tournage', '#Artisanat', '#Tasse'],
  ['Explore beginner pottery lessons, from your first piece of clay to the pottery wheel.', 'A channel for new potters. Follow beginner pottery lessons and try the next project.', 'Learn about beginner pottery lessons. Watch the beginner series and explore the craft.'],
];

test('all new generation kinds use the daily budget and return normalized AI suggestions', async () => {
  for (const [index, data] of inputs.entries()) {
    const calls = [];
    const env = {
      ROAST_BUDGET: { getByName: name => ({ take: async () => { calls.push(name); return true; } }) },
      ROAST_AI: { run: async (model, request) => { calls.push(model); assert.ok(request.messages[0].content.includes('untrusted')); assert.deepEqual(JSON.parse(request.messages[1].content), parseGeneration(data)); return { response: { items: responses[index] } }; } },
    };
    const result = await generateIdeas(parseGeneration(data), env);
    assert.equal(result.source, 'ai');
    assert.deepEqual(result.items, responses[index]);
    assert.equal(calls[0], 'daily');
    assert.equal(calls.length, 2);
  }
});

test('local suggestions remain clearly labeled when budget is missing or exhausted', async () => {
  for (const data of inputs) {
    let calls = 0;
    const ai = { run: async () => { calls++; throw new Error('Must not spend'); } };
    for (const env of [{}, { ROAST_AI: ai }, { ROAST_AI: ai, ROAST_BUDGET: { getByName: () => ({ take: async () => false }) } }]) {
      const result = await generateIdeas(parseGeneration(data), env);
      assert.equal(result.source, data.kind === 'channel-description' ? 'template' : 'keywords');
      assert.ok(result.items.length > 0);
      assert.ok(result.reason);
    }
    assert.equal(calls, 0);
  }
});

test('malformed, duplicated, overlong or wrong-format AI output falls back to local generation', async () => {
  const invalidResponses = [{ items: ['too few'] }, { items: [123] }, { items: ['one..name', 'has spaces', 'https://example.com', 'x'.repeat(50), '.last'] }, { items: ['same', 'same', 'same', 'same', 'same'] }];
  for (const response of invalidResponses) {
    const env = { ROAST_BUDGET: { getByName: () => ({ take: async () => true }) }, ROAST_AI: { run: async () => ({ response }) } };
    const result = await generateIdeas(parseGeneration(inputs[0]), env);
    assert.equal(result.source, 'keywords');
    assert.equal(result.reason, 'invalid_response');
    assert.ok(result.items.every(item => item.length <= 24));
  }
});

test('new kinds cannot bypass the existing origin or per-IP rate controls', async () => {
  for (const data of inputs) {
    let aiCalls = 0;
    const env = { FREE_TOOLS_LIMITER: { limit: async ({ key }) => { assert.equal(key, '192.0.2.55'); return { success: false }; } }, ROAST_AI: { run: async () => { aiCalls++; } } };
    const makeRequest = origin => new Request('https://findmeadow.com/api/free-tools/generate', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin, 'CF-Connecting-IP': '192.0.2.55' }, body: JSON.stringify(data) });
    assert.equal((await handleFreeTools(makeRequest('https://evil.test'), env)).status, 403);
    const result = await handleFreeTools(makeRequest('https://findmeadow.com'), env);
    assert.equal(result.status, 429);
    assert.equal(result.headers.get('Retry-After'), '60');
    assert.equal(aiCalls, 0);
  }
});
