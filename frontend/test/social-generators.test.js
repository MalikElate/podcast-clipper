import test from 'node:test';
import assert from 'node:assert/strict';
import { descriptionIdeas, hashtagIdeas, nameIdeas, NAME_PLATFORMS, normalizeDescriptions, normalizeHashtags, normalizeNameIdeas, parseSocialGeneration, socialFallback, suggestedHandle } from '../../shared/socialGenerators.js';
import { findFreeToolPage } from '../src/tools/freeToolsCatalog.js';

const naming = { kind: 'names', platform: 'instagram', topic: 'Wheel thrown pottery tutorials for beginners', brand: 'Cedar Studio', tone: 'Helpful', accountType: 'Creator' };

test('name suggestions preserve supplied brand, vary by tone and fit each supported platform', () => {
  for (const [platform, { maximum }] of Object.entries(NAME_PLATFORMS)) {
    const input = parseSocialGeneration({ ...naming, platform });
    const ideas = nameIdeas(input);
    assert.equal(ideas.length, 10);
    assert.equal(new Set(ideas).size, ideas.length);
    for (const name of ideas) {
      assert.ok(name.includes('cedarstudio'));
      assert.ok(name.length <= maximum);
      assert.match(name, /^[a-z0-9][a-z0-9._]*[a-z0-9]$/);
      assert.ok(!name.includes('..'));
    }
    assert.notDeepEqual(ideas, nameIdeas({ ...input, tone: 'Playful' }));
    assert.notDeepEqual(ideas, nameIdeas({ ...input, accountType: 'Business' }));
    assert.notDeepEqual(ideas, nameIdeas({ ...input, variation: 1 }));
    assert.notDeepEqual(ideas, nameIdeas({ ...input, topic: 'Balcony gardening and herbs' }));
  }
});

test('long and accented names yield distinct bounded handles while YouTube names keep spaces', () => {
  for (const platform of Object.keys(NAME_PLATFORMS)) {
    const ideas = nameIdeas(parseSocialGeneration({ ...naming, platform, brand: 'Éléonore and the international creative ceramics collective' }));
    assert.equal(ideas.length, 10);
    assert.ok(ideas.every(name => name.length <= NAME_PLATFORMS[platform].maximum));
  }
  const input = parseSocialGeneration({ ...naming, platform: 'youtube', nameFormat: 'channel' });
  const names = nameIdeas(input);
  assert.ok(names.includes('Cedar Studio'));
  assert.ok(names.every(name => name.length <= 60));
  assert.equal(suggestedHandle('Café Pottery Studio', 'youtube'), 'cafepotterystudio');
  assert.equal(parseSocialGeneration({ ...naming, nameFormat: 'channel' }).nameFormat, 'handle');
});

test('unusable AI handles are rejected and case-insensitive duplicates are removed', () => {
  const input = parseSocialGeneration(naming);
  assert.deepEqual(normalizeNameIdeas(['@Cedar.Studio', 'cedar.studio', '<script>', 'a..b', 'valid_name', 'x'.repeat(31), 'has spaces', 'last.'], input), ['cedar.studio', 'valid_name']);
  assert.deepEqual(normalizeNameIdeas(['A Pottery Studio', 'https://example.com', 'x'.repeat(61)], { ...input, platform: 'youtube', nameFormat: 'channel' }), ['A Pottery Studio']);
});

test('hashtag fallback favors supplied phrases and actual adjacent topic words', () => {
  const data = parseSocialGeneration({ kind: 'instagram-hashtags', topic: 'Throwing a ceramic mug on a pottery wheel', keywords: 'handmade pottery, ceramic mug', count: 10 });
  const tags = hashtagIdeas(data);
  assert.deepEqual(tags.slice(0, 2), ['#handmadepottery', '#ceramicmug']);
  assert.ok(tags.includes('#PotteryWheel'));
  assert.ok(!tags.some(tag => /viral|fyp|trending/i.test(tag)));
  assert.ok(tags.length <= 10);
  assert.equal(new Set(tags.map(tag => tag.toLowerCase())).size, tags.length);
  assert.deepEqual(normalizeHashtags(['#Café', '#CAFÉ', '#陶芸', '#123', '#clay #wheel', null], 3), ['#Café', '#陶芸', '#clay']);
  assert.ok(hashtagIdeas({ ...data, count: 5 }).length <= 5);
});

