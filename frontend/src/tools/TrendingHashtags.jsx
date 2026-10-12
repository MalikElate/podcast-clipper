import { useEffect, useRef, useState } from 'react';
import { TIKTOK_TRENDS_URL, TREND_REGIONS, trendSource } from '../../../shared/trendSources.js';
import { CopyButton, Field } from './freeToolUi.jsx';
import './trendingHashtags.css';

function timeLabel(value, dateOnly = false) {
  if (!value || !Number.isFinite(Date.parse(value))) return 'Not supplied';
  return new Date(value).toLocaleString(undefined, dateOnly ? { dateStyle: 'medium', timeZone: 'UTC' } : { dateStyle: 'medium', timeStyle: 'short' });
}

export default function TrendingHashtags() {
  const [source, setSource] = useState('mastodon');
  const [region, setRegion] = useState('US');
  const [filter, setFilter] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useRef(null);
  useEffect(() => () => pending.current?.abort(), []);
  const selected = trendSource(source, region);
  const google = source === 'google';
  const items = result?.items.filter(item => item.title.toLocaleLowerCase().includes(filter.trim().toLocaleLowerCase())) || [];
  const copyText = [...new Set(items.map(item => item.hashtag).filter(Boolean))].join(' ');

  function changeSource(value) { setSource(value); setResult(null); setError(''); setFilter(''); }
  async function load(event) {
    event.preventDefault();
    setBusy(true); setError(''); setResult(null);
    const controller = new AbortController();
    pending.current = controller;
    const timer = setTimeout(() => controller.abort(), 15_000);
    try {
      const params = new URLSearchParams({ source, ...(google ? { region } : {}) });
      const response = await fetch(`/api/free-tools/trends?${params}`, { signal: controller.signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'The source could not be loaded. Please try again.');
      if (!Array.isArray(data.items) || data.source !== source || (google && data.region !== region)) throw new Error('The source returned an unreadable response. Please try again.');
      setResult(data);
    } catch (cause) {
      setError(controller.signal.aborted ? 'The request took too long. Please try again.' : cause.message || 'The source could not be loaded. Please try again.');
    } finally { clearTimeout(timer); pending.current = null; setBusy(false); }
  }

  return <div className="ft-trends">
    <div className="ft-workbench ft-trends-start">
      <form onSubmit={load}><fieldset className="ft-controls" disabled={busy}>
        <Field label="Trend source">{id => <select id={id} value={source} onChange={event => changeSource(event.target.value)}>
          <option value="mastodon">Mastodon hashtags — mastodon.social</option>
          <option value="google">Google Search topics — hashtag ideas</option>
        </select>}</Field>
        {google && <Field label="Google Search country">{id => <select id={id} value={region} onChange={event => { setRegion(event.target.value); setResult(null); setError(''); }}>
          {Object.entries(TREND_REGIONS).map(([code, name]) => <option key={code} value={code}>{name}</option>)}
        </select>}</Field>}
        <button type="submit" className="ft-button">{busy ? 'Loading trends…' : result ? 'Refresh trends' : 'Load trends'}</button>
        <p className="ft-hint">Meadow checks the public source when you load. Results are cached for up to 15 minutes; refreshing during that time returns the same snapshot.</p>
      </fieldset></form>
      <div className="ft-result">
        <h2>{google ? 'Google Search topics and hashtag ideas' : 'Trending hashtags on mastodon.social'}</h2>
        <p>{google ? `Find topics gaining search interest in ${TREND_REGIONS[region]}. Meadow turns each topic into a hashtag suggestion. These are not measured hashtag trends on Instagram, TikTok, or Mastodon.` : 'Explore hashtags used more frequently over the past week, as reported by mastodon.social. This is one Mastodon server’s view of activity, not a ranking across every social network.'}</p>
        <a href={selected.sourceUrl} target="_blank" rel="noopener noreferrer">Open {selected.sourceName} source</a>
        <p className="ft-hint">Looking for TikTok data? <a href={TIKTOK_TRENDS_URL} target="_blank" rel="noopener noreferrer">Research hashtags in TikTok Creative Center</a>. TikTok may ask you to sign in for more detail.</p>
      </div>
    </div>
    <p role="status" className="ft-hint">{busy ? `Loading ${selected.scope}…` : result ? `${items.length} of ${result.items.length} trends shown.` : 'Choose a source and load its latest available snapshot.'}</p>
    {error && <p role="alert" className="ft-error">{error} <a href={selected.sourceUrl} target="_blank" rel="noopener noreferrer">Open the source directly</a>.</p>}
    {result && <section className="ft-trends-results" aria-label={`${selected.scope} results`}>
      <div className="ft-trends-heading">
        <div><h2>{google ? `Search trends in ${TREND_REGIONS[region]}` : 'Hashtag activity on mastodon.social'}</h2>
          <p className="ft-hint">Data source: <a href={selected.sourceUrl} target="_blank" rel="noopener noreferrer">{selected.sourceName}</a>. Retrieved <time dateTime={result.fetchedAt}>{timeLabel(result.fetchedAt)}</time>.
            {result.sourceTimestamp?.at && <> {result.sourceTimestamp.label}: <time dateTime={result.sourceTimestamp.at}>{timeLabel(result.sourceTimestamp.at, !google)}</time>.</>}
          </p>
        </div>
        <CopyButton text={copyText} label={google ? 'Copy shown hashtag ideas' : 'Copy shown hashtags'} />
      </div>
      <Field label={google ? 'Filter search topics' : 'Filter hashtags'} type="search" value={filter} onChange={event => setFilter(event.target.value)} placeholder="Search these results" maxLength={100} />
      <p className="ft-hint">{google ? 'Search interest is the approximate traffic figure supplied by Google for each trend. It is not a hashtag usage count. A hashtag suggestion combines the words in the topic; check its meaning and relevance before using it.' : 'Uses counts posts using the hashtag in activity observed by mastodon.social. Accounts counts distinct accounts per day; a person can appear on several days. Today is a partial UTC day. The source determines the order.'}</p>
      {items.length ? <ul className="ft-trend-list">{items.map(item => <li className="ft-trend-row" key={item.id}>
        <div className="ft-trend-main"><h3><a href={item.url} target="_blank" rel="noopener noreferrer">{item.title}</a></h3>
          {google ? <>
            <p className="ft-trend-metric">Approximate search traffic: <strong>{item.searchTraffic || 'Not supplied'}</strong></p>
            <p className="ft-hint">Published by Google: <time dateTime={item.publishedAt}>{timeLabel(item.publishedAt)}</time></p>
            {item.hashtag && <p className="ft-trend-suggestion">Hashtag idea: <span>{item.hashtag}</span></p>}
          </> : <>
            <p className="ft-trend-metric"><strong>{item.history.reduce((total, day) => total + day.uses, 0).toLocaleString()}</strong> uses across {item.history.length} reported days</p>
            <details className="ft-trend-history"><summary>Daily activity</summary><div className="ft-table-wrap"><table>
              <caption>Activity for {item.title} on mastodon.social</caption>
              <thead><tr><th scope="col">Date (UTC)</th><th scope="col">Uses</th><th scope="col">Accounts</th></tr></thead>
              <tbody>{item.history.map(day => <tr key={day.date}><th scope="row"><time dateTime={day.date}>{timeLabel(day.date, true)}</time></th><td>{day.uses.toLocaleString()}</td><td>{day.accounts.toLocaleString()}</td></tr>)}</tbody>
            </table></div></details>
          </>}
        </div>
        <CopyButton text={item.hashtag} label={google ? 'Copy idea' : 'Copy hashtag'} />
      </li>)}</ul> : <p className="ft-empty">{result.items.length ? 'No trends match this filter. Try a different word.' : 'The source currently has no trends to show. Try another source or return later.'}</p>}
    </section>}
  </div>;
}
