import { useEffect, useRef, useState } from "react";
import { api } from "./BridgeApi.js";
import { Icon } from "./Icons.jsx";
import { Alert, Badge, Check, dateTime, Field, MediaThumb, Modal, PlatformBadge } from "./ui.jsx";
import { DestinationSettings } from "./DestinationSettings.jsx";
import UploadProgress from "./UploadProgress.jsx";
import { ACCEPT_BY_TYPE, detectFormat, FORMAT_LABELS, formatVariants, MAX_MEDIA_BY_TYPE, POST_TYPES, supportsPostType } from "./platforms.js";
import { hasPostContent } from "./postContent.js";
import EmojiPicker from "./EmojiPicker.jsx";


export const makePost = (project, mediaIds = [], accountIds = [], scheduledDate = "") => ({ key: crypto.randomUUID(), caption: "", title: "", mediaIds, accountIds, format: "auto", overrides: {}, schedule: { mode: scheduledDate ? "scheduled" : "now", timeZone: project.timeZone, localDateTime: scheduledDate ? `${scheduledDate}T09:00` : "" } });

export function draftPost(draft, project) {
  return {
    key: draft.id,
    caption: draft.caption || "",
    title: draft.title || "",
    mediaIds: [...(draft.mediaIds || [])],
    accountIds: [...(draft.accountIds || [])],
    format: draft.format || "auto",
    overrides: structuredClone(draft.overrides || {}),
    schedule: {
      mode: draft.schedule?.mode === "scheduled" ? "scheduled" : "now",
      timeZone: project.timeZone,
      localDateTime: draft.schedule?.localDateTime || "",
    },
  };
}

function scheduleParts(value = "") {
  const [date = "", time = ""] = value.split("T"), [hourText = "9", minute = "00"] = time.split(":"), hour = Number(hourText);
  if (!time || !Number.isInteger(hour) || hour < 0 || hour > 23) return { date, time: "9:00", period: "AM" };
  return { date, time: `${hour % 12 || 12}:${minute}`, period: hour >= 12 ? "PM" : "AM" };
}

function generalTimeLabel(value) {
  const { date, time, period } = scheduleParts(value);
  if (!date) return "";
  const [year, month, day] = date.split("-").map(Number);
  return `${new Date(year, month - 1, day).toLocaleDateString(undefined, { month: "short", day: "numeric" })}, ${time} ${period}`;
}

function parseTime(value, allowHourOnly = false) {
  const match = value.trim().match(allowHourOnly ? /^(\d{1,2})(?::([0-5]\d))?$/ : /^(\d{1,2}):([0-5]\d)$/);
  if (!match) return null;
  const hour = Number(match[1]);
  return hour >= 1 && hour <= 12 ? { hour, minute: match[2] || "00" } : null;
}

function localDateTime(date, time, period) {
  const parsed = parseTime(time);
  if (!date || !parsed) return "";
  const hour = parsed.hour % 12 + (period === "PM" ? 12 : 0);
  return `${date}T${String(hour).padStart(2, "0")}:${parsed.minute}`;
}

function ScheduleDateTime({ value, onChange }) {
  const parts = scheduleParts(value), [time, setTime] = useState(parts.time), [period, setPeriod] = useState(parts.period);
  useEffect(() => { const next = scheduleParts(value); setTime(next.time); setPeriod(next.period); }, [value]);
  function changeTime(next) {
    setTime(next);
    const combined = localDateTime(parts.date, next, period);
    if (combined) onChange(combined);
  }
  function finishTime() {
    const parsed = parseTime(time, true);
    if (!parsed) { setTime(parts.time); return; }
    const normalized = `${parsed.hour}:${parsed.minute}`;
    setTime(normalized); onChange(localDateTime(parts.date, normalized, period));
  }
  function changePeriod(next) {
    setPeriod(next);
    const combined = localDateTime(parts.date, time, next);
    if (combined) onChange(combined);
  }
  return <div className="bridge-field-row"><Field label="Date"><input type="date" required value={parts.date} onChange={event => onChange(localDateTime(event.target.value, time, period))}/></Field><Field label="Time" hint="Type a time such as 9:30"><span className="bridge-time-input"><input type="text" required inputMode="numeric" autoComplete="off" placeholder="9:00" value={time} aria-label="Time" aria-invalid={Boolean(time && !parseTime(time, true))} onChange={event => changeTime(event.target.value)} onBlur={finishTime}/><select value={period} aria-label="AM or PM" onChange={event => changePeriod(event.target.value)}><option value="AM">AM</option><option value="PM">PM</option></select></span></Field></div>;
}

