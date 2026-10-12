import { useRef, useState } from 'react';
import { textLength } from '../../../shared/freeTools.js';
import { ACCOUNT_TYPES, GENERATOR_LANGUAGES, NAME_PLATFORMS, SOCIAL_CATEGORIES, SOCIAL_TONES, normalizeHashtags, parseSocialGeneration, socialFallback, socialGenerationSpec, suggestedHandle } from '../../../shared/socialGenerators.js';
import { CopyButton, Field, requestTool } from './freeToolUi.jsx';

const initialValues = { topic: '', brand: '', keywords: '', audience: '', schedule: '', cta: 'Subscribe for more.', tone: 'Helpful', accountType: 'Creator', category: 'Other', language: 'English' };

function SelectField({ label, value, options, onChange }) {
  return <Field label={label}>{id => <select id={id} value={value} onChange={onChange}>{options.map(option => <option key={option}>{option}</option>)}</select>}</Field>;
}

function useGeneration(initial) {
  const [values, setValues] = useState(initial);
  const [items, setItems] = useState([]), [source, setSource] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const variation = useRef(0);
  const update = key => event => {
    setValues(current => ({ ...current, [key]: event.target.value })); setItems([]); setSource(''); setError(''); variation.current = 0;
  };
  async function generate(event) {
    event.preventDefault(); setError('');
    let input;
    try { input = parseSocialGeneration({ ...values, count: Number(values.count), variation: variation.current }); }
    catch (failure) { setError(failure.message); return; }
    setBusy(true);
    try {
      const response = await requestTool('generate', input);
      const spec = socialGenerationSpec(input);
      if (!Array.isArray(response.items)) throw new Error('Missing suggestions');
      const normalized = spec.normalize(response.items);
      if (!normalized.length) throw new Error('Empty suggestions');
      setItems(normalized); setSource(response.source === 'ai' ? 'ai' : 'local');
    } catch {
      setItems(socialFallback(input).items); setSource('local');
    } finally { setBusy(false); variation.current = (variation.current + 1) % 51; }
  }
  return { values, items, setItems, source, error, busy, update, generate };
}

function GenerationNote({ source, kind, language, count }) {
  let message = 'Add a topic to get suggestions you can review and copy.';
  if (source === 'ai') message = `${count} AI-generated ${kind}. Review the wording before using it.`;
  if (source === 'local') message = kind === 'descriptions'
    ? `${count} template drafts. AI is unavailable, so these use English templates and your original wording.`
    : `${count} keyword-based ${kind}. AI is unavailable, so these are built from your inputs.${language && language !== 'English' ? ' Local suggestions keep the language of your words; they do not translate.' : ''}`;
  return <p className="ft-hint" role="status">{message}</p>;
}

