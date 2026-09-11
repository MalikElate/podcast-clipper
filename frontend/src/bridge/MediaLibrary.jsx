import { useRef, useState } from "react";
import { api } from "./BridgeApi.js";
import { Icon } from "./Icons.jsx";
import { Alert, Badge, Empty, MediaThumb, Modal } from "./ui.jsx";

export default function MediaLibrary({ project, media, onUpload, onChanged, onCompose, config }) {
  const input = useRef(null), [busy, setBusy] = useState(false), [progress, setProgress] = useState(""), [error, setError] = useState(""), [selected, setSelected] = useState([]), [search, setSearch] = useState(""), [kind, setKind] = useState("all"), [preview, setPreview] = useState(null), [deleting, setDeleting] = useState(null), [dragging, setDragging] = useState(false);
  const visible = media.filter(item => (kind === "all" || item.kind === kind || kind === "clip" && item.source === "clip") && item.filename.toLowerCase().includes(search.toLowerCase()));
  const selectedMedia = media.filter(item => selected.includes(item.id));
  async function upload(files) {
    setBusy(true); setError("");
    try { await onUpload([...files].slice(0, 100), setProgress); }
    catch (error) { setError(error.message); } finally { setBusy(false); setProgress(""); }
  }
  async function remove() {
    setBusy(true); setError("");
    try { await api.project(project.id, `/media/${deleting.id}`, { method: "DELETE" }); setSelected(current => current.filter(id => id !== deleting.id)); setDeleting(null); onChanged(); }
    catch (error) { setError(error.message); } finally { setBusy(false); }
  }
  async function download() {
    setBusy(true); setError("");
    try { await api.download(project.id, `/media-download?ids=${selectedMedia.map(item => item.id).join(",")}`, "meadow-media.zip"); }
    catch (error) { setError(error.message); } finally { setBusy(false); }
  }
  return <><div className="bridge-intro-row"><p>Your uploads and generated clips, ready for their next destination.</p><input ref={input} type="file" hidden multiple accept="image/*,video/*,.pdf,.doc,.docx,.ppt,.pptx" onChange={event => { upload(event.target.files); event.target.value = ""; }}/><button className="bridge-button" disabled={busy || !config.mediaReady} onClick={() => input.current.click()}><Icon name="upload" size={17}/>{busy ? progress || "Working…" : "Upload media"}</button></div><Alert message={error}/>
    <div className={`bridge-drop-area ${dragging ? "dragging" : ""}`} onDragOver={event => { event.preventDefault(); setDragging(true); }} onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget)) setDragging(false); }} onDrop={event => { event.preventDefault(); setDragging(false); if (!busy && config.mediaReady) upload(event.dataTransfer.files); }}><div className="bridge-library-toolbar"><div className="bridge-filter-tabs">{[["all", "All media"], ["video", "Videos"], ["image", "Images"], ["document", "Documents"], ["clip", "Clips"]].map(([value, label]) => <button key={value} className={kind === value ? "active" : ""} onClick={() => setKind(value)}>{label}</button>)}</div><input className="bridge-search" aria-label="Search media" placeholder="Search media…" value={search} onChange={event => setSearch(event.target.value)}/></div>
      {selectedMedia.length > 0 && <div className="bridge-selection-bar"><span>{selectedMedia.length} selected</span><button className="bridge-text-button" onClick={() => setSelected([])}>Clear</button><div className="bridge-inline-actions"><button className="bridge-button secondary small" disabled={busy} onClick={download}><Icon name="download" size={15}/> Download ZIP</button><button className="bridge-button small" onClick={() => onCompose(selectedMedia)}><Icon name="compose" size={15}/> Create {selectedMedia.length} posts</button></div></div>}
      {!visible.length ? <div className="bridge-panel"><Empty title={media.length ? "No matching media" : "Build your content library"} action={!media.length && <button className="bridge-button secondary" disabled={busy || !config.mediaReady} onClick={() => input.current.click()}><Icon name="upload" size={16}/> Choose files</button>}>{media.length ? "Try a different filter or filename." : `Drop your files here, or choose them from your computer. Up to ${Math.round(config.maxUploadBytes / 1024 ** 2)} MB per file.`}</Empty></div> : <div className="bridge-media-grid">{visible.map(item => <article className={`bridge-media-card ${selected.includes(item.id) ? "selected" : ""}`} key={item.id}><div className="bridge-media-preview"><button onClick={() => setPreview(item)} aria-label={`Preview ${item.filename}`}><MediaThumb media={item}/>{item.kind === "video" && <span className="bridge-play-indicator">▶</span>}</button><input type="checkbox" aria-label={`Select ${item.filename}`} checked={selected.includes(item.id)} onChange={event => setSelected(current => event.target.checked ? [...current, item.id].slice(0, 100) : current.filter(id => id !== item.id))}/><Badge>{item.source === "clip" ? "Studio clip" : item.kind}</Badge></div><div className="bridge-media-card-body"><h3 title={item.filename}>{item.filename}</h3><p>{(item.bytes / 1024 ** 2).toFixed(1)} MB{item.width && ` · ${item.width} × ${item.height}`}{item.durationSec && ` · ${Math.round(item.durationSec)}s`}</p><div className="bridge-inline-actions"><button className="bridge-button secondary small" onClick={() => onCompose([item])}>Create post</button><a className="bridge-icon-button" href={item.downloadUrl} download aria-label={`Download ${item.filename}`}><Icon name="download" size={17}/></a><button className="bridge-icon-button" onClick={() => setDeleting(item)} aria-label={`Delete ${item.filename}`}><Icon name="trash" size={17}/></button></div></div></article>)}</div>}
    </div>
    {preview && <Modal title={preview.filename} wide onClose={() => setPreview(null)}><div className="bridge-large-preview"><MediaThumb media={preview} playable/></div><div className="bridge-modal-actions"><a className="bridge-button secondary" href={preview.downloadUrl} download><Icon name="download" size={17}/> Download</a><button className="bridge-button" onClick={() => onCompose([preview])}>Create post</button></div></Modal>}
    {deleting && <Modal title="Delete media" onClose={() => setDeleting(null)} busy={busy}><p>Delete {deleting.filename} from this project’s library? Published social posts remain on their platforms.</p><Alert message={error}/><div className="bridge-modal-actions"><button className="bridge-button secondary" onClick={() => setDeleting(null)}>Keep file</button><button className="bridge-button danger" disabled={busy} onClick={remove}>Delete file</button></div></Modal>}
  </>;
}
