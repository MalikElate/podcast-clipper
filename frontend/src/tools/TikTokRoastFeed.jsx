import { useEffect, useRef, useState } from 'react';
import RoastFlower from './RoastFlower.jsx';
import { nextWalkthroughStep, postVerdict, runningSlopScore } from './tiktokWalkthrough.js';

const formatCount = value => new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function ProfileImage({ src, name }) {
  const [failed, setFailed] = useState(false);
  return <span className="roast-avatar">{src && !failed ? <img src={src} alt="" referrerPolicy="no-referrer" onError={() => setFailed(true)} /> : <span aria-hidden="true">{name.slice(0, 1).toUpperCase()}</span>}</span>;
}

function RoastProfile({ profile }) {
  return <header className="roast-creator-profile">
    <ProfileImage src={profile.avatarUrl} name={profile.name} />
    <div className="roast-creator-copy">
      <h2 id="roast-result-title">{profile.name}{profile.verified && <span className="roast-verified" aria-label="Verified on TikTok">✓</span>}</h2>
      <a href={profile.url} target="_blank" rel="noreferrer">@{profile.handle} ↗</a>
      {profile.bio && <p>{profile.bio}</p>}
      <dl className="roast-profile-stats">{[[profile.following, 'Following'], [profile.followers, 'Followers'], [profile.likes, 'Likes']].filter(([value]) => Number.isFinite(value)).map(([value, label]) => <div key={label}><dd title={value.toLocaleString()}>{formatCount(value)}</dd><dt>{label}</dt></div>)}</dl>
    </div>
  </header>;
}

function SlopMeter({ score, reading }) {
  const angle = (score ?? 50) * 1.8 - 90;
  return <div className={`roast-meter ${reading ? 'is-reading' : ''}`} role={score === null ? "status" : "meter"} aria-label="Running slop score" aria-valuemin={score === null ? undefined : 0} aria-valuemax={score === null ? undefined : 100} aria-valuenow={score ?? undefined} aria-valuetext={score === null ? 'Checking the first caption' : `${score}% slop`}>
    <svg viewBox="0 0 320 218" aria-hidden="true">
      <g fill="none" strokeWidth="43">{['#55a55a', '#92be4f', '#ebd84e', '#ef934c', '#d95743'].map((color, index) => {
        const a = Math.PI + index * Math.PI / 5 + .024, b = Math.PI + (index + 1) * Math.PI / 5 - .024;
        return <path key={color} stroke={color} d={`M ${160 + 112 * Math.cos(a)} ${160 + 112 * Math.sin(a)} A 112 112 0 0 1 ${160 + 112 * Math.cos(b)} ${160 + 112 * Math.sin(b)}`} />;
      })}</g>
      <g className="roast-meter-needle" style={{ '--needle-angle': `${angle}deg` }}><path d="M153 160 160 48 167 160Z" fill="currentColor" /><circle cx="160" cy="160" r="13" fill="currentColor" /></g>
      <text x="160" y="209" textAnchor="middle" className="roast-meter-title">SLOP</text>
    </svg>
    <div className="roast-meter-labels" aria-hidden="true"><span>LOW</span><span>MEDIUM</span><span>HIGH</span></div>
    <p className="roast-meter-value"><strong>{score ?? '—'}</strong><span>% slop</span></p>
  </div>;
}

function PostPreview({ post }) {
  const [failed, setFailed] = useState(false);
  return <div className={`roast-phone-media ${!post.coverUrl || failed ? 'is-missing' : ''}`}>
    {post.coverUrl && !failed ? <img src={post.coverUrl} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} /> : <span>Preview unavailable</span>}
    {Number.isFinite(post.views) && <span className="roast-phone-views">▷ {formatCount(post.views)} views</span>}
  </div>;
}

