import { useState } from 'react';
import { textLength } from '../../../shared/freeTools.js';
import { characterStats, engagementRate, rankPostingTimes, WEEKDAYS, writingIdeas, WRITING_LIMITS, WRITING_PLATFORMS } from '../../../shared/writingTools.js';
import { CopyButton, Field, requestTool } from './freeToolUi.jsx';

const configs = {
  hashtags: { topic: 'What is your post about?', placeholder: 'A balcony herb garden with basil and mint', action: 'Generate hashtags', result: 'Your hashtag ideas', platform: 'Instagram' },
  captions: { topic: 'What is your post about?', placeholder: 'A behind-the-scenes look at our new studio opening', action: 'Generate captions', result: 'Caption drafts', platform: 'Instagram', item: 'Caption' },
  bio: { topic: 'About you or your brand', placeholder: 'A ceramic artist in Douala making small batches of everyday tableware', action: 'Generate bios', result: 'Bio drafts', platform: 'Instagram', item: 'Bio' },
  description: { topic: 'What does your video cover?', placeholder: 'How to plan a week of social posts, from choosing topics to scheduling each account', action: 'Generate descriptions', result: 'Description drafts', platform: 'YouTube', item: 'Description' },
  linkedin: { topic: 'What would you like to share?', placeholder: 'A lesson from launching our studio: preparing the content before opening day helped us stay focused', action: 'Generate posts', result: 'Post drafts', platform: 'LinkedIn', item: 'Post' },
};

export function WritingGenerator({ kind }) {
  const config = configs[kind];
  const [values, setValues] = useState({ topic: '', platform: config.platform, language: 'English', tone: kind === 'linkedin' ? 'Professional' : 'Helpful', audience: '', cta: '', keywords: '', links: '' });
  const [items, setItems] = useState([]), [source, setSource] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const update = key => e => { setValues({ ...values, [key]: e.target.value }); setItems([]); setSource(''); setError(''); };
  async function generate(e) {
    e.preventDefault(); setError(''); setItems([]); setSource('');
    if (values.topic.trim().length < 3) { setError('Add a more specific description, with at least three characters.'); return; }
    setBusy(true);
    const input = { kind, ...values };
    let result, nextSource;
    try {
      const data = await requestTool('generate', input);
      if (!Array.isArray(data.items) || !data.items.length || !data.items.every(item => typeof item === 'string')) throw new Error();
      result = data.items; nextSource = data.source === 'ai' ? 'ai' : kind === 'hashtags' ? 'keywords' : 'template';
    } catch { result = writingIdeas(input); nextSource = kind === 'hashtags' ? 'keywords' : 'template'; }
    if (result.length) { setItems(kind === 'hashtags' ? [result.join(' ')] : result); setSource(nextSource); }
    else setError('Add words that describe the subject so we can suggest relevant ideas.');
    setBusy(false);
  }
  const limit = WRITING_LIMITS[kind];
  return <div className="ft-workbench"><form onSubmit={generate}><fieldset className="ft-controls" disabled={busy}>
    {['captions', 'hashtags'].includes(kind) && <Field label="Platform">{id => <select id={id} value={values.platform} onChange={update('platform')}>{WRITING_PLATFORMS.map(platform => <option key={platform}>{platform}</option>)}</select>}</Field>}
    <Field label={config.topic}>{id => <textarea id={id} rows={4} placeholder={config.placeholder} value={values.topic} onChange={update('topic')} maxLength={1200} required />}</Field>
    <div className="ft-two-fields"><Field label="Language">{id => <select id={id} value={values.language} onChange={update('language')}><option>English</option><option>French</option></select>}</Field>{kind !== 'hashtags' && <Field label="Tone">{id => <select id={id} value={values.tone} onChange={update('tone')}>{['Helpful','Playful','Professional','Curious'].map(tone => <option key={tone}>{tone}</option>)}</select>}</Field>}</div>
    {kind !== 'hashtags' && <Field label="Audience (optional)" placeholder="Who you want to reach" value={values.audience} onChange={update('audience')} maxLength={120} />}
    {['hashtags', 'description', 'captions'].includes(kind) && <Field label="Key phrases (optional)" placeholder="Separate phrases with commas" value={values.keywords} onChange={update('keywords')} maxLength={400} />}
    {kind !== 'hashtags' && <Field label="Call to action (optional)" placeholder={kind === 'bio' ? 'Explore the latest collection' : 'What has worked for you?'} value={values.cta} onChange={update('cta')} maxLength={kind === 'bio' ? 80 : 160} />}
    {kind === 'description' && <Field label="Useful links (optional)" hint="Include only links you want in the description. Check them before posting.">{id => <textarea id={id} rows={3} value={values.links} onChange={update('links')} placeholder="Studio website: https://example.com" maxLength={600} />}</Field>}
    <button className="ft-button" type="submit">{busy ? 'Creating ideas…' : config.action}</button>
    {error && <p className="ft-error" role="alert">{error}</p>}
    <p className="ft-hint">Your brief is sent for AI suggestions. Review the wording before using it. This tool creates text; it does not publish.</p>
  </fieldset></form><div className="ft-result" aria-busy={busy}><h2>{config.result}</h2><p className="ft-hint" role="status">{source === 'ai' ? 'AI-generated ideas. Review and make the wording yours.' : source === 'keywords' ? 'Keyword-based ideas. AI is currently unavailable; these were built from your inputs.' : source === 'template' ? 'Template ideas. AI is currently unavailable; these were built from your inputs.' : 'Your editable suggestions will appear here.'}</p>
    {items.map((item, index) => <div className="ft-caption" key={index}><Field label={kind === 'hashtags' ? 'Editable hashtags' : `${config.item} ${index + 1}`}>{id => <textarea id={id} rows={kind === 'bio' ? 4 : 7} value={item} onChange={e => setItems(items.map((value, i) => i === index ? e.target.value : value))} />}</Field><div className="ft-inline"><small className={limit && textLength(item) > limit ? 'ft-error' : ''}>{textLength(item)} characters{limit ? ` / ${limit} working limit` : ''}</small><CopyButton text={item} label={kind === 'hashtags' ? 'Copy hashtags' : `Copy ${config.item.toLowerCase()}`} disabled={Boolean(limit && textLength(item) > limit)} /></div>{limit && textLength(item) > limit && <p className="ft-error" role="alert">Shorten this draft before copying it.</p>}</div>)}
  </div></div>;
}

