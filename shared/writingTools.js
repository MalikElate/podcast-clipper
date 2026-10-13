import { captionIdeas, suggestTags, textLength } from './freeTools.js';

export const WRITING_KINDS = ['captions', 'bio', 'description', 'linkedin', 'hashtags', 'tags', 'slogan', 'profile'];
export const WRITING_PLATFORMS = ['Instagram', 'TikTok', 'LinkedIn', 'Facebook', 'X', 'YouTube', 'Threads', 'Pinterest'];
export const WRITING_LIMITS = { captions: 600, bio: 150, description: 2500, linkedin: 1600, slogan: 100, profile: 420 };

export function shortenText(text, limit) {
  const chars = Array.from(text);
  if (chars.length <= limit) return text;
  return chars.slice(0, limit - 1).join('').trimEnd() + '…';
}

export function fitHashtags(values) {
  const output = [];
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const words = value.replace(/^#+/, '').match(/[\p{L}\p{N}_]+/gu) || [];
    const tag = words.map(word => word[0].toLocaleUpperCase() + word.slice(1)).join('');
    if (!/\p{L}/u.test(tag) || textLength(tag) > 60) continue;
    if (!output.some(item => item.toLowerCase() === `#${tag}`.toLowerCase())) output.push(`#${tag}`);
    if (output.length === 15) break;
  }
  return output;
}

export function fitProfileDrafts(values, language = 'English') {
  const french = language === 'French';
  return [...new Set(values.flatMap(value => {
    const match = value.trim().match(/^(?:Name|Nom):\s*([^\n]+)\n(?:Handle idea|Idée de pseudo):\s*@?([a-z0-9_.]{1,30})\nBio:\s*([\s\S]+)$/i);
    if (!match) return [];
    return [`${french ? 'Nom' : 'Name'}: ${shortenText(match[1].trim(), 80)}\n${french ? 'Idée de pseudo' : 'Handle idea'}: @${match[2]}\nBio: ${shortenText(match[3].trim(), 150)}`];
  }))].slice(0, 3);
}

export function writingIdeas(data) {
  const { kind, topic, audience = '', cta = '', keywords = '', links = '', language = 'English' } = data;
  const french = language === 'French';
  if (kind === 'hashtags') return fitHashtags(suggestTags(topic, keywords));
  if (kind === 'captions' && !french) return captionIdeas(data).map(text => shortenText(text, WRITING_LIMITS.captions));
  const subject = topic.trim().replace(/[.!?]+$/, '');
  const forAudience = audience.trim() ? `${french ? 'Pour' : 'For'} ${audience.trim()}.` : '';
  const join = values => values.filter(Boolean).join('\n\n');
  let drafts;
  if (kind === 'slogan') {
    const brand = data.brand?.trim() || shortenText(subject, 45);
    drafts = french ? [`${brand}. Pensé pour vous.`, `${brand}. Votre prochaine idée commence ici.`, `${brand}. Place à ce qui compte.`] : [`${brand}. Made for your everyday.`, `${brand}. Make room for what matters.`, `${brand}. A fresh way forward.`];
  } else if (kind === 'profile') {
    const name = data.brand?.trim() || shortenText(subject, 50);
    const base = name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 18) || 'yourbrand';
    const bios = ['', french ? 'À découvrir : ' : 'Explore ', french ? 'Ici, on parle de ' : 'A place for '].map(prefix => shortenText([prefix + subject, forAudience, cta.trim()].filter(Boolean).join('\n'), 150));
    drafts = bios.map((bio, index) => `${french ? 'Nom' : 'Name'}: ${name}\n${french ? 'Idée de pseudo' : 'Handle idea'}: @${base}${['', '_studio', '_daily'][index]}\nBio: ${bio}`);
  } else if (kind === 'bio') {
    const suffix = [forAudience, cta.trim()].filter(Boolean).join('\n');
    const prefixes = french ? ['', 'À découvrir : ', 'Ici, on parle de ' ] : ['', 'Explore ', 'A place for '];
    drafts = prefixes.map(prefix => {
      const room = Math.max(20, 150 - textLength(suffix) - (suffix ? 1 : 0));
      return [shortenText(prefix + subject, room), suffix].filter(Boolean).join('\n');
    });
  } else if (kind === 'description') {
    const keywordsLine = keywords.trim() ? `${french ? 'Au programme' : 'Topics covered'}: ${keywords.trim()}` : '';
    const linksLine = links.trim() ? `${french ? 'Liens utiles' : 'Useful links'}:\n${links.trim()}` : '';
    drafts = (french ? [subject + '.', `Dans cette vidéo : ${subject}.`, `Découvrez ${subject}.`] : [subject + '.', `In this video: ${subject}.`, `Take a closer look at ${subject}.`]).map(line => join([line, forAudience, keywordsLine, cta.trim(), linksLine]));
  } else if (kind === 'linkedin') {
    drafts = (french ? [subject + '.', `Une réflexion sur ${subject}.`, `Parlons de ${subject}.`] : [subject + '.', `A perspective on ${subject}.`, `Let's talk about ${subject}.`]).map(line => join([line, forAudience, cta.trim()]));
  } else {
    drafts = [`À découvrir : ${subject}.`, `Parlons de ${subject}.`, `Un aperçu de ${subject}.`].map(line => join([line, forAudience, cta.trim(), data.hashtags?.trim()]));
  }
  return drafts.map(text => shortenText(text, WRITING_LIMITS[kind] || 600));
}

