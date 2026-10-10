import { useEffect, useRef, useState } from "react";
import { api } from "./BridgeApi.js";
import { Icon } from "./Icons.jsx";
import { Alert, Check, Field, MediaThumb, Modal, PlatformBadge } from "./ui.jsx";
import { DestinationSettings } from "./DestinationSettings.jsx";
import UploadProgress from "./UploadProgress.jsx";
import { detectFormat, FORMAT_LABELS, formatVariants, MAX_MEDIA_BY_TYPE, POST_TYPES, supportsPostType } from "./platforms.js";
import { UPLOAD_ACCEPT, UPLOAD_CATEGORIES, validateUploadSelection } from "./uploadValidation.js";
import { hasPostContent } from "./postContent.js";
import EmojiPicker from "./EmojiPicker.jsx";
import { dashboardPath } from "./dashboardRoutes.js";
import { useAccountOptions } from "./useAccountOptions.js";
import { deliveryMix, isDeliveryComplete, isTikTokInbox, submissionLabel } from "./deliveryPresentation.js";
import { submitComposerPosts } from "./composerSubmission.js";
import VideoCoverPicker from "./VideoCoverPicker.jsx";
import { coverVideo, removeStaleCovers } from "./videoCover.js";


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

function formatFitsMedia(format, selected) {
  if (!format || format === "auto") return true;
  if (format === "text") return selected.length === 0;
  if (format === "carousel") return selected.length >= 2 && selected.every(item => ["image", "video"].includes(item.kind));
  if (format === "story") return selected.length === 1 && ["image", "video"].includes(selected[0].kind);
  if (format === "reel") return selected.length === 1 && selected[0].kind === "video";
  return selected.length === 1 && selected[0].kind === format;
}

export function mediaChangePatch(post, mediaIds, media) {
  const selected = mediaIds.map(id => media.find(item => item.id === id)).filter(Boolean);
  let overrides = post.overrides || {};
  // Format overrides such as Story and Reel may remain when the new media still
  // fits. Stale ones must not silently override the format shown in the editor.
  if (selected.length === mediaIds.length) {
    for (const [id, override] of Object.entries(overrides)) {
      if (formatFitsMedia(override?.format, selected)) continue;
      if (overrides === post.overrides) overrides = { ...overrides };
      const next = { ...override }; delete next.format; overrides[id] = next;
    }
  }
  return { mediaIds, format: "auto", overrides };
}

export function removeMediaPatch(post, id, inferFormat = false, media = []) {
  const mediaIds = post.mediaIds.filter(value => value !== id);
  return inferFormat ? mediaChangePatch(post, mediaIds, media) : { mediaIds };
}

function UnifiedDropzone({ onPickMedia, onDropFiles, uploading }) {
  const [dragActive, setDragActive] = useState(false);
  return <div className={`bridge-upload-zone bridge-unified-upload-zone${dragActive ? " is-dragging" : ""}`}
    onDragOver={event => { if (uploading || !Array.from(event.dataTransfer?.types || []).includes("Files")) return; event.preventDefault(); event.dataTransfer.dropEffect = "copy"; setDragActive(true); }}
    onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget)) setDragActive(false); }}
    onDrop={event => { event.preventDefault(); setDragActive(false); if (!uploading && event.dataTransfer?.files?.length) onDropFiles(event.dataTransfer.files); }}>
    <h3>Drag &amp; Drop</h3>
    <p className="bridge-upload-types">{UPLOAD_CATEGORIES}</p>
    <div className="bridge-upload-or"><span>OR</span></div>
    <button type="button" className="bridge-upload-choose" disabled={uploading} onClick={onPickMedia}>{uploading ? "Uploading…" : "Choose File"}</button>
  </div>;
}

