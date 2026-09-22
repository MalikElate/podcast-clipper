import { useEffect, useRef, useState } from 'react';
import BrandLogo from '../components/BrandLogo.jsx';
import SiteFooter from '../components/SiteFooter.jsx';
import { appHref } from '../siteUrls.js';
import TikTokRoastFeed, { RoastProfile } from './TikTokRoastFeed.jsx';
import './tiktokRoast.css';

function RoastFlower({smile=false}) {
  return <svg className="roast-flower" viewBox="0 0 200 220" role="img" aria-label={smile ? 'A pleased Meadow flower' : 'A skeptical Meadow flower'}>
    <path d="M102 151q-8 32-1 58M102 187q-32-5-39-28 26-2 39 28M101 179q28-29 43-21-8 23-43 21" fill="#7f956d" stroke="#496745" strokeWidth="5" strokeLinecap="round"/>
    <g fill="#f6c87b" stroke="#dfac5a" strokeWidth="2">{Array.from({length:8},(_,i)=><ellipse key={i} cx="100" cy="50" rx="24" ry="40" transform={`rotate(${i*45} 100 98)`}/>)}</g>
    <circle cx="100" cy="98" r="48" fill="#563e32"/>
    <path d="M68 81l24 5M111 84l23-7" stroke="#fff5d8" strokeWidth="5" strokeLinecap="round"/>
    <ellipse cx="83" cy="99" rx="4" ry="7" fill="#fff5d8"/><ellipse cx="121" cy="97" rx="4" ry="7" fill="#fff5d8"/>
    <path d={smile ? 'M86 118q17 19 32-2' : 'M85 124q17-8 30-3'} fill="none" stroke="#fff5d8" strokeWidth="4" strokeLinecap="round"/>
  </svg>;
}
const FAQs = [
  ['Is it actually free?', 'Yes. No Meadow account, TikTok connection, or credit card is required. There is a short request limit to keep the tool available for everyone.'],
  ['What does it look at?', 'TikTok’s public profile embed supplies a bio and a sample of up to 10 recent post captions. You can play each post in the scrolling feed. The score checks the captions for repeated text, engagement bait, sales instructions, hashtag-only text, and missing context. It does not watch the videos, listen to audio, or read text inside a video.'],
  ['How is the score calculated?', 'Each available caption is Strong, Thin, or Filler. Filler counts as 1, Thin as ½, and Strong as 0. Divide the total by the number of scored captions and multiply by 100. Empty captions are unscored. These are simple editorial checks, not a scientific quality rating or an AI-content detector.'],
  ['Why might a great video get roasted?', 'A great visual can have a weak caption. This tool can only judge the text TikTok makes available, so jokes, language, and context can be missed. Use the notes as prompts to improve your next caption, not as a verdict on the creator.'],
  ['Can I roast any profile?', 'Only profiles TikTok makes publicly embeddable, with at least three readable captions. Private, restricted, unavailable, or very new profiles may not work. We show an explanation instead of inventing a score.'],
  ['What happens to the data?', 'Public results may be cached for one hour. Cloudflare processes the public caption text to generate the optional AI punchline; the score itself comes from the displayed checks. No TikTok password is requested and nothing is posted. Playing a post loads TikTok’s embedded player. Copying or sharing a result is always your choice.'],
];