export function NameGenerator({ platform, channelNames = false }) {
  const { values, items, source, error, busy, update, generate } = useGeneration({ ...initialValues, kind: 'names', platform: platform || 'instagram', nameFormat: channelNames ? 'channel' : 'handle' });
  const network = NAME_PLATFORMS[values.platform];
  return <div className="ft-workbench"><form onSubmit={generate}><fieldset className="ft-controls" disabled={busy}>
    {!platform && <Field label="Platform">{id => <select id={id} value={values.platform} onChange={update('platform')}>{Object.entries(NAME_PLATFORMS).map(([value, option]) => <option key={value} value={value}>{option.label}</option>)}</select>}</Field>}
    <Field label={channelNames ? 'Channel name or words to include (optional)' : 'Your name or brand (optional)'} value={values.brand} onChange={update('brand')} placeholder="Cedar Studio" maxLength={60} />
    <Field label={channelNames ? 'What will your channel cover?' : 'What is your account about?'} hint={`${values.topic.length} / 600 characters`}>{id => <textarea id={id} value={values.topic} onChange={update('topic')} placeholder="Beginner pottery tutorials, wheel throwing, and handmade ceramics" required minLength={3} maxLength={600} rows={4} />}</Field>
    <div className="ft-two-fields"><SelectField label="Account type" value={values.accountType} onChange={update('accountType')} options={ACCOUNT_TYPES} /><SelectField label="Tone" value={values.tone} onChange={update('tone')} options={SOCIAL_TONES} /></div>
    <SelectField label="Category" value={values.category} onChange={update('category')} options={SOCIAL_CATEGORIES} />
    <button type="submit" className="ft-button">{busy ? 'Finding name ideas…' : items.length ? 'Generate more names' : 'Generate names'}</button>
    {error && <p role="alert" className="ft-error">{error}</p>}
    <p className="ft-hint">Your inputs are sent for AI suggestions. Every name is an idea; availability has not been checked.</p>
  </fieldset></form><div className="ft-result" aria-busy={busy}>
    <h2>{channelNames ? 'Channel name ideas' : `${network.label} handle ideas`}</h2>
    <GenerationNote source={source} kind="name ideas" count={items.length} />
    {!channelNames && <p className="ft-hint">Suggestions use up to {network.maximum} letters, numbers, periods, or underscores. Confirm the name in {network.label} before claiming it.</p>}
    {Boolean(items.length) && <CopyButton text={items.map(item => channelNames ? item : `@${item}`).join('\n')} label="Copy all names" />}
    <ul className="ft-name-results">{items.map(item => {
      const handle = channelNames ? suggestedHandle(item, 'youtube') : '';
      return <li key={item}><div className="ft-inline"><div><strong>{channelNames ? item : `@${item}`}</strong><small>{textLength(item)} characters</small></div><CopyButton text={item} label={channelNames ? 'Copy name' : 'Copy handle'} /></div>
        {handle && <div className="ft-inline ft-name-handle"><span>Handle idea: @{handle}</span><CopyButton text={handle} label="Copy handle" /></div>}
      </li>;
    })}</ul>
    {channelNames && <p className="ft-hint">A channel name and an @handle are separate. Handle ideas are simplified versions of each name; YouTube must confirm availability.</p>}
    {platform === 'instagram' && <p className="ft-hint"><a href="/tools/instagram-handle-checker/">Check a suggested Instagram handle ↗</a></p>}
    {platform === 'tiktok' && <p className="ft-hint"><a href="/tools/tiktok-username-checker/">Check a suggested TikTok handle ↗</a></p>}
  </div></div>;
}

export function InstagramHashtagGenerator() {
  const { values, items, setItems, source, error, busy, update, generate } = useGeneration({ ...initialValues, kind: 'instagram-hashtags', count: '5' });
  const output = items.join(' ');
  const hashtags = normalizeHashtags(items, 100);
  return <div className="ft-workbench"><form onSubmit={generate}><fieldset className="ft-controls" disabled={busy}>
    <Field label="Describe your photo, Reel, or post" hint={`${values.topic.length} / 600 characters`}>{id => <textarea id={id} value={values.topic} onChange={update('topic')} placeholder="A ceramic mug being thrown on a pottery wheel in my home studio" rows={5} required minLength={3} maxLength={600} />}</Field>
    <Field label="Keywords (optional)" hint="Separate phrases with commas. Include a location only when it is relevant." value={values.keywords} onChange={update('keywords')} placeholder="wheel thrown pottery, handmade mug, ceramics" maxLength={400} />
    <div className="ft-two-fields"><SelectField label="Language" value={values.language} onChange={update('language')} options={GENERATOR_LANGUAGES} /><SelectField label="Number of ideas" value={values.count} onChange={update('count')} options={['5', '10', '15']} /></div>
    <button type="submit" className="ft-button">{busy ? 'Finding hashtag ideas…' : 'Generate hashtags'}</button>
    {error && <p role="alert" className="ft-error">{error}</p>}
    <p className="ft-hint">Your description and keywords are sent for AI suggestions. These are topic ideas, without live popularity or volume data.</p>
  </fieldset></form><div className="ft-result" aria-busy={busy}><h2>Your hashtag ideas</h2>
    <GenerationNote source={source} kind="hashtag ideas" language={values.language} count={hashtags.length} />
    <Field label="Edit your hashtags" hint="Remove any tag that does not describe your post.">{id => <textarea id={id} rows={7} value={output} onChange={event => setItems([event.target.value])} maxLength={1500} />}</Field>
    <p className="ft-hint">{hashtags.length} hashtags · {textLength(output)} characters. Choose a focused set that fits the limits shown in Instagram.</p>
    <div className="ft-inline"><CopyButton text={hashtags.join(' ')} label="Copy hashtags" /><button type="button" className="ft-text-button" disabled={!output} onClick={() => setItems(hashtags)}>Remove duplicates and clean up</button></div>
  </div></div>;
}

