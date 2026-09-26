import { useRef, useState } from 'react';
import { buildUtm, captionIdeas, checkTitle, fitTags, formatText, handleIdeas, suggestTags, tagCost, textLength, validateHandle } from '../../../shared/freeTools.js';
import { CopyButton, Field, requestTool, useLocalImage } from './freeToolUi.jsx';

export function UtmBuilder() {
  const [values, setValues] = useState({ url: '', source: 'instagram', medium: 'social', campaign: '', term: '', content: '', id: '' });
  const [attempted, setAttempted] = useState(false);
  const update = key => e => setValues({ ...values, [key]: e.target.value });
  let output = '', error = '';
  try { output = buildUtm(values); } catch (e) { error = e.message; }
  return <div className="ft-workbench"><form className="ft-controls" onSubmit={e => { e.preventDefault(); setAttempted(true); }}>
    <Field label="Destination URL" type="url" placeholder="https://example.com/launch" value={values.url} onChange={update('url')} required maxLength={4000} />
    <div className="ft-two-fields"><Field label="Campaign source" value={values.source} onChange={update('source')} placeholder="instagram" required maxLength={200} /><Field label="Campaign medium" value={values.medium} onChange={update('medium')} placeholder="social" required maxLength={200} /></div>
    <Field label="Campaign name" value={values.campaign} onChange={update('campaign')} placeholder="autumn_launch" hint="Use consistent spelling and capitalization in every post." required maxLength={200} />
    <details className="ft-options"><summary>Optional tracking fields</summary><Field label="Campaign content" value={values.content} onChange={update('content')} placeholder="carousel_a" maxLength={200} /><Field label="Campaign term" value={values.term} onChange={update('term')} placeholder="target_keyword" maxLength={200} /><Field label="Campaign ID" value={values.id} onChange={update('id')} placeholder="campaign_2026_09" maxLength={200} /></details>
    <button className="ft-button" type="submit">Build tracking link</button>
    {attempted && error && <p role="alert" className="ft-error">{error}</p>}
  </form><div className="ft-result"><h2>Your campaign link</h2><textarea aria-label="Generated tracking link" readOnly value={output} placeholder="Your link appears here as you fill in the fields." rows={6} /><CopyButton text={output} label="Copy link" /><dl className="ft-definition-list"><div><dt>Source</dt><dd>{values.source || 'Where the visit starts'}</dd></div><div><dt>Medium</dt><dd>{values.medium || 'The type of traffic'}</dd></div><div><dt>Campaign</dt><dd>{values.campaign || 'The initiative you are tracking'}</dd></div></dl><p className="ft-hint">Existing URL parameters and anchors are preserved. No link shortening or analytics account required.</p></div></div>;
}

export function HandleChecker({ platform }) {
  const name = platform === 'instagram' ? 'Instagram' : 'TikTok';
  const [input, setInput] = useState(''), [result, setResult] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  async function check(e) {
    e.preventDefault(); setError(''); setResult(null);
    let parsed;
    try { parsed = validateHandle(input, platform); } catch (error) { setError(error.message); return; }
    setBusy(true);
    try {
      const response = await requestTool('check-handle', { platform, handle: parsed.handle });
      setResult({ ...parsed, status: response.status === 'found' ? 'found' : 'unconfirmed' });
    } catch { setResult({ ...parsed, status: 'unconfirmed' }); }
    finally { setBusy(false); }
  }
  return <div className="ft-workbench"><form className="ft-controls" onSubmit={check}>
    <Field label={`${name} username or profile URL`} placeholder={platform === 'instagram' ? '@yourbrand' : '@yourname'} value={input} onChange={e => { setInput(e.target.value); setResult(null); setError(''); }} maxLength={180} required disabled={busy} autoCapitalize="none" autoCorrect="off" spellCheck={false} />
    <button className="ft-button" type="submit" disabled={busy}>{busy ? 'Checking public profile…' : 'Check username'}</button>
    {error && <p role="alert" className="ft-error">{error}</p>}
    <p className="ft-hint">Checks formatting and public profile evidence. Only {name} can confirm that a name is available to register.</p>
  </form><div className="ft-result" aria-live="polite"><h2>{result ? `@${result.handle}` : 'Find your next handle'}</h2>{result ? <>
    <p className="ft-result-status">{result.status === 'found' ? 'A matching public profile was found.' : 'Valid format. Availability is unconfirmed.'}</p>
    <p>{result.status === 'found' ? 'This name is in use by a public profile. You can review it on the platform.' : `${name} did not return enough public evidence to confirm a profile. The name could be in use, restricted, or reserved. Check it in Edit profile before claiming it.`}</p>
    <a className="ft-button secondary" href={result.url} target="_blank" rel="noopener noreferrer">View profile on {name}</a>
    <h3>More names to explore</h3><p className="ft-hint">Suggestions only; availability has not been checked.</p><div className="ft-handle-ideas">{handleIdeas(result.handle, platform).map(handle => <button key={handle} type="button" onClick={() => { setInput(handle); setResult(null); }}>@{handle}</button>)}</div>
  </> : <p>Enter a handle to check its format, look for a profile, and get alternative name ideas.</p>}</div></div>;
}