export function CharacterCounter() {
  const [text, setText] = useState(''), [limit, setLimit] = useState('');
  const stats = characterStats(text), maximum = Number(limit);
  const over = maximum > 0 && stats.characters > maximum;
  return <div className="ft-workbench"><div className="ft-controls"><Field label="Your text">{id => <textarea id={id} rows={12} placeholder="Paste or write your post here…" value={text} onChange={e => setText(e.target.value)} maxLength={100000} />}</Field><Field label="Working character limit (optional)" type="number" min="1" max="100000" step="1" value={limit} onChange={e => setLimit(e.target.value)} placeholder="For example, 3000" /><div className="ft-inline"><CopyButton text={text} label="Copy text" /><button className="ft-text-button" type="button" onClick={() => setText('')} disabled={!text}>Clear text</button></div></div><div className="ft-result"><h2>Your text at a glance</h2><dl className="ft-definition-list" aria-live="polite">{[['Characters with whitespace',stats.characters],['Characters without whitespace',stats.withoutWhitespace],['Visible characters',stats.visibleCharacters],['Words',stats.words],['Lines',stats.lines]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value.toLocaleString()}</dd></div>)}</dl>{maximum > 0 && <p role="status" className={over ? 'ft-error' : ''}>{over ? `${stats.characters - maximum} characters over your working limit.` : `${maximum - stats.characters} characters remaining.`}</p>}<p className="ft-hint">Combined emoji may contain several Unicode characters. Platform counts can also treat links differently. Nothing is uploaded.</p></div></div>;
}

export function EngagementCalculator() {
  const [values, setValues] = useState({ audience: '', likes: '', comments: '', shares: '', saves: '', clicks: '' });
  const [basis, setBasis] = useState('Reach'), [attempted, setAttempted] = useState(false);
  let result, error;
  try { result = engagementRate(values); } catch (e) { error = e.message; }
  const update = key => e => setValues({ ...values, [key]: e.target.value });
  const output = result ? `Engagement rate by ${basis.toLowerCase()}: ${result.rate.toFixed(2)}%\n${result.engagements} interactions / ${result.audience} ${basis.toLowerCase()} × 100` : '';
  return <div className="ft-workbench"><form className="ft-controls" onSubmit={e => { e.preventDefault(); setAttempted(true); }}><Field label="Audience measure">{id => <select id={id} value={basis} onChange={e => { setBasis(e.target.value); setValues({ ...values, audience: '' }); setAttempted(false); }}>{['Reach', 'Followers', 'Impressions', 'Views'].map(value => <option key={value}>{value}</option>)}</select>}</Field><Field label={`${basis} for this post`} type="number" min="1" step="1" required value={values.audience} onChange={update('audience')} placeholder="1000" /><div className="ft-two-fields">{['likes','comments','shares','saves','clicks'].map(key => <Field key={key} label={key[0].toUpperCase() + key.slice(1)} type="number" min="0" step="1" placeholder="0" value={values[key]} onChange={update(key)} />)}</div><button className="ft-button" type="submit">Calculate rate</button>{attempted && error && <p role="alert" className="ft-error">{error}</p>}<p className="ft-hint">Use metrics from one post and the same reporting period. Leave unavailable interaction counts at zero.</p></form><div className="ft-result"><h2>Engagement rate by {basis.toLowerCase()}</h2><output className="ft-stat-number" aria-live="polite">{result ? `${result.rate.toFixed(2)}%` : '—'}</output><p>{result ? `${result.engagements.toLocaleString()} interactions ÷ ${result.audience.toLocaleString()} ${basis.toLowerCase()} × 100` : 'Add an audience count to see the result.'}</p><CopyButton text={output} label="Copy result" /><p className="ft-hint">Interactions are events, so the result can exceed 100%. This is your calculated rate, with no industry benchmark or account lookup.</p></div></div>;
}