export function YouTubeChannelDescriptionGenerator() {
  const { values, items, setItems, source, error, busy, update, generate } = useGeneration({ ...initialValues, kind: 'channel-description' });
  return <div className="ft-workbench"><form onSubmit={generate}><fieldset className="ft-controls" disabled={busy}>
    <Field label="Channel name (optional)" value={values.brand} onChange={update('brand')} placeholder="Cedar Studio" maxLength={60} />
    <Field label="What can viewers expect from your channel?" hint={`${values.topic.length} / 600 characters`}>{id => <textarea id={id} value={values.topic} onChange={update('topic')} placeholder="Beginner pottery tutorials, wheel throwing, and a look inside my home ceramics studio" rows={4} required minLength={3} maxLength={600} />}</Field>
    <div className="ft-two-fields"><SelectField label="Account type" value={values.accountType} onChange={update('accountType')} options={ACCOUNT_TYPES} /><SelectField label="Tone" value={values.tone} onChange={update('tone')} options={SOCIAL_TONES} /></div>
    <Field label="Audience (optional)" value={values.audience} onChange={update('audience')} placeholder="People trying pottery for the first time" maxLength={120} />
    <Field label="Topics or keywords (optional)" value={values.keywords} onChange={update('keywords')} placeholder="pottery tutorials, ceramics, handmade mugs" maxLength={400} />
    <details className="ft-options"><summary>Language, category, and channel details</summary>
      <SelectField label="Language" value={values.language} onChange={update('language')} options={GENERATOR_LANGUAGES} />
      <SelectField label="Category" value={values.category} onChange={update('category')} options={SOCIAL_CATEGORIES} />
      <Field label="Publishing schedule (optional)" hint="Add only a schedule you actually plan to follow." value={values.schedule} onChange={update('schedule')} placeholder="Every other Sunday" maxLength={100} />
      <Field label="Call to action (optional)" value={values.cta} onChange={update('cta')} placeholder="Subscribe for more." maxLength={160} />
    </details>
    <button type="submit" className="ft-button">{busy ? 'Writing channel descriptions…' : 'Generate descriptions'}</button>
    {error && <p role="alert" className="ft-error">{error}</p>}
    <p className="ft-hint">Your inputs are sent for AI generation. Review the details and make each draft sound like you.</p>
  </fieldset></form><div className="ft-result" aria-busy={busy}><h2>Channel description drafts</h2>
    <GenerationNote source={source} kind="descriptions" language={values.language} count={items.length} />
    {items.map((description, index) => <div className="ft-caption" key={index}>
      <Field label={`Description ${index + 1}`}>{id => <textarea className="ft-description-editor" id={id} rows={9} value={description} maxLength={1600} onChange={event => setItems(current => current.map((item, position) => position === index ? event.target.value : item))} />}</Field>
      <div className="ft-inline"><small className={textLength(description) > 1000 ? 'ft-error' : ''}>{textLength(description)} / 1,000 characters{textLength(description) > 1000 ? ' · Shorten before copying.' : ''}</small><CopyButton text={description} label="Copy description" disabled={textLength(description) > 1000} /></div>
    </div>)}
    <p className="ft-hint">Use these in your channel’s About section. Add links through YouTube’s channel settings and check the final preview.</p>
  </div></div>;
}
