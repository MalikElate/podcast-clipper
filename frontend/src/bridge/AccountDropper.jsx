import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { api } from "./BridgeApi.js";
import { Icon } from "./Icons.jsx";
import { Alert, Check, Field, Modal, PlatformIcon, dateTime, useProjectResource } from "./ui.jsx";
import { DestinationSettings } from "./DestinationSettings.jsx";
import { useAccountOptions } from "./useAccountOptions.js";
import { dashboardPath } from "./dashboardRoutes.js";
import { dropperDestinationAccounts, dropperSourceAccounts, selectableDropperCards, currentDropperItem, intervalMinutes, intervalInput, intervalLabel, dropperQueueStatus, funnelFeed, funnelDuration, funnelProgress, wrongFormatLabel, videoFit, durationLabel, demoRejects } from "./dropper.js";
import "./dropper.css";

const initial = { cards: null, wrongFormat: [], sources: [], settings: { sourceAccountId: null, accountIds: [], overrides: {}, intervalMinutes: 480 }, queue: [], running: false, inFlight: false, nextSlotAt: null, run: null };
const platformName = (catalog, platform) => catalog.find(item => item.id === platform)?.name || platform;
const optionPlatforms = new Set(["tiktok", "pinterest"]);
const destinationSettingsPlatforms = new Set(["tiktok", "youtube", "pinterest", "bluesky", "google_business"]);

