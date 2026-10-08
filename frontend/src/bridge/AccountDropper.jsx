import { useEffect, useRef, useState } from "react";
import { api } from "./BridgeApi.js";
import { Icon } from "./Icons.jsx";
import { Alert, Check, Field, Modal, PlatformIcon, dateTime, useProjectResource } from "./ui.jsx";
import { DestinationSettings } from "./DestinationSettings.jsx";
import { useAccountOptions } from "./useAccountOptions.js";
import { dashboardPath } from "./dashboardRoutes.js";
import { dropperDestinationAccounts, dropperSourceAccounts, selectableDropperCards, currentDropperItem, intervalMinutes, intervalInput, intervalLabel, dropperQueueStatus, dropKeyframes } from "./dropper.js";
import "./dropper.css";

const initial = { cards: null, sources: [], settings: { sourceAccountId: null, accountIds: [], overrides: {}, intervalMinutes: 480 }, queue: [], running: false, inFlight: false, nextSlotAt: null, run: null };
const platformName = (catalog, platform) => catalog.find(item => item.id === platform)?.name || platform;
const optionPlatforms = new Set(["tiktok", "pinterest"]);
const destinationSettingsPlatforms = new Set(["tiktok", "youtube", "pinterest", "bluesky", "google_business"]);

export default function AccountDropper({ project, catalog, accounts, accountsReady, notify, onAccounts }) {
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
  const selectable = selectableDropperCards(cards, data.queue);
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

  useEffect(() => {
    const valid = new Set(selectableDropperCards(data.cards || [], data.queue).map(card => card.id));
    setSelected(current => {
      const kept = current.filter(id => valid.has(id));
      return kept.length === current.length ? current : kept;
    });
  }, [data.cards, data.queue]);

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
      notify("Dropper setup saved.");
    });
  }

  async function start() {
    if (!ready || locked || !selectedCards.length || resource.loading || resource.error) return;
    try {
      await mutate("start", { cardIds: selectedCards.map(card => card.id) }, result => {
        resource.setData(current => ({ ...current, ...result }));
        setSelected([]);
        notify(`Dropper started. The first video begins now, then one every ${intervalLabel(data.settings.intervalMinutes)}.`);
      });
    } catch { /* The action error is shown above the board. */ }
  }

  async function stop() {
    if (busy || rechecking || resource.loading) return;
    try {
      await mutate("stop", {}, result => {
        resource.setData(current => ({ ...current, ...result }));
        notify(`Dropper stopped. ${result.cancelled || 0} ${(result.cancelled || 0) === 1 ? "video was" : "videos were"} cancelled before being added to Posts. Videos already in Posts keep their status.`);
      });
    } catch { /* The action error is shown above the board. */ }
  }

  function toggleCard(id) {
    setSelected(current => current.includes(id) ? current.filter(value => value !== id) : current.length < 50 ? [...current, id] : current);
  }

  const settingSummary = displayedSetup.sourceAccountId && displayedSetup.accountIds.length ? `Every video goes to ${displayedSetup.accountIds.length} ${displayedSetup.accountIds.length === 1 ? "account" : "accounts"}, one video every ${intervalLabel(displayedSetup.intervalMinutes)}.` : "Choose a source account, destination accounts, and your posting interval.";
  return <div className="dropper">
    <div className="dropper-intro">
      <p>Drop videos from one account into the others. Choose the videos and set the pace.</p>
      <button type="button" className="bridge-button secondary small" disabled={locked || !accountsReady || Boolean(resource.error) || data.cards === null && resource.loading} onClick={() => setEditing(true)}><Icon name="settings" size={17}/>{data.settings.sourceAccountId ? "Edit setup" : "Set up dropper"}</button>
    </div>
    <Alert message={error || resource.error}/>
    {resource.error && <button type="button" className="bridge-button secondary small" disabled={resource.loading} onClick={resource.reload}>Try again</button>}
    {hasUnavailable && <p className="bridge-notice" role="status">A saved account is unavailable. Choose connected accounts in Edit setup before starting another batch.</p>}
    <section className="bridge-panel dropper-board-panel" aria-label="Account dropper">
      <DropBoard source={boardSource} destinations={boardDestinations} currentDrop={currentDrop} catalog={catalog} loading={!accountsReady || data.cards === null && resource.loading} onSetup={() => setEditing(true)} setupDisabled={locked || !accountsReady || resource.loading || Boolean(resource.error)}/>
      <div className="dropper-board-controls">
        <div className="dropper-board-summary">
          <strong>{data.running ? "Dropper is running" : data.inFlight ? "Finishing a video" : "Ready when you are"}</strong>
          <p>{settingSummary}</p>
          {Boolean(data.running || data.inFlight) && <span role="status">{preparing.length ? "Preparing a video for your destinations." : waiting.length && data.nextSlotAt ? `Next video begins ${dateTime(data.nextSlotAt, project.timeZone)}.` : "Checking the queue…"}</span>}
        </div>
        {(data.running || data.inFlight) ? <button type="button" className="bridge-button secondary" disabled={Boolean(busy) || rechecking || resource.loading} onClick={stop}><Icon name="close" size={17}/>{busy === "stop" ? "Stopping…" : "Stop dropper"}</button>
          : <button type="button" className="bridge-button" disabled={!ready || !selectedCards.length || locked || resource.loading || Boolean(resource.error)} onClick={start}><Icon name="dropper" size={18}/>{busy === "start" ? "Starting…" : `Start dropper${selectedCards.length ? ` · ${selectedCards.length} ${selectedCards.length === 1 ? "video" : "videos"}` : ""}`}</button>}
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
            <div className="dropper-video-grid">{cards.map(card => <ReviewCard key={card.id} card={card} selected={selected.includes(card.id)} order={selected.indexOf(card.id) + 1} disabled={locked || !selectableIds.has(card.id) || selectedCards.length >= 50 && !selected.includes(card.id) || resource.loading} alreadyQueued={card.pushable && !selectableIds.has(card.id)} catalog={catalog} timeZone={project.timeZone} onChange={() => toggleCard(card.id)}/>)}</div>
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