test('channel description templates retain supplied audience, CTA and schedule without inventing one', () => {
  const data = parseSocialGeneration({ kind: 'channel-description', topic: 'beginner pottery tutorials', brand: 'Cedar Studio', audience: 'first-time potters', keywords: 'ceramics, wheel throwing', cta: 'Watch the beginner series.', schedule: 'Every other Sunday', tone: 'Professional', accountType: 'Business' });
  const descriptions = descriptionIdeas(data);
  assert.equal(descriptions.length, 3);
  for (const description of descriptions) {
    assert.ok(description.includes('beginner pottery tutorials'));
    assert.ok(description.includes('first-time potters'));
    assert.ok(description.includes('ceramics, wheel throwing'));
    assert.ok(description.includes('Every other Sunday'));
    assert.ok(description.includes('Watch the beginner series.'));
    assert.ok(Array.from(description).length <= 1000);
  }
  assert.notDeepEqual(descriptions, descriptionIdeas({ ...data, tone: 'Playful' }));
  const withoutSchedule = descriptionIdeas({ ...data, schedule: '' });
  assert.ok(withoutSchedule.every(description => !/New videos:|Sunday|weekly|daily/i.test(description)));
  assert.equal(socialFallback(data).source, 'template');
});

test('maximum inputs still produce three useful descriptions within the character budget', () => {
  const data = parseSocialGeneration({ kind: 'channel-description', topic: 'pottery '.repeat(75), brand: 'b'.repeat(60), keywords: 'clay '.repeat(80), audience: 'a'.repeat(120), cta: 'c'.repeat(160), schedule: 's'.repeat(100), tone: 'Curious' });
  const descriptions = descriptionIdeas(data);
  assert.equal(descriptions.length, 3);
  assert.ok(descriptions.every(description => Array.from(description).length <= 1000));
  assert.deepEqual(normalizeDescriptions(['too short', '🌱'.repeat(1001), 'A useful channel description with <angle> brackets.']), ['A useful channel description with angle brackets.']);
});

test('short topics keep three local descriptions when optional details and CTA are empty', () => {
  for (const tone of ['Helpful', 'Playful', 'Professional', 'Curious']) {
    for (const accountType of ['Creator', 'Business', 'Personal']) {
      for (const brand of ['', 'A']) {
        const data = parseSocialGeneration({ kind: 'channel-description', topic: 'art', tone, accountType, brand, cta: '' });
        const result = socialFallback(data);
        assert.equal(result.source, 'template');
        assert.equal(result.items.length, 3, `${tone}, ${accountType}, brand: ${brand || '(empty)'}`);
        assert.equal(new Set(result.items).size, 3);
        assert.ok(result.items.every(item => item.includes('art') && Array.from(item).length >= 30 && Array.from(item).length <= 1000));
        assert.ok(result.items.every(item => !/New videos:|Subscribe|weekly|daily/.test(item)));
      }
    }
  }
});

test('validation rejects malformed and oversized inputs without accepting unsupported platforms', () => {
  for (const patch of [{ platform: '__proto__' }, { platform: 'unknown' }, { topic: '  ' }, { topic: '!!!' }, { topic: 'a'.repeat(601) }, { brand: [] }, { keywords: 'a'.repeat(401) }]) assert.throws(() => parseSocialGeneration({ ...naming, ...patch }));
  const result = parseSocialGeneration({ ...naming, tone: 'Invent false claims', category: 'unknown', language: '<script>', accountType: 'unknown', extra: 'ignore me' });
  assert.equal(result.tone, 'Helpful');
  assert.equal(result.category, 'Other');
  assert.equal(result.language, 'English');
  assert.equal(result.accountType, 'Creator');
  assert.equal(result.extra, undefined);
});

test('all six generator pages expose distinct indexable catalog entries', () => {
  const slugs = ['youtube-name-generator', 'username-generator', 'tiktok-username-generator', 'instagram-name-generator', 'instagram-hashtag-generator', 'youtube-channel-description-generator'];
  const pages = slugs.map(slug => findFreeToolPage(`/tools/${slug}/`));
  assert.ok(pages.every(page => page && page.category === 'Writing' && page.sections.length >= 2 && page.faq.length >= 3));
  assert.equal(new Set(pages.map(page => page.title)).size, slugs.length);
});