export default function AccountDropper({ project, catalog, accounts, accountsReady, onAccounts }) {
  const [demo] = useState(() => new URLSearchParams(window.location.search).has("demo"));
  const resource = useProjectResource(project.id, "/dropper", initial, { refreshOnFocus: true });
  const { data } = resource;
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [rechecking, setRechecking] = useState(false);
  const request = useRef(null);
  const failedRead = useRef(null);
  const mounted = useRef(false);
  const sourceAccounts = dropperSourceAccounts(accounts);
  const source = sourceAccounts.find(account => account.id === data.settings.sourceAccountId);
  const eligible = dropperDestinationAccounts(accounts, catalog, data.settings.sourceAccountId);
  const destinations = data.settings.accountIds.map(id => eligible.find(account => account.id === id)).filter(Boolean);
  const cards = data.cards || [];
  const fitting = cards.filter(card => videoFit(card, destinations, catalog).fits);
  const selectable = selectableDropperCards(fitting, data.queue);
  const selectableIds = new Set(selectable.map(card => card.id));
  const selectedCards = selected.map(id => selectable.find(card => card.id === id)).filter(Boolean);
  const locked = Boolean(busy || rechecking || data.running || data.inFlight);
  const ready = Boolean(source && destinations.length && destinations.length === data.settings.accountIds.length);
  const waiting = data.queue.filter(item => item.status === "queued");
  const preparing = data.queue.filter(item => ["downloading", "submitting"].includes(item.status));
  const displayedSetup = data.run && (data.running || data.inFlight) ? data.run : data.settings;
  const dropCandidate = currentDropperItem(data.queue, data);
  const currentDrop = dropCandidate && (dropCandidate.status !== "scheduled" || dropCandidate.accountId === displayedSetup.sourceAccountId
    && dropCandidate.accountIds.length === displayedSetup.accountIds.length && dropCandidate.accountIds.every(id => displayedSetup.accountIds.includes(id))) ? dropCandidate : null;
  const boardSource = accounts.find(account => account.id === displayedSetup.sourceAccountId);
  const currentDestinationIds = currentDrop?.accountIds || displayedSetup.accountIds;
  const boardDestinations = currentDestinationIds.map(id => accounts.find(account => account.id === id)).filter(Boolean);
  const hasUnavailable = Boolean(data.settings.sourceAccountId && accountsReady && !ready);
  const posting = data.queue.some(item => item.status === "scheduled" && ["scheduled", "publishing", "partially_published"].includes(item.postStatus));

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; request.current?.abort(); };
  }, [project.id]);

  const selectableKey = selectable.map(card => card.id).join(",");
  useEffect(() => {
    const valid = new Set(selectableKey.split(","));
    setSelected(current => {
      const kept = current.filter(id => valid.has(id));
      return kept.length === current.length ? current : kept;
    });
  }, [selectableKey]);

  useEffect(() => {
    if (failedRead.current && failedRead.current !== data) { failedRead.current = null; setRechecking(false); }
  }, [data]);

  useEffect(() => {
    if (!data.running && !data.inFlight && !posting) return;
    const timer = setInterval(resource.reload, 8000);
    return () => clearInterval(timer);
  }, [data.running, data.inFlight, posting, resource.reload]);

  async function mutate(action, body, apply) {
    if (request.current) return null;
    const controller = new AbortController();
    request.current = controller;
    setBusy(action); setError("");
    try {
      const result = await api.project(project.id, `/dropper/${action}`, { method: "POST", body, signal: controller.signal });
      if (controller.signal.aborted || !mounted.current || request.current !== controller) return null;
      apply(result);
      resource.reload();
      return result;
    } catch (failure) {
      if (controller.signal.aborted || !mounted.current || failure.name === "AbortError") return null;
      setError(failure.message);
      // A lost response can still represent a successful write. Refresh the
      // authoritative queue before another Start or Stop is offered.
      failedRead.current = data; setRechecking(true);
      resource.reload();
      throw failure;
    } finally {
      if (request.current === controller) { request.current = null; if (mounted.current) setBusy(""); }
    }
  }

  async function saveSettings(settings) {
    return mutate("settings", settings, result => {
      const changedSource = result.settings.sourceAccountId !== data.settings.sourceAccountId;
      resource.setData(current => ({ ...current, settings: result.settings, ...(changedSource ? { cards: null, sources: [] } : {}) }));
      if (changedSource) setSelected([]);
      setEditing(false);
    });
  }

  async function start() {
    if (!ready || locked || !selectedCards.length || resource.loading || resource.error) return;
    try {
      await mutate("start", { cardIds: selectedCards.map(card => card.id) }, result => {
        resource.setData(current => ({ ...current, ...result }));
        setSelected([]);
      });
    } catch { /* The action error is shown above the board. */ }
  }

  async function stop() {
    if (busy || rechecking || resource.loading) return;
    try {
      await mutate("stop", {}, result => {
        resource.setData(current => ({ ...current, ...result }));
      });
    } catch { /* The action error is shown above the board. */ }
  }

  function toggleCard(id) {
    setSelected(current => current.includes(id) ? current.filter(value => value !== id) : current.length < 50 ? [...current, id] : current);
  }

  const settingSummary = displayedSetup.sourceAccountId && displayedSetup.accountIds.length ? `Every video goes to ${displayedSetup.accountIds.length} ${displayedSetup.accountIds.length === 1 ? "account" : "accounts"}, one video every ${intervalLabel(displayedSetup.intervalMinutes)}.` : "Choose a source account, destination accounts, and your posting interval.";
  return <div className="dropper">
    <Alert message={error || resource.error}/>
    {resource.error && <button type="button" className="bridge-button secondary small" disabled={resource.loading} onClick={resource.reload}>Try again</button>}
    {hasUnavailable && <p className="bridge-notice" role="status">A saved account is unavailable. Choose connected accounts in Edit setup before starting another batch.</p>}
    <section className="bridge-panel dropper-board-panel" aria-label="Account dropper">
      <FunnelBoard demo={demo} source={boardSource} destinations={boardDestinations} cards={cards} wrongFormat={data.wrongFormat || []} currentDrop={currentDrop} catalog={catalog} intervalMinutes={displayedSetup.intervalMinutes} loading={!accountsReady || data.cards === null && resource.loading} onSetup={() => setEditing(true)} setupDisabled={locked || !accountsReady || resource.loading || Boolean(resource.error)}/>
      <div className="dropper-board-controls">
        <div className="dropper-board-summary">
          <strong>{data.running ? "Dropper is running" : data.inFlight ? "Finishing a video" : "Ready when you are"}</strong>
          <p>{settingSummary}</p>
          {Boolean(data.running || data.inFlight) && <span role="status">{preparing.length ? "Preparing a video for your destinations." : waiting.length && data.nextSlotAt ? `Next video begins ${dateTime(data.nextSlotAt, project.timeZone)}.` : "Checking the queue…"}</span>}
        </div>
        <div className="dropper-board-actions">
          {(data.running || data.inFlight) ? <button type="button" className="bridge-button secondary" disabled={Boolean(busy) || rechecking || resource.loading} onClick={stop}><Icon name="close" size={17}/>{busy === "stop" ? "Stopping…" : "Stop dropper"}</button>
            : <button type="button" className="bridge-button" disabled={!ready || !selectedCards.length || locked || resource.loading || Boolean(resource.error)} onClick={start}><Icon name="dropper" size={18}/>{busy === "start" ? "Starting…" : `Start dropper${selectedCards.length ? ` · ${selectedCards.length} ${selectedCards.length === 1 ? "video" : "videos"}` : ""}`}</button>}
          <button type="button" className="bridge-button secondary small" disabled={locked || !accountsReady || Boolean(resource.error) || data.cards === null && resource.loading} onClick={() => setEditing(true)}><Icon name="settings" size={17}/>{data.settings.sourceAccountId ? "Edit setup" : "Set up dropper"}</button>
        </div>
      </div>
      <p className="dropper-start-note">The first video begins immediately. Later videos follow your interval. Stop cancels videos that haven’t been added to Posts; manage videos already added from <a href={dashboardPath("posts")}>Posts</a>.</p>
    </section>
    <div className="dropper-lower">
      <section className="bridge-panel dropper-review" aria-labelledby="dropper-review-title">
        <div className="dropper-section-heading"><div><h2 id="dropper-review-title">Choose videos</h2><p>Videos drop in the order you select them. Up to 50 per batch.</p></div><button type="button" className="bridge-text-button" disabled={locked || resource.loading || !source} onClick={resource.reload}><Icon name="refresh" size={16}/> Refresh</button></div>
        {!accountsReady || data.cards === null && resource.loading ? <p className="dropper-empty" role="status">Loading your accounts and videos…</p>
          : !sourceAccounts.length ? <div className="dropper-empty"><p>Connect TikTok, YouTube, Instagram, Facebook or Threads to use its recent videos.</p><button type="button" className="bridge-button secondary small" onClick={onAccounts}>Connect an account</button></div>
          : !source ? <div className="dropper-empty"><p>Choose the account whose videos you want to drop.</p><button type="button" className="bridge-button secondary small" disabled={locked} onClick={() => setEditing(true)}>Choose source</button></div>
          : resource.error && data.cards === null ? <p className="dropper-empty">Your videos could not be loaded. Try again above.</p>
          : !cards.length ? <p className="dropper-empty">{data.sources.find(item => item.accountId === source.id)?.error || "No recent videos are available from this account. Refresh to check again."}</p>
          : <>
            <div className="dropper-selection-bar"><Check checked={Boolean(selectable.length) && selectedCards.length === Math.min(50, selectable.length)} disabled={locked || !selectable.length || resource.loading} onChange={event => setSelected(event.target.checked ? selectable.slice(0, 50).map(card => card.id) : [])}>Select {selectable.length > 50 ? "first 50" : "all available"}</Check><span>{selectedCards.length} selected{selectable.length > 50 ? " · up to 50 per batch" : ""}</span></div>
            <div className="dropper-video-grid">{cards.map(card => <ReviewCard key={card.id} card={card} selected={selected.includes(card.id)} order={selected.indexOf(card.id) + 1} disabled={locked || !selectableIds.has(card.id) || selectedCards.length >= 50 && !selected.includes(card.id) || resource.loading} alreadyQueued={card.pushable && fitting.includes(card) && !selectableIds.has(card.id)} tooLong={!fitting.includes(card)} catalog={catalog} timeZone={project.timeZone} onChange={() => toggleCard(card.id)}/>)}</div>
          </>}
      </section>
      <DropQueue queue={data.queue} running={data.running} timeZone={project.timeZone} catalog={catalog}/>
    </div>
    {editing && <DropperSettings project={project} catalog={catalog} accounts={accounts} settings={data.settings} onSave={saveSettings} onClose={() => { if (!busy) setEditing(false); }} onAccounts={onAccounts}/>}
  </div>;
}