export default function TikTokRoastFeed({ result }) {
  const { profile, posts } = result;
  const [step, setStep] = useState({ index: 0, phase: 'reading' });
  const [browsing, setBrowsing] = useState(reducedMotion);
  const [active, setActive] = useState(0);
  const [onScreen, setOnScreen] = useState(false);
  const [visible, setVisible] = useState(!document.hidden);
  const phone = useRef(null), feed = useRef(null), cards = useRef([]);
  const complete = step.phase === 'complete';
  const index = browsing ? active : step.index;
  const reading = !browsing && !complete && step.phase === 'reading';
  const revealedCount = browsing ? index + 1 : complete ? posts.length : step.index + (reading ? 0 : 1);
  const score = runningSlopScore(posts, revealedCount);
  const current = posts[index];
  const verdict = postVerdict(current);
  const takeover = () => setBrowsing(true);

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => setOnScreen(entry.isIntersecting && entry.intersectionRatio >= .15), { threshold: .15 });
    if (phone.current) observer.observe(phone.current);
    const visibility = () => setVisible(!document.hidden);
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const motion = () => { if (preference.matches) setBrowsing(true); };
    const escape = event => { if (event.key === 'Escape') setBrowsing(true); };
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('keydown', escape);
    preference.addEventListener('change', motion);
    return () => { observer.disconnect(); document.removeEventListener('visibilitychange', visibility); window.removeEventListener('keydown', escape); preference.removeEventListener('change', motion); };
  }, []);

  useEffect(() => {
    if (browsing || complete || !onScreen || !visible || !posts.length) return;
    const timer = setTimeout(() => setStep(previous => nextWalkthroughStep(previous, posts.length)), reading ? 2200 : 1350);
    return () => clearTimeout(timer);
  }, [browsing, complete, onScreen, visible, reading, step.index, posts.length]);

  useEffect(() => {
    if (browsing || !onScreen || !visible) return;
    const card = cards.current[step.index], container = feed.current;
    if (!card || !container) return;
    // Keep the animation inside the phone; never move the page as posts advance.
    const top = container.scrollTop + card.getBoundingClientRect().top - container.getBoundingClientRect().top - 10;
    container.scrollTo({ top, behavior: reducedMotion() ? 'auto' : 'smooth' });
  }, [step.index, browsing, onScreen, visible]);

  useEffect(() => {
    if (!browsing || !feed.current) return;
    const container = feed.current;
    let raf = 0;
    const measure = () => {
      raf = 0;
      const anchor = container.getBoundingClientRect().top + container.clientHeight * .4;
      let nearest = 0, distance = Infinity;
      cards.current.forEach((card, i) => {
        if (!card) return;
        const rect = card.getBoundingClientRect();
        const next = Math.max(rect.top - anchor, anchor - rect.bottom, 0);
        if (next < distance) { nearest = i; distance = next; }
      });
      setActive(nearest);
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(measure); };
    container.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    measure();
    return () => { cancelAnimationFrame(raf); container.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); };
  }, [browsing]);

  if (!current) return null;
  return <section className={`roast-walkthrough ${reading && onScreen && visible ? 'is-scanning' : ''}`} aria-label="TikTok post walkthrough">
    <div className="roast-judging-panel">
      <RoastProfile profile={profile} />
    </div>
    <div className="roast-live-viewer">
      <div className="roast-live-judging"><div className="roast-judging-scene">
        <SlopMeter score={score} reading={reading && onScreen && visible} />
        <div className={`roast-reaction ${reading && onScreen && visible ? 'is-thinking' : ''}`}>
          <RoastFlower smile={!reading && verdict.tone === 'fresh'} mood={reading ? 'thinking' : verdict.tone} />
          <p className="roast-reaction-speech">{reading ? ['Let’s see what you brought.', 'Hold on. There might be something here.', 'Looking for the plot.'][index % 3] : complete && !browsing ? result.roast : current.roast || current.reason}</p>
        </div>
      </div>
      <div className="roast-scan-status" role="status" aria-live="polite" aria-atomic="true">
        <span>{complete && !browsing ? 'The verdict is in.' : reading ? `Checking post ${index + 1}…` : `Post ${index + 1}: ${verdict.label}`}</span>
        <span>{complete && !browsing ? `${posts.length} posts checked` : `${index + 1} / ${posts.length}`}</span>
      </div>
      <p className="roast-scroll-hint">Scroll the phone to look through your posts.</p></div>
    <div className="roast-phone" ref={phone}>
      <div className="roast-phone-notch" aria-hidden="true" />
      <div className="roast-phone-top"><span>@{profile.handle}</span><span>TikTok</span></div>
      <div className="roast-phone-feed" ref={feed} tabIndex={0} role="region" aria-label={`Posts by @${profile.handle}. Scroll to browse; Escape stops the animation.`} onWheel={takeover} onTouchStart={takeover} onPointerDown={takeover} onFocus={takeover} onKeyDown={event => { if (['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', ' '].includes(event.key)) takeover(); }}>
        {posts.map((post, i) => {
          const judged = browsing || complete || i < step.index || (i === step.index && !reading);
          const stamp = postVerdict(post);
          return <article key={post.id} ref={element => { cards.current[i] = element; }} className={`roast-phone-post ${i === index ? 'is-active' : ''} ${judged ? 'is-judged' : ''}`} data-post-id={post.id} aria-label={`Post ${i + 1} by @${profile.handle}`}>
            <header><ProfileImage src={profile.avatarUrl} name={profile.name} /><div><strong>{profile.name}</strong><span>@{profile.handle}</span></div><a href={post.url} target="_blank" rel="noreferrer" aria-label={`Open post ${i + 1} on TikTok`}>↗</a></header>
            <div className="roast-phone-preview"><PostPreview post={post} />{judged && <span className={`roast-stamp ${stamp.tone}`}>{stamp.label}</span>}{i === index && reading && <span className="roast-scanning-line" aria-hidden="true" />}</div>
            <p className="roast-phone-caption">{post.caption || 'No caption available'}</p>
            <div className="roast-post-reading">{i === index && reading ? 'Meadow is checking…' : judged ? stamp.label : 'Up next'}<span className="roast-post-scan-track" aria-hidden="true"><span /></span></div>
          </article>;
        })}
        <p className="roast-phone-end">You’re all caught up.</p>
      </div>
      <div className="roast-phone-home" aria-hidden="true" />
    </div>
    </div>
  </section>;
}