function DropBoard({ source, destinations, currentDrop, catalog, loading, onSetup, setupDisabled }) {
  const board = useRef(null), pegs = useRef(null), sourceNode = useRef(null);
  const targets = useRef(new Map()), copies = useRef(new Map());
  const [preview, setPreview] = useState(null);
  const seen = useRef("");
  const destinationKey = destinations.map(account => account.id).join(",");
  const dropKey = currentDrop ? `${currentDrop.cardId}:${currentDrop.createdAt || currentDrop.slotAt}` : "";
  useEffect(() => {
    if (!dropKey || seen.current === dropKey) return;
    seen.current = dropKey;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    setPreview(currentDrop);
  }, [dropKey]);

  useEffect(() => {
    if (!preview) return;
    const timer = setTimeout(() => setPreview(null), 4100);
    return () => clearTimeout(timer);
  }, [preview]);

  useEffect(() => {
    if (!preview || !board.current || !pegs.current) return;
    const animations = [];
    const animate = () => {
      animations.forEach(animation => animation.cancel());
      animations.length = 0;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      const bounds = board.current.getBoundingClientRect(), field = pegs.current.getBoundingClientRect(), sourceBounds = sourceNode.current?.getBoundingClientRect();
      destinations.forEach((account, index) => {
        const target = targets.current.get(account.id), copy = copies.current.get(account.id);
        if (!target || !copy) return;
        const bucket = target.getBoundingClientRect();
        const keyframes = dropKeyframes({ startX: bounds.width / 2 - 18, startY: (sourceBounds?.bottom || field.top) - bounds.top - 18, endX: bucket.left + bucket.width / 2 - bounds.left - 18, endY: bucket.top + bucket.height / 2 - bounds.top - 18, pegTop: field.top - bounds.top, pegHeight: field.height, copyIndex: index });
        animations.push(copy.animate(keyframes, { duration: 2850, delay: Math.min(index, 10) * 80, easing: "linear", fill: "both" }));
      });
    };
    animate();
    const resize = new ResizeObserver(animate);
    resize.observe(board.current);
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const motionChanged = () => { if (motion.matches) { animations.forEach(animation => animation.cancel()); setPreview(null); } };
    motion.addEventListener("change", motionChanged);
    return () => { resize.disconnect(); motion.removeEventListener("change", motionChanged); animations.forEach(animation => animation.cancel()); };
  }, [preview, destinationKey]);

  return <div ref={board} className="dropper-board">
    <div className="dropper-source" ref={sourceNode}>
      {source ? <><AccountAvatar account={source}/><div><span>Source account</span><strong>{source.label}</strong><small><PlatformIcon platform={source.platform} size={16}/>{platformName(catalog, source.platform)}</small></div></>
        : <button type="button" className="dropper-source-empty" disabled={setupDisabled} onClick={onSetup}><Icon name={loading ? "clock" : "plus"} size={24}/><span>{loading ? "Loading…" : "Choose source account"}</span></button>}
    </div>
    <svg className="dropper-pegs" ref={pegs} viewBox="0 0 1000 380" aria-hidden="true">
      {Array.from({ length: 7 }, (_, row) => Array.from({ length: row + 3 }, (_, column) => <g key={`${row}:${column}`}><circle className="dropper-peg-shadow" cx={500 + (column - (row + 2) / 2) * 94} cy={42 + row * 46} r="7"/><circle className="dropper-peg" cx={500 + (column - (row + 2) / 2) * 94} cy={39 + row * 46} r="6"/></g>))}
    </svg>
    <div className="dropper-buckets">
      {destinations.length ? destinations.map(account => <div className="dropper-bucket" key={account.id}>
        <div className="dropper-bucket-cup" ref={node => { if (node) targets.current.set(account.id, node); else targets.current.delete(account.id); }}><AccountAvatar account={account}/></div>
        <strong title={account.label}>{account.label}</strong><small><PlatformIcon platform={account.platform} size={16}/>{platformName(catalog, account.platform)}</small>
      </div>) : <button type="button" className="dropper-destinations-empty" disabled={setupDisabled} onClick={onSetup}><Icon name="accounts" size={21}/><span>Choose destination accounts</span></button>}
    </div>
    {preview && destinations.map(account => <span className="dropper-copy" aria-hidden="true" key={`${dropKey}:${account.id}`} ref={node => { if (node) copies.current.set(account.id, node); else copies.current.delete(account.id); }}>{preview.thumbnailUrl ? <img src={preview.thumbnailUrl} alt="" referrerPolicy="no-referrer"/> : <Icon name="video" size={19}/>}</span>)}
    <p className="dropper-preview-caption">{preview ? "Drop preview · posting status appears in your queue" : destinations.length ? `Each video lands in all ${destinations.length} selected ${destinations.length === 1 ? "account" : "accounts"}` : "Your selected accounts will appear here"}</p>
  </div>;
}