function AccountAvatar({ account, className = "" }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [account?.avatar]);
  const initial = (account?.label || "").trim().replace(/^@+/, "").trim().slice(0, 1).toUpperCase() || "?";
  return account?.avatar && !failed ? <img className={`dropper-avatar ${className}`} src={account.avatar} alt="" referrerPolicy="no-referrer" onError={() => setFailed(true)}/>
    : <span className={`dropper-avatar dropper-avatar-fallback ${className}`} aria-hidden="true">{initial}</span>;
}

const CARD_HEIGHT = 66;

// Station positions scale with the stage, like the reference: posts wait near
// the top, the rim sits about a third of the way down, the neck near halfway,
// and the stack of drops runs down behind the counters.
function funnelGeometry(width, height) {
  const rim = Math.round(height * .27), slant = Math.round(height * .5), neck = Math.round(height * .54);
  const cardWidth = width < 520 ? Math.max(200, width * .74) : Math.min(400, Math.max(260, width * .4));
  // Posts fall straight down a left, centre or right lane, land on the rim,
  // then slide along it to the centre before dropping through, like the reference.
  const offset = width < 520 ? Math.round(width * .08) : Math.round(Math.min(width * .22, (width - cardWidth) / 2 - 12));
  const onRim = rim - CARD_HEIGHT - 3, inNeck = neck - CARD_HEIGHT + 6;
  return { rim, slant, neck, cardWidth, offset, queue: Math.round(height * .055), onRim, inFunnel: Math.round((onRim + inNeck) / 2), inNeck, stack: neck + 16, sideInset: Math.min(20, width * .02) };
}
// Lane for each post in turn (-1 left, 0 centre, 1 right); neighbours never share one.
const LANES = [0, -1, 1, 0, -1, 1, -1, 0, 1];