function nextMorning(timeZone) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(Date.now() + 86400000)).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}T09:00`;
}

// The type a post was created as; older posts saved as "auto" fall back to their media.
export function postTypeOf(post, media = []) {
  if (POST_TYPES.some(type => type.id === post.format)) return post.format;
  const detected = detectFormat(post.mediaIds.map(id => media.find(item => item.id === id)).filter(Boolean));
  return POST_TYPES.some(type => type.id === detected) ? detected : "carousel";
}

export function PostEditor({ post, onChange, accounts, media, catalog, onPickMedia, uploading = false, uploadProgress, compact = false }) {
  const chosen = post.mediaIds.map(id => media.find(item => item.id === id)).filter(Boolean);
  const uploadLabel = uploadProgress?.stage === "processing" ? "Preparing…" : "Uploading…";
  const [draggedId, setDraggedId] = useState("");
  const [dropTarget, setDropTarget] = useState(null);
  const draggedMedia = useRef("");
  const update = patch => onChange({ ...post, ...patch });
  const setOverride = (id, patch) => update({ overrides: { ...post.overrides, [id]: { ...post.overrides[id], ...patch } } });
  const toggleAccount = id => {
    const selected = post.accountIds.includes(id);
    const overrides = { ...post.overrides }; if (selected) delete overrides[id];
    update({ accountIds: selected ? post.accountIds.filter(value => value !== id) : [...post.accountIds, id], overrides });
  };
  const scheduled = post.schedule?.mode === "scheduled";
  const frozenFor = id => post.deliveries?.find(delivery => delivery.accountId === id && ["published", "cancelled"].includes(delivery.status));
  const type = postTypeOf(post, media), maxMedia = MAX_MEDIA_BY_TYPE[type];
  const capabilityFor = account => catalog.find(item => item.id === account.platform);
  // Only accounts whose platform can publish this type are listed.
  const visible = accounts.filter(account => frozenFor(account.id) || supportsPostType(capabilityFor(account), type, chosen));
  const selectable = visible.filter(account => account.status === "connected" && !frozenFor(account.id));
  const hidden = post.accountIds.filter(id => !visible.some(account => account.id === id) && accounts.some(account => account.id === id));
  useEffect(() => {
    if (!hidden.length) return;
    const overrides = { ...post.overrides }; hidden.forEach(id => delete overrides[id]);
    update({ accountIds: post.accountIds.filter(id => !hidden.includes(id)), overrides });
  }, [hidden.join(",")]);
  const textBox = useRef(null);
  const insertEmoji = emoji => {
    const box = textBox.current, start = box?.selectionStart ?? post.caption.length, end = box?.selectionEnd ?? start;
    update({ caption: post.caption.slice(0, start) + emoji + post.caption.slice(end) });
    requestAnimationFrame(() => { if (!box) return; box.focus(); box.setSelectionRange(start + emoji.length, start + emoji.length); });
  };
  const allSelected = selectable.length > 0 && selectable.every(account => post.accountIds.includes(account.id));
  const someSelected = selectable.some(account => post.accountIds.includes(account.id));
  const selectAll = useRef(null);
  useEffect(() => { if (selectAll.current) selectAll.current.indeterminate = someSelected && !allSelected; }, [someSelected, allSelected]);
  const toggleAll = () => {
    const ids = new Set(selectable.map(account => account.id));
    if (!allSelected) return update({ accountIds: [...post.accountIds, ...selectable.map(account => account.id).filter(id => !post.accountIds.includes(id))] });
    const overrides = { ...post.overrides }; ids.forEach(id => delete overrides[id]);
    update({ accountIds: post.accountIds.filter(id => !ids.has(id)), overrides });
  };
  const setCustomTime = (id, on) => {
    const next = { ...post.overrides[id] };
    if (on) next.localDateTime = post.schedule.localDateTime; else delete next.localDateTime;
    update({ overrides: { ...post.overrides, [id]: next } });
  };
  const clearDrag = () => { draggedMedia.current = ""; setDraggedId(""); setDropTarget(null); };
  const moveMedia = (sourceId, targetId, position = "before") => {
    if (!sourceId || sourceId === targetId) return clearDrag();
    const ids = [...post.mediaIds], sourceIndex = ids.indexOf(sourceId), targetIndex = ids.indexOf(targetId);
    if (sourceIndex < 0 || targetIndex < 0) return clearDrag();
    ids.splice(sourceIndex, 1);
    const adjustedTarget = targetIndex - (sourceIndex < targetIndex ? 1 : 0);
    ids.splice(adjustedTarget + (position === "after" ? 1 : 0), 0, sourceId);
    update({ mediaIds: ids }); clearDrag();
  };
  const moveMediaBy = (id, delta) => {
    const index = post.mediaIds.indexOf(id), target = index + delta;
    if (index < 0 || target < 0 || target >= post.mediaIds.length) return;
    const ids = [...post.mediaIds]; [ids[index], ids[target]] = [ids[target], ids[index]]; update({ mediaIds: ids });
  };
  return <div className={`bridge-post-editor ${compact ? "compact" : ""}`}>
    <div className="bridge-composer-main">
      <div className="bridge-section-label"><strong>Content <span className="bridge-detected-format">{POST_TYPES.find(item => item.id === type)?.label}</span></strong>{type === "carousel" && <span>{chosen.length} {chosen.length === 1 ? "item" : "items"}{chosen.length < 2 ? " · add at least 2" : " · Drag to reorder"}</span>}</div>
      {maxMedia > 0 && (chosen.length ? <div className="bridge-media-strip">{chosen.map((item, index) => <div key={item.id} className={`bridge-picked-media ${draggedId === item.id ? "dragging" : ""} ${dropTarget?.id === item.id ? `drop-${dropTarget.position}` : ""}`} onDragOver={event => { const sourceId = draggedMedia.current; if (!sourceId || sourceId === item.id) return; event.preventDefault(); event.dataTransfer.dropEffect = "move"; const rect = event.currentTarget.getBoundingClientRect(); setDropTarget({ id: item.id, position: event.clientX < rect.left + rect.width / 2 ? "before" : "after" }); }} onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget)) setDropTarget(current => current?.id === item.id ? null : current); }} onDrop={event => { event.preventDefault(); moveMedia(draggedMedia.current || event.dataTransfer.getData("text/plain"), item.id, dropTarget?.id === item.id ? dropTarget.position : "before"); }}><MediaThumb media={item}/>{chosen.length > 1 && <button type="button" className="bridge-drag-handle" draggable aria-label={`Drag ${item.filename} to reorder`} title="Drag to reorder" onDragStart={event => { draggedMedia.current = item.id; event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", item.id); setDraggedId(item.id); }} onDragEnd={clearDrag} onKeyDown={event => { if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); moveMediaBy(item.id, event.key === "ArrowLeft" ? -1 : 1); } }}><Icon name="drag" size={18}/></button>}<span className="bridge-media-order">{index + 1}</span><button className="bridge-remove-media" aria-label={`Remove ${item.filename}`} onClick={() => update({ mediaIds: post.mediaIds.filter(id => id !== item.id) })}><Icon name="close" size={14}/></button></div>)}{chosen.length < maxMedia && <button className="bridge-add-media" disabled={uploading} onClick={onPickMedia}><Icon name="plus"/><span>{uploading ? uploadLabel : "Add more"}</span></button>}</div> : <button className="bridge-upload-zone" disabled={uploading} onClick={onPickMedia}><Icon name={type === "carousel" ? "carousel" : type} size={30}/><h3>{uploading ? uploadLabel : type === "image" ? "Add an image" : type === "video" ? "Add a video" : "Add pictures or videos"}</h3><p>{type === "carousel" ? "Select 2 or more files from your device" : "Select a file from your device"}</p></button>)}
      {uploading && <UploadProgress progress={uploadProgress}/>}
      <div className="bridge-field bridge-text-field"><span>Text</span><div className="bridge-text-box"><textarea ref={textBox} aria-label="Text" value={post.caption} maxLength={65000} rows={type === "text" ? 8 : 5} onChange={event => update({ caption: event.target.value })} placeholder="Write something worth sharing…"/><EmojiPicker onPick={insertEmoji}/></div><span className="bridge-character-count">{post.caption.length.toLocaleString()} characters</span></div>
    </div>
    <div className="bridge-composer-destinations"><div className="bridge-section-label"><strong>Destinations</strong><span>{post.accountIds.length} selected</span></div>
      {!accounts.length ? <p className="bridge-small">Connect a social account in this project to choose a destination.</p> : !visible.length && <p className="bridge-small">None of your connected accounts can publish {type === "image" ? "an image" : type === "video" ? "a video" : type === "text" ? "text-only" : "this carousel"} posts.</p>}
      {type === "carousel" && chosen.some(item => item.kind === "video") && <p className="bridge-small">Only platforms that accept videos in a carousel are shown.</p>}
      {selectable.length > 1 && <label className="bridge-select-all"><input ref={selectAll} type="checkbox" checked={allSelected} onChange={toggleAll}/><span>Select all connected accounts</span><small>{selectable.length} accounts</small></label>}
      {visible.map(account => { const selected = post.accountIds.includes(account.id), override = post.overrides[account.id] || {}, capability = capabilityFor(account), frozen = frozenFor(account.id), variants = formatVariants(capability, type); return <div className={`bridge-destination ${selected ? "selected" : ""}`} key={account.id}>
        <label className="bridge-account-choice"><input type="checkbox" checked={selected} disabled={Boolean(frozen) || account.status !== "connected" && !selected} onChange={() => toggleAccount(account.id)}/><PlatformBadge platform={account.platform} catalog={catalog}/><span><strong>{account.label}</strong><small>{capability?.name || account.platform}{frozen ? ` · ${frozen.status}` : account.status !== "connected" ? ` · ${account.status.replaceAll("_", " ")}` : ""}</small></span></label>
        {selected && !frozen && <div className="bridge-account-customize">
          {scheduled && <div className="bridge-account-time"><label className="bridge-check"><input type="checkbox" checked={Boolean(override.localDateTime)} onChange={event => setCustomTime(account.id, event.target.checked)}/><span>Custom time</span></label>{override.localDateTime ? <ScheduleDateTime value={override.localDateTime} onChange={localDateTime => localDateTime && setOverride(account.id, { localDateTime })}/> : <small>Posts at the general time{post.schedule.localDateTime ? ` · ${generalTimeLabel(post.schedule.localDateTime)}` : ""}</small>}</div>}
          <div className="bridge-allowance">{account.options?.remaining !== null && account.options?.remaining !== undefined ? `${account.options.remaining} of ${account.options.limit} posts available` : "Posting allowance checked before delivery"}</div>
          {account.optionsError && <Alert message={account.optionsError}/>}
          {variants.length > 1 && <Field label="Post as"><select value={override.format && override.format !== "auto" ? override.format : type} onChange={event => setOverride(account.id, { format: event.target.value === type ? "auto" : event.target.value })}>{variants.map(format => <option key={format} value={format}>{FORMAT_LABELS[format] || format}</option>)}</select></Field>}
          {capability?.titleLimit && <Field label={capability.titleRequired ? `${capability.name} title (required)` : `${capability.name} title (optional)`}><input value={override.title ?? ""} maxLength={capability.titleLimit} placeholder={`Up to ${capability.titleLimit} characters`} onChange={event => setOverride(account.id, { title: event.target.value })}/></Field>}
          <details><summary>Customize text for this account</summary><Field label={`Text · ${capability?.captionLimit?.toLocaleString() || "—"} character limit`}><textarea rows={3} value={override.caption ?? post.caption} onChange={event => setOverride(account.id, { caption: event.target.value })}/></Field><button className="bridge-text-button" onClick={() => { const next = { ...override }; delete next.caption; update({ overrides: { ...post.overrides, [account.id]: next } }); }}>Use shared text</button></details>
          <DestinationSettings account={account} settings={override.settings} onChange={settings => setOverride(account.id, { settings })} hasVideo={chosen.some(item => item.kind === "video")} hasImages={chosen.some(item => item.kind === "image")}/>
        </div>}
      </div>; })}
    </div>
  </div>;
}

export default function Composer({ project, accounts: initialAccounts, media, catalog, config, draft = null, onAccounts, onSubmitted, onDraftSaved, onDiscard, onDirtyChange, onBusyChange, scheduledDate = "", onDraftStarted, onUpload }) {
  const [items, setItems] = useState(() => [draft ? draftPost(draft, project) : makePost(project, [], [], scheduledDate)]);
  const [accounts, setAccounts] = useState(initialAccounts), [active, setActive] = useState(0), [preview, setPreview] = useState(null), [previewIntent, setPreviewIntent] = useState("publish"), [error, setError] = useState(""), [busy, setBusy] = useState(false), [uploading, setUploading] = useState(false);
  const [dirty, setDirty] = useState(false), [discardOpen, setDiscardOpen] = useState(false);
  const requestId = useRef(crypto.randomUUID()), fileInput = useRef(null), alive = useRef(true);
  const [uploadProgress, setUploadProgress] = useState(null);
  const selectedAccountIds = [...new Set(items.flatMap(item => item.accountIds))].sort().join(",");
  const hasDraftContent = items.length > 0 && items.every(hasPostContent);
  useEffect(() => { alive.current = true; onDraftStarted?.(); return () => { alive.current = false; }; }, []);
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);
  useEffect(() => { onBusyChange?.(busy || uploading); }, [busy, uploading, onBusyChange]);
  useEffect(() => () => onBusyChange?.(false), [onBusyChange]);
  useEffect(() => {
    if (!dirty) return;
    const warn = event => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  useEffect(() => { setAccounts(current => initialAccounts.map(account => ({ ...account, ...(current.find(item => item.id === account.id)?.options ? { options: current.find(item => item.id === account.id).options } : {}) }))); }, [initialAccounts]);
  useEffect(() => {
    const controller = new AbortController();
    const ids = selectedAccountIds.split(",").filter(Boolean);
    Promise.allSettled(ids.map(async id => {
      try { const data = await api.project(project.id, `/accounts/${id}/options`, { signal: controller.signal }); if (!controller.signal.aborted) setAccounts(current => current.map(account => account.id === id ? { ...account, options: data.options, optionsError: null } : account)); }
      catch (error) { if (!controller.signal.aborted) setAccounts(current => current.map(account => account.id === id ? { ...account, optionsError: error.message } : account)); }
    }));
    return () => controller.abort();
  }, [project.id, selectedAccountIds]);
  function changeItems(next) { setItems(next); setDirty(true); setPreview(null); setError(""); requestId.current = crypto.randomUUID(); }
  async function review(nextItems, intent) {
    setBusy(true); setError(""); setPreviewIntent(intent); setItems(nextItems); requestId.current = crypto.randomUUID();
    if (JSON.stringify(nextItems) !== JSON.stringify(items)) setDirty(true);
    try { const result = await api.project(project.id, "/posts/preview", { method: "POST", body: { items: nextItems } }); if (alive.current) setPreview(result); }
    catch (error) { if (alive.current) setError(error.message); } finally { if (alive.current) setBusy(false); }
  }
  async function submit() {
    setBusy(true); setError("");
    try {
      const result = await api.project(project.id, "/posts", { method: "POST", body: { items, requestId: requestId.current, ...(draft ? { draftId: draft.id, revision: draft.revision } : {}) } });
      if (alive.current) { setDirty(false); onSubmitted(result); }
    }
    catch (error) { if (alive.current) setError(error.message); } finally { if (alive.current) setBusy(false); }
  }
  async function saveDraft() {
    if (!hasDraftContent) { setError("Add text, a title, or media before saving a draft."); return; }
    setBusy(true); setError("");
    try {
      const result = draft
        ? await api.project(project.id, `/posts/${encodeURIComponent(draft.id)}`, { method: "PATCH", body: { ...items[0], revision: draft.revision } })
        : await api.project(project.id, "/posts/drafts", { method: "POST", body: { items, requestId: requestId.current } });
      if (alive.current) { setDirty(false); onDraftSaved?.(result.post || result.posts?.[0]); }
    } catch (error) { if (alive.current) setError(error.message); } finally { if (alive.current) setBusy(false); }
  }
  function requestDiscard() {
    if (!dirty) { onDiscard?.(); return; }
    setDiscardOpen(true);
  }
  function discard() { setDirty(false); setDiscardOpen(false); onDiscard?.(); }
  async function uploadMedia(files) {
    if (!files.length) return;
    setUploading(true); setUploadProgress(null); setError("");
    try {
      const available = Math.max(0, MAX_MEDIA_BY_TYPE[postType] - items[active].mediaIds.length);
      const uploaded = await onUpload([...files].slice(0, available), progress => { if (alive.current) setUploadProgress(progress); });
      if (alive.current && uploaded.length) changeItems(current => current.map((item, index) => index === active ? { ...item, mediaIds: [...new Set([...item.mediaIds, ...uploaded.map(upload => upload.id)])].slice(0, 35) } : item));
    }
    catch (error) { if (alive.current) setError(error.message); } finally { if (alive.current) setUploading(false); }
  }
  const typeChosen = POST_TYPES.some(type => type.id === items[active].format), postType = typeChosen ? items[active].format : "carousel";
  // Switching type keeps the text and only the media the new type can carry.
  function chooseType(type) {
    changeItems(items.map(item => {
      const kept = item.mediaIds.map(id => media.find(entry => entry.id === id)).filter(entry => entry && (type === "carousel" ? ["image", "video"].includes(entry.kind) : entry.kind === type));
      const overrides = Object.fromEntries(Object.entries(item.overrides).map(([id, override]) => { const next = { ...override }; delete next.format; return [id, next]; }));
      return { ...item, format: type, overrides, mediaIds: kept.slice(0, MAX_MEDIA_BY_TYPE[type]).map(entry => entry.id) };
    }));
  }
  const schedule = items[active].schedule, scheduled = schedule.mode === "scheduled";
  const setSchedule = patch => changeItems(items.map(item => ({ ...item, schedule: { ...item.schedule, ...patch } })));
  const toggleScheduled = on => setSchedule(on ? { mode: "scheduled", timeZone: project.timeZone, localDateTime: schedule.localDateTime || nextMorning(project.timeZone) } : { mode: "now" });
  const hasYouTubePreview = Boolean(preview?.rows.some(row => row.destinations.some(destination => destination.platform === "youtube")));
  const userAgent = typeof navigator === "undefined" ? "" : navigator.userAgent;
  const mobileUpload = /Android|iPhone|iPad|iPod|IEMobile|Opera Mini|Mobile/i.test(userAgent) || /Macintosh/i.test(userAgent) && navigator.maxTouchPoints > 1;
  const youtubeTermsUrl = mobileUpload ? "http://m.youtube.com/terms" : "https://www.youtube.com/t/terms";
  const finalActionLabel = previewIntent === "publish" ? hasYouTubePreview ? "Upload & publish now" : "Publish now" : hasYouTubePreview ? "Schedule upload" : `Schedule ${items.length === 1 ? "post" : `${items.length} posts`}`;
  const discardDialog = discardOpen && <Modal title={draft ? "Discard changes?" : "Discard this post?"} onClose={() => setDiscardOpen(false)} busy={busy}><p>{draft ? "Your last saved draft will stay in Drafts. Changes made since then will be lost." : "This unsaved post will be removed. Media you uploaded will remain available in your media library."}</p><div className="bridge-modal-actions"><button className="bridge-button secondary" onClick={() => setDiscardOpen(false)}>Keep editing</button><button className="bridge-button danger" onClick={discard}>{draft ? "Discard changes" : "Discard post"}</button></div></Modal>;
  if (!typeChosen) return <>
    <div className="bridge-intro-row"><p>What would you like to post? You'll only see the accounts that support it.</p><div className="bridge-inline-actions"><button className="bridge-button secondary" onClick={requestDiscard}>{draft ? "Discard changes" : "Discard"}</button><button className="bridge-button secondary" onClick={onAccounts}><Icon name="accounts" size={16}/> Accounts</button></div></div>
    <Alert message={error}/>
    <div className="bridge-type-grid">{POST_TYPES.map(type => { const count = accounts.filter(account => account.status === "connected" && supportsPostType(catalog.find(item => item.id === account.platform), type.id)).length; return <button type="button" key={type.id} className="bridge-panel bridge-type-card" onClick={() => chooseType(type.id)}><span className="bridge-type-icon"><Icon name={type.id} size={28}/></span><strong>{type.label}</strong><small>{type.description}</small><span className="bridge-type-count">{accounts.length ? `${count} ${count === 1 ? "account" : "accounts"}` : ""}</span></button>; })}</div>
    {discardDialog}
  </>;
  return <>
    <div className="bridge-intro-row"><p>Create once, tailor for every account. Each destination keeps its own place in the queue.</p><div className="bridge-inline-actions"><button className="bridge-button secondary" disabled={busy || uploading} onClick={() => changeItems(items.map(item => ({ ...item, format: "auto" })))}><Icon name={postType} size={16}/> Change type</button><button className="bridge-button secondary" disabled={busy || uploading} onClick={onAccounts}><Icon name="accounts" size={16}/> Accounts</button></div></div>
    <Alert message={error}/>
    <input type="file" ref={fileInput} hidden multiple={postType === "carousel"} accept={ACCEPT_BY_TYPE[postType]} onChange={event => { uploadMedia(event.target.files); event.target.value = ""; }}/>
    <fieldset className="bridge-composer-workspace" disabled={busy || uploading}>
      <div className={`bridge-panel bridge-schedule-bar ${scheduled ? "on" : ""}`}><label className="bridge-switch"><input type="checkbox" role="switch" checked={scheduled} onChange={event => toggleScheduled(event.target.checked)}/><span className="bridge-switch-track" aria-hidden="true"/><span><strong>Schedule for later</strong><small>{scheduled ? "Choose a general time below, or a custom time on any account." : "Off: posts publish as soon as you confirm."}</small></span></label>{scheduled && <div className="bridge-schedule-bar-fields"><div className="bridge-general-time"><strong>General time</strong><small>Every selected account posts at this time unless you give it a custom time. Times use your current time zone ({project.timeZone}).</small><ScheduleDateTime value={schedule.localDateTime} onChange={localDateTime => localDateTime && setSchedule({ localDateTime })}/></div></div>}</div>
      <div className="bridge-panel"><PostEditor post={items[active]} onChange={post => changeItems(items.map((item, i) => i === active ? post : item))} accounts={accounts} media={media} catalog={catalog} uploading={uploading} uploadProgress={uploadProgress} onPickMedia={() => fileInput.current?.click()}/></div>
    </fieldset>
    <div className="bridge-composer-footer"><div><strong>{draft ? "Editing saved draft" : "1 post in this draft"}</strong><span id={!hasDraftContent ? "bridge-empty-draft-help" : undefined}>{!hasDraftContent ? "Add text, a title, or media before saving." : scheduled ? "Each destination publishes at its own time" : "Each destination can use its own format and settings"}</span></div><div className="bridge-inline-actions"><button className="bridge-button secondary" disabled={busy || uploading} onClick={requestDiscard}>{draft ? "Discard changes" : "Discard"}</button><button className="bridge-button secondary" disabled={busy || uploading || !dirty || !hasDraftContent} aria-describedby={!hasDraftContent ? "bridge-empty-draft-help" : undefined} onClick={saveDraft}><Icon name="drafts" size={17}/>{busy ? "Saving…" : "Save draft"}</button>{scheduled ? <button className="bridge-button" disabled={busy || uploading || !schedule.localDateTime} onClick={() => review(items, "schedule")}><Icon name="clock" size={17}/>{busy ? "Checking…" : "Review schedule"}<Icon name="arrow" size={17}/></button> : <button className="bridge-button" disabled={busy || uploading} onClick={() => review(items.map(item => ({ ...item, schedule: { ...item.schedule, mode: "now", localDateTime: "" } })), "publish")}>{busy ? "Checking…" : "Review & publish"}<Icon name="arrow" size={17}/></button>}</div></div>
    {preview && <Modal title={previewIntent === "publish" ? "Review and publish" : "Review schedule"} wide busy={busy} onClose={() => setPreview(null)}><p className="bridge-small">Times are shown in {project.timeZone}. Allowances are checked again before every delivery.</p><Alert message={error}/>{preview.delayed > 0 && <div className="bridge-notice">{preview.delayed} deliveries will wait for their account’s next available allowance.</div>}<div className="bridge-preview-list">{preview.rows.map(row => <div className="bridge-preview-post" key={row.index}><h3>Post {row.index + 1} <span>{row.title || row.caption.slice(0, 80) || "Media post"}</span></h3>{row.destinations.map(destination => <div key={destination.id} className="bridge-preview-destination"><PlatformBadge platform={destination.platform} catalog={catalog}/><div><strong>{destination.accountName}</strong><span>{dateTime(destination.dueAt, project.timeZone)}{destination.estimated ? " · estimate" : ""}</span>{destination.reason && <small>{destination.reason}</small>}{destination.errors.map((message, index) => <p className="bridge-validation-error" key={index}>{message}</p>)}</div><Badge status={destination.errors.length ? "failed" : destination.delayed ? "scheduled" : "queued"}>{destination.errors.length ? "Needs changes" : destination.delayed ? "Auto queued" : "Ready"}</Badge></div>)}</div>)}</div>{hasYouTubePreview && <p className="bridge-small">By clicking 'upload,' you certify that the content you are uploading complies with the YouTube Terms of Service (including the YouTube Community Guidelines) at <a href={youtubeTermsUrl} target="_blank" rel="noreferrer">{youtubeTermsUrl}</a>. Please be sure not to violate others' copyright or privacy rights.</p>}<div className="bridge-modal-actions"><button className="bridge-button secondary" disabled={busy} onClick={() => setPreview(null)}>Keep editing</button><button className="bridge-button" disabled={!preview.valid || busy || !config.features?.publishing} onClick={submit}>{busy ? previewIntent === "publish" ? "Publishing…" : "Scheduling…" : finalActionLabel}</button></div></Modal>}
    {discardDialog}
  </>;
}
