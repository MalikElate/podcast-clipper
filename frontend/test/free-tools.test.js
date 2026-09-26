import test from 'node:test';
import assert from 'node:assert/strict';
import { buildUtm, captionIdeas, checkTitle, cropRectangle, fitTags, formatText, handleIdeas, plainText, sliceRectangles, suggestTags, tagCost, validateHandle } from '../../shared/freeTools.js';
import { CROP_PRESETS, FREE_TOOLS, FREE_TOOL_PAGES, findFreeToolPage } from '../src/tools/freeToolsCatalog.js';

test('UTM links replace old tags while preserving unrelated query values and fragments', () => {
  const result = new URL(buildUtm({ url: 'https://example.com/shop?item=2&utm_source=old&utm_source=duplicate&utm_term=old#details', source: 'LinkedIn', medium: 'social', campaign: 'launch & learn', content: 'video 1' }));
  assert.equal(result.searchParams.get('item'), '2');
  assert.deepEqual(result.searchParams.getAll('utm_source'), ['LinkedIn']);
  assert.equal(result.searchParams.get('utm_campaign'), 'launch & learn');
  assert.equal(result.searchParams.get('utm_content'), 'video 1');
  assert.equal(result.searchParams.has('utm_term'), false);
  assert.equal(result.hash, '#details');
});
test('UTM builder rejects unsafe destinations and incomplete campaign inputs', () => {
  const fields = { source: 'ig', medium: 'social', campaign: 'launch' };
  for (const url of ['javascript:alert(1)', 'data:text/html,test', 'https://user:password@example.com', 'not a url']) assert.throws(() => buildUtm({ ...fields, url }));
  assert.throws(() => buildUtm({ ...fields, url: 'https://example.com', source: '  ' }));
});
test('handle parsing normalizes exact platform profile URLs without admitting external targets', () => {
  assert.equal(validateHandle('https://www.instagram.com/Studio.Name/?ref=x', 'instagram').handle, 'studio.name');
  assert.equal(validateHandle('https://www.tiktok.com/@Studio_Name', 'tiktok').handle, 'studio_name');
  assert.equal(validateHandle('@brand', 'instagram').url, 'https://www.instagram.com/brand/');
  for (const value of ['https://instagram.com.evil.test/name', 'https://localhost/name', 'https://instagram.com:8443/name', 'https://instagram.com/p/123', 'a b', '.abc', 'a..b', 'a'.repeat(31)]) assert.throws(() => validateHandle(value, 'instagram'));
  for (const value of ['https://tiktok.com/@brand/video/123', 'user.', 'a'.repeat(25)]) assert.throws(() => validateHandle(value, 'tiktok'));
  assert.throws(() => validateHandle('abc', 'unsupported'));
});
test('suggested handles fit their platform format even with a long input', () => {
  for (const platform of ['instagram', 'tiktok']) for (const handle of handleIdeas('a'.repeat(30), platform)) assert.doesNotThrow(() => validateHandle(handle, platform));
});
test('formatting can be switched and removed without corrupting non-Latin text or line breaks', () => {
  const text = 'Hello 2026\nCafé 中文 🌱';
  for (const style of ['bold', 'italic', 'bold-italic', 'underline', 'monospace']) {
    assert.equal(plainText(formatText(text, style)), text);
    assert.equal(formatText(formatText(text, style), 'plain'), text);
  }
  assert.equal(formatText('h', 'italic'), 'ℎ');
  assert.equal(formatText(formatText('Abc', 'bold'), 'italic'), formatText('Abc', 'italic'));
});
test('YouTube checks separate the hard limit from editorial suggestions', () => {
  assert.equal(checkTitle('x'.repeat(100)).valid, true);
  assert.equal(checkTitle('x'.repeat(101)).valid, false);
  assert.equal(checkTitle('A < B').valid, false);
  assert.equal(checkTitle(' ').valid, false);
  assert.equal(checkTitle('🌱'.repeat(100)).length, 100);
  assert.ok(checkTitle('Plan your next video', 'content').issues.some(issue => issue.includes('missing')));
});
test('YouTube tag budget counts commas and implied quotes, and drops duplicates', () => {
  assert.equal(tagCost(['Foo-Baz']), 7);
  assert.equal(tagCost(['Foo Baz']), 9);
  assert.equal(tagCost(['Foo Baz', 'hello']), 15);
  assert.deepEqual(fitTags(['basil', 'BASIL', ' #plants\n ', null]), ['basil', 'plants']);
  const tags = fitTags(Array.from({ length: 50 }, (_, i) => `tag number ${i} ${'a'.repeat(30)}`));
  assert.ok(tagCost(tags) <= 500);
  assert.ok(tags.length > 5);
  assert.ok(suggestTags('How to grow basil on a balcony', 'basil growing,small space').includes('basil growing'));
});
test('caption templates respect supplied tone, audience, CTA, and hashtags', () => {
  const captions = captionIdeas({ topic: 'balcony herbs', tone: 'Curious', audience: 'new gardeners', cta: 'Save the planting guide.', hashtags: '#basil herbs' });
  assert.equal(new Set(captions).size, 3);
  for (const caption of captions) { assert.ok(caption.includes('balcony herbs')); assert.ok(caption.includes('new gardeners')); assert.ok(caption.includes('Save the planting guide.')); assert.ok(caption.includes('#basil #herbs')); }
});
test('image crop fills the destination and source slices meet without gaps', () => {
  const crop = cropRectangle(6000, 2000, 3240, 1080, 1, 50, 50);
  for (const [key, value] of Object.entries({ x: 0, y: 0, width: 6000, height: 2000 })) assert.ok(Math.abs(crop[key] - value) < 1e-8);
  const slices = sliceRectangles(crop, 3, 1);
  assert.equal(slices.length, 3);
  assert.equal(slices[0].x + slices[0].width, slices[1].x);
  assert.equal(slices[2].x + slices[2].width, 6000);
  const portrait = cropRectangle(2000, 1000, 1080, 1350, 2, 100, 0);
  assert.ok(portrait.x >= 0 && portrait.x + portrait.width <= 2000);
  assert.equal(portrait.y, 0);
  assert.equal(portrait.width / portrait.height, .8);
  const grid = sliceRectangles(cropRectangle(4000,3000,3240,4320),3,4);
  assert.equal(grid.length,12);
  assert.equal(grid[0].y + grid[0].height, grid[3].y);
  assert.throws(() => cropRectangle(0, 100, 10, 10));
});
test('all ten tools and guides have unique public routes, metadata, and working crop presets', () => {
  assert.equal(FREE_TOOLS.length, 10);
  assert.equal(new Set(FREE_TOOL_PAGES.map(page => page.path)).size, FREE_TOOL_PAGES.length);
  assert.equal(new Set(FREE_TOOL_PAGES.map(page => page.title)).size, FREE_TOOL_PAGES.length);
  for (const page of FREE_TOOL_PAGES) {
    assert.equal(findFreeToolPage(`${page.path}/`), page);
    assert.ok(page.description.length >= 70);
  }
  for (const preset of CROP_PRESETS) assert.ok(preset.width <= 4096 && preset.height <= 4096 && preset.width >= 100 && preset.height >= 100);
});