function FunnelBoard({ demo, source, destinations, cards, wrongFormat: realWrongFormat, currentDrop, catalog, loading, intervalMinutes: interval, onSetup, setupDisabled }) {
  const stage = useRef(null);
  const wrongFormat = demo ? [...realWrongFormat, ...demoRejects(cards, source?.platform)] : realWrongFormat;
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [elapsed, setElapsed] = useState(Infinity);
  const feed = funnelFeed(cards, wrongFormat, { destinations, catalog });
  const feedKey = `${feed.map(item => item.id).join(",")}|${destinations.map(account => account.id).join(",")}`;

  useEffect(() => {
    if (!stage.current) return;
    const resize = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    resize.observe(stage.current);
    return () => resize.disconnect();
  }, []);

  // Replay the sort whenever a different set of posts or destinations arrives.
  useLayoutEffect(() => {
    if (!feed.length || window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setElapsed(Infinity); return; }
    const started = performance.now(), total = funnelDuration(feed);
    setElapsed(0);
    const timer = setInterval(() => {
      const now = performance.now() - started;
      setElapsed(now);
      if (now >= total) clearInterval(timer);
    }, 100);
    return () => clearInterval(timer);
  }, [feedKey]);

  const fitting = cards.filter(card => videoFit(card, destinations, catalog).fits);
  const rejectedTotal = wrongFormat.length + cards.length - fitting.length;
  const progress = funnelProgress(feed, elapsed);
  const skipped = progress.done ? rejectedTotal : progress.wrong;
  const ready = progress.done ? fitting.length : progress.landed.length;
  const stacked = (progress.done ? fitting : progress.landed).slice(0, 8);
  const { width, height } = size, geometry = funnelGeometry(width, height), center = width / 2, half = geometry.cardWidth / 2 + 14;
  // Labels sit just inside the funnel wall at the height of their second line.
  const labelInset = Math.round(geometry.sideInset + (center - half - geometry.sideInset) * 46 / Math.max(1, geometry.slant - geometry.rim) + 14);
  // The tinted inside of the funnel, from the rim down through the neck.
  const inside = width ? `M ${geometry.sideInset} ${geometry.rim} H ${width - geometry.sideInset} L ${center + half} ${geometry.slant} V ${geometry.neck} H ${center - half} V ${geometry.slant} Z` : "";
  const sides = width ? `M ${geometry.sideInset} ${geometry.rim + 2} L ${center - half} ${geometry.slant} V ${geometry.neck} M ${width - geometry.sideInset} ${geometry.rim + 2} L ${center + half} ${geometry.slant} V ${geometry.neck}` : "";
  const setup = loading ? "Loading your setup…" : [source?.label, source && platformName(catalog, source.platform), destinations.length ? `${destinations.length} ${destinations.length === 1 ? "destination" : "destinations"}` : "no destinations yet",
    source && destinations.length ? `every ${intervalLabel(interval)}` : null, "keep: videos that fit"].filter(Boolean).join(" · ");
  const summary = loading ? "Loading your posts." : `${fitting.length} ${fitting.length === 1 ? "video is" : "videos are"} ready to post. ${rejectedTotal} ${rejectedTotal === 1 ? "post is" : "posts are"} the wrong format.`;
  const stageStyle = { "--dropper-card-width": `${geometry.cardWidth}px`, "--dropper-card-height": `${CARD_HEIGHT}px`, "--dropper-queue": `${geometry.queue}px`, "--dropper-rim": `${geometry.onRim}px`, "--dropper-funnel": `${geometry.inFunnel}px`, "--dropper-neck": `${geometry.inNeck}px`, "--dropper-stack": `${geometry.stack}px` };

  return <div className="dropper-funnel-board">
    <div className="dropper-funnel-head">
      <div><h2>Dropper</h2><p>{setup}</p></div>
      {!loading && source && <span><i aria-hidden="true"/>{cards.length + wrongFormat.length} posts</span>}
    </div>
    <p className="dropper-visually-hidden" aria-live="polite">{summary}</p>
    <div className="dropper-funnel-stage" ref={stage} style={stageStyle}>
      <svg className="dropper-funnel-lines" width={width} height={height} aria-hidden="true">
        <defs>
          <linearGradient id="dropper-funnel-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#d24fe0" stopOpacity=".3"/>
            <stop offset=".55" stopColor="#d65ee2" stopOpacity=".16"/>
            <stop offset="1" stopColor="#de7ee8" stopOpacity=".1"/>
          </linearGradient>
        </defs>
        <path className="dropper-funnel-fill" d={inside} fill="url(#dropper-funnel-fill)"/>
        <path className="dropper-funnel-side" d={sides}/>
        <line className="dropper-funnel-rim" x1="0" x2={width} y1={geometry.rim} y2={geometry.rim}/>
      </svg>
      {width >= 520 && <>
        <span className="dropper-funnel-label left" style={{ top: geometry.rim + 12, left: labelInset }} aria-hidden="true">Right format<br/>drops through</span>
        <span className="dropper-funnel-label right" style={{ top: geometry.rim + 12, right: labelInset }} aria-hidden="true">Skipped ×<strong>{loading ? "–" : skipped}</strong></span>
      </>}
      {!source ? <button type="button" className="dropper-funnel-empty" disabled={setupDisabled} onClick={onSetup}><Icon name={loading ? "clock" : "plus"} size={20}/>{loading ? "Loading…" : "Choose source account"}</button>
        : loading ? <span className="dropper-funnel-empty">Loading your posts…</span>
        : !feed.length ? <span className="dropper-funnel-empty">No recent posts on {source.label}</span>
        : progress.done && !currentDrop ? <span className="dropper-funnel-idle" aria-hidden="true">✓ all {cards.length + wrongFormat.length} posts checked</span> : null}
      {progress.active.map(({ item, index }) => <FunnelCard key={`${feedKey}:${index}`} item={item} catalog={catalog} className={item.fits ? "keep" : "reject"} style={{ "--dropper-dx": `${LANES[index % LANES.length] * geometry.offset}px` }}/>)}
      {currentDrop && <FunnelCard item={{ ...currentDrop, fits: true, tooLong: [] }} catalog={catalog} className="dropping" status="dropping now"/>}
      <div className="dropper-funnel-stack" aria-hidden="true">
        {stacked.map((item, index) => <FunnelCard key={item.id} item={{ ...item, fits: true }} catalog={catalog} className="stacked" style={{ top: index * (CARD_HEIGHT + 9) }}/>)}
      </div>
      <div className="dropper-funnel-counts">
        <div className="wrong"><span>Wrong format ×</span><strong>{loading ? "–" : skipped}</strong></div>
        <div className="ready"><span>Ready to post ✓</span><strong>{loading ? "–" : ready}</strong></div>
      </div>
    </div>
  </div>;
}

