import { useEffect, useRef, useState } from "react";
import { api } from "./BridgeApi.js";
import { Icon } from "./Icons.jsx";
import { Alert, Check, Modal, PlatformIcon, dateTime, number, useProjectResource } from "./ui.jsx";
import { DestinationSettings } from "./DestinationSettings.jsx";
import { prefetchHandTracking, useHandSwipe } from "./useHandSwipe.js";
import "./swipe.css";

// Swipe or Push: review recent videos from connected accounts. Right pushes a
// video to the chosen destinations, left skips it. The first push goes out
// now and each later one eight hours after the previous push.

const SOURCE_PLATFORMS = ["tiktok", "youtube", "instagram", "facebook", "threads"];
const CHAT_ONLY = new Set(["twitch", "kick"]);
const OPTION_PLATFORMS = new Set(["tiktok", "pinterest"]);
const THRESHOLD = 110;
// A hand swipe could be accidental, so a camera push waits this long and can be cancelled.
const CAMERA_PUSH_DELAY_MS = 2000;
const CAMERA_KEY = "meadow:swipe-camera";
// How far the card leans while following a hand, and how long a decided card
// takes to fly off the screen (see .swipe-flight in swipe.css).
const HAND_LEAN = 150;
const PENDING_LEAN = 120;
const FLIGHT_MS = 800;
const readCameraPreference = () => { try { return window.localStorage.getItem(CAMERA_KEY) === "on"; } catch { return false; } };
const initial = { cards: null, queue: [], sources: [], settings: { accountIds: [], overrides: {} }, nextSlotAt: null, spacingHours: 8 };

const platformName = (catalog, id) => catalog.find(item => item.id === id)?.name || id;
const soon = at => !at || at <= Date.now() + 60000;