function ReviewCard({ card, selected, order, disabled, alreadyQueued, catalog, timeZone, onChange }) {
  const title = card.title || card.caption || `${platformName(catalog, card.platform)} video`;
  return <article className={`dropper-video-card ${selected ? "selected" : ""}`}>
    <div className="dropper-video-media">
      {card.previewUrl ? <video src={card.previewUrl} poster={card.thumbnailUrl || undefined} controls playsInline muted preload="none" referrerPolicy="no-referrer"/>
        : card.thumbnailUrl ? <img src={card.thumbnailUrl} alt="" loading="lazy" referrerPolicy="no-referrer"/> : <Icon name="video" size={35}/>}
      <label className="dropper-video-select"><input type="checkbox" checked={selected} disabled={disabled} onChange={onChange}/><span className="dropper-visually-hidden">Select {title}</span></label>
      {selected && <span className="dropper-selected-order">{order === 1 ? "First" : `#${order}`}</span>}
    </div>
    <div className="dropper-video-description"><strong title={title}>{title}</strong>{Boolean(card.publishedAt) && <span>{dateTime(card.publishedAt, timeZone)}</span>}
      {!card.pushable && <small>Meadow can’t download this video yet.</small>}{alreadyQueued && <small>Already in the dropper queue.</small>}
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