function FunnelCard({ item, catalog, className, style, status }) {
  const name = platformName(catalog, item.platform), length = durationLabel(item.duration);
  const video = item.format === undefined || item.format === "video";
  const title = clip(item.title || item.caption || (video ? `${name} video` : `${name} ${wrongFormatLabel(item.format)}`), 52);
  const kind = video ? `${length ? `${length} ` : ""}video` : wrongFormatLabel(item.format);
  const skips = (item.tooLong || []).map(account => platformName(catalog, account.platform));
  const checked = status || (item.fits ? `${kind} · drops${skips.length ? ` · skips ${skips.join(", ")}` : ""}` : video ? `${kind} · too long` : `${kind} · wrong format`);
  return <div className={`dropper-funnel-card ${className}`} style={style} aria-hidden="true">
    <span className="dropper-funnel-icon" data-platform={item.platform}><PlatformIcon platform={item.platform} variant="mono" size={17}/></span>
    <span className="dropper-funnel-text"><strong>{title}</strong>
      {className === "keep" || className === "reject" ? <span className="dropper-funnel-sub"><small className="pending">{domainOf(item.url) || name}</small><small className="checked">{checked}</small></span> : <span className="dropper-funnel-sub"><small>{checked}</small></span>}
    </span>
    <span className="dropper-funnel-close">×</span>
    {className === "reject" && <span className="dropper-funnel-x">×</span>}
  </div>;
}