const emptyPost = day => ({ day, time: '', engagements: '', reach: '' });
export function PostingTimeFinder() {
  const [platform, setPlatform] = useState('Instagram'), [zone, setZone] = useState('UTC');
  const [rows, setRows] = useState(WEEKDAYS.slice(0, 3).map(emptyPost)), [results, setResults] = useState([]), [error, setError] = useState('');
  const update = (index, key) => e => { setRows(rows.map((row, i) => i === index ? { ...row, [key]: e.target.value } : row)); setResults([]); setError(''); };
  function compare(e) {
    e.preventDefault(); setResults([]); setError('');
    try {
      if (!zone.trim()) throw new Error('Enter the time zone used for these posting times.');
      try { new Intl.DateTimeFormat('en', { timeZone: zone.trim() }); } catch { throw new Error('Use a valid IANA time zone, such as Africa/Douala or Europe/Paris.'); }
      setResults(rankPostingTimes(rows));
    } catch (e) { setError(e.message); }
  }
  const schedule = results.length ? `${platform}: strongest observed posting windows (${zone.trim()})\n${results.slice(0, 3).map(row => `${row.day}, ${row.time}–${row.time.slice(0,2)}:59 — ${row.rate.toFixed(2)}% engagement by reach, ${row.posts} post(s)`).join('\n')}\nBased only on entered results. Test these windows with comparable content.` : '';
  return <div className="ft-workbench"><form className="ft-controls" onSubmit={compare}><Field label="Platform">{id => <select id={id} value={platform} onChange={e => { setPlatform(e.target.value); setRows(WEEKDAYS.slice(0,3).map(emptyPost)); setResults([]); setError(''); }}>{WRITING_PLATFORMS.map(value => <option key={value}>{value}</option>)}</select>}</Field><Field label="Time zone used for your post times" value={zone} onChange={e => { setZone(e.target.value); setResults([]); }} maxLength={64} placeholder="Africa/Douala" required hint="Enter all times in this zone. The tool does not convert them." /><p className="ft-hint">Use one account and a comparable period. Add at least three posts across two or more day-and-hour windows.</p>
    {rows.map((row, index) => <fieldset className="ft-history-row" key={index}><legend>Post {index + 1}</legend><div className="ft-two-fields"><Field label={`Day for post ${index + 1}`}>{id => <select id={id} value={row.day} onChange={update(index, 'day')}>{WEEKDAYS.map(day => <option key={day}>{day}</option>)}</select>}</Field><Field label={`Time for post ${index + 1}`} type="time" value={row.time} onChange={update(index,'time')} /></div><div className="ft-two-fields"><Field label={`Engagements for post ${index + 1}`} type="number" min="0" step="1" placeholder="0" value={row.engagements} onChange={update(index,'engagements')} /><Field label={`Reach for post ${index + 1}`} type="number" min="1" step="1" placeholder="1000" value={row.reach} onChange={update(index,'reach')} /></div>{rows.length > 3 && <button className="ft-text-button" type="button" onClick={() => { setRows(rows.filter((_, i) => i !== index)); setResults([]); }}>Remove post {index + 1}</button>}</fieldset>)}
    <button type="button" className="ft-button secondary" disabled={rows.length >= 30} onClick={() => { setRows([...rows, emptyPost('Monday')]); setResults([]); }}>Add another post</button><button type="submit" className="ft-button">Compare posting times</button>{error && <p role="alert" className="ft-error">{error}</p>}
  </form><div className="ft-result"><h2>Your strongest observed windows</h2><p className="ft-hint" role="status">{results.length ? `Results for ${platform}, in ${zone.trim()}. Ranked by total engagements ÷ total reach within each weekday and hour.` : 'Enter your results to compare posting windows.'}</p>{results.map(row => <div className="ft-caption" key={row.day + row.time}><h3>{row.day}, {row.time}–{row.time.slice(0,2)}:59</h3><p><strong>{row.rate.toFixed(2)}%</strong> engagement by reach</p><p className="ft-hint">{row.posts} post{row.posts === 1 ? '' : 's'} · {row.engagements} interactions · {row.reach} reach{row.posts === 1 ? '. One post is a small sample; keep testing.' : '.'}</p></div>)}<CopyButton text={schedule} label="Copy schedule to test" /><p className="ft-hint">Content, audience and reporting windows affect the result. Past performance does not establish a universal best time. Calculations stay in your browser.</p></div></div>;
}
