import { useEffect, useRef, useState } from 'react';

const labels = { strong: 'Strong caption', thin: 'Thin caption', filler: 'Extra crispy', unscored: 'No caption' };
const formatCount = value => new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
const scrollBehavior = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';

function ProfileImage({ src, name, className = '' }) {
  const [failed, setFailed] = useState(false);
  return <span className={`roast-avatar ${className}`}>
    {src && !failed ? <img src={src} alt="" referrerPolicy="no-referrer" onError={() => setFailed(true)} /> : <span aria-hidden="true">{name.slice(0, 1).toUpperCase()}</span>}
  </span>;
}

export function RoastProfile({ profile, postCount }) {
  return <div className="roast-creator-profile">
    <ProfileImage src={profile.avatarUrl} name={profile.name} />
    <div className="roast-creator-copy">
      <span className="roast-eyebrow">PROFILE LOADED · {postCount} POSTS IN THE HOT SEAT</span>
      <h2 id="roast-result-title">{profile.name}{profile.verified && <span className="roast-verified" aria-label="Verified on TikTok">✓</span>}</h2>
      <a href={profile.url} target="_blank" rel="noreferrer">@{profile.handle} <span aria-hidden="true">↗</span></a>
      {profile.bio && <p>{profile.bio}</p>}
      <dl className="roast-profile-stats">
        {[[profile.following, 'Following'], [profile.followers, 'Followers'], [profile.likes, 'Likes']].filter(([value]) => Number.isFinite(value)).map(([value, label]) => <div key={label}><dt>{label}</dt><dd title={value.toLocaleString()}>{formatCount(value)}</dd></div>)}
      </dl>
    </div>
  </div>;
}