const clip = (text, length) => text.length > length ? `${text.slice(0, length - 1).trimEnd()}…` : text;
function domainOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
}

function ReviewCard({ card, selected, order, disabled, alreadyQueued, tooLong, catalog, timeZone, onChange }) {
  const title = card.title || card.caption || `${platformName(catalog, card.platform)} video`;
  return <article className={`dropper-video-card ${selected ? "selected" : ""}`}>
    <div className="dropper-video-media">
      {card.previewUrl ? <video src={card.previewUrl} poster={card.thumbnailUrl || undefined} controls playsInline muted preload="none" referrerPolicy="no-referrer"/>
        : card.thumbnailUrl ? <img src={card.thumbnailUrl} alt="" loading="lazy" referrerPolicy="no-referrer"/> : <Icon name="video" size={35}/>}
      <label className="dropper-video-select"><input type="checkbox" checked={selected} disabled={disabled} onChange={onChange}/><span className="dropper-visually-hidden">Select {title}</span></label>
      {selected && <span className="dropper-selected-order">{order === 1 ? "First" : `#${order}`}</span>}
    </div>
    <div className="dropper-video-description"><strong title={title}>{title}</strong>{Boolean(card.publishedAt) && <span>{dateTime(card.publishedAt, timeZone)}</span>}
      {!card.pushable && <small>Meadow can’t download this video yet.</small>}{alreadyQueued && <small>Already in the dropper queue.</small>}{tooLong && <small>Too long for your destinations.</small>}
      {card.url && <a href={card.url} target="_blank" rel="noreferrer">Review video <Icon name="external" size={13}/></a>}
    </div>
  </article>;
}

