import test from 'node:test';
import assert from 'node:assert/strict';
import { characterStats, engagementRate, fitHashtags, rankPostingTimes, shortenText, writingIdeas, WRITING_LIMITS } from '../../shared/writingTools.js';

test('counts distinguish combined emoji, whitespace, words and line breaks', () => {
  assert.deepEqual(characterStats('A 👨‍👩‍👧‍👦\nÉ'), { characters: 11, withoutWhitespace: 9, visibleCharacters: 5, words: 2, lines: 2 });
  assert.equal(characterStats('').lines, 0);
  assert.equal(characterStats('one\r\ntwo').lines, 2);
});
test('hashtag normalization keeps Unicode words, removes duplicates and rejects numeric-only or oversized tags', () => {
  assert.deepEqual(fitHashtags(['#balcony herbs', 'BalconyHerbs', 'café local', '1234', 'x'.repeat(61), null]), ['#BalconyHerbs', '#CaféLocal']);
});
test('writing fallbacks preserve the brief and supplied links, and honor working limits without splitting surrogate pairs', () => {
  const common = { topic: 'Opening our ceramic studio', audience: 'local makers', cta: 'Visit the collection', keywords: 'ceramics, studio', links: 'https://example.com/studio' };
  for (const kind of ['captions','bio','description','linkedin']) {
    const ideas = writingIdeas({ ...common, kind });
    assert.equal(ideas.length, 3);
    assert.ok(ideas.every(text => Array.from(text).length <= WRITING_LIMITS[kind]));
  }
  assert.ok(writingIdeas({ ...common, kind: 'description' }).every(text => text.includes(common.links) && text.includes('\n\n')));
  assert.ok(writingIdeas({ ...common, kind: 'linkedin', language: 'French' })[1].startsWith('Une réflexion'));
  assert.equal(shortenText('😀😀😀😀', 3), '😀😀…');
});
test('engagement uses the chosen denominator, allows rates over 100%, and rejects invalid or unsafe counts', () => {
  assert.deepEqual(engagementRate({ audience: '500', likes: '50', comments: '5', shares: '5' }), { engagements: 60, audience: 500, rate: 12 });
  assert.equal(engagementRate({ audience: 10, likes: 20 }).rate, 200);
  for (const audience of [0, -1, 'invalid', 1.5, Infinity]) assert.throws(() => engagementRate({ audience }));
  for (const likes of [-1, 1.5, 'invalid', Infinity]) assert.throws(() => engagementRate({ audience: 100, likes }));
});
test('posting-time comparisons weight reach instead of averaging percentages and group weekday/hour correctly', () => {
  const rows = [{ day: 'Monday', time: '09:10', engagements: '10', reach: '100' }, { day: 'Monday', time: '09:55', engagements: '200', reach: '10000' }, { day: 'Tuesday', time: '10:20', engagements: '3', reach: '100' }];
  const results = rankPostingTimes(rows);
  assert.equal(results[0].day, 'Tuesday'); assert.equal(results[0].rate, 3);
  assert.equal(results[1].time, '09:00'); assert.equal(results[1].posts, 2);
  assert.equal(results[1].rate, 210 / 10100 * 100);
  assert.throws(() => rankPostingTimes(rows.slice(0,2)), /at least three/);
  assert.throws(() => rankPostingTimes(rows.map(row => ({ ...row, day: 'Monday', time: '09:00' }))), /two different/);
  assert.throws(() => rankPostingTimes(rows.map(row => ({ ...row, reach: '0' }))), /greater than zero/);
});
