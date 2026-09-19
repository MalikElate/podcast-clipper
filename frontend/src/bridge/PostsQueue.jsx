import { useEffect, useRef, useState } from "react";
import { api } from "./BridgeApi.js";
import { Icon } from "./Icons.jsx";
import { Alert, Badge, Check, dateTime, Empty, MediaThumb, Modal, PlatformBadge, useProjectResource } from "./ui.jsx";
import { PostEditor } from "./Composer.jsx";

const pending = ["queued", "scheduled", "retrying"];
const sections = {
  posts: { intro: "Every post, every destination, and exactly where it stands.", empty: "No posts yet", detail: "Create your first post to start building this project’s content history." },
  scheduled: { intro: "Review what is waiting to publish and when each delivery is due.", empty: "Nothing scheduled", detail: "Posts scheduled for later or waiting in a publishing queue will appear here." },
  posted: { intro: "Browse the content that has already reached at least one destination.", empty: "Nothing posted yet", detail: "Successfully published posts will appear here." },
  drafts: { intro: "Keep unfinished ideas together until they are ready to schedule.", empty: "No drafts yet", detail: "Saved drafts will appear here." },
  failed: { intro: "Find deliveries that need attention and retry them when they are ready.", empty: "No failed posts", detail: "Posts with failed or interrupted deliveries will appear here." },
};
const failed = ["failed", "needs_review", "needs_account"];
function belongsToSection(post, section) {
  if (section === "scheduled") return post.deliveries.some(item => [...pending, "processing", "publishing"].includes(item.status));
  if (section === "posted") return post.deliveries.some(item => item.status === "published");
  if (section === "drafts") return post.status === "draft";
  if (section === "failed") return post.status === "needs_attention" || post.deliveries.some(item => failed.includes(item.status));
  return true;
}
export default function PostsQueue({ project, accounts: initialAccounts, media, catalog, onCreate, onEditDraft, onUpload, section = "posts" }) {
  const { data, error: loadError, loading, reload } = useProjectResource(project.id, "/posts", { posts: [] }, { interval: 15000 });
  const [accountId, setAccountId] = useState(""), [search, setSearch] = useState(""), [error, setError] = useState(""), [busy, setBusy] = useState(false), [uploading, setUploading] = useState(false), [action, setAction] = useState(null), [confirmed, setConfirmed] = useState(false), [editing, setEditing] = useState(null), [accounts, setAccounts] = useState(initialAccounts);
  const fileInput = useRef(null);
  const [uploadProgress, setUploadProgress] = useState(null);
  useEffect(() => setAccounts(initialAccounts), [initialAccounts]);
  useEffect(() => {
    if (!editing) return;
    const controller = new AbortController();
    Promise.allSettled(editing.accountIds.map(async id => {
      try { const { options } = await api.project(project.id, `/accounts/${id}/options`, { signal: controller.signal }); if (!controller.signal.aborted) setAccounts(current => current.map(item => item.id === id ? { ...item, options } : item)); }
      catch (error) { if (!controller.signal.aborted) setError(error.message); }
    }));
    return () => controller.abort();
  }, [editing?.id, editing?.accountIds.join(","), project.id]);
  const selectedQueue = data.posts.flatMap(post => post.deliveries).filter(delivery => delivery.accountId === accountId && pending.includes(delivery.status)).sort((a, b) => a.dueAt - b.dueAt || a.order - b.order || a.id.localeCompare(b.id));
  const visible = data.posts.filter(post => {
    const matchesAccount = !accountId || post.accountIds?.includes(accountId) || post.deliveries.some(item => item.accountId === accountId);
    return matchesAccount && `${post.title} ${post.caption}`.toLowerCase().includes(search.toLowerCase()) && belongsToSection(post, section);
  }).sort((a, b) => section === "scheduled"
    ? Math.min(...a.deliveries.filter(d => !accountId || d.accountId === accountId).map(d => d.dueAt)) - Math.min(...b.deliveries.filter(d => !accountId || d.accountId === accountId).map(d => d.dueAt))
    : section === "drafts" ? (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt) : b.createdAt - a.createdAt);
  async function perform() {
    setBusy(true); setError("");
    try {
      if (action.type === "retry") await api.project(project.id, `/deliveries/${action.item.id}/retry`, { method: "POST", body: { confirmedNotPublished: confirmed } });
      else await api.project(project.id, `/posts/${action.item.id}${action.type === "cancel" ? "/cancel" : ""}`, { method: action.type === "delete" ? "DELETE" : "POST", body: action.type === "delete" && action.item.status === "draft" ? { draftOnly: true, revision: action.item.revision } : {} });
      setAction(null); setConfirmed(false); reload();
    } catch (error) { setError(error.message); } finally { setBusy(false); }
  }
  async function move(id, direction) {
    const ids = selectedQueue.map(item => item.id), index = ids.indexOf(id), other = index + direction;
    if (index < 0 || other < 0 || other >= ids.length) return;
    [ids[index], ids[other]] = [ids[other], ids[index]];
    setBusy(true); setError("");
    try { await api.project(project.id, "/queue/reorder", { method: "POST", body: { accountId, deliveryIds: ids } }); reload(); }
    catch (error) { setError(error.message); } finally { setBusy(false); }
  }
  async function save() {
    setBusy(true); setError("");
    try { await api.project(project.id, `/posts/${editing.id}`, { method: "PATCH", body: editing }); setEditing(null); reload(); }
    catch (error) { setError(error.message); } finally { setBusy(false); }
  }
  async function uploadEditingMedia(files) {
    if (!files.length || !editing) return;
    setUploading(true); setUploadProgress(null); setError("");
    try {
      const uploaded = await onUpload([...files].slice(0, Math.max(0, 35 - editing.mediaIds.length)), setUploadProgress);
      if (uploaded.length) setEditing(current => ({ ...current, mediaIds: [...new Set([...current.mediaIds, ...uploaded.map(item => item.id)])].slice(0, 35) }));
    } catch (error) { setError(error.message); } finally { setUploading(false); }
  }
  const counts = { queued: data.posts.flatMap(post => post.deliveries).filter(item => pending.includes(item.status)).length, published: data.posts.flatMap(post => post.deliveries).filter(item => item.status === "published").length, attention: data.posts.filter(post => post.status === "needs_attention").length };
  const current = sections[section] || sections.posts;
  const deletingDraft = action?.type === "delete" && action.item.status === "draft";
  return <><div className="bridge-intro-row"><p>{current.intro}</p><button className="bridge-button" onClick={onCreate}><Icon name="plus" size={17}/> Create post</button></div><Alert message={error || loadError}/><div className="bridge-stat-grid compact"><div className="bridge-stat"><span>Waiting in queue</span><strong>{counts.queued}</strong></div><div className="bridge-stat"><span>Published deliveries</span><strong>{counts.published}</strong></div><div className="bridge-stat"><span>Posts needing attention</span><strong>{counts.attention}</strong></div></div>
    <div className="bridge-posts-toolbar"><input aria-label="Search posts" className="bridge-search wide-search" placeholder="Search titles and captions…" value={search} onChange={event => setSearch(event.target.value)}/><div className="bridge-inline-actions"><select aria-label="Filter by account" value={accountId} onChange={event => setAccountId(event.target.value)}><option value="">All accounts</option>{accounts.map(account => <option key={account.id} value={account.id}>{account.label} · {catalog.find(p => p.id === account.platform)?.name}</option>)}</select><button className="bridge-icon-button" onClick={reload} aria-label="Refresh posts"><Icon name="refresh" size={17}/></button></div></div>
    {section === "scheduled" && <p className="bridge-small bridge-queue-note">{accountId ? "Use the arrows to exchange queue positions, including their requested times. Each account has its own order." : "Choose an account above to reorder its queued deliveries."}</p>}
    {!visible.length ? <div className="bridge-panel"><Empty icon={section === "failed" ? "failed" : section === "drafts" ? "drafts" : "all"} title={loading ? "Loading posts…" : current.empty}>{loading ? "Retrieving this project’s posts." : current.detail}</Empty></div> : <div className="bridge-post-list">{visible.map(post => <article className="bridge-panel bridge-post-card" key={post.id}><div className="bridge-post-card-heading">{post.media[0] && <div className="bridge-post-thumbnail"><MediaThumb media={post.media[0]}/></div>}<div className="bridge-grow"><h3>{post.title || post.caption.slice(0, 90) || "Media post"}</h3><p>{post.caption.slice(0, 220) || `${post.media.length} media ${post.media.length === 1 ? "item" : "items"}`}</p><small>{post.status === "draft" ? "Last saved" : "Created"} {dateTime(post.status === "draft" ? post.updatedAt || post.createdAt : post.createdAt, project.timeZone)}</small></div><Badge status={post.status}/></div><div className="bridge-deliveries">{post.deliveries.filter(item => !accountId || item.accountId === accountId).map(delivery => <div className="bridge-delivery-row" key={delivery.id}><PlatformBadge platform={delivery.platform} catalog={catalog}/><div className="bridge-grow"><strong>{delivery.accountName}</strong><span>{delivery.status === "published" ? `Published ${dateTime(delivery.publishedAt, project.timeZone)}` : dateTime(delivery.dueAt, project.timeZone)}{delivery.estimated ? " · estimate" : ""}</span>{delivery.delayed && pending.includes(delivery.status) && <small>Waiting for posting allowance</small>}{delivery.error && <p className="bridge-validation-error">{delivery.error}</p>}</div><Badge status={delivery.status}/><div className="bridge-inline-actions">{accountId && section === "scheduled" && pending.includes(delivery.status) && <><button className="bridge-icon-button" aria-label={`Move ${delivery.accountName} delivery earlier`} disabled={busy || selectedQueue[0]?.id === delivery.id} onClick={() => move(delivery.id, -1)}><Icon name="up" size={17}/></button><button className="bridge-icon-button" aria-label={`Move ${delivery.accountName} delivery later`} disabled={busy || selectedQueue.at(-1)?.id === delivery.id} onClick={() => move(delivery.id, 1)}><Icon name="down" size={17}/></button></>}{delivery.url && <a className="bridge-icon-button" href={delivery.url} target="_blank" rel="noreferrer" aria-label="View published post"><Icon name="external" size={17}/></a>}{failed.includes(delivery.status) && <button className="bridge-button secondary small" onClick={() => { setError(""); setConfirmed(false); setAction({ type: "retry", item: delivery }); }}>Retry</button>}</div></div>)}</div><div className="bridge-post-actions">{post.status === "draft" ? <button className="bridge-button secondary small" onClick={() => onEditDraft?.(post)}>Continue editing</button> : post.editable && <button className="bridge-button secondary small" onClick={() => { setError(""); setEditing(structuredClone(post)); }}>Edit post</button>}{post.deletable && post.deliveries.some(item => !["published", "cancelled"].includes(item.status)) && <button className="bridge-text-button" onClick={() => setAction({ type: "cancel", item: post })}>Cancel remaining</button>}{post.deletable && !post.deliveries.some(item => item.status === "published") && <button className="bridge-icon-button" onClick={() => setAction({ type: "delete", item: post })} aria-label={post.status === "draft" ? "Delete draft" : "Delete queued post"}><Icon name="trash" size={17}/></button>}</div></article>)}</div>}
    {action && <Modal title={action.type === "retry" ? "Retry this delivery" : action.type === "cancel" ? "Cancel queued deliveries" : deletingDraft ? "Delete draft" : "Delete queued post"} onClose={() => setAction(null)} busy={busy}><Alert message={error}/><p>{action.type === "retry" ? `Meadow will retry only the delivery to ${action.item.accountName}.` : action.type === "cancel" ? "Pending deliveries for this post will be removed from the queue. Published deliveries remain in history." : deletingDraft ? "Permanently remove this saved draft from the project? Uploaded media will remain in your media library." : "Remove this post and its unpublished deliveries from the project?"}</p>{action.type === "retry" && action.item.status === "needs_review" && <Check checked={confirmed} onChange={event => setConfirmed(event.target.checked)}>I checked the social account and this post was not published.</Check>}<div className="bridge-modal-actions"><button className="bridge-button secondary" onClick={() => setAction(null)}>Go back</button><button className={`bridge-button ${action.type === "retry" ? "" : "danger"}`} disabled={busy || action.type === "retry" && action.item.status === "needs_review" && !confirmed} onClick={perform}>{busy ? "Saving…" : action.type === "retry" ? "Retry delivery" : action.type === "delete" ? deletingDraft ? "Delete draft" : "Delete post" : "Cancel deliveries"}</button></div></Modal>}
    <input type="file" ref={fileInput} hidden multiple accept="image/*,video/*,.pdf,.doc,.docx,.ppt,.pptx" onChange={event => { uploadEditingMedia(event.target.files); event.target.value = ""; }}/>
    {editing && <Modal title="Edit queued post" wide onClose={() => setEditing(null)} busy={busy || uploading}><Alert message={error}/><PostEditor post={editing} onChange={setEditing} accounts={accounts} media={media} catalog={catalog} uploading={uploading} uploadProgress={uploadProgress} onPickMedia={() => fileInput.current?.click()} compact/><div className="bridge-modal-actions"><button className="bridge-button secondary" disabled={uploading} onClick={() => setEditing(null)}>Discard changes</button><button className="bridge-button" disabled={busy || uploading} onClick={save}>{busy ? "Validating & saving…" : "Save & update queue"}</button></div></Modal>}
  </>;
}