function DropQueue({ queue, running, timeZone, catalog }) {
  const pending = queue.filter(item => ["queued", "downloading", "submitting"].includes(item.status)).length;
  const shown = [...queue].sort((a, b) => {
    const aPending = ["queued", "downloading", "submitting"].includes(a.status), bPending = ["queued", "downloading", "submitting"].includes(b.status);
    return Number(bPending) - Number(aPending) || (aPending ? a.slotAt - b.slotAt : (b.createdAt || 0) - (a.createdAt || 0));
  });
  return <section className="bridge-panel dropper-queue" aria-labelledby="dropper-queue-title">
    <div className="dropper-section-heading"><div><h2 id="dropper-queue-title">Dropper queue</h2><p>{pending ? `${pending} ${pending === 1 ? "video" : "videos"} waiting or preparing` : running ? "Finishing this batch" : "Your batch and its progress appear here."}</p></div></div>
    {!queue.length ? <p className="dropper-empty">Select videos, then start the dropper. Preparing a video and adding it to Posts can take a few minutes.</p>
      : <ol>{shown.map((item, index) => <li key={`${item.cardId}:${item.createdAt || item.slotAt}:${index}`} className={`dropper-queue-item ${item.status}`}>
        {item.thumbnailUrl ? <img src={item.thumbnailUrl} alt="" loading="lazy" referrerPolicy="no-referrer"/> : <span className="dropper-queue-thumb"><PlatformIcon platform={item.platform} size={21}/></span>}
        <div><strong>{item.caption || `${platformName(catalog, item.platform)} video`}</strong><span>{dropperQueueStatus(item, at => dateTime(at, timeZone))}</span>
          {item.accountIds?.length > 0 && <small>{item.accountIds.length} destination {item.accountIds.length === 1 ? "account" : "accounts"}</small>}
          {item.rejected?.length > 0 && <small className="dropper-rejected">{item.rejected.map(entry => `${entry.accountName || "An account"}: ${entry.errors?.[0] || "Could not accept this video"}`).join(" · ")}</small>}
          {item.postId && <a href={dashboardPath("posts")}>View posting status <Icon name="external" size={13}/></a>}
        </div>
      </li>)}</ol>}
  </section>;
}