export function PostEditor({ post, onChange, accounts, accountsReady = true, media, catalog, onPickMedia, onDropFiles, unifiedUpload = false, uploadDisabled = false, onRefreshOptions, uploading = false, uploadProgress, onCancelUpload, onUploadCover, onCoverBusyChange, coverUploading = false, compact = false }) {
  const chosen = post.mediaIds.map(id => media.find(item => item.id === id)).filter(Boolean);
  const mediaReady = chosen.length === post.mediaIds.length;
  const uploadLabel = uploadProgress?.stage === "processing" ? "Preparing…" : "Uploading…";
  const [draggedId, setDraggedId] = useState("");
  const [dropTarget, setDropTarget] = useState(null);
  const draggedMedia = useRef("");
  const update = patch => onChange(current => ({ ...current, ...patch }));
  const setOverride = (id, patch) => update({ overrides: { ...post.overrides, [id]: { ...post.overrides[id], ...patch } } });
  useEffect(() => {
    const overrides = removeStaleCovers(post.overrides, post.mediaIds, (post.deliveries || []).filter(isDeliveryComplete).map(delivery => delivery.accountId));
    if (overrides !== post.overrides) update({ overrides });
  }, [post.mediaIds.join(","), post.overrides]);
  const toggleAccount = id => {
    const selected = post.accountIds.includes(id);
    const overrides = { ...post.overrides }; if (selected) delete overrides[id];
    update({ accountIds: selected ? post.accountIds.filter(value => value !== id) : [...post.accountIds, id], overrides });
  };
  const scheduled = post.schedule?.mode === "scheduled";
  const frozenFor = id => post.deliveries?.find(delivery => delivery.accountId === id && isDeliveryComplete(delivery));
  const type = unifiedUpload
    ? (["story", "reel"].includes(post.format) ? post.format : detectFormat(chosen))
    : postTypeOf(post, media);
  const maxMedia = MAX_MEDIA_BY_TYPE[type];
  const capabilityFor = account => catalog.find(item => item.id === account.platform);
  // Removed accounts are not destinations. Expired authorizations remain visible
  // so the creator can reconnect without losing their draft's selections.
  const available = accounts.filter(account => ["connected", "reconnect_required"].includes(account.status));
  const visible = mediaReady ? available.filter(account => frozenFor(account.id) || supportsPostType(capabilityFor(account), type, chosen)) : [];
  const selectable = visible.filter(account => account.status === "connected" && !frozenFor(account.id));
  const hidden = accountsReady && mediaReady ? post.accountIds.filter(id => !visible.some(account => account.id === id)) : [];
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
      <div className="bridge-section-label"><strong>Content <span className="bridge-detected-format">{mediaReady ? POST_TYPES.find(item => item.id === type)?.label || FORMAT_LABELS[type] : "Loading media…"}</span></strong>{mediaReady && type === "carousel" && <span>{chosen.length} {chosen.length === 1 ? "item" : "items"}{chosen.length < 2 ? " · add at least 2" : " · Drag to reorder"}</span>}</div>
      {unifiedUpload && mediaReady && !chosen.some(item => item.kind === "document") && chosen.length < 35 && <UnifiedDropzone onPickMedia={onPickMedia} onDropFiles={onDropFiles} uploading={uploading || uploadDisabled}/>}
      {maxMedia > 0 && (!unifiedUpload || mediaReady && chosen.length > 0) && (chosen.length ? <div className="bridge-media-strip">{chosen.map((item, index) => <div key={item.id} className={`bridge-picked-media ${draggedId === item.id ? "dragging" : ""} ${dropTarget?.id === item.id ? `drop-${dropTarget.position}` : ""}`} onDragOver={event => { const sourceId = draggedMedia.current; if (!sourceId || sourceId === item.id) return; event.preventDefault(); event.dataTransfer.dropEffect = "move"; const rect = event.currentTarget.getBoundingClientRect(); setDropTarget({ id: item.id, position: event.clientX < rect.left + rect.width / 2 ? "before" : "after" }); }} onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget)) setDropTarget(current => current?.id === item.id ? null : current); }} onDrop={event => { event.preventDefault(); moveMedia(draggedMedia.current || event.dataTransfer.getData("text/plain"), item.id, dropTarget?.id === item.id ? dropTarget.position : "before"); }}><MediaThumb media={item}/>{chosen.length > 1 && <button type="button" className="bridge-drag-handle" draggable aria-label={`Drag ${item.filename} to reorder`} title="Drag to reorder" onDragStart={event => { draggedMedia.current = item.id; event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", item.id); setDraggedId(item.id); }} onDragEnd={clearDrag} onKeyDown={event => { if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); moveMediaBy(item.id, event.key === "ArrowLeft" ? -1 : 1); } }}><Icon name="drag" size={18}/></button>}<span className="bridge-media-order">{index + 1}</span><button className="bridge-remove-media" aria-label={`Remove ${item.filename}`} onClick={() => update(removeMediaPatch(post, item.id, unifiedUpload, media))}><Icon name="close" size={14}/></button></div>)}{!unifiedUpload && chosen.length < maxMedia && <button className="bridge-add-media" disabled={uploading} onClick={onPickMedia}><Icon name="plus"/><span>{uploading ? uploadLabel : "Add more"}</span></button>}</div> : <button className="bridge-upload-zone" disabled={uploading} onClick={onPickMedia}><Icon name={type === "carousel" ? "carousel" : type} size={30}/><h3>{uploading ? uploadLabel : type === "image" ? "Add an image" : type === "video" ? "Add a video" : "Add pictures or videos"}</h3><p>{type === "carousel" ? "Select 2 or more files from your device" : "Select a file from your device"}</p></button>)}
      {(uploading || ["failed", "cancelled"].includes(uploadProgress?.stage)) && <UploadProgress progress={uploadProgress} onCancel={onCancelUpload}/>}
      <div className="bridge-field bridge-text-field"><span>Caption</span><div className="bridge-text-box"><textarea ref={textBox} aria-label="Caption" value={post.caption} maxLength={65000} rows={type === "text" ? 8 : 5} onChange={event => update({ caption: event.target.value })} placeholder="Write something worth sharing…"/><EmojiPicker onPick={insertEmoji}/></div><span className="bridge-character-count">{post.caption.length.toLocaleString()} characters</span></div>
    </div>
    <div className="bridge-composer-destinations"><div className="bridge-section-label"><strong>Destinations</strong><span>{post.accountIds.length} selected</span></div>
      {!accountsReady ? <p className="bridge-small">Loading accounts…</p> : !mediaReady ? <p className="bridge-small">Loading media before showing destinations…</p> : !available.length ? <p className="bridge-small">Connect a social account in this project to choose a destination.</p> : !visible.length && <p className="bridge-small">None of your connected accounts can publish {type === "image" ? "an image" : type === "video" ? "a video" : type === "text" ? "text-only" : type === "document" ? "this document" : "this carousel"} post.</p>}
      {type === "carousel" && chosen.some(item => item.kind === "video") && <p className="bridge-small">Only platforms that accept videos in a carousel are shown.</p>}
      {selectable.length > 1 && <label className="bridge-select-all"><input ref={selectAll} type="checkbox" checked={allSelected} onChange={toggleAll}/><span>Select all connected accounts</span><small>{selectable.length} accounts</small></label>}
      {visible.map(account => { const selected = post.accountIds.includes(account.id), override = post.overrides[account.id] || {}, capability = capabilityFor(account), frozen = frozenFor(account.id), variants = formatVariants(capability, type), inbox = isTikTokInbox({ platform: account.platform, settings: override.settings }), inboxVideo = inbox && chosen.some(item => item.kind === "video"); return <div className={`bridge-destination ${selected ? "selected" : ""}`} key={account.id}>
        <label className="bridge-account-choice"><input type="checkbox" checked={selected} disabled={Boolean(frozen) || account.status !== "connected" && !selected} onChange={() => toggleAccount(account.id)}/><PlatformBadge platform={account.platform} catalog={catalog}/><span><strong>{account.label}</strong><small>{capability?.name || account.platform}{frozen ? ` · ${frozen.status === "awaiting_publish" ? "Finish in TikTok" : frozen.status}` : account.status !== "connected" ? ` · ${account.status.replaceAll("_", " ")}` : ""}</small></span></label>
        {account.status === "reconnect_required" && <a className="bridge-text-button bridge-destination-refresh" href={dashboardPath("accounts")} target="_blank" rel="noreferrer" aria-label={`Refresh connection for ${account.label} (opens Connections in a new tab)`}><Icon name="refresh" size={14}/> Refresh connection</a>}
        {selected && !frozen && <div className="bridge-account-customize">
          {scheduled && <div className="bridge-account-time"><label className="bridge-check"><input type="checkbox" checked={Boolean(override.localDateTime)} onChange={event => setCustomTime(account.id, event.target.checked)}/><span>Custom time</span></label>{override.localDateTime ? <ScheduleDateTime value={override.localDateTime} onChange={localDateTime => localDateTime && setOverride(account.id, { localDateTime })}/> : <small>{inbox ? "Sends to TikTok at the general time" : "Posts at the general time"}{post.schedule.localDateTime ? ` · ${generalTimeLabel(post.schedule.localDateTime)}` : ""}</small>}</div>}
          <div className="bridge-allowance">{account.options?.remaining !== null && account.options?.remaining !== undefined ? `${account.options.remaining} of ${account.options.limit} posts available` : "Posting allowance checked before delivery"}</div>
          {account.optionsError && <><Alert message={account.optionsError}/>{onRefreshOptions && <button type="button" className="bridge-text-button" disabled={account.optionsLoading || account.status !== "connected"} onClick={() => onRefreshOptions(account.id)}><Icon name="refresh" size={14}/>{account.optionsLoading ? "Refreshing settings…" : account.platform === "tiktok" ? "Refresh TikTok settings" : "Retry posting options"}</button>}</>}
          {variants.length > 1 && <Field label="Post as"><select value={override.format && override.format !== "auto" ? override.format : type} onChange={event => setOverride(account.id, { format: event.target.value === type ? "auto" : event.target.value })}>{variants.map(format => <option key={format} value={format}>{FORMAT_LABELS[format] || format}</option>)}</select></Field>}
          {capability?.titleLimit && !inboxVideo && <Field label={capability.titleRequired ? `${capability.name} title (required)` : `${capability.name} title (optional)`}><input value={override.title ?? ""} maxLength={capability.titleLimit} placeholder={`Up to ${capability.titleLimit} characters`} onChange={event => setOverride(account.id, { title: event.target.value })}/></Field>}
          {!inboxVideo && <details><summary>Customize caption for this account</summary><Field label={`Caption · ${capability?.captionLimit?.toLocaleString() || "—"} character limit`}><textarea rows={3} value={override.caption ?? post.caption} onChange={event => setOverride(account.id, { caption: event.target.value })}/></Field><button className="bridge-text-button" onClick={() => { const next = { ...override }; delete next.caption; update({ overrides: { ...post.overrides, [account.id]: next } }); }}>Use shared caption</button></details>}
          <DestinationSettings account={account} settings={override.settings} onChange={settings => setOverride(account.id, { settings })} hasVideo={chosen.some(item => item.kind === "video")} hasImages={chosen.some(item => item.kind === "image")}/>
          {coverVideo(account.platform, override.format && override.format !== "auto" ? override.format : type, override.settings, chosen) && <VideoCoverPicker key={`${account.id}:${chosen[0].id}`} account={account} video={chosen[0]} media={media} settings={override.settings} onChange={settings => setOverride(account.id, { settings })} onUpload={onUploadCover} onBusyChange={onCoverBusyChange} disabled={uploading || coverUploading}/>}
        </div>}
      </div>; })}
    </div>
  </div>;
}

export default function Composer({ project, accounts: initialAccounts, accountsReady = true, media, catalog, config, draft = null, onAccounts, onSubmitted, onDraftSaved, onDiscard, onDirtyChange, onBusyChange, scheduledDate = "", onDraftStarted, onUpload }) {
  const [items, setItems] = useState(() => [draft ? draftPost(draft, project) : makePost(project, [], [], scheduledDate)]);
  const [active, setActive] = useState(0), [error, setError] = useState(""), [busyAction, setBusyAction] = useState(""), [uploading, setUploading] = useState(false);
  const [dirty, setDirty] = useState(false), [discardOpen, setDiscardOpen] = useState(false);
  const requestId = useRef(crypto.randomUUID()), fileInput = useRef(null), errorActions = useRef(null), alive = useRef(true), uploadController = useRef(null);
  const [uploadProgress, setUploadProgress] = useState(null), [coverUploads, setCoverUploads] = useState(0);
  const coverUploading = coverUploads > 0;
  const busy = Boolean(busyAction);
  const selectedAccountIds = [...new Set(items.flatMap(item => item.accountIds))].sort().join(",");
  const { accounts, refreshOptions } = useAccountOptions(project.id, initialAccounts, selectedAccountIds.split(","));
  const hasDraftContent = items.length > 0 && items.every(hasPostContent);
  useEffect(() => { alive.current = true; onDraftStarted?.(); return () => { alive.current = false; uploadController.current?.abort(); }; }, []);
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);
  useEffect(() => { onBusyChange?.(busy || uploading || coverUploading); }, [busy, uploading, coverUploading, onBusyChange]);
  useEffect(() => () => onBusyChange?.(false), [onBusyChange]);
  useEffect(() => {
    if (!dirty) return;
    const warn = event => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  useEffect(() => {
    if (error) errorActions.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [error]);
  function changeItems(next) { setItems(next); setDirty(true); setError(""); requestId.current = crypto.randomUUID(); }
  async function submit(nextItems) {
    setBusyAction("submit"); setError("");
    setItems(nextItems);
    if (JSON.stringify(nextItems) !== JSON.stringify(items)) setDirty(true);
    try {
      const result = await submitComposerPosts({ projectId: project.id, items: nextItems, requestId: requestId.current, draft });
      if (alive.current) { setDirty(false); onSubmitted(result); }
    }
    catch (error) {
      if (alive.current) {
        const message = error.message || "Your post could not be submitted. Please try again.";
        setError(message);
      }
    } finally { if (alive.current) setBusyAction(""); }
  }
  async function saveDraft() {
    if (!hasDraftContent) { setError("Add a caption, a title, or media before saving a draft."); return; }
    setBusyAction("save"); setError("");
    try {
      const result = draft
        ? await api.project(project.id, `/posts/${encodeURIComponent(draft.id)}`, { method: "PATCH", body: { ...items[0], revision: draft.revision } })
        : await api.project(project.id, "/posts/drafts", { method: "POST", body: { items, requestId: requestId.current } });
      if (alive.current) { setDirty(false); onDraftSaved?.(result.post || result.posts?.[0]); }
    } catch (error) { if (alive.current) setError(error.message); } finally { if (alive.current) setBusyAction(""); }
  }
  function requestDiscard() {
    if (!dirty) { onDiscard?.(); return; }
    setDiscardOpen(true);
  }
  function discard() { setDirty(false); setDiscardOpen(false); onDiscard?.(); }
  async function uploadMedia(files) {
    if (!files?.length || uploading || busy) return;
    let selected;
    try {
      const existing = items[active].mediaIds.map(id => media.find(item => item.id === id)).filter(Boolean);
      if (existing.length !== items[active].mediaIds.length) throw new Error("Wait for the saved media to load before adding files.");
      selected = validateUploadSelection(files, existing, config.maxUploadBytes);
    } catch (error) { setError(error.message); return; }
    const postKey = items[active].key;
    const controller = new AbortController(); uploadController.current = controller;
    setUploading(true); setUploadProgress(null); setError(""); setDirty(true);
    try {
      const uploaded = await onUpload(selected, progress => { if (alive.current) setUploadProgress(progress); }, { signal: controller.signal });
      if (alive.current && uploaded.length) changeItems(current => current.map(item => item.key === postKey ? { ...item, ...mediaChangePatch(item, [...new Set([...item.mediaIds, ...uploaded.map(upload => upload.id)])], [...media, ...uploaded]) } : item));
    }
    catch (error) { if (alive.current) setError(error.message); } finally { if (uploadController.current === controller) uploadController.current = null; if (alive.current) setUploading(false); }
  }
  const schedule = items[active].schedule, scheduled = schedule.mode === "scheduled";
  const setSchedule = patch => changeItems(items.map(item => ({ ...item, schedule: { ...item.schedule, ...patch } })));
  const toggleScheduled = on => setSchedule(on ? { mode: "scheduled", timeZone: project.timeZone, localDateTime: schedule.localDateTime || nextMorning(project.timeZone) } : { mode: "now" });
  const selectedDestinations = items.flatMap(item => item.accountIds.map(id => ({ platform: accounts.find(account => account.id === id)?.platform, settings: item.overrides[id]?.settings })));
  const selectedMix = deliveryMix(selectedDestinations);
  const hasYouTube = selectedDestinations.some(destination => destination.platform === "youtube");
  const userAgent = typeof navigator === "undefined" ? "" : navigator.userAgent;
  const mobileUpload = /Android|iPhone|iPad|iPod|IEMobile|Opera Mini|Mobile/i.test(userAgent) || /Macintosh/i.test(userAgent) && navigator.maxTouchPoints > 1;
  const youtubeTermsUrl = mobileUpload ? "http://m.youtube.com/terms" : "https://www.youtube.com/t/terms";
  const actionLabel = submissionLabel(selectedDestinations, { scheduled, count: items.length, youtube: hasYouTube });
  const busyLabel = scheduled ? "Scheduling…" : selectedMix.onlyInbox ? "Sending…" : selectedMix.hasInbox ? "Submitting…" : "Publishing…";
  const discardDialog = discardOpen && <Modal title={draft ? "Discard changes?" : "Discard this post?"} onClose={() => setDiscardOpen(false)} busy={busy}><p>{draft ? "Your last saved draft will stay in Drafts. Changes made since then will be lost." : "This unsaved post will be removed. Media you uploaded will remain available in your media library."}</p><div className="bridge-modal-actions"><button className="bridge-button secondary" onClick={() => setDiscardOpen(false)}>Keep editing</button><button className="bridge-button danger" onClick={discard}>{draft ? "Discard changes" : "Discard post"}</button></div></Modal>;
  return <>
    <div className="bridge-intro-row"><p>Add files or write a caption, then choose the accounts that can publish it.</p><div className="bridge-inline-actions"><button className="bridge-button secondary" disabled={busy || uploading || coverUploading} onClick={onAccounts}><Icon name="accounts" size={16}/> Accounts</button></div></div>
    <input type="file" ref={fileInput} hidden multiple accept={UPLOAD_ACCEPT} onChange={event => { uploadMedia(event.target.files); event.target.value = ""; }}/>
    <fieldset className="bridge-composer-workspace" disabled={busy}>
      <div className={`bridge-panel bridge-schedule-bar ${scheduled ? "on" : ""}`}><label className="bridge-switch"><input type="checkbox" role="switch" checked={scheduled} onChange={event => toggleScheduled(event.target.checked)}/><span className="bridge-switch-track" aria-hidden="true"/><span><strong>Schedule for later</strong><small>{scheduled ? "Choose a general time below, or a custom time on any account." : selectedMix.onlyInbox ? "Off: media is sent when you click Send to TikTok." : selectedMix.hasInbox ? "Off: publishing and TikTok transfers start when you click Publish & send to TikTok." : "Off: posts start publishing when you click Publish now."}</small></span></label>{scheduled && <div className="bridge-schedule-bar-fields"><div className="bridge-general-time"><strong>General time</strong><small>{selectedMix.hasInbox ? "TikTok transfers start at this time; you finish publishing in TikTok. Other destinations publish at their chosen time." : "Every selected account posts at this time unless you give it a custom time."} Times use your current time zone ({project.timeZone}).</small><ScheduleDateTime value={schedule.localDateTime} onChange={localDateTime => localDateTime && setSchedule({ localDateTime })}/></div></div>}</div>
      <div className="bridge-panel"><PostEditor post={items[active]} onChange={updatePost => changeItems(current => current.map((item, i) => i === active ? updatePost(item) : item))} accounts={accounts} accountsReady={accountsReady} media={media} catalog={catalog} uploading={uploading} uploadProgress={uploadProgress} onCancelUpload={() => uploadController.current?.abort()} onPickMedia={() => fileInput.current?.click()} onDropFiles={uploadMedia} unifiedUpload uploadDisabled={busy} onRefreshOptions={refreshOptions} onUploadCover={onUpload} onCoverBusyChange={delta => setCoverUploads(count => Math.max(0, count + delta))} coverUploading={coverUploading}/></div>
    </fieldset>
    {hasYouTube && <p className="bridge-small">By clicking {actionLabel}, you certify that the content you are uploading complies with the YouTube Terms of Service (including the YouTube Community Guidelines) at <a href={youtubeTermsUrl} target="_blank" rel="noreferrer">{youtubeTermsUrl}</a>. Please be sure not to violate others' copyright or privacy rights.</p>}
    <div className="bridge-composer-footer"><div><strong>{draft ? "Editing saved draft" : "1 post in this draft"}</strong><span id={!hasDraftContent ? "bridge-empty-draft-help" : undefined}>{!hasDraftContent ? "Add a caption, a title, or media before saving." : selectedMix.hasInbox ? "TikTok transfers still need you to finish publishing in the TikTok app" : scheduled ? "Each destination publishes at its own time" : "Each destination can use its own format and settings"}</span></div><div ref={errorActions} className="bridge-composer-actions">{error && <div id="bridge-composer-error"><Alert message={error}/></div>}<div className="bridge-inline-actions"><button className="bridge-button secondary" disabled={busy || uploading || coverUploading} onClick={requestDiscard}>{draft ? "Discard changes" : "Discard"}</button><button className="bridge-button secondary" disabled={busy || uploading || coverUploading || !dirty || !hasDraftContent} aria-describedby={!hasDraftContent ? "bridge-empty-draft-help" : undefined} onClick={saveDraft}><Icon name="drafts" size={17}/>{busyAction === "save" ? "Saving…" : "Save draft in Meadow"}</button><button className="bridge-button" aria-describedby={error ? "bridge-composer-error" : undefined} disabled={busy || uploading || coverUploading || scheduled && !schedule.localDateTime || !config.features?.publishing} onClick={() => submit(scheduled ? items : items.map(item => ({ ...item, schedule: { ...item.schedule, mode: "now", localDateTime: "" } })))}>{scheduled && <Icon name="clock" size={17}/>} {busyAction === "submit" ? busyLabel : actionLabel}</button></div></div></div>
    {discardDialog}
  </>;
}