function ScoreDial({score}) {
  return <div className="roast-score" aria-label={`Caption roast score: ${score} out of 100`}>
    <div className="roast-score-track"><span style={{left:`${Math.max(2,Math.min(98,score))}%`}} /></div>
    <div className="roast-score-labels"><span>Fresh</span><span>Extra crispy</span></div>
  </div>;
}
function wrapCanvas(ctx, text, x, y, maxWidth, lineHeight) {
  let line=''; let count=0;
  for (const word of text.split(/\s+/)) {
    const next=line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width>maxWidth && line) {ctx.fillText(line,x,y+count*lineHeight);count++;line=word;} else line=next;
  }
  ctx.fillText(line,x,y+count*lineHeight);
}
async function saveImage(result) {
  const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=900;
  const c=canvas.getContext('2d'); c.fillStyle='#f5f6ed';c.fillRect(0,0,1200,900);
  c.fillStyle='#26382d';c.font='bold 34px Arial';c.fillText('meadow. / TikTok Roast',70,86);
  c.font='28px Arial';c.fillText(`@${result.profile.handle}`,70,151);
  c.fillStyle='#d7744b';c.font='bold 210px Arial';c.fillText(`${result.score}`,64,378);
  c.fillStyle='#52614e';c.font='30px Arial';c.fillText('/100 · caption roast score',70,434);
  c.fillStyle='#26382d';c.font='bold 38px Arial';wrapCanvas(c,result.roast,70,540,1050,53);
  c.font='23px Arial';c.fillStyle='#66715f';c.fillText(`${result.posts.length} public captions sampled · Videos not analyzed`,70,748);
  c.fillText('Roast yours: findmeadow.com/tiktok-roast',70,810);
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
  if (!blob) throw new Error('The image could not be created. Try copying the result instead.');
  const url=URL.createObjectURL(blob), a=document.createElement('a');a.href=url;a.download=`meadow-tiktok-roast-${result.profile.handle}.png`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}