function DropperSettings({ project, catalog, accounts: initialAccounts, settings, onSave, onClose, onAccounts }) {
  const [sourceId, setSourceId] = useState(settings.sourceAccountId || "");
  const [selected, setSelected] = useState(settings.accountIds);
  const [overrides, setOverrides] = useState(settings.overrides || {});
  const [interval, setInterval] = useState(() => intervalInput(settings.intervalMinutes));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const { accounts, refreshOptions } = useAccountOptions(project.id, initialAccounts, selected);
  const sources = dropperSourceAccounts(accounts);
  const eligible = dropperDestinationAccounts(accounts, catalog, sourceId);
  const chosen = selected.filter(id => eligible.some(account => account.id === id));
  const unavailable = selected.filter(id => !eligible.some(account => account.id === id));
  const minutes = intervalMinutes(interval.value, interval.unit);
  const optionsPending = accounts.some(account => chosen.includes(account.id) && optionPlatforms.has(account.platform) && account.optionsLoading);
  const optionsFailed = accounts.some(account => chosen.includes(account.id) && optionPlatforms.has(account.platform) && account.optionsError);

  function chooseSource(id) { setSourceId(id); setSelected(current => current.filter(value => value !== id)); }
  function toggle(id) { setSelected(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id]); }
  async function save(event) {
    event.preventDefault();
    if (saving || !minutes || !chosen.length || !sources.some(account => account.id === sourceId) || optionsPending || optionsFailed) return;
    setSaving(true); setError("");
    try {
      await onSave({ sourceAccountId: sourceId, accountIds: chosen, intervalMinutes: minutes, overrides: Object.fromEntries(chosen.map(id => [id, { settings: overrides[id]?.settings || {} }])) });
    } catch (failure) { setError(failure.message); }
    finally { setSaving(false); }
  }

  return <Modal title="Set up your dropper" wide busy={saving} onClose={onClose} className="dropper-settings">
    <form onSubmit={save}>
      <Alert message={error}/>
      <fieldset disabled={saving}>
        <Field label="Source account" hint="Use recent videos from one connected account."><select required value={sourceId} onChange={event => chooseSource(event.target.value)}><option value="">Choose an account</option>{sources.map(account => <option key={account.id} value={account.id}>{account.label} · {platformName(catalog, account.platform)}</option>)}</select></Field>
        {!sources.length && <p className="bridge-small">Connect TikTok, YouTube, Instagram, Facebook or Threads first.</p>}
        <div className="dropper-interval"><Field label="Posting interval"><input type="number" required min="1" step="1" max={interval.unit === "days" ? 7 : interval.unit === "hours" ? 168 : 10080} value={interval.value} onChange={event => setInterval(current => ({ ...current, value: event.target.value }))}/></Field><Field label="Unit"><select value={interval.unit} onChange={event => setInterval(current => ({ ...current, unit: event.target.value }))}><option value="minutes">Minutes</option><option value="hours">Hours</option><option value="days">Days</option></select></Field></div>
        <p className={`bridge-small ${!minutes ? "bridge-validation-error" : ""}`}>{minutes ? `The first video begins now, then one every ${intervalLabel(minutes)}. Each goes to all selected destinations.` : "Choose a whole-number interval between 1 minute and 7 days."}</p>
        <div className="dropper-settings-destinations"><h3>Destination accounts</h3><p className="bridge-small">Choose the accounts each video should land in.</p>
          {unavailable.length > 0 && <div className="bridge-notice">{unavailable.length} saved {unavailable.length === 1 ? "destination is" : "destinations are"} unavailable. Saving uses the connected accounts you select below.</div>}
          {!sourceId ? <p className="dropper-empty">Choose a source first.</p> : !eligible.length ? <p className="dropper-empty">Connect another account that accepts videos.</p> : eligible.map(account => <div key={account.id} className={`dropper-settings-account ${chosen.includes(account.id) ? "selected" : ""}`}>
            <Check checked={chosen.includes(account.id)} onChange={() => toggle(account.id)}><AccountAvatar account={account}/><span><strong>{account.label}</strong><small><PlatformIcon platform={account.platform} size={15}/>{platformName(catalog, account.platform)}</small></span></Check>
            {chosen.includes(account.id) && destinationSettingsPlatforms.has(account.platform) && <details className="dropper-account-options" open={optionPlatforms.has(account.platform) || account.platform === "youtube" ? true : undefined}>
              <summary>Posting settings for {account.label}</summary>
              {account.optionsError ? <><Alert message={account.optionsError}/><button type="button" className="bridge-text-button" disabled={account.optionsLoading} onClick={() => refreshOptions(account.id)}>Retry posting settings</button></>
                : optionPlatforms.has(account.platform) && account.optionsLoading ? <p className="bridge-small" role="status">Loading posting settings…</p>
                : <DestinationSettings account={account} settings={overrides[account.id]?.settings || {}} onChange={value => setOverrides(current => ({ ...current, [account.id]: { settings: value } }))} hasVideo hasImages={false}/>}
            </details>}
          </div>)}
        </div>
      </fieldset>
      <div className="bridge-modal-actions dropper-settings-actions"><button type="button" className="bridge-text-button" disabled={saving} onClick={() => { onClose(); onAccounts(); }}>Connect accounts</button><button type="button" className="bridge-button secondary" onClick={onClose} disabled={saving}>Cancel</button><button type="submit" className="bridge-button" disabled={saving || !sources.some(account => account.id === sourceId) || !chosen.length || !minutes || optionsPending || optionsFailed}>{saving ? "Saving…" : "Save setup"}</button></div>
    </form>
  </Modal>;
}