export function CaptionGenerator() {
  const [values, setValues] = useState({ topic: '', tone: 'Helpful', audience: '', cta: '', hashtags: '' });
  const [captions, setCaptions] = useState([]), [source, setSource] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const update = key => e => { setValues({ ...values, [key]: e.target.value }); setCaptions([]); setSource(''); };
  async function generate(e) {
    e.preventDefault(); setError('');
    if (values.topic.trim().length < 3) { setError('Describe the video in at least a few words.'); return; }
    setBusy(true);
    try { const data = await requestTool('generate', { kind: 'captions', ...values }); if (!Array.isArray(data.items) || !data.items.length) throw new Error(); setCaptions(data.items); setSource(data.source); }
    catch { setCaptions(captionIdeas(values)); setSource('template'); }
    finally { setBusy(false); }
  }
  return <div className="ft-workbench"><form onSubmit={generate}><fieldset className="ft-controls" disabled={busy}>
    <Field label="What happens in your video?">{id => <textarea id={id} value={values.topic} onChange={update('topic')} placeholder="A 15-minute desk stretch routine for people who work from home" rows={4} maxLength={1200} required />}</Field>
    <div className="ft-two-fields"><Field label="Tone">{id => <select id={id} value={values.tone} onChange={update('tone')}>{['Helpful','Playful','Professional','Curious'].map(tone => <option key={tone}>{tone}</option>)}</select>}</Field><Field label="Audience (optional)" value={values.audience} onChange={update('audience')} placeholder="remote workers" maxLength={120} /></div>
    <Field label="Call to action (optional)" value={values.cta} onChange={update('cta')} placeholder="Save this for your next break." maxLength={160} />
    <Field label="Hashtags (optional)" value={values.hashtags} onChange={update('hashtags')} placeholder="#deskstretch #remotework" maxLength={120} />
    <button type="submit" className="ft-button">{busy ? 'Writing caption ideas…' : 'Generate captions'}</button>
    {error && <p role="alert" className="ft-error">{error}</p>}
    <p className="ft-hint">Your description is sent for AI generation. Review and edit every draft before posting.</p>
  </fieldset></form><div className="ft-result"><h2>Caption ideas</h2><p className="ft-hint" role="status">{source ? source === 'ai' ? 'AI-generated drafts. Make the final wording yours.' : 'Template ideas. AI is currently unavailable; these drafts were built from your inputs.' : 'Add a specific moment, result, or idea to get started.'}</p>{captions.map((caption, i) => <div className="ft-caption" key={i}><Field label={`Caption ${i + 1}`}>{id => <textarea id={id} value={caption} rows={5} onChange={e => setCaptions(captions.map((value, index) => index === i ? e.target.value : value))} />}</Field><div className="ft-inline"><small>{textLength(caption)} characters</small><CopyButton text={caption} label="Copy caption" /></div></div>)}</div></div>;
}

export function LinkedInFormatter() {
  const [text, setText] = useState(''), editor = useRef(null);
  function apply(style) {
    const start = editor.current.selectionStart, end = editor.current.selectionEnd;
    const selected = start !== end;
    const formatted = formatText(selected ? text.slice(start, end) : text, style);
    const next = selected ? text.slice(0, start) + formatted + text.slice(end) : formatted;
    setText(next);
    requestAnimationFrame(() => { editor.current.focus(); editor.current.setSelectionRange(selected ? start : 0, selected ? start + formatted.length : next.length); });
  }
  return <div className="ft-workbench"><div className="ft-controls"><div className="ft-toolbar" role="group" aria-label="Text styles">{[['bold','Bold'],['italic','Italic'],['bold-italic','Bold italic'],['underline','Underline'],['monospace','Monospace'],['plain','Plain text']].map(([style,label]) => <button type="button" key={style} onMouseDown={e => e.preventDefault()} onClick={() => apply(style)}>{label}</button>)}</div>
    <Field label="Your LinkedIn post" hint="Select a phrase to style it, or apply a style to the whole post.">{id => <textarea id={id} ref={editor} rows={10} value={text} onChange={e => setText(e.target.value)} placeholder="Write your next LinkedIn post…" maxLength={12000} />}</Field>
    <CopyButton text={text} label="Copy formatted text" />
  </div><div className="ft-result"><h2>Post preview</h2><div className="ft-post-preview">{text || 'Your formatted post will appear here.'}</div><p className="ft-hint">{textLength(text)} characters. Unicode styling can affect accessibility and search. Keep essential details in plain text.</p></div></div>;
}

