import { useEffect, useRef, useState } from "react";
import { api } from "./BridgeApi.js";
import { Icon } from "./Icons.jsx";
import { Alert, Check, Modal, PlatformIcon, dateTime, useProjectResource } from "./ui.jsx";
import { DestinationSettings } from "./DestinationSettings.jsx";
import { useHandSwipe } from "./useHandSwipe.js";
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
  const pendingRef = useRef(pending);
  pendingRef.current = pending;
  const cards = (data.cards || []).filter(card => !hidden.includes(card.id));
  const card = cards[0];
  const settingsReady = data.settings.accountIds.length > 0;
  const working = data.queue.some(item => ["queued", "downloading"].includes(item.status));
  const hasSource = accounts.some(account => SOURCE_PLATFORMS.includes(account.platform) && account.status === "connected");

  // Follow pushes while Meadow downloads and schedules them.
  useEffect(() => {
    if (!working) return undefined;
    const timer = setInterval(resource.reload, 8000);
    return () => clearInterval(timer);
  }, [working, resource.reload]);

  async function decide(decision) {
    // A skip during a camera countdown cancels the push; any other choice replaces it.
    if (pendingRef.current) { setPending(null); if (decision === "skip") return false; }
    if (!card || busy || editing) return false;
    if (decision === "push" && !card.pushable) return false;
    if (decision === "push" && !settingsReady) { setEditing(true); return false; }
    setBusy(true); setError("");
    try {
      const result = await api.project(project.id, "/swipe/decisions", { method: "POST", body: { cardId: card.id, decision } });
      setHidden(current => [...current, card.id]);
      setLast({ card, decision });
      if (decision === "push") {
        notify(soon(result.decision.slotAt) ? "Pushing now. Meadow is downloading the video." : `Queued. It goes out ${dateTime(result.decision.slotAt, project.timeZone)}.`);
        resource.reload();
      }
      return true;
    } catch (failure) {
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
  }

  // A right swipe in front of the camera starts a short countdown; a left
  // swipe cancels it or skips the card.
  function onGesture(direction) {
    if (!card || busy || editing) return;
    if (pending) { if (direction === "left") setPending(null); return; }
    if (direction === "left") { decide("skip"); return; }
    if (!card.pushable) { setError(`Meadow can't download ${platformName(catalog, card.platform)} videos yet. Swipe left to skip it.`); return; }
    if (!settingsReady) { setError("Choose destinations before pushing with your hand."); return; }
    setError("");
    setPending({ cardId: card.id });
  }
  const camera = useHandSwipe({ enabled: cameraOn, onGesture });

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
      await decideRef.current("push");
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

  const handNudge = cameraOn && camera.status === "ready" && camera.handVisible && !pending ? Math.max(-1, Math.min(1, camera.offset / camera.minDistance)) * 80 : 0;

  const loading = data.cards === null;
  return <div className="swipe-page">
    <Alert message={error || resource.error}/>
    <div className="swipe-toolbar">
      <p className="bridge-small">Swipe right to push a video to your other accounts, or left to skip it. The first push goes out now, then one every {data.spacingHours} hours.</p>
      <div className="swipe-toolbar-actions">
      <button type="button" className={`bridge-button small ${cameraOn ? "" : "secondary"}`} onClick={toggleCamera} aria-pressed={cameraOn}><Icon name="camera" size={16}/>{cameraOn ? "Stop camera" : "Swipe with your hand"}</button>
      <button type="button" className="bridge-button secondary small" onClick={() => setEditing(true)}><Icon name="settings" size={16}/>{settingsReady ? `Pushing to ${data.settings.accountIds.length} ${data.settings.accountIds.length === 1 ? "account" : "accounts"}` : "Choose destinations"}</button>
      </div>
    </div>
    <div className={`swipe-layout ${cameraOn ? "camera-mode" : ""}`}>
      {cameraOn && <CameraStage camera={camera} onStop={toggleCamera}/>}
      <section className="swipe-stage" aria-label="Videos to review">
        {loading && resource.error ? <div className="bridge-panel bridge-empty"><p>Your videos could not be loaded.</p><button type="button" className="bridge-button secondary" onClick={resource.reload} disabled={resource.loading}>Try again</button></div>
          : loading ? <div className="bridge-panel bridge-empty"><p>Loading your videos…</p></div>
          : !hasSource && accountsReady ? <div className="bridge-panel bridge-empty"><div className="bridge-empty-icon"><Icon name="video" size={28}/></div><h2>Connect a video account</h2><p>Swipe or Push uses recent videos from TikTok, YouTube, Instagram, Facebook and Threads.</p><button type="button" className="bridge-button" onClick={onAccounts}>Connect an account</button></div>
          : !card ? <div className="bridge-panel bridge-empty"><div className="bridge-empty-icon"><Icon name="check" size={28}/></div><h2>You're all caught up</h2><p>New videos from your connected accounts show up here.</p><button type="button" className="bridge-button secondary" onClick={resource.reload} disabled={resource.loading}>Check again</button></div>
          : <>
            <div className="swipe-deck">
              {cards[1] && <div className="swipe-card swipe-card-behind" aria-hidden="true"/>}
              <SwipeCard key={card.id} card={card} catalog={catalog} timeZone={project.timeZone} disabled={busy || editing || Boolean(pending)} onDecide={decide} nudge={handNudge}
                pending={pending?.cardId === card.id ? <div className="swipe-pending" role="status"><strong>Pushing in 2 seconds</strong><span>Swipe left or press Esc to cancel.</span><i/><button type="button" className="bridge-button secondary small" onClick={() => setPending(null)}>Cancel</button></div> : null}/>
            </div>
            <div className="swipe-actions">
              <button type="button" className="swipe-action skip" onClick={() => decide("skip")} disabled={busy} aria-label="Skip this video"><Icon name="close" size={26}/></button>
              {last && <button type="button" className="bridge-button secondary small swipe-undo" onClick={undo} disabled={busy}>Undo {last.decision === "push" ? "push" : "skip"}</button>}
              <button type="button" className="swipe-action push" onClick={() => decide("push")} disabled={busy || !card.pushable} aria-label="Push this video"><Icon name="arrow" size={26}/></button>
            </div>
            <p className="swipe-hint bridge-small">{card.pushable ? "Use ← and → on your keyboard too." : `Meadow can't download ${platformName(catalog, card.platform)} videos yet, so this one can only be skipped.`} {cards.length - 1 > 0 ? `${cards.length - 1} more after this.` : "This is the last one."}</p>
          </>}
      </section>
      {!cameraOn && <div className="swipe-side-column"><PushQueue queue={data.queue} nextSlotAt={data.nextSlotAt} sources={data.sources} catalog={catalog} timeZone={project.timeZone}/></div>}
    </div>
    {cameraOn && <div className="swipe-below"><PushQueue queue={data.queue} nextSlotAt={data.nextSlotAt} sources={data.sources} catalog={catalog} timeZone={project.timeZone}/></div>}
    {editing && <PushSettings project={project} catalog={catalog} accounts={accounts} settings={data.settings} onClose={() => setEditing(false)} onSaved={settings => { resource.setData(current => ({ ...current, settings })); setEditing(false); setError(""); notify("Push destinations saved."); }}/>}
  </div>;
}

