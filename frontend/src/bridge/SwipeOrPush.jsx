import { useEffect, useRef, useState } from "react";
import { api } from "./BridgeApi.js";
import { Icon } from "./Icons.jsx";
import { Alert, Check, Modal, PlatformIcon, dateTime, useProjectResource } from "./ui.jsx";
import { DestinationSettings } from "./DestinationSettings.jsx";
import "./swipe.css";

// Swipe or Push: review recent videos from connected accounts. Right pushes a
// video to the chosen destinations, left skips it. The first push goes out
// now and each later one eight hours after the previous push.

const SOURCE_PLATFORMS = ["tiktok", "youtube", "instagram", "facebook", "threads"];
const CHAT_ONLY = new Set(["twitch", "kick"]);
const OPTION_PLATFORMS = new Set(["tiktok", "pinterest"]);
const THRESHOLD = 110;
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

  // Arrow keys mirror the swipe: right pushes, left skips.
  const decideRef = useRef(decide);
  decideRef.current = decide;
  useEffect(() => {
    const onKey = event => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || event.target.closest?.("input, textarea, select, [contenteditable], .bridge-modal")) return;
      if (event.key === "ArrowRight") { event.preventDefault(); decideRef.current("push"); }
      if (event.key === "ArrowLeft") { event.preventDefault(); decideRef.current("skip"); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const loading = data.cards === null;
  return <div className="swipe-page">
    <Alert message={error || resource.error}/>
    <div className="swipe-toolbar">
      <p className="bridge-small">Swipe right to push a video to your other accounts, or left to skip it. The first push goes out now, then one every {data.spacingHours} hours.</p>
      <button type="button" className="bridge-button secondary small" onClick={() => setEditing(true)}><Icon name="settings" size={16}/>Push to {settingsReady ? `${data.settings.accountIds.length} ${data.settings.accountIds.length === 1 ? "account" : "accounts"}` : "…"}</button>
    </div>
    <div className="swipe-layout">
      <section className="swipe-stage" aria-label="Videos to review">
        {loading ? <div className="bridge-panel bridge-empty"><p>Loading your videos…</p></div>
          : !hasSource && accountsReady ? <div className="bridge-panel bridge-empty"><div className="bridge-empty-icon"><Icon name="video" size={28}/></div><h2>Connect a video account</h2><p>Swipe or Push uses recent videos from TikTok, YouTube, Instagram, Facebook and Threads.</p><button type="button" className="bridge-button" onClick={onAccounts}>Connect an account</button></div>
          : !card ? <div className="bridge-panel bridge-empty"><div className="bridge-empty-icon"><Icon name="check" size={28}/></div><h2>You're all caught up</h2><p>New videos from your connected accounts show up here.</p><button type="button" className="bridge-button secondary" onClick={resource.reload} disabled={resource.loading}>Check again</button></div>
          : <>
            <div className="swipe-deck">
              {cards[1] && <div className="swipe-card swipe-card-behind" aria-hidden="true"/>}
              <SwipeCard key={card.id} card={card} catalog={catalog} timeZone={project.timeZone} disabled={busy || editing} onDecide={decide}/>
            </div>
            <div className="swipe-actions">
              <button type="button" className="swipe-action skip" onClick={() => decide("skip")} disabled={busy} aria-label="Skip this video"><Icon name="close" size={26}/></button>
              {last && <button type="button" className="bridge-button secondary small swipe-undo" onClick={undo} disabled={busy}>Undo {last.decision === "push" ? "push" : "skip"}</button>}
              <button type="button" className="swipe-action push" onClick={() => decide("push")} disabled={busy || !card.pushable} aria-label="Push this video"><Icon name="arrow" size={26}/></button>
            </div>
            <p className="swipe-hint bridge-small">{card.pushable ? "Use ← and → on your keyboard too." : `Meadow can't download ${platformName(catalog, card.platform)} videos yet, so this one can only be skipped.`} {cards.length - 1 > 0 ? `${cards.length - 1} more after this.` : "This is the last one."}</p>
          </>}
      </section>
      <PushQueue queue={data.queue} nextSlotAt={data.nextSlotAt} sources={data.sources} catalog={catalog} timeZone={project.timeZone}/>
    </div>
    {editing && <PushSettings project={project} catalog={catalog} accounts={accounts} settings={data.settings} onClose={() => setEditing(false)} onSaved={settings => { resource.setData(current => ({ ...current, settings })); setEditing(false); setError(""); notify("Push destinations saved."); }}/>}
  </div>;
}

function SwipeCard({ card, catalog, timeZone, disabled, onDecide }) {
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

  const strength = Math.min(1, Math.abs(drag.x) / THRESHOLD);
  return <article className={`swipe-card ${drag.active ? "is-dragging" : ""}`} style={{ transform: `translateX(${drag.x}px) rotate(${drag.x / 22}deg)` }}
    onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerEnd} onPointerCancel={onPointerEnd}>
    <span className="swipe-stamp push" style={{ opacity: drag.x > 0 ? strength : 0 }}>Push</span>
    <span className="swipe-stamp skip" style={{ opacity: drag.x < 0 ? strength : 0 }}>Skip</span>
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
