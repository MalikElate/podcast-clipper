import { useEffect, useRef, useState } from "react";
import { api } from "./BridgeApi.js";
import { Icon } from "./Icons.jsx";
import { Alert, Badge, Check, dateTime, Field, MediaThumb, Modal, PlatformBadge, TimezoneField } from "./ui.jsx";
import { DestinationSettings } from "./DestinationSettings.jsx";
import UploadProgress from "./UploadProgress.jsx";


export const makePost = (project, mediaIds = [], accountIds = [], scheduledDate = "") => ({ key: crypto.randomUUID(), caption: "", title: "", mediaIds, accountIds, format: "auto", overrides: {}, schedule: { mode: scheduledDate ? "scheduled" : "now", timeZone: project.timeZone, localDateTime: scheduledDate ? `${scheduledDate}T09:00` : "", disambiguation: "reject" } });

function scheduleParts(value = "") {
  const [date = "", time = ""] = value.split("T"), [hourText = "9", minute = "00"] = time.split(":"), hour = Number(hourText);
  if (!time || !Number.isInteger(hour) || hour < 0 || hour > 23) return { date, time: "9:00", period: "AM" };
  return { date, time: `${hour % 12 || 12}:${minute}`, period: hour >= 12 ? "PM" : "AM" };
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
      <div className="bridge-section-label"><strong>Content</strong><span>{chosen.length} media {chosen.length === 1 ? "item" : "items"}{chosen.length > 1 ? " · Drag to reorder" : ""}</span></div>
      {chosen.length ? <div className="bridge-media-strip">{chosen.map((item, index) => <div key={item.id} className={`bridge-picked-media ${draggedId === item.id ? "dragging" : ""} ${dropTarget?.id === item.id ? `drop-${dropTarget.position}` : ""}`} onDragOver={event => { const sourceId = draggedMedia.current; if (!sourceId || sourceId === item.id) return; event.preventDefault(); event.dataTransfer.dropEffect = "move"; const rect = event.currentTarget.getBoundingClientRect(); setDropTarget({ id: item.id, position: event.clientX < rect.left + rect.width / 2 ? "before" : "after" }); }} onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget)) setDropTarget(current => current?.id === item.id ? null : current); }} onDrop={event => { event.preventDefault(); moveMedia(draggedMedia.current || event.dataTransfer.getData("text/plain"), item.id, dropTarget?.id === item.id ? dropTarget.position : "before"); }}><MediaThumb media={item}/>{chosen.length > 1 && <button type="button" className="bridge-drag-handle" draggable aria-label={`Drag ${item.filename} to reorder`} title="Drag to reorder" onDragStart={event => { draggedMedia.current = item.id; event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", item.id); setDraggedId(item.id); }} onDragEnd={clearDrag} onKeyDown={event => { if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); moveMediaBy(item.id, event.key === "ArrowLeft" ? -1 : 1); } }}><Icon name="drag" size={18}/></button>}<span className="bridge-media-order">{index + 1}</span><button className="bridge-remove-media" aria-label={`Remove ${item.filename}`} onClick={() => update({ mediaIds: post.mediaIds.filter(id => id !== item.id) })}><Icon name="close" size={14}/></button></div>)}<button className="bridge-add-media" disabled={uploading || chosen.length >= 35} onClick={onPickMedia}><Icon name="plus"/><span>{uploading ? uploadLabel : "Add media"}</span></button></div> : <button className="bridge-upload-zone" disabled={uploading} onClick={onPickMedia}><Icon name="media" size={30}/><h3>{uploading ? uploadLabel : "Add media"}</h3><p>Select images, videos, or documents from your device</p></button>}
      {uploading && <UploadProgress progress={uploadProgress}/>}
      <Field label="Title" hint="Used by platforms that support a post title."><input maxLength={500} value={post.title} onChange={event => update({ title: event.target.value })} placeholder="Give this post a title"/></Field>
      <Field label="Caption"><textarea value={post.caption} maxLength={65000} rows={5} onChange={event => update({ caption: event.target.value })} placeholder="Write something worth sharing…"/><span className="bridge-character-count">{post.caption.length.toLocaleString()} characters</span></Field>
    </div>
    <div className="bridge-composer-destinations"><div className="bridge-section-label"><strong>Destinations</strong><span>{post.accountIds.length} selected</span></div>
      {!accounts.length && <p className="bridge-small">Connect a social account in this project to choose a destination.</p>}
      {accounts.map(account => { const selected = post.accountIds.includes(account.id), override = post.overrides[account.id] || {}, capability = catalog.find(item => item.id === account.platform), frozen = post.deliveries?.find(delivery => delivery.accountId === account.id && ["published", "cancelled"].includes(delivery.status)); return <div className={`bridge-destination ${selected ? "selected" : ""}`} key={account.id}>
        <label className="bridge-account-choice"><input type="checkbox" checked={selected} disabled={Boolean(frozen) || account.status !== "connected" && !selected} onChange={() => toggleAccount(account.id)}/><PlatformBadge platform={account.platform} catalog={catalog}/><span><strong>{account.label}</strong><small>{capability?.name || account.platform}{frozen ? ` · ${frozen.status}` : account.status !== "connected" ? ` · ${account.status.replaceAll("_", " ")}` : ""}</small></span></label>
        {selected && !frozen && <div className="bridge-account-customize">
          <div className="bridge-allowance">{account.options?.remaining !== null && account.options?.remaining !== undefined ? `${account.options.remaining} of ${account.options.limit} posts available` : "Posting allowance checked before delivery"}</div>
          {account.optionsError && <Alert message={account.optionsError}/>}
          <Field label="Format"><select value={override.format || "auto"} onChange={event => setOverride(account.id, { format: event.target.value })}><option value="auto">Automatic from media</option>{(capability?.formats || []).map(format => <option key={format} value={format}>{format[0].toUpperCase() + format.slice(1)}</option>)}</select></Field>
          <details><summary>Customize title & caption</summary><Field label="Title for this account"><input value={override.title ?? post.title} maxLength={500} onChange={event => setOverride(account.id, { title: event.target.value })}/></Field><Field label={`Caption · ${capability?.captionLimit?.toLocaleString() || "—"} character limit`}><textarea rows={3} value={override.caption ?? post.caption} onChange={event => setOverride(account.id, { caption: event.target.value })}/></Field><button className="bridge-text-button" onClick={() => { const next = { ...override }; delete next.title; delete next.caption; update({ overrides: { ...post.overrides, [account.id]: next } }); }}>Use shared title & caption</button></details>
          <DestinationSettings account={account} settings={override.settings} onChange={settings => setOverride(account.id, { settings })} hasVideo={chosen.some(item => item.kind === "video")} hasImages={chosen.some(item => item.kind === "image")}/>
        </div>}
      </div>; })}
    </div>
  </div>;
}

export default function Composer({ project, accounts: initialAccounts, media, catalog, config, onAccounts, onSubmitted, scheduledDate = "", onDraftStarted, onUpload }) {
  const [items, setItems] = useState(() => [makePost(project, [], [], scheduledDate)]);
  const [accounts, setAccounts] = useState(initialAccounts), [active, setActive] = useState(0), [scheduling, setScheduling] = useState(false), [scheduleDraft, setScheduleDraft] = useState(null), [preview, setPreview] = useState(null), [previewIntent, setPreviewIntent] = useState("publish"), [error, setError] = useState(""), [busy, setBusy] = useState(false), [uploading, setUploading] = useState(false);
  const requestId = useRef(crypto.randomUUID()), fileInput = useRef(null), alive = useRef(true);
  const [uploadProgress, setUploadProgress] = useState(null);
  const selectedAccountIds = [...new Set(items.flatMap(item => item.accountIds))].sort().join(",");
  useEffect(() => { alive.current = true; onDraftStarted?.(); return () => { alive.current = false; }; }, []);
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
  function changeItems(next) { setItems(next); setPreview(null); setError(""); requestId.current = crypto.randomUUID(); }
  async function review(nextItems, intent) {
    setBusy(true); setError(""); setPreviewIntent(intent); setItems(nextItems); setScheduling(false); requestId.current = crypto.randomUUID();
    try { const result = await api.project(project.id, "/posts/preview", { method: "POST", body: { items: nextItems } }); if (alive.current) setPreview(result); }
    catch (error) { if (alive.current) setError(error.message); } finally { if (alive.current) setBusy(false); }
  }
  async function submit() {
    setBusy(true); setError("");
    try { const result = await api.project(project.id, "/posts", { method: "POST", body: { items, requestId: requestId.current } }); if (alive.current) onSubmitted(result); }
    catch (error) { if (alive.current) setError(error.message); } finally { if (alive.current) setBusy(false); }
  }
  async function uploadMedia(files) {
    if (!files.length) return;
    setUploading(true); setUploadProgress(null); setError("");
    try {
      const available = Math.max(0, 35 - items[active].mediaIds.length);
      const uploaded = await onUpload([...files].slice(0, available), progress => { if (alive.current) setUploadProgress(progress); });
      if (alive.current && uploaded.length) changeItems(current => current.map((item, index) => index === active ? { ...item, mediaIds: [...new Set([...item.mediaIds, ...uploaded.map(upload => upload.id)])].slice(0, 35) } : item));
    }
    catch (error) { if (alive.current) setError(error.message); } finally { if (alive.current) setUploading(false); }
  }
  function openSchedule() {
    const current = items[active].schedule;
    setScheduleDraft({ ...current, mode: "scheduled", timeZone: current.timeZone || project.timeZone, localDateTime: current.localDateTime || nextMorning(project.timeZone) });
    setScheduling(true); setError("");
  }
  return <>
    <div className="bridge-intro-row"><p>Create once, tailor for every account. Each destination keeps its own place in the queue.</p><button className="bridge-button secondary" onClick={onAccounts}><Icon name="accounts" size={16}/> Accounts</button></div>
    <Alert message={error}/>
    <input type="file" ref={fileInput} hidden multiple accept="image/*,video/*,.pdf,.doc,.docx,.ppt,.pptx" onChange={event => { uploadMedia(event.target.files); event.target.value = ""; }}/>
    <div className="bridge-panel"><PostEditor post={items[active]} onChange={post => changeItems(items.map((item, i) => i === active ? post : item))} accounts={accounts} media={media} catalog={catalog} uploading={uploading} uploadProgress={uploadProgress} onPickMedia={() => fileInput.current?.click()}/></div>
    <div className="bridge-composer-footer"><div><strong>1 post in this draft</strong><span>Each destination can use its own format and settings</span></div><div className="bridge-inline-actions"><button className="bridge-button" disabled={busy || uploading} onClick={() => review(items.map(item => ({ ...item, schedule: { ...item.schedule, mode: "now", localDateTime: "" } })), "publish")}>{busy && previewIntent === "publish" ? "Checking…" : "Review & publish"}<Icon name="arrow" size={17}/></button><button className="bridge-button secondary" disabled={busy || uploading} onClick={openSchedule}><Icon name="clock" size={17}/> Schedule</button></div></div>
    {scheduling && scheduleDraft && <Modal title="Schedule post" busy={busy} onClose={() => setScheduling(false)}><p>Choose when this post should publish.</p><ScheduleDateTime value={scheduleDraft.localDateTime} onChange={localDateTime => setScheduleDraft(current => ({ ...current, localDateTime }))}/><TimezoneField value={scheduleDraft.timeZone} onChange={timeZone => setScheduleDraft(current => ({ ...current, timeZone }))}/><Field label="When clocks repeat an hour"><select value={scheduleDraft.disambiguation || "reject"} onChange={event => setScheduleDraft(current => ({ ...current, disambiguation: event.target.value }))}><option value="reject">Ask me to choose if ambiguous</option><option value="earlier">Use the earlier occurrence</option><option value="later">Use the later occurrence</option></select></Field><div className="bridge-modal-actions"><button className="bridge-button secondary" disabled={busy} onClick={() => setScheduling(false)}>Cancel</button><button className="bridge-button" disabled={busy || !scheduleDraft.localDateTime} onClick={() => review(items.map(item => ({ ...item, schedule: { ...scheduleDraft, mode: "scheduled" } })), "schedule")}>{busy ? "Checking…" : "Review schedule"}<Icon name="arrow" size={17}/></button></div></Modal>}
    {preview && <Modal title={previewIntent === "publish" ? "Review and publish" : "Review schedule"} wide busy={busy} onClose={() => setPreview(null)}><p className="bridge-small">Times are shown in {project.timeZone}. Allowances are checked again before every delivery.</p><Alert message={error}/>{preview.delayed > 0 && <div className="bridge-notice">{preview.delayed} deliveries will wait for their account’s next available allowance.</div>}<div className="bridge-preview-list">{preview.rows.map(row => <div className="bridge-preview-post" key={row.index}><h3>Post {row.index + 1} <span>{row.title || row.caption.slice(0, 80) || "Media post"}</span></h3>{row.destinations.map(destination => <div key={destination.id} className="bridge-preview-destination"><PlatformBadge platform={destination.platform} catalog={catalog}/><div><strong>{destination.accountName}</strong><span>{dateTime(destination.dueAt, project.timeZone)}{destination.estimated ? " · estimate" : ""}</span>{destination.reason && <small>{destination.reason}</small>}{destination.errors.map((message, index) => <p className="bridge-validation-error" key={index}>{message}</p>)}</div><Badge status={destination.errors.length ? "failed" : destination.delayed ? "scheduled" : "queued"}>{destination.errors.length ? "Needs changes" : destination.delayed ? "Auto queued" : "Ready"}</Badge></div>)}</div>)}</div><div className="bridge-modal-actions"><button className="bridge-button secondary" disabled={busy} onClick={() => setPreview(null)}>Keep editing</button><button className="bridge-button" disabled={!preview.valid || busy || !config.features?.publishing} onClick={submit}>{busy ? previewIntent === "publish" ? "Publishing…" : "Scheduling…" : previewIntent === "publish" ? "Publish now" : `Schedule ${items.length === 1 ? "post" : `${items.length} posts`}`}</button></div></Modal>}
  </>;
}