// With the camera on, the preview is the main stage: a big mirrored view with
// a red or green box drawn over each hand (see useHandSwipe).
function CameraStage({ camera, onStop }) {
  const ready = camera.status === "ready";
  const strength = Math.min(1, Math.abs(camera.offset) / camera.minDistance);
  const message = camera.status === "error" ? camera.error
    : camera.status === "starting" ? "Starting the camera…"
    : camera.status === "loading" ? "Loading hand tracking. The first time downloads about 11 MB, so it can take a little while."
    : camera.handVisible ? "Swipe your hand right to push, left to skip." : "Raise a hand so the camera can see it.";
  return <section className="swipe-camera-stage" aria-label="Camera">
    <div className="swipe-camera-frame">
      <video ref={camera.videoRef} muted playsInline aria-hidden="true"/>
      <canvas ref={camera.overlayRef} aria-hidden="true"/>
      {ready && <>
        <span className="swipe-camera-zone skip" style={{ opacity: camera.offset < 0 ? 0.35 + strength * 0.65 : 0.35 }}><Icon name="close" size={22}/>Skip</span>
        <span className="swipe-camera-zone push" style={{ opacity: camera.offset > 0 ? 0.35 + strength * 0.65 : 0.35 }}>Push<Icon name="arrow" size={22}/></span>
      </>}
      <p className={`swipe-camera-status ${camera.status === "error" ? "is-error" : ""}`} role="status">{message}</p>
    </div>
    <p className="bridge-small swipe-camera-privacy">Hand tracking runs on this device. Meadow never receives the camera feed. <button type="button" className="swipe-link" onClick={onStop}>Turn off camera</button></p>
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
    setDrag({ x: decision === "push" ? 700 : -700, active: false });
    if (!await onDecide(decision)) setDrag({ x: 0, active: false });
  }

  const x = drag.active || drag.x ? drag.x : pending ? 60 : nudge;
  const strength = Math.min(1, Math.abs(x) / THRESHOLD);
  return <article className={`swipe-card ${drag.active ? "is-dragging" : ""} ${nudge && !drag.active ? "is-following" : ""}`} style={{ transform: `translateX(${x}px) rotate(${x / 22}deg)` }}
    onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerEnd} onPointerCancel={onPointerEnd}>
    <span className="swipe-stamp push" style={{ opacity: pending ? 1 : x > 0 ? strength : 0 }}>Push</span>
    <span className="swipe-stamp skip" style={{ opacity: x < 0 ? strength : 0 }}>Skip</span>
    {pending}
    <header className="swipe-card-head">
      <PlatformIcon platform={card.platform} size={22}/>
      <div><strong>{card.accountName}</strong><span>{name}{card.publishedAt ? ` · ${dateTime(card.publishedAt, timeZone)}` : ""}</span></div>
      {card.url && <a href={card.url} target="_blank" rel="noreferrer" aria-label={`Open on ${name}`}><Icon name="external" size={17}/></a>}
    </header>
    <div className={`swipe-media-frame ${card.platform}`}><CardMedia card={card} name={name}/></div>
    {(card.title || card.caption) && <p className="swipe-caption">{card.title && card.title !== card.caption ? <strong>{card.title} </strong> : null}{card.caption}</p>}
  </article>;
}

function CardMedia({ card, name }) {
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
