import { useEffect, useRef, useState } from "react";
import { api } from "./BridgeApi.js";
import { Icon } from "./Icons.jsx";
import { Alert, Badge, Check, dateTime, Empty, Field, MediaThumb, Modal, PlatformBadge, TimezoneField } from "./ui.jsx";
import { DestinationSettings } from "./DestinationSettings.jsx";

export const makePost = (project, mediaIds = [], accountIds = []) => ({ key: crypto.randomUUID(), caption: "", title: "", mediaIds, accountIds, format: "auto", overrides: {}, schedule: { mode: "now", timeZone: project.timeZone, localDateTime: "", disambiguation: "reject" } });

export function PostEditor({ post, onChange, project, accounts, media, catalog, onPickMedia, compact = false }) {
  const chosen = post.mediaIds.map(id => media.find(item => item.id === id)).filter(Boolean);
  const update = patch => onChange({ ...post, ...patch });
  const setOverride = (id, patch) => update({ overrides: { ...post.overrides, [id]: { ...post.overrides[id], ...patch } } });
  const toggleAccount = id => {
    const selected = post.accountIds.includes(id);
    const overrides = { ...post.overrides }; if (selected) delete overrides[id];
    update({ accountIds: selected ? post.accountIds.filter(value => value !== id) : [...post.accountIds, id], overrides });
  };
  return <div className={`bridge-post-editor ${compact ? "compact" : ""}`}>
    <div className="bridge-composer-main">
      <div className="bridge-section-label"><strong>Content</strong><span>{chosen.length} media {chosen.length === 1 ? "item" : "items"}</span></div>
      {chosen.length ? <div className="bridge-media-strip">{chosen.map((item, index) => <div key={item.id} className="bridge-picked-media"><MediaThumb media={item}/><span className="bridge-media-order">{index + 1}</span><button className="bridge-remove-media" aria-label={`Remove ${item.filename}`} onClick={() => update({ mediaIds: post.mediaIds.filter(id => id !== item.id) })}><Icon name="close" size={14}/></button>{index > 0 && <button className="bridge-move-media" onClick={() => { const ids = [...post.mediaIds]; [ids[index - 1], ids[index]] = [ids[index], ids[index - 1]]; update({ mediaIds: ids }); }} aria-label={`Move ${item.filename} earlier`}>←</button>}</div>)}<button className="bridge-add-media" onClick={onPickMedia}><Icon name="plus"/><span>Add media</span></button></div> : <button className="bridge-upload-zone" onClick={onPickMedia}><Icon name="media" size={30}/><h3>Add media from your library</h3><p>Images, videos, documents, and your generated clips</p></button>}
      <Field label="Title" hint="Used by platforms that support a post title."><input maxLength={500} value={post.title} onChange={event => update({ title: event.target.value })} placeholder="Give this post a title"/></Field>
      <Field label="Caption"><textarea value={post.caption} maxLength={65000} rows={5} onChange={event => update({ caption: event.target.value })} placeholder="Write something worth sharing…"/><span className="bridge-character-count">{post.caption.length.toLocaleString()} characters</span></Field>
      <div className="bridge-schedule-box"><div className="bridge-section-label"><strong>Publishing time</strong><Icon name="clock" size={17}/></div><div className="bridge-segmented"><button className={post.schedule.mode === "now" ? "active" : ""} onClick={() => update({ schedule: { ...post.schedule, mode: "now" } })}>As soon as available</button><button className={post.schedule.mode === "scheduled" ? "active" : ""} onClick={() => update({ schedule: { ...post.schedule, mode: "scheduled" } })}>Choose date & time</button></div>
        {post.schedule.mode === "scheduled" && <><div className="bridge-field-row"><Field label="Date & time"><input type="datetime-local" value={post.schedule.localDateTime || ""} onChange={event => update({ schedule: { ...post.schedule, localDateTime: event.target.value } })}/></Field><TimezoneField value={post.schedule.timeZone} onChange={timeZone => update({ schedule: { ...post.schedule, timeZone } })}/></div><Field label="When clocks repeat an hour"><select value={post.schedule.disambiguation || "reject"} onChange={event => update({ schedule: { ...post.schedule, disambiguation: event.target.value } })}><option value="reject">Ask me to choose if ambiguous</option><option value="earlier">Use the earlier occurrence</option><option value="later">Use the later occurrence</option></select></Field></>}
        <p className="bridge-small">If an account reaches its allowance, Bridge keeps its remaining posts in order and sends them when space becomes available.</p>
      </div>
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

export function MediaPicker({ media, selected, onSelect, onClose }) {
  const [ids, setIds] = useState(selected), [search, setSearch] = useState("");
  return <Modal title="Choose media" wide onClose={onClose}><Field label="Search your library"><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search filenames…"/></Field><div className="bridge-picker-grid">{media.filter(item => item.filename.toLowerCase().includes(search.toLowerCase())).map(item => <button key={item.id} className={`bridge-picker-item ${ids.includes(item.id) ? "selected" : ""}`} onClick={() => setIds(current => current.includes(item.id) ? current.filter(id => id !== item.id) : current.length < 35 ? [...current, item.id] : current)} aria-pressed={ids.includes(item.id)}><MediaThumb media={item}/><span>{item.filename}</span>{ids.includes(item.id) && <b>{ids.indexOf(item.id) + 1}</b>}</button>)}</div>{!media.length && <Empty title="Your library is empty">Upload content in Media library, or create clips in Clipping studio.</Empty>}<div className="bridge-modal-actions"><span className="bridge-small">{ids.length} / 35 selected</span><button className="bridge-button" onClick={() => { onSelect(ids); onClose(); }}>Use selected media</button></div></Modal>;
}

export default function Composer({ project, accounts: initialAccounts, media, catalog, config, onAccounts, onSubmitted, seed, onClearSeed, onUpload }) {
  const [items, setItems] = useState(() => seed?.length ? seed.map(item => ({ ...makePost(project, [item.id]), title: item.metadata?.title || item.filename.replace(/\.[^.]+$/, "") })) : [makePost(project)]);
  const [accounts, setAccounts] = useState(initialAccounts), [active, setActive] = useState(0), [picking, setPicking] = useState(false), [preview, setPreview] = useState(null), [error, setError] = useState(""), [busy, setBusy] = useState(false), [uploading, setUploading] = useState(false);
  const requestId = useRef(crypto.randomUUID()), fileInput = useRef(null), alive = useRef(true);
  const selectedAccountIds = [...new Set(items.flatMap(item => item.accountIds))].sort().join(",");
  useEffect(() => { alive.current = true; onClearSeed?.(); return () => { alive.current = false; }; }, []);
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
  async function review() {
    setBusy(true); setError("");
    try { const result = await api.project(project.id, "/posts/preview", { method: "POST", body: { items } }); if (alive.current) setPreview(result); }
    catch (error) { if (alive.current) setError(error.message); } finally { if (alive.current) setBusy(false); }
  }
  async function submit() {
    setBusy(true); setError("");
    try { const result = await api.project(project.id, "/posts", { method: "POST", body: { items, requestId: requestId.current } }); if (alive.current) onSubmitted(result); }
    catch (error) { if (alive.current) setError(error.message); } finally { if (alive.current) setBusy(false); }
  }
  async function uploadFiles(files) {
    if (!files.length) return;
    setUploading(true); setError("");
    try {
      const current = items[active], replaceBlank = items.length === 1 && !current.mediaIds.length && !current.caption && !current.title;
      const existing = replaceBlank ? [] : items;
      const uploaded = await onUpload([...files].slice(0, 100 - existing.length));
      if (alive.current && uploaded.length) { changeItems([...existing, ...uploaded.map(item => ({ ...makePost(project, [item.id], current.accountIds), title: item.metadata?.title || item.filename.replace(/\.[^.]+$/, ""), overrides: structuredClone(current.overrides), schedule: { ...current.schedule } }))]); setActive(existing.length); }
    }
    catch (error) { if (alive.current) setError(error.message); } finally { if (alive.current) setUploading(false); }
  }
  return <>
    <div className="bridge-intro-row"><p>Create once, tailor for every account. Each destination keeps its own place in the queue.</p><button className="bridge-button secondary" onClick={onAccounts}><Icon name="accounts" size={16}/> Accounts</button></div>
    <Alert message={error}/>
    <div className="bridge-composer-toolbar"><div className="bridge-post-tabs">{items.map((item, index) => <button key={item.key} className={active === index ? "active" : ""} onClick={() => setActive(index)}>Post {index + 1}{item.mediaIds.length > 0 && <span>{item.mediaIds.length}</span>}</button>)}</div><div className="bridge-inline-actions"><button className="bridge-icon-button" title="Add post" aria-label="Add post" disabled={items.length >= 100 || busy} onClick={() => { changeItems([...items, makePost(project, [], items[active].accountIds)]); setActive(items.length); }}><Icon name="plus"/></button><button className="bridge-icon-button" title="Remove current post" aria-label="Remove current post" disabled={items.length === 1 || busy} onClick={() => { changeItems(items.filter((_, i) => i !== active)); setActive(Math.max(0, active - 1)); }}><Icon name="trash"/></button></div></div>
    {items.length > 1 && <div className="bridge-batch-actions"><span>Apply from Post {active + 1} to all:</span><button onClick={() => changeItems(items.map(item => ({ ...item, accountIds: [...items[active].accountIds], overrides: Object.fromEntries(items[active].accountIds.map(id => [id, { ...(item.overrides[id] || {}), format: items[active].overrides[id]?.format || "auto", settings: structuredClone(items[active].overrides[id]?.settings || {}) }])) })))}>Destinations & settings</button><button onClick={() => changeItems(items.map(item => ({ ...item, caption: items[active].caption })))}>Shared caption</button><button onClick={() => changeItems(items.map(item => ({ ...item, schedule: { ...items[active].schedule } })))}>Publishing time</button></div>}
    <div className="bridge-panel"><PostEditor post={items[active]} onChange={post => changeItems(items.map((item, i) => i === active ? post : item))} project={project} accounts={accounts} media={media} catalog={catalog} onPickMedia={() => setPicking(true)}/></div>
    <div className="bridge-composer-footer"><div><strong>{items.length} {items.length === 1 ? "post" : "posts"} in this batch</strong><span>Up to 100 posts · Each post can use different media and settings</span></div><div className="bridge-inline-actions"><input type="file" ref={fileInput} hidden multiple accept="image/*,video/*,.pdf,.doc,.docx,.ppt,.pptx" onChange={event => { uploadFiles(event.target.files); event.target.value = ""; }}/><button className="bridge-button secondary" disabled={uploading || busy || items.length >= 100} onClick={() => fileInput.current.click()}><Icon name="upload" size={17}/>{uploading ? "Uploading…" : "Upload files as posts"}</button><button className="bridge-button" disabled={busy || uploading} onClick={review}>{busy ? "Checking…" : "Review schedule"}<Icon name="arrow" size={17}/></button></div></div>
    {picking && <MediaPicker media={media} selected={items[active].mediaIds} onClose={() => setPicking(false)} onSelect={mediaIds => changeItems(items.map((item, index) => index === active ? { ...item, mediaIds } : item))}/>}
    {preview && <Modal title="Review your publishing plan" wide busy={busy} onClose={() => setPreview(null)}><p className="bridge-small">Times are shown in {project.timeZone}. Allowances are checked again before every delivery.</p><Alert message={error}/>{preview.delayed > 0 && <div className="bridge-notice">{preview.delayed} deliveries will wait for their account’s next available allowance.</div>}<div className="bridge-preview-list">{preview.rows.map(row => <div className="bridge-preview-post" key={row.index}><h3>Post {row.index + 1} <span>{row.title || row.caption.slice(0, 80) || "Media post"}</span></h3>{row.destinations.map(destination => <div key={destination.id} className="bridge-preview-destination"><PlatformBadge platform={destination.platform} catalog={catalog}/><div><strong>{destination.accountName}</strong><span>{dateTime(destination.dueAt, project.timeZone)}{destination.estimated ? " · estimate" : ""}</span>{destination.reason && <small>{destination.reason}</small>}{destination.errors.map((message, index) => <p className="bridge-validation-error" key={index}>{message}</p>)}</div><Badge status={destination.errors.length ? "failed" : destination.delayed ? "scheduled" : "queued"}>{destination.errors.length ? "Needs changes" : destination.delayed ? "Auto queued" : "Ready"}</Badge></div>)}</div>)}</div><div className="bridge-modal-actions"><button className="bridge-button secondary" disabled={busy} onClick={() => setPreview(null)}>Keep editing</button><button className="bridge-button" disabled={!preview.valid || busy || !config.features?.publishing} onClick={submit}>{busy ? "Adding to queue…" : `Confirm ${items.length === 1 ? "post" : `${items.length} posts`}`}</button></div></Modal>}
  </>;
}