export function YouTubeTitleChecker() {
  const [title, setTitle] = useState(''), [keyword, setKeyword] = useState(''), [device, setDevice] = useState('mobile');
  const { image, error, load } = useLocalImage();
  const result = checkTitle(title, keyword);
  return <div className="ft-workbench"><div className="ft-controls">
    <Field label="Video title">{id => <textarea id={id} rows={3} value={title} onChange={e => setTitle(e.target.value)} placeholder="How I plan a month of content in one afternoon" maxLength={500} />}</Field>
    <p className={`ft-counter ${result.length > 100 ? 'ft-error' : ''}`} role="status">{result.length} / 100 characters{title && result.valid ? ' · Within the title limit' : ''}</p>
    <Field label="Target phrase (optional)" value={keyword} onChange={e => setKeyword(e.target.value)} placeholder="plan content" maxLength={100} />
    <Field label="Thumbnail (optional)" hint="JPG, PNG, or WebP. Previewed locally.">{id => <input type="file" id={id} accept="image/jpeg,image/png,image/webp" onChange={e => load(e.target.files?.[0])} />}</Field>
    {error && <p role="alert" className="ft-error">{error}</p>}
    <CopyButton text={title} label="Copy title" />
    <div className="ft-checks">{result.issues.map(issue => <p key={issue}>{issue}</p>)}{title && !result.issues.length && <p>The title fits the length and formatting checks. Make sure it accurately describes your video.</p>}</div>
  </div><div className="ft-result"><div className="ft-panel-heading"><h2>Feed preview</h2><div className="ft-toolbar" role="group" aria-label="Preview device">{['mobile','desktop'].map(d => <button key={d} type="button" aria-pressed={device === d} onClick={() => setDevice(d)}>{d === 'mobile' ? 'Mobile' : 'Desktop'}</button>)}</div></div><div className={`ft-youtube-preview ${device}`}><div className="ft-thumbnail">{image ? <img src={image.url} alt="Your uploaded thumbnail" /> : <span>Your thumbnail</span>}</div><div className="ft-youtube-title">{title || 'Your video title appears here'}</div><small>Your channel</small></div><p className="ft-hint">Illustrative preview. Real truncation varies by device, font, and YouTube layout.</p></div></div>;
}

export function YouTubeTagGenerator() {
  const [topic, setTopic] = useState(''), [keywords, setKeywords] = useState(''), [output, setOutput] = useState(''), [source, setSource] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const tags = output.split(',').map(tag => tag.trim()).filter(Boolean);
  const cost = tagCost(tags);
  async function generate(e) {
    e.preventDefault(); setError('');
    if (topic.trim().length < 3) { setError('Add a more specific video topic.'); return; }
    setBusy(true);
    try { const data = await requestTool('generate', { kind: 'tags', topic, keywords }); if (!Array.isArray(data.items) || !data.items.length) throw new Error(); setOutput(fitTags(data.items).join(', ')); setSource(data.source); }
    catch { setOutput(suggestTags(topic, keywords).join(', ')); setSource('keywords'); }
    finally { setBusy(false); }
  }
  const clear = () => { setOutput(''); setSource(''); };
  return <div className="ft-workbench"><form onSubmit={generate}><fieldset disabled={busy} className="ft-controls">
    <Field label="Video topic or description">{id => <textarea id={id} rows={5} value={topic} onChange={e => { setTopic(e.target.value); clear(); }} placeholder="How to grow basil on a small apartment balcony" required maxLength={1200} />}</Field>
    <Field label="Key phrases (optional)" hint="Separate phrases with commas." value={keywords} onChange={e => { setKeywords(e.target.value); clear(); }} placeholder="balcony gardening, growing basil, small spaces" maxLength={400} />
    <button className="ft-button" type="submit">{busy ? 'Finding tag ideas…' : 'Generate tags'}</button>
    {error && <p role="alert" className="ft-error">{error}</p>}
    <p className="ft-hint">Your topic is sent for AI suggestions. Tags are a small part of discovery; focus on the title and thumbnail first.</p>
  </fieldset></form><div className="ft-result"><h2>Your tag ideas</h2><p role="status" className="ft-hint">{source ? source === 'ai' ? 'AI-generated suggestions. Keep only tags that describe your video.' : 'Keyword-based suggestions. AI is currently unavailable.' : 'Suggestions will appear here. You can edit them before copying.'}</p><Field label="Tags, separated by commas">{id => <textarea id={id} rows={7} value={output} onChange={e => setOutput(e.target.value)} maxLength={3000} />}</Field><p className={cost > 500 ? 'ft-error' : 'ft-hint'} role="status">{cost} / 500 characters including separators and quotes{cost > 500 ? ' · Remove some tags before copying.' : ''}</p><div className="ft-inline"><CopyButton text={tags.join(', ')} label="Copy tags" disabled={cost > 500} /><button className="ft-text-button" type="button" disabled={!output} onClick={() => setOutput(fitTags(tags).join(', '))}>Clean up and fit to limit</button></div></div></div>;
}