export default function SwipeOrPush({ project, catalog, accounts, accountsReady, notify, onAccounts }) {
  const resource = useProjectResource(project.id, "/swipe", initial);
  const { data } = resource;
  const [hidden, setHidden] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [last, setLast] = useState(null);
  const [cameraOn, setCameraOn] = useState(readCameraPreference);
  const [pending, setPending] = useState(null);
  const [paused, setPaused] = useState(false);
  const [flash, setFlash] = useState(null);
  const [flights, setFlights] = useState([]);
  const deckRef = useRef(null);
  const pendingRef = useRef(pending);
  pendingRef.current = pending;
  const cards = (data.cards || []).filter(card => !hidden.includes(card.id));
  const card = cards[0];
  const settingsReady = data.settings.accountIds.length > 0;
  const working = data.queue.some(item => ["queued", "downloading"].includes(item.status));
  const sourceAccounts = accounts.filter(account => SOURCE_PLATFORMS.includes(account.platform) && account.status === "connected");
  const hasSource = sourceAccounts.length > 0;
  const [savingSource, setSavingSource] = useState(false);

  // Pick the channel whose videos fill the deck, or every channel.
  async function chooseSource(accountId) {
    setSavingSource(true); setError("");
    try {
      const result = await api.project(project.id, "/swipe/settings", { method: "POST", body: { sourceAccountIds: accountId ? [accountId] : [] } });
      resource.setData(current => ({ ...current, cards: null, settings: result.settings }));
      setPending(null);
      resource.reload();
    } catch (failure) { setError(failure.message); }
    finally { setSavingSource(false); }
  }

  // Follow pushes while Meadow downloads and schedules them.
  useEffect(() => {
    if (!working) return undefined;
    const timer = setInterval(resource.reload, 8000);
    return () => clearInterval(timer);
  }, [working, resource.reload]);

  // `fromX` is where the card already leans, so its flight starts from there.
  async function decide(decision, fromX = 0) {
    // A skip during a camera countdown cancels the push; any other choice replaces it.
    if (pendingRef.current) { setPending(null); if (decision === "skip") return false; }
    if (!card || busy || editing) return false;
    if (decision === "push" && !card.pushable) return false;
    if (decision === "push" && !settingsReady) { setEditing(true); return false; }
    setBusy(true); setError("");
    // The card flies off at once and comes back if the decision fails.
    const rect = deckRef.current?.getBoundingClientRect();
    const flight = { id: `${card.id}:${Date.now()}`, card, decision, fromX, rect: rect ? { left: rect.left, top: rect.top, width: rect.width } : null };
    setHidden(current => [...current, card.id]);
    if (flight.rect) {
      setFlights(current => [...current, flight]);
      setTimeout(() => setFlights(current => current.filter(item => item !== flight)), FLIGHT_MS);
    }
    try {
      const result = await api.project(project.id, "/swipe/decisions", { method: "POST", body: { cardId: card.id, decision } });
      setLast({ card, decision });
      if (decision === "push") {
        notify(soon(result.decision.slotAt) ? "Pushing now. Meadow is downloading the video." : `Queued. It goes out ${dateTime(result.decision.slotAt, project.timeZone)}.`);
        resource.reload();
      }
      return true;
    } catch (failure) {
      setHidden(current => current.filter(id => id !== card.id));
      setFlights(current => current.filter(item => item !== flight));
      if (failure.code === "swipe_settings_required") setEditing(true);
      setError(failure.message);
      return false;
    } finally { setBusy(false); }
  }

  async function undo() {
    if (!last || busy) return;
    setBusy(true); setError("");
    try {
      await api.project(project.id, `/swipe/decisions/${encodeURIComponent(last.card.id)}`, { method: "DELETE" });
      setHidden(current => current.filter(id => id !== last.card.id));
      setLast(null);
      resource.reload();
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }

  function toggleCamera() {
    setCameraOn(on => {
      try { window.localStorage.setItem(CAMERA_KEY, on ? "off" : "on"); } catch { /* The choice lasts for this visit. */ }
      return !on;
    });
    setPending(null);
    setPaused(false);
  }

  // Download hand tracking in the background once the page settles, so the
  // camera is ready in a moment when it is turned on. Skipped on touch
  // devices and data-saving connections, and it never turns the camera on.
  useEffect(() => {
    const connection = navigator.connection;
    if (connection?.saveData || /2g$/.test(connection?.effectiveType || "") || !window.matchMedia?.("(pointer: fine)").matches) return undefined;
    const start = () => { prefetchHandTracking().catch(() => {}); };
    if (window.requestIdleCallback) {
      const id = window.requestIdleCallback(start, { timeout: 4000 });
      return () => window.cancelIdleCallback(id);
    }
    const timer = setTimeout(start, 1500);
    return () => clearTimeout(timer);
  }, []);

  // A big SKIP or PUSH flash on the camera confirms each hand swipe.
  useEffect(() => {
    if (!flash) return undefined;
    const timer = setTimeout(() => setFlash(null), 900);
    return () => clearTimeout(timer);
  }, [flash]);

  // A right swipe in front of the camera starts a short countdown; a left
  // swipe cancels it or skips the card.
  function onGesture(direction) {
    // A held fist pauses hand control, and another resumes it.
    if (direction === "fist") { setPaused(value => !value); setPending(null); return; }
    if (paused) return;
    if (!card || busy || editing) return;
    if (pending) { if (direction === "left") { setPending(null); setFlash({ kind: "cancel", at: Date.now() }); } return; }
    if (direction === "left") { setFlash({ kind: "skip", at: Date.now() }); decide("skip", -HAND_LEAN); return; }
    if (!card.pushable) { setError(`Meadow can't download ${platformName(catalog, card.platform)} videos yet. Swipe left to skip it.`); return; }
    if (!settingsReady) { setError("Choose destinations before pushing with your hand."); return; }
    setError("");
    setFlash({ kind: "push", at: Date.now() });
    setPending({ cardId: card.id });
  }
  const camera = useHandSwipe({ enabled: cameraOn, paused, onGesture });

  const decideRef = useRef(decide);
  decideRef.current = decide;
  const topCardRef = useRef(card?.id);
  topCardRef.current = card?.id;
  useEffect(() => {
    if (!pending) return undefined;
    const timer = setTimeout(async () => {
      if (pendingRef.current?.cardId !== pending.cardId || topCardRef.current !== pending.cardId) return;
      pendingRef.current = null;
      setPending(null);
      await decideRef.current("push", PENDING_LEAN);
    }, CAMERA_PUSH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [pending]);

  // Arrow keys mirror the swipe: right pushes, left skips. Escape or left
  // cancels a camera push that is counting down.
  useEffect(() => {
    const onKey = event => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || event.target.closest?.("input, textarea, select, [contenteditable], .bridge-modal")) return;
      if (pendingRef.current && ["Escape", "ArrowLeft"].includes(event.key)) { event.preventDefault(); setPending(null); return; }
      if (event.key === "ArrowRight") { event.preventDefault(); decideRef.current("push"); }
      if (event.key === "ArrowLeft") { event.preventDefault(); decideRef.current("skip"); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const handNudge = cameraOn && camera.status === "ready" && camera.handVisible && !pending && !paused ? Math.max(-1, Math.min(1, camera.pull)) * HAND_LEAN : 0;

  const loading = data.cards === null;
  return <div className="swipe-page">
    <Alert message={error || resource.error}/>
    <div className="swipe-toolbar">
      <p className="bridge-small">Swipe right to push a video to your other accounts, or left to skip it. The first push goes out now, then one every {data.spacingHours} hours.</p>
      <div className="swipe-toolbar-actions">
      {sourceAccounts.length > 1 && <label className="swipe-source-picker"><span>Videos from</span>
        <select value={data.settings.sourceAccountIds?.[0] || ""} disabled={savingSource} onChange={event => chooseSource(event.target.value)}>
          <option value="">All channels</option>
          {sourceAccounts.map(account => <option key={account.id} value={account.id}>{account.label} · {platformName(catalog, account.platform)}</option>)}
        </select>
      </label>}
      <button type="button" className={`bridge-button small ${cameraOn ? "" : "secondary"}`} onClick={toggleCamera} onPointerEnter={() => prefetchHandTracking().catch(() => {})} onFocus={() => prefetchHandTracking().catch(() => {})} aria-pressed={cameraOn}><Icon name="camera" size={16}/>{cameraOn ? "Stop camera" : "Swipe with your hand"}</button>
      <button type="button" className="bridge-button secondary small" onClick={() => setEditing(true)}><Icon name="settings" size={16}/>{settingsReady ? `Pushing to ${data.settings.accountIds.length} ${data.settings.accountIds.length === 1 ? "account" : "accounts"}` : "Choose destinations"}</button>
      </div>
    </div>
    <div className={`swipe-layout ${cameraOn ? "camera-mode" : ""}`}>
      {cameraOn && <CameraStage camera={camera} paused={paused} onPause={() => { setPaused(true); setPending(null); }} onResume={() => setPaused(false)} flash={flash}/>}
      <section className="swipe-stage" aria-label="Videos to review">
        {flights.map(flight => <FlyingCard key={flight.id} flight={flight} catalog={catalog} timeZone={project.timeZone}/>)}
        {loading && resource.error ? <div className="bridge-panel bridge-empty"><p>Your videos could not be loaded.</p><button type="button" className="bridge-button secondary" onClick={resource.reload} disabled={resource.loading}>Try again</button></div>
          : loading ? <div className="bridge-panel bridge-empty"><p>Loading your videos…</p></div>
          : !hasSource && accountsReady ? <div className="bridge-panel bridge-empty"><div className="bridge-empty-icon"><Icon name="video" size={28}/></div><h2>Connect a video account</h2><p>Swipe or Push uses recent videos from TikTok, YouTube, Instagram, Facebook and Threads.</p><button type="button" className="bridge-button" onClick={onAccounts}>Connect an account</button></div>
          : !card ? <div className="bridge-panel bridge-empty"><div className="bridge-empty-icon"><Icon name="check" size={28}/></div><h2>You're all caught up</h2><p>New videos from your connected accounts show up here.</p><button type="button" className="bridge-button secondary" onClick={resource.reload} disabled={resource.loading}>Check again</button></div>
          : <>
            <div className="swipe-deck" ref={deckRef}>
              {cards[1] && <div className="swipe-card swipe-card-behind" aria-hidden="true"/>}
              <SwipeCard key={card.id} card={card} catalog={catalog} timeZone={project.timeZone} disabled={busy || editing || Boolean(pending)} onDecide={decide} nudge={handNudge}
                pending={pending?.cardId === card.id ? <div className="swipe-pending" role="status"><strong>Pushing in 2 seconds</strong><span>Swipe left or press Esc to cancel.</span><i/><button type="button" className="bridge-button secondary small" onClick={() => setPending(null)}>Cancel</button></div> : null}/>
            </div>
            <div className="swipe-actions">
              <button type="button" className="swipe-action skip" onClick={() => decide("skip")} disabled={busy} aria-label="Skip this video"><Icon name="close" size={26}/></button>
              {last && <button type="button" className="bridge-button secondary small swipe-undo" onClick={undo} disabled={busy}>Undo {last.decision === "push" ? "push" : "skip"}</button>}
              <button type="button" className="swipe-action push" onClick={() => decide("push")} disabled={busy || !card.pushable} aria-label="Push this video"><Icon name="arrow" size={26}/></button>
            </div>
            {!card.pushable && <p className="swipe-hint bridge-small">Meadow can't download {platformName(catalog, card.platform)} videos yet, so this one can only be skipped.</p>}
          </>}
      </section>
      {!cameraOn && <div className="swipe-side-column"><PushQueue queue={data.queue} nextSlotAt={data.nextSlotAt} sources={data.sources} catalog={catalog} timeZone={project.timeZone}/></div>}
    </div>
    {cameraOn && <div className="swipe-below"><PushQueue queue={data.queue} nextSlotAt={data.nextSlotAt} sources={data.sources} catalog={catalog} timeZone={project.timeZone}/></div>}
    {editing && <PushSettings project={project} catalog={catalog} accounts={accounts} settings={data.settings} onClose={() => setEditing(false)} onSaved={settings => { resource.setData(current => ({ ...current, settings })); setEditing(false); setError(""); notify("Push destinations saved."); }}/>}
  </div>;
}

// With the camera on, the preview is the main stage: a big mirrored view with
// a red or green box drawn over each hand (see useHandSwipe), full-height
// SKIP and PUSH bands on either side, and a flash when a swipe lands.
const FLASH_TEXT = { push: "Pushing →", skip: "← Skipped", cancel: "Push cancelled" };

function CameraStage({ camera, paused, onPause, onResume, flash }) {
  const ready = camera.status === "ready";
  const strength = Math.min(1, Math.abs(camera.pull));
  const message = camera.status === "error" ? camera.error
    : camera.status === "starting" ? "Starting the camera…"
    : camera.status === "loading" ? `Getting hand tracking ready… ${Math.round(camera.progress * 100)}%. The buttons and arrow keys work meanwhile.`
    : paused ? "Paused. Make a fist to resume."
    : camera.fist ? "Keep the fist still to pause."
    : camera.handVisible ? "Swipe right to push, left to skip. Hold a still fist to pause." : "Raise a hand so the camera can see it.";
  const pull = side => paused ? 0 : (side === "push" ? camera.pull > 0 : camera.pull < 0) ? strength : 0;
  return <section className="swipe-camera-stage" aria-label="Camera">
    <div className={`swipe-camera-frame ${paused ? "is-paused" : ""}`}>
      <video ref={camera.videoRef} muted playsInline aria-hidden="true"/>
      <canvas ref={camera.overlayRef} aria-hidden="true"/>
      {ready && <>
        <div className="swipe-camera-band skip" style={{ "--pull": pull("skip") }} aria-hidden="true"><Icon name="close" size={40}/><strong>Skip</strong><span>← swipe left</span></div>
        <div className="swipe-camera-band push" style={{ "--pull": pull("push") }} aria-hidden="true"><Icon name="arrow" size={40}/><strong>Push</strong><span>swipe right →</span></div>
        {!paused && <button type="button" className="swipe-camera-pause" onClick={onPause}>✊ Pause</button>}
      </>}
      {flash && !paused && <div key={flash.at} className={`swipe-camera-flash ${flash.kind}`} role="status">{FLASH_TEXT[flash.kind]}</div>}
      {paused && <div className="swipe-camera-paused" role="status"><strong>Paused</strong><span>Make a fist to resume</span><button type="button" className="bridge-button" onClick={onResume}>Resume</button></div>}
      <p className={`swipe-camera-status ${camera.status === "error" ? "is-error" : ""}`} role="status">{message}{camera.status === "loading" && <i className="swipe-camera-progress" style={{ "--progress": camera.progress }}/>}</p>
    </div>
  </section>;
}

function SwipeCard({ card, catalog, timeZone, disabled, onDecide, nudge = 0, pending = null }) {
  const [drag, setDrag] = useState({ x: 0, active: false });
  const start = useRef(null);
  const name = platformName(catalog, card.platform);

  function onPointerDown(event) {
    if (disabled || event.button !== 0 || event.target.closest("a, button, video, iframe")) return;
    start.current = { x: event.clientX, id: event.pointerId };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({ x: 0, active: true });
  }
  function onPointerMove(event) {
    if (start.current?.id !== event.pointerId) return;
    setDrag({ x: event.clientX - start.current.x, active: true });
  }
  async function onPointerEnd(event) {
    if (start.current?.id !== event.pointerId) return;
    const dx = event.clientX - start.current.x;
    start.current = null;
    const decision = dx > THRESHOLD && card.pushable ? "push" : dx < -THRESHOLD ? "skip" : null;
    if (!decision) { setDrag({ x: 0, active: false }); return; }
    setDrag({ x: 0, active: false });
    await onDecide(decision, dx);
  }

  const x = drag.active || drag.x ? drag.x : pending ? PENDING_LEAN : nudge;
  const strength = Math.min(1, Math.abs(x) / THRESHOLD);
  return <article className={`swipe-card ${drag.active ? "is-dragging" : ""} ${nudge && !drag.active ? "is-following" : ""}`} style={{ transform: `translateX(${x}px) rotate(${x / 22}deg)` }}
    onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerEnd} onPointerCancel={onPointerEnd}>
    <span className="swipe-stamp push" style={{ opacity: pending ? 1 : x > 0 ? strength : 0 }}>Push</span>
    <span className="swipe-stamp skip" style={{ opacity: x < 0 ? strength : 0 }}>Skip</span>
    {pending}
    <CardBody card={card} name={name} timeZone={timeZone}/>
  </article>;
}

function CardBody({ card, name, timeZone, still = false }) {
  return <>
    <header className="swipe-card-head">
      <PlatformIcon platform={card.platform} size={22}/>
      <div><strong>{card.accountName}</strong><span>{name}{card.publishedAt ? ` · ${dateTime(card.publishedAt, timeZone)}` : ""}</span></div>
      {card.url && <a href={card.url} target="_blank" rel="noreferrer" aria-label={`Open on ${name}`} tabIndex={still ? -1 : undefined}><Icon name="external" size={17}/></a>}
    </header>
    <div className={`swipe-media-frame ${card.platform}`}><CardMedia card={card} name={name} still={still}/></div>
    <CardMetrics metrics={card.metrics}/>
    {(card.title || card.caption) && <p className="swipe-caption">{card.title && card.title !== card.caption ? <strong>{card.title} </strong> : null}{card.caption}</p>}
  </>;
}

/** A decided card flying off the screen: up and away to the right, then
 * dropping, for a push; the same to the left for a skip. It sits in a fixed
 * layer over the deck, so it can leave the page without scrollbars. */
function FlyingCard({ flight, catalog, timeZone }) {
  const { card, decision, fromX, rect } = flight;
  const style = { left: rect.left, top: rect.top, width: rect.width, "--from-x": `${fromX}px`, "--from-rot": `${fromX / 22}deg`, "--dir": decision === "push" ? 1 : -1 };
  return <div className="swipe-flight" style={style} aria-hidden="true">
    <article className="swipe-card">
      <span className={`swipe-stamp ${decision}`}>{decision === "push" ? "Push" : "Skip"}</span>
      <CardBody card={card} name={platformName(catalog, card.platform)} timeZone={timeZone} still/>
    </article>
  </div>;
}

const METRIC_LABELS = [["views", "views"], ["likes", "likes"], ["comments", "comments"], ["shares", "shares"], ["saves", "saves"]];

/** The video's numbers on its platform, as last reported. */
function CardMetrics({ metrics = {} }) {
  const shown = METRIC_LABELS.filter(([key]) => Number.isFinite(metrics[key]));
  if (!shown.length) return <p className="swipe-metrics is-empty">No analytics reported for this video yet.</p>;
  return <dl className="swipe-metrics" aria-label="Video analytics">
    {shown.map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{number(metrics[key])}</dd></div>)}
  </dl>;
}

function CardMedia({ card, name, still = false }) {
  // A flying card shows a still frame rather than reloading the player.
  if (still) return card.thumbnailUrl ? <img className="swipe-media" src={card.thumbnailUrl} alt="" referrerPolicy="no-referrer"/> : <div className="swipe-media swipe-media-empty"><Icon name="video" size={34}/></div>;
  if (card.previewUrl) return <video className="swipe-media" src={card.previewUrl} poster={card.thumbnailUrl || undefined} controls playsInline loop muted preload="metadata" referrerPolicy="no-referrer"/>;
  if (card.embedUrl) return <iframe className="swipe-media" src={card.embedUrl} title={`${name} video`} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen loading="lazy" referrerPolicy="strict-origin-when-cross-origin"/>;
  if (card.thumbnailUrl) return <img className="swipe-media" src={card.thumbnailUrl} alt="" referrerPolicy="no-referrer"/>;
  return <div className="swipe-media swipe-media-empty"><Icon name="video" size={34}/></div>;
}

const statusText = (item, timeZone) => item.status === "queued" ? (soon(item.slotAt) ? "Starting…" : `Queued for ${dateTime(item.slotAt, timeZone)}`)
  : item.status === "downloading" ? "Downloading the video…"
  : item.status === "scheduled" ? (soon(item.slotAt) ? "Sent to your delivery queue" : `Scheduled for ${dateTime(item.slotAt, timeZone)}`)
  : item.status === "failed" ? item.error || "This push failed." : item.status;

function PushQueue({ queue, nextSlotAt, sources, catalog, timeZone }) {
  return <aside className="swipe-side">
    <section className="bridge-panel swipe-queue">
      <h2>Pushes</h2>
      <p className="bridge-small">Next push {soon(nextSlotAt) ? "goes out right away" : `goes out ${dateTime(nextSlotAt, timeZone)}`}.</p>
      {!queue.length ? <p className="bridge-small">Videos you push appear here.</p> : <ol>
        {queue.map(item => <li key={item.cardId} className={`swipe-queue-item ${item.status}`}>
          {item.thumbnailUrl ? <img src={item.thumbnailUrl} alt="" referrerPolicy="no-referrer"/> : <span className="swipe-queue-thumb"><PlatformIcon platform={item.platform} size={18}/></span>}
          <div>
            <strong>{item.caption || `${platformName(catalog, item.platform)} video`}</strong>
            <span>{statusText(item, timeZone)}</span>
            {item.rejected?.length ? <small>Not sent to {item.rejected.map(entry => `${entry.accountName} (${entry.errors[0]})`).join(", ")}</small> : null}
          </div>
        </li>)}
      </ol>}
    </section>
    {sources.length > 0 && <section className="bridge-panel swipe-sources">
      <h2>Video sources</h2>
      <ul>{sources.map(source => <li key={source.accountId}><PlatformIcon platform={source.platform} size={18}/><span>{source.accountName}</span><small>{source.error ? source.error : `${source.videos} recent ${source.videos === 1 ? "video" : "videos"}`}</small></li>)}</ul>
    </section>}
  </aside>;
}

function PushSettings({ project, catalog, accounts, settings, onClose, onSaved }) {
  const eligible = accounts.filter(account => account.status === "connected" && !CHAT_ONLY.has(account.platform) && catalog.find(item => item.id === account.platform)?.formats?.some(format => ["video", "reel"].includes(format)));
  const [selected, setSelected] = useState(settings.accountIds);
  const [overrides, setOverrides] = useState(settings.overrides || {});
  const [options, setOptions] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    for (const account of eligible.filter(item => selected.includes(item.id) && OPTION_PLATFORMS.has(item.platform) && !options[item.id])) {
      api.project(project.id, `/accounts/${encodeURIComponent(account.id)}/options`, { signal: controller.signal })
        .then(result => setOptions(current => ({ ...current, [account.id]: result.options })))
        .catch(failure => { if (failure.name !== "AbortError") setOptions(current => ({ ...current, [account.id]: { error: failure.message } })); });
    }
    return () => controller.abort();
  }, [selected.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  function toggle(id) { setSelected(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id]); }
  async function save() {
    setSaving(true); setError("");
    try {
      const result = await api.project(project.id, "/swipe/settings", { method: "POST", body: { accountIds: selected, overrides: Object.fromEntries(selected.map(id => [id, { settings: overrides[id]?.settings || {} }])) } });
      onSaved(result.settings);
    } catch (failure) { setError(failure.message); }
    finally { setSaving(false); }
  }

  return <Modal title="Where should pushed videos go?" wide busy={saving} onClose={onClose} className="swipe-settings">
    <p className="bridge-small">Each video you push goes to these accounts, except the account it came from.</p>
    <Alert message={error}/>
    {!eligible.length ? <p>Connect an account that accepts videos first.</p> : <div className="swipe-settings-list">
      {eligible.map(account => <div key={account.id} className="swipe-settings-row">
        <Check checked={selected.includes(account.id)} onChange={() => toggle(account.id)}><PlatformIcon platform={account.platform} size={18}/> {account.label} <span className="bridge-small">{platformName(catalog, account.platform)}</span></Check>
        {selected.includes(account.id) && ["tiktok", "youtube", "pinterest", "bluesky", "google_business"].includes(account.platform) && <div className="swipe-settings-detail">
          {options[account.id]?.error ? <Alert message={options[account.id].error}/> : OPTION_PLATFORMS.has(account.platform) && !options[account.id] ? <p className="bridge-small">Loading {platformName(catalog, account.platform)} options…</p>
            : <DestinationSettings account={{ ...account, options: options[account.id] || account.options }} settings={overrides[account.id]?.settings || {}} onChange={value => setOverrides(current => ({ ...current, [account.id]: { settings: value } }))} hasVideo hasImages={false}/>}
        </div>}
      </div>)}
    </div>}
    <div className="bridge-modal-actions">
      <button type="button" className="bridge-button secondary" onClick={onClose} disabled={saving}>Cancel</button>
      <button type="button" className="bridge-button" onClick={save} disabled={saving || !selected.length}>{saving ? "Saving…" : "Save destinations"}</button>
    </div>
  </Modal>;
}