export function characterStats(text) {
  return {
    characters: textLength(text),
    withoutWhitespace: textLength(text.replace(/\s/gu, '')),
    visibleCharacters: [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)].length,
    words: [...new Intl.Segmenter(undefined, { granularity: 'word' }).segment(text)].filter(part => part.isWordLike).length,
    lines: text ? text.split(/\r\n|\r|\n/).length : 0,
  };
}

const count = value => value === '' ? 0 : Number(value);
export function engagementRate({ audience, likes = '', comments = '', shares = '', saves = '', clicks = '' }) {
  const denominator = Number(audience), values = [likes, comments, shares, saves, clicks].map(count);
  if (!Number.isSafeInteger(denominator) || denominator <= 0) throw new Error('Enter an audience count greater than zero.');
  if (values.some(value => !Number.isSafeInteger(value) || value < 0)) throw new Error('Use whole, non-negative interaction counts.');
  const engagements = values.reduce((sum, value) => sum + value, 0);
  if (!Number.isSafeInteger(engagements)) throw new Error('These counts are too large to calculate accurately.');
  return { engagements, audience: denominator, rate: engagements / denominator * 100 };
}

export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export function rankPostingTimes(rows) {
  const entries = rows.filter(row => row.time || row.engagements || row.reach);
  if (entries.length < 3) throw new Error('Add results for at least three posts to compare posting times.');
  const groups = new Map();
  for (const row of entries) {
    if (!WEEKDAYS.includes(row.day) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(row.time)) throw new Error('Choose a day and valid posting time for every completed row.');
    const { engagements, audience: reach } = engagementRate({ audience: row.reach, likes: row.engagements });
    const hour = `${row.time.slice(0, 2)}:00`;
    const key = `${row.day} ${hour}`;
    const group = groups.get(key) || { day: row.day, time: hour, posts: 0, engagements: 0, reach: 0 };
    group.posts++; group.engagements += engagements; group.reach += reach;
    if (!Number.isSafeInteger(group.engagements) || !Number.isSafeInteger(group.reach)) throw new Error('These counts are too large to compare accurately.');
    groups.set(key, group);
  }
  if (groups.size < 2) throw new Error('Include at least two different day or hour windows to compare.');
  return [...groups.values()].map(group => ({ ...group, rate: group.engagements / group.reach * 100 })).sort((a, b) => b.rate - a.rate || b.posts - a.posts || WEEKDAYS.indexOf(a.day) - WEEKDAYS.indexOf(b.day) || a.time.localeCompare(b.time));
}
