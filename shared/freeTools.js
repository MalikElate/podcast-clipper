export const textLength = (text) => Array.from(text).length;

export function buildUtm({ url, source, medium, campaign, term = '', content = '', id = '' }) {
  let parsed;
  try { parsed = new URL(url.trim()); } catch { throw new Error('Enter a complete URL starting with https:// or http://.'); }
  if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error('Use a public http:// or https:// URL without login credentials.');
  if (![source, medium, campaign].every(value => value.trim())) throw new Error('Add a source, medium, and campaign name.');
  for (const [key, value] of Object.entries({ source, medium, campaign, term, content, id })) {
    parsed.searchParams.delete(`utm_${key}`);
    if (value.trim()) parsed.searchParams.set(`utm_${key}`, value.trim());
  }
  return parsed.href;
}

export function validateHandle(input, platform) {
  if (!['instagram', 'tiktok'].includes(platform)) throw new Error('Choose Instagram or TikTok.');
  let handle = String(input || '').trim().replace(/^@/, '');
  if (/^(https?:\/\/|www\.|instagram\.com\/|tiktok\.com\/)/i.test(handle)) {
    let url;
    try { url = new URL(/^https?:\/\//i.test(handle) ? handle : `https://${handle}`); } catch { throw new Error('Enter a handle or a complete profile link.'); }
    if (url.protocol !== 'https:' || ![`${platform}.com`, `www.${platform}.com`].includes(url.hostname) || url.username || url.password || url.port) throw new Error(`Use a ${platform === 'tiktok' ? 'TikTok' : 'Instagram'} profile link.`);
    const match = url.pathname.match(platform === 'tiktok' ? /^\/@([\w.]+)\/?$/ : /^\/([\w.]+)\/?$/);
    if (!match || (platform === 'instagram' && ['p', 'reel', 'reels', 'stories', 'explore', 'accounts'].includes(match[1]))) throw new Error('Use a profile link, not a post or video link.');
    handle = match[1];
  }
  const maximum = platform === 'instagram' ? 30 : 24;
  if (!/^[a-zA-Z0-9_.]+$/.test(handle) || handle.length > maximum) throw new Error(`Use up to ${maximum} letters, numbers, underscores, or periods, without spaces.`);
  if (handle.endsWith('.') || (platform === 'instagram' && (handle.startsWith('.') || handle.includes('..')))) throw new Error(platform === 'instagram' ? 'Do not start or end with a period, or use consecutive periods.' : 'TikTok usernames cannot end with a period.');
  handle = handle.toLowerCase();
  return { handle, platform, url: platform === 'tiktok' ? `https://www.tiktok.com/@${handle}` : `https://www.instagram.com/${handle}/` };
}

export function handleIdeas(handle, platform) {
  const max = platform === 'instagram' ? 30 : 24;
  const base = handle.replace(/[._]+$/g, '').slice(0, max - 8);
  return [`${base}.studio`, `hello.${base}`, `${base}_hq`, `${base}.daily`];
}

const styles = {
  bold: [0x1d400, 0x1d41a, 0x1d7ce],
  italic: [0x1d434, 0x1d44e, null],
  'bold-italic': [0x1d468, 0x1d482, null],
  monospace: [0x1d670, 0x1d68a, 0x1d7f6],
};
const plainMap = new Map();
for (const ranges of Object.values(styles)) for (let group = 0; group < 3; group++) {
  if (!ranges[group]) continue;
  for (let i = 0; i < (group === 2 ? 10 : 26); i++) plainMap.set(String.fromCodePoint(ranges[group] + i), String.fromCharCode([65, 97, 48][group] + i));
}
plainMap.set('ℎ', 'h');
export function plainText(text) { return Array.from(text).map(char => plainMap.get(char) || char).join('').replace(/\u0332/g, ''); }
export function formatText(text, style) {
  const plain = plainText(text);
  if (style === 'plain') return plain;
  if (style === 'underline') return Array.from(plain).map(char => /\s/.test(char) ? char : `${char}\u0332`).join('');
  const ranges = styles[style];
  if (!ranges) return plain;
  return Array.from(plain).map(char => {
    const code = char.codePointAt(0);
    if (style === 'italic' && char === 'h') return 'ℎ';
    for (let group = 0; group < 3; group++) {
      const start = [65, 97, 48][group];
      if (ranges[group] && code >= start && code < start + (group === 2 ? 10 : 26)) return String.fromCodePoint(ranges[group] + code - start);
    }
    return char;
  }).join('');
}

export function checkTitle(title, keyword = '') {
  const length = textLength(title);
  const issues = [];
  if (!title.trim()) issues.push('Add a title to check it.');
  if (length > 100) issues.push(`Remove at least ${length - 100} characters to meet the 100-character limit.`);
  if (/[<>]/.test(title)) issues.push('YouTube does not allow < or > in video titles.');
  if (title.trim() && length < 20) issues.push('Consider adding the specific subject or payoff so viewers know what to expect.');
  if (length > 60) issues.push('Put the important words first. Longer titles may be shortened in some feeds.');
  if (keyword.trim() && !title.toLowerCase().includes(keyword.trim().toLowerCase())) issues.push('Your target phrase is missing. Add it naturally if it describes the video.');
  if (/[a-zA-Z]/.test(title) && title === title.toUpperCase()) issues.push('Consider sentence case for easier reading.');
  return { length, valid: Boolean(title.trim()) && length <= 100 && !/[<>]/.test(title), issues };
}

export function tagCost(tags) {
  return tags.reduce((total, tag) => total + textLength(tag) + (/\s/.test(tag) ? 2 : 0), Math.max(0, tags.length - 1));
}
export function fitTags(values, limit = 500) {
  const tags = [];
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const tag = value.replace(/[#<>"\r\n,]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
    if (tag && !tags.some(item => item.toLowerCase() === tag.toLowerCase()) && tagCost([...tags, tag]) <= limit) tags.push(tag);
    if (tags.length === 20) break;
  }
  return tags;
}

const stopWords = new Set('a an and are as at be by for from how i in is it of on or our that the their this to we what with you your'.split(' '));
export function suggestTags(topic, keywords = '') {
  const words = topic.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}'-]*/gu) || [];
  const phrases = [];
  for (let i = 0; i < words.length - 1; i++) if (!stopWords.has(words[i]) && !stopWords.has(words[i + 1])) phrases.push(`${words[i]} ${words[i + 1]}`);
  return fitTags([...keywords.split(','), words.slice(0, 8).join(' '), ...phrases, ...words.filter(word => word.length > 2 && !stopWords.has(word))]);
}

export function captionIdeas({ topic, tone = 'Helpful', audience = '', cta = '', hashtags = '' }) {
  const subject = topic.trim().replace(/[.!?]+$/, '');
  const openings = {
    Helpful: [`A closer look at ${subject}.`, `Let's make ${subject} a little easier.`, `${subject}: the details worth saving.`],
    Playful: [`Today's plot twist: ${subject}.`, `${subject} has entered the chat.`, `Consider this your sign to explore ${subject}.`],
    Professional: [`A practical perspective on ${subject}.`, `What to consider about ${subject}.`, `Making time for ${subject}.`],
    Curious: [`What would you change about ${subject}?`, `Let's talk about ${subject}.`, `Have you tried ${subject}?`],
  };
  const tags = (hashtags.match(/#?[\p{L}\p{N}_]+/gu) || []).slice(0, 5).map(tag => `#${tag.replace(/^#/, '')}`).join(' ');
  return (openings[tone] || openings.Helpful).map(line => [line, audience.trim() ? `For ${audience.trim()}.` : '', cta.trim(), tags].filter(Boolean).join('\n\n'));
}

// One continuous source rectangle means neighboring slices share exact edges.
export function cropRectangle(sourceWidth, sourceHeight, outputWidth, outputHeight, zoom = 1, x = 50, y = 50) {
  if (![sourceWidth, sourceHeight, outputWidth, outputHeight].every(n => Number.isFinite(n) && n > 0)) throw new Error('Image dimensions must be positive.');
  const scale = Math.max(outputWidth / sourceWidth, outputHeight / sourceHeight) * Math.max(1, zoom);
  const width = outputWidth / scale, height = outputHeight / scale;
  return { x: (sourceWidth - width) * Math.max(0, Math.min(100, x)) / 100, y: (sourceHeight - height) * Math.max(0, Math.min(100, y)) / 100, width, height };
}

export function sliceRectangles(crop, columns, rows) {
  return Array.from({ length: columns * rows }, (_, i) => ({ x: crop.x + (i % columns) * crop.width / columns, y: crop.y + Math.floor(i / columns) * crop.height / rows, width: crop.width / columns, height: crop.height / rows }));
}