function PostPlayer({ post, playing, onPlay }) {
  const frame = useRef(null);
  const [coverFailed, setCoverFailed] = useState(false);
  const [playerFailed, setPlayerFailed] = useState(false);
  useEffect(() => {
    if (!playing) return;
    setPlayerFailed(false);
    const receive = event => {
      if (event.origin !== 'https://www.tiktok.com' || event.source !== frame.current?.contentWindow || event.data?.['x-tiktok-player'] !== true) return;
      if (event.data.type === 'onPlayerError' && event.data.value?.errorCode !== 3002) setPlayerFailed(true);
    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, [playing]);
  return <div className="roast-video-stage">
    {post.coverUrl && !coverFailed && <img className="roast-video-cover" src={post.coverUrl} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setCoverFailed(true)} />}
    {playing && !playerFailed ? <iframe ref={frame} title={`TikTok post ${post.id}`} src={`https://www.tiktok.com/player/v1/${post.id}?autoplay=1&controls=1&description=0&music_info=0&rel=0`} allow="autoplay; fullscreen; encrypted-media" allowFullScreen onError={() => setPlayerFailed(true)} /> : <div className="roast-video-overlay">
      {playerFailed ? <><p>TikTok couldn’t play this post here.</p><a href={post.url} target="_blank" rel="noreferrer">Open on TikTok ↗</a></> : <button className="roast-video-play" type="button" onClick={onPlay} aria-label={`Play TikTok post ${post.id}`}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4v16l13-8z" fill="currentColor" /></svg><span>Play post</span></button>}
      {!post.coverUrl || coverFailed ? <span className="roast-preview-unavailable">Preview unavailable · You can still open the post</span> : null}
    </div>}
    {Number.isFinite(post.views) && <span className="roast-video-views" title={`${post.views.toLocaleString()} views`}>▷ {formatCount(post.views)} views</span>}
  </div>;
}

function PostCommentary({ post, index, total, className = '' }) {
  return <div className={`roast-post-commentary ${className}`}>
    <span className="roast-eyebrow">POST {String(index + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}</span>
    <span className={`roast-bucket ${post.bucket}`}>{labels[post.bucket]}</span>
    <h3>{post.roast || post.reason}</h3>
    <p>{post.reason}</p>
    <div className="roast-post-fix"><span>Make the next one better</span><p>{post.fix || 'Give this post its own specific opening line.'}</p></div>
  </div>;
}

export default function TikTokRoastFeed({ result }) {
  const { profile, posts } = result;
  const [active, setActive] = useState(0);
  const [tourPlaying, setTourPlaying] = useState(false);
  const [playingId, setPlayingId] = useState(null);
  const cards = useRef([]);
  const toolbar = useRef(null);

  function goTo(index) {
    const card = cards.current[index];
    if (!card) return;
    setActive(index);
    const offset = (toolbar.current?.offsetHeight || 72) + 28;
    window.scrollTo({ top: Math.max(0, window.scrollY + card.getBoundingClientRect().top - offset), behavior: scrollBehavior() });
  }

  useEffect(() => {
    let raf = 0;
    const measure = () => {
      raf = 0;
      const anchor = Math.max((toolbar.current?.offsetHeight || 72) + 36, window.innerHeight * .42);
      let closest = 0, distance = Infinity;
      cards.current.forEach((card, index) => {
        if (!card) return;
        const rect = card.getBoundingClientRect();
        const nextDistance = Math.max(rect.top - anchor, anchor - rect.bottom, 0);
        if (nextDistance < distance) { closest = index; distance = nextDistance; }
      });
      setActive(closest);
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(measure); };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    measure();
    return () => { cancelAnimationFrame(raf); window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); };
  }, [posts]);

  useEffect(() => { setPlayingId(current => current === posts[active]?.id ? current : null); }, [active, posts]);

  useEffect(() => {
    if (!tourPlaying) return;
    const pause = () => setTourPlaying(false);
    const onKey = event => { if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', 'Escape', ' '].includes(event.key)) pause(); };
    const onVisibility = () => { if (document.hidden) pause(); };
    const timer = setTimeout(() => { if (active < posts.length - 1) goTo(active + 1); else pause(); }, 9000);
    window.addEventListener('wheel', pause, { passive: true });
    window.addEventListener('touchstart', pause, { passive: true });
    window.addEventListener('keydown', onKey);
    document.addEventListener('visibilitychange', onVisibility);
    return () => { clearTimeout(timer); window.removeEventListener('wheel', pause); window.removeEventListener('touchstart', pause); window.removeEventListener('keydown', onKey); document.removeEventListener('visibilitychange', onVisibility); };
  }, [tourPlaying, active, posts.length]);

  const navigate = index => { setTourPlaying(false); goTo(index); };
  const toggleTour = () => {
    if (tourPlaying) { setTourPlaying(false); return; }
    setPlayingId(null);
    goTo(active === posts.length - 1 ? 0 : active);
    setTourPlaying(true);
  };

  return <section className="roast-feed" aria-labelledby="roast-feed-title">
    <div className="roast-feed-heading"><div><span className="roast-eyebrow">LET’S SCROLL THE RECEIPTS</span><h2 id="roast-feed-title">One post. One roast. Keep scrolling.</h2></div><p>Watch the posts and follow the commentary. Roasts are based on each caption.</p></div>
    <div className="roast-tour-bar" ref={toolbar}>
      <button type="button" className="roast-tour-toggle" onClick={toggleTour} aria-pressed={tourPlaying}>{tourPlaying ? 'Ⅱ Pause walkthrough' : '▷ Play walkthrough'}</button>
      <span className="roast-tour-count" aria-live="polite" aria-atomic="true">Post {active + 1} of {posts.length}</span>
      <div className="roast-tour-navigation"><button type="button" onClick={() => navigate(active - 1)} disabled={active === 0} aria-label="Previous post">↑</button><button type="button" onClick={() => navigate(active + 1)} disabled={active === posts.length - 1} aria-label="Next post">↓</button></div>
      <span className="roast-tour-progress" aria-hidden="true"><span style={{ width: `${100 * (active + 1) / posts.length}%` }} /></span>
    </div>
    <div className="roast-feed-layout">
      <div className="roast-feed-posts">
        {posts.map((post, index) => <article className={`roast-feed-post ${index === active ? 'is-active' : ''}`} key={post.id} ref={el => { cards.current[index] = el; }} aria-label={`Post ${index + 1} by @${profile.handle}`} data-post-id={post.id}>
          <header className="roast-post-header"><ProfileImage src={profile.avatarUrl} name={profile.name} /><div><strong>{profile.name}</strong><span>@{profile.handle}</span></div><a href={post.url} target="_blank" rel="noreferrer" aria-label={`Open post ${index + 1} on TikTok`}>TikTok ↗</a></header>
          <PostPlayer post={post} playing={playingId === post.id && index === active} onPlay={() => { setTourPlaying(false); setActive(index); setPlayingId(post.id); }} />
          <div className="roast-post-caption"><span>THE CAPTION</span><p>{post.caption || 'No caption available'}</p></div>
          <PostCommentary className="roast-inline-commentary" post={post} index={index} total={posts.length} />
        </article>)}
        <p className="roast-feed-end">That’s the {posts.length}-post sample. Your verdict is below. ↓</p>
      </div>
      <aside className="roast-feed-commentator" aria-label="Commentary for the current post">
        <div className="roast-commentator-label"><span aria-hidden="true">✳</span><div><strong>Meadow’s running commentary</strong><span>Scroll the feed. We’ll bring the heat.</span></div></div>
        <PostCommentary post={posts[active]} index={active} total={posts.length} />
        <p className="roast-commentary-note">Caption check · Video and audio aren’t scored.</p>
      </aside>
    </div>
  </section>;
}