export default function TikTokRoast() {
  const [handle,setHandle]=useState('');
  const [result,setResult]=useState(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const controller=useRef(null), output=useRef(null);
  useEffect(()=>{const value=new URLSearchParams(window.location.search).get('handle');if(value)setHandle(value.slice(0,180));return()=>controller.current?.abort();},[]);
  async function roast(event) {
    event.preventDefault();if(busy)return;
    setError('');setNotice('');setResult(null);setBusy(true);
    controller.current=new AbortController();
    const timer=setTimeout(()=>controller.current?.abort(),45000);
    try {
      const response=await fetch('/api/tools/tiktok-roast',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({handle}),signal:controller.current.signal});
      const data=await response.json();
      if (!response.ok) throw new Error(data.error || 'The roast could not finish. Try again in a moment.');
      setResult(data);
      requestAnimationFrame(()=>{output.current?.focus({preventScroll:true});output.current?.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});});
    } catch(e) {setError(e.name==='AbortError' ? 'That took too long. Please try again in a moment.' : e.message);}
    finally {clearTimeout(timer);setBusy(false);}
  }
  async function share(kind) {
    setNotice('');
    const text=`Meadow gave @${result.profile.handle} a ${result.score}/100 caption roast score. “${result.roast}”\nBased on ${result.posts.length} public captions, not the videos.\nhttps://findmeadow.com/tiktok-roast?handle=${encodeURIComponent(result.profile.handle)}`;
    try {
      if(kind==='image'){await saveImage(result);setNotice('Your roast card is ready to save.');}
      else {await navigator.clipboard.writeText(text);setNotice('Roast and link copied.');}
    } catch(e) {setNotice(kind==='image' ? e.message : 'Could not copy automatically. Select and copy the roast text below.');}
  }
  return <div className="tiktok-roast-page">
    <header className="roast-nav"><a href="/" aria-label="Meadow home"><BrandLogo /></a><nav aria-label="Roast navigation"><a href="/tiktok-roast" aria-current="page">Free TikTok tool</a><a className="roast-nav-cta" href={appHref('/dashboard')}>Try Meadow <span aria-hidden="true">↗</span></a></nav></header>
    <main>
      <section className="roast-hero" aria-labelledby="roast-title">
        <div className="roast-intro"><span className="roast-powered-badge">Powered by Jev</span><h1 id="roast-title">TikTok <span>Hot or Not.</span></h1><p>Meadow is a social media scheduling tool, and I’m not sure what this has to do with our main product.</p></div>
        <div className="roast-workspace">
          <aside className={`roast-host ${busy?'is-thinking':''}`} aria-label="Meet your roaster"><div className="roast-speech">{busy ? 'Looking for the hook. Please let there be a hook.' : result ? result.roast : '“Link in bio” is not a personality. Let’s start there.'}</div><RoastFlower smile={result && result.score<30}/><span className="roast-host-name">Meadow, with the gloves off.</span><span className="roast-host-note">A little heat. A lot of room to grow.</span></aside>
          <div className="roast-input-card"><h2>Drop your handle.</h2><form onSubmit={roast}><label htmlFor="roast-handle">TikTok handle or profile URL</label><div className="roast-input-wrap"><span aria-hidden="true">@</span><input id="roast-handle" name="handle" value={handle} onChange={e=>setHandle(e.target.value)} placeholder="yourhandle" maxLength={180} autoCapitalize="none" autoCorrect="off" spellCheck="false" required aria-describedby="roast-input-help" disabled={busy}/></div><button className="roast-submit" disabled={busy || !handle.trim()} type="submit">{busy ? 'Preparing your roast…' : 'Roast my TikTok'}<span aria-hidden="true">{busy ? '◌' : '↗'}</span></button><p id="roast-input-help">Public profiles only. No login. Nothing gets posted.</p></form>{busy && <p className="roast-loading" role="status">Loading the profile, lining up the posts, and preparing each roast. This can take a few seconds.</p>}{error && <p className="roast-error" role="alert">{error}</p>}<div className="roast-scope"><p>We roast the <strong>captions</strong>, not the person. Video, audio, and on-screen text aren’t included.</p></div></div>
        </div>
      </section>
      <section className="roast-cta-bar" aria-label="Schedule and cross-post with Meadow">
        <div><span>Turn the roast into your next post.</span><h2>Schedule your TikTok posts and cross-post them to every platform.</h2></div>
        <a href={appHref('/dashboard')}>Try for free <span aria-hidden="true">↗</span></a>
      </section>
      {result && <section className="roast-results" ref={output} tabIndex="-1" aria-labelledby="roast-result-title">
        <RoastProfile key={result.profile.handle} profile={result.profile} postCount={result.posts.length} />
        <TikTokRoastFeed key={`${result.profile.handle}-${result.sampledAt}`} result={result} />
        <div className="roast-result-top"><div><h2>Your captions, collectively roasted.</h2><p>{result.posts.length} public posts sampled · {new Date(result.sampledAt).toLocaleDateString()} · {result.counts.strong} strong · {result.counts.thin} thin · {result.counts.filler} filler</p></div></div>
        <div className="roast-verdict"><div className="roast-number"><strong>{result.score}<span>/100</span></strong><span>Caption roast score</span><ScoreDial score={result.score}/></div><div className="roast-verdict-copy"><span>{result.label}</span><blockquote>{result.roast}</blockquote><small>{result.voice==='meadow-ai'?'AI punchline · Transparent caption checks':'Based on transparent caption checks'} · Not a video-quality rating</small></div></div>
        <div className="roast-share">
          <div className="roast-share-actions" role="group" aria-label="Share your roast">
            <button type="button" onClick={()=>share('image')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v12m-5-5 5 5 5-5M5 16v4a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-4" /></svg>
              <span>Save roast card</span>
            </button>
            <button type="button" onClick={()=>share('copy')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="8" y="8" width="12" height="13" rx="2" /><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" /></svg>
              <span>Copy roast + link</span>
            </button>
          </div>
          <p className="roast-share-notice" role="status" aria-atomic="true">{notice}</p>
        </div>
        <div className="roast-fixes">{result.observations.map(o=><article key={o.title}><h3>{o.title}</h3><p>{o.evidence}</p><div><strong>Try this next</strong><p>{o.fix}</p></div></article>)}</div>

        <div className="roast-recovery"><div><h2>Better captions. Meet a better workflow.</h2><p>Turn the roast into your next post. Draft, preview, and schedule your content with Meadow.</p></div><a href={appHref('/dashboard')}>Start free with Meadow ↗</a></div>
      </section>}
      <section className="roast-faq" aria-labelledby="roast-faq-title"><h2 id="roast-faq-title">Before you blame the algorithm.</h2>{FAQs.map(([q,a])=><details key={q}><summary>{q}<span aria-hidden="true">+</span></summary><p>{a}</p></details>)}</section>
    </main><SiteFooter />
  </div>;
}
