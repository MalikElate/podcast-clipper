import { useEffect, useRef, useState } from "react";
import { api } from "./BridgeApi.js";
import { Icon } from "./Icons.jsx";
import { Alert, Check, Empty, Modal, useProjectResource } from "./ui.jsx";
import { PostEditor } from "./Composer.jsx";
import PostDetails, { CompactPostCard } from "./PostDetails.jsx";
import { PLATFORM_ORDER } from "./platforms.js";
import { useAccountOptions } from "./useAccountOptions.js";
import { retryConfirmation } from "./deliveryPresentation.js";
import { belongsToSection, newestPostFirst, pending } from "./postListOrder.js";
import { availableCardPlatforms, cardPostDate, matchesPostCardFilters, postDatePresetRange } from "./postListFilters.js";
import { canDeletePost, eligibleSelection } from "./postBulkDelete.js";

const sections = {
  posts: { intro: "Every post, every destination, and exactly where it stands.", empty: "No posts yet", detail: "Create your first post to start building this project’s content history." },
  scheduled: { intro: "Review upcoming publishing and TikTok transfers, and when each delivery is due.", empty: "Nothing scheduled", detail: "Posts scheduled for later or waiting in a publishing queue will appear here." },
  posted: { intro: "Browse the content that has already reached at least one destination.", empty: "Nothing posted yet", detail: "Successfully published posts will appear here." },
  drafts: { intro: "Keep unfinished ideas together until they are ready to schedule.", empty: "No drafts yet", detail: "Saved drafts will appear here." },
  failed: { intro: "Find deliveries that need attention and retry them when they are ready.", empty: "No failed posts", detail: "Posts with failed or interrupted deliveries will appear here." },
};
const contentTypes = [
  { id: "text", label: "Text" }, { id: "image", label: "Image" }, { id: "video", label: "Video" },
  { id: "carousel", label: "Carousel" }, { id: "document", label: "Document" },
];
const bulkSections = new Set(["failed", "scheduled", "drafts"]);
export default function PostsQueue({ project, accounts: initialAccounts, accountsReady = true, media, catalog, onCreate, onEditDraft, onUpload, section = "posts" }) {
  const { data, error: loadError, loading, reload } = useProjectResource(project.id, "/posts", { posts: [] }, { interval: 15000 });
  const [accountId, setAccountId] = useState(""), [search, setSearch] = useState(""), [error, setError] = useState(""), [busy, setBusy] = useState(false), [uploading, setUploading] = useState(false), [action, setAction] = useState(null), [confirmed, setConfirmed] = useState(false), [editing, setEditing] = useState(null), [viewingId, setViewingId] = useState(null);
  const [datePresets, setDatePresets] = useState({}), [platform, setPlatform] = useState(""), [contentType, setContentType] = useState("");
  const [selection, setSelection] = useState({ scope: "", ids: new Set() }), [bulkAction, setBulkAction] = useState(null), [bulkProgress, setBulkProgress] = useState(0);
  const datePreset = datePresets[section] ?? (section === "scheduled" ? "all" : "last_30_days");
  function setDatePreset(value) { setDatePresets(current => ({ ...current, [section]: value })); }
  const fileInput = useRef(null), uploadController = useRef(null);
  useEffect(() => () => uploadController.current?.abort(), [editing?.id]);
  const [uploadProgress, setUploadProgress] = useState(null);
  const { accounts, refreshOptions } = useAccountOptions(project.id, initialAccounts, editing?.accountIds || []);
  const selectedQueue = data.posts.flatMap(post => post.deliveries).filter(delivery => delivery.accountId === accountId && pending.includes(delivery.status)).sort((a, b) => a.dueAt - b.dueAt || a.order - b.order || a.id.localeCompare(b.id));
  const { fromDate, toDate } = postDatePresetRange(datePreset, project.timeZone);
  const cardFilters = { section, accountId, platform, contentType, fromDate, toDate, timeZone: project.timeZone, accounts };
  const visible = data.posts.filter(post => {
    const matchesSearch = `${post.title} ${post.caption}`.toLowerCase().includes(search.toLowerCase());
    return matchesSearch && matchesPostCardFilters(post, cardFilters);
  }).sort((a, b) => section !== "posts"
    ? cardPostDate(b, section, accountId, platform).time - cardPostDate(a, section, accountId, platform).time || (b.createdAt || 0) - (a.createdAt || 0) || String(a.id).localeCompare(String(b.id))
    : newestPostFirst(section, a, b, accountId));
  const selectionScope = JSON.stringify([section, accountId, search, datePreset, platform, contentType]);
  useEffect(() => {
    setSelection(current => current.scope === selectionScope ? current : { scope: selectionScope, ids: new Set() });
    setError("");
  }, [selectionScope]);
  const selectedPosts = eligibleSelection(visible, selection.scope === selectionScope ? selection.ids : []);
  const selectedIds = new Set(selectedPosts.map(post => post.id));
  const deletableVisible = bulkSections.has(section) ? visible.filter(canDeletePost) : [];
  const allVisibleSelected = deletableVisible.length > 0 && selectedPosts.length === deletableVisible.length;
  function toggleSelected(id) {
    setSelection(current => {
      const ids = new Set(eligibleSelection(visible, current.scope === selectionScope ? current.ids : []).map(post => post.id));
      if (ids.has(id)) ids.delete(id); else ids.add(id);
      return { scope: selectionScope, ids };
    });
  }
  function toggleSelectAll() {
    setSelection({ scope: selectionScope, ids: new Set(allVisibleSelected ? [] : deletableVisible.map(post => post.id)) });
  }
  const platformOptions = [...new Set([...availableCardPlatforms(data.posts, section, accounts), platform].filter(Boolean))]
    .sort((a, b) => (PLATFORM_ORDER.indexOf(a) < 0 ? PLATFORM_ORDER.length : PLATFORM_ORDER.indexOf(a)) - (PLATFORM_ORDER.indexOf(b) < 0 ? PLATFORM_ORDER.length : PLATFORM_ORDER.indexOf(b)) || a.localeCompare(b));
  const filtersActive = Boolean(search.trim() || accountId || datePreset !== "all" || platform || contentType);
  const filteredEmpty = filtersActive && data.posts.some(post => belongsToSection(post, section));
  function clearFilters() { setSearch(""); setAccountId(""); setDatePreset("all"); setPlatform(""); setContentType(""); }
  const viewingPost = data.posts.find(post => post.id === viewingId);
  function detailAction(type, item) { setViewingId(null); setError(""); setConfirmed(false); setAction({ type, item }); }
  function detailEdit(post) { setViewingId(null); setError(""); setEditing(structuredClone(post)); }
  function detailEditDraft(post) { setViewingId(null); onEditDraft?.(post); }
  async function perform() {
    setBusy(true); setError("");
    try {
      if (action.type === "retry") await api.project(project.id, `/deliveries/${action.item.id}/retry`, { method: "POST", body: { confirmedNotPublished: confirmed } });
      else await api.project(project.id, `/posts/${action.item.id}${action.type === "cancel" ? "/cancel" : ""}`, { method: action.type === "delete" ? "DELETE" : "POST", body: action.type === "delete" ? { revision: action.item.revision, ...(action.item.status === "draft" ? { draftOnly: true } : {}) } : {} });
      setAction(null); setConfirmed(false); reload();
    } catch (error) { setError(error.message); } finally { setBusy(false); }
  }
  async function performBulkDelete() {
    if (!bulkAction?.items.length) return;
    setBusy(true); setBulkProgress(0); setError("");
    const items = bulkAction.items;
    const results = Array(items.length);
    let next = 0;
    async function worker() {
      while (next < items.length) {
        const index = next++;
        const post = items[index];
        try {
          await api.project(project.id, `/posts/${post.id}`, { method: "DELETE", body: { revision: post.revision, ...(post.status === "draft" ? { draftOnly: true } : {}) } });
          results[index] = { ok: true };
        } catch (error) { results[index] = { ok: false, message: error.message }; }
        setBulkProgress(current => current + 1);
      }
    }
    await Promise.all(Array.from({ length: Math.min(3, items.length) }, worker));
    const failedItems = items.filter((_, index) => !results[index]?.ok);
    const deleted = items.length - failedItems.length;
    setSelection({ scope: selectionScope, ids: new Set(failedItems.map(post => post.id)) });
    setBulkAction(null); setBusy(false); reload();
    if (failedItems.length) {
      const firstError = results.find(result => !result?.ok)?.message;
      setError(`${deleted ? `Deleted ${deleted} ${deleted === 1 ? "post" : "posts"}. ` : ""}${failedItems.length} ${failedItems.length === 1 ? "post could" : "posts could"} not be deleted. ${firstError || "Refresh and try again."}`);
    }
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
    if (!files.length || !editing || uploading) return;
    const postId = editing.id;
    const controller = new AbortController(); uploadController.current = controller;
    setUploading(true); setUploadProgress(null); setError("");
    try {
      const uploaded = await onUpload([...files].slice(0, Math.max(0, 35 - editing.mediaIds.length)), setUploadProgress, { signal: controller.signal });
      if (uploaded.length) setEditing(current => current?.id === postId ? { ...current, mediaIds: [...new Set([...current.mediaIds, ...uploaded.map(item => item.id)])].slice(0, 35) } : current);
    } catch (error) { setError(error.message); } finally { if (uploadController.current === controller) uploadController.current = null; setUploading(false); }
  }
  const inboxCount = data.posts.flatMap(post => post.deliveries).filter(item => item.status === "awaiting_publish").length;
  const counts = { queued: data.posts.flatMap(post => post.deliveries).filter(item => pending.includes(item.status)).length, published: data.posts.flatMap(post => post.deliveries).filter(item => item.status === "published").length, attention: data.posts.filter(post => post.status === "needs_attention").length };
  const current = sections[section] || sections.posts;
  const deletingDraft = action?.type === "delete" && action.item.status === "draft";
  const deletingFailed = action?.type === "delete" && action.item.status === "needs_attention";
  return <><div className="bridge-intro-row"><p>{current.intro}</p><button className="bridge-button" onClick={onCreate}><Icon name="plus" size={17}/> Create post</button></div><Alert message={error || loadError}/><div className="bridge-stat-grid compact"><div className="bridge-stat"><span>Waiting in queue</span><strong>{counts.queued}</strong></div><div className="bridge-stat"><span>Published deliveries</span><strong>{counts.published}</strong></div><div className="bridge-stat"><span>Posts needing attention</span><strong>{counts.attention}</strong></div></div>
    {inboxCount > 0 && <div className="bridge-notice">{inboxCount} TikTok {inboxCount === 1 ? "upload is" : "uploads are"} ready to finish. Open the inbox notification in TikTok to edit and post. These transfers are not counted as published.</div>}
    <div className="bridge-posts-toolbar"><input aria-label="Search posts" className="bridge-search wide-search" placeholder="Search titles and captions…" value={search} onChange={event => setSearch(event.target.value)}/><div className="bridge-inline-actions"><select aria-label="Filter by account" value={accountId} onChange={event => setAccountId(event.target.value)}><option value="">All accounts</option>{accounts.map(account => <option key={account.id} value={account.id}>{account.label} · {catalog.find(p => p.id === account.platform)?.name}</option>)}</select><button className="bridge-icon-button" onClick={reload} aria-label="Refresh posts"><Icon name="refresh" size={17}/></button></div></div>
    {section === "scheduled" && <p className="bridge-small bridge-queue-note">{accountId ? "Use the arrows to exchange queue positions, including their requested times. Each account has its own order." : "Choose an account above to reorder its queued deliveries."}</p>}
    <div className="bridge-post-filters" role="group" aria-label="Filter post cards">
      <label className="bridge-post-filter-choice bridge-post-filter-date"><span>Date · {project.timeZone}</span><select value={datePreset} onChange={event => setDatePreset(event.target.value)}>
        <option value="last_7_days">Last 7 days</option><option value="last_30_days">Last 30 days</option><option value="last_90_days">Last 90 days</option><option value="all">All available</option>
      </select></label>
      <label className="bridge-post-filter-choice"><span>Platform</span><select value={platform} onChange={event => setPlatform(event.target.value)}><option value="">All platforms</option>{platformOptions.map(id => <option key={id} value={id}>{catalog.find(item => item.id === id)?.name || id.replaceAll("_", " ")}</option>)}</select></label>
      <label className="bridge-post-filter-choice"><span>Content type</span><select value={contentType} onChange={event => setContentType(event.target.value)}><option value="">All types</option>{contentTypes.map(type => <option key={type.id} value={type.id}>{type.label}</option>)}</select></label>
      {filtersActive && <button className="bridge-text-button bridge-post-filter-clear" onClick={clearFilters}>Clear filters</button>}
    </div>
    {bulkSections.has(section) && visible.length > 0 && <div className="bridge-post-bulk-toolbar">
      {deletableVisible.length > 0 ? <label className="bridge-post-bulk-select"><input type="checkbox" checked={allVisibleSelected} disabled={busy} onChange={toggleSelectAll} aria-label="Select all deletable posts shown"/><span>Select all available</span></label> : <span className="bridge-small">No posts shown can be deleted.</span>}
      <span className="bridge-small">{selectedPosts.length} selected · {deletableVisible.length} available to delete</span>
      <button className="bridge-button danger small" disabled={busy || !selectedPosts.length} onClick={() => { setError(""); setBulkAction({ items: selectedPosts, section }); }}>Delete selected</button>
    </div>}
    {!visible.length ? <div className="bridge-panel"><Empty icon={section === "failed" ? "failed" : section === "drafts" ? "drafts" : "all"} title={loading ? "Loading posts…" : filteredEmpty ? "No matching posts" : current.empty} action={!loading && filteredEmpty ? <button className="bridge-button secondary small" onClick={clearFilters}>Clear filters</button> : null}>{loading ? "Retrieving this project’s posts." : filteredEmpty ? "Try another date, platform, content type, account, or search." : current.detail}</Empty></div> : <div className="bridge-post-list bridge-post-grid">{visible.map(post => <CompactPostCard key={post.id} post={post} section={section} accountId={accountId} platform={platform} project={project} selectable={bulkSections.has(section) && canDeletePost(post)} selected={selectedIds.has(post.id)} selectionDisabled={busy} onToggleSelect={() => toggleSelected(post.id)} onDelete={section === "failed" && canDeletePost(post) ? () => detailAction("delete", post) : undefined} onView={() => { setError(""); setViewingId(post.id); }}/>)}</div>}
    {viewingPost && <PostDetails post={viewingPost} project={project} accounts={accounts} media={media} catalog={catalog} accountId={accountId} section={section} selectedQueue={selectedQueue} busy={busy} error={error} onClose={() => setViewingId(null)} onAction={detailAction} onEdit={detailEdit} onEditDraft={detailEditDraft} onMove={move}/>}
    {action && <Modal title={action.type === "retry" ? "Retry this delivery" : action.type === "cancel" ? "Cancel queued deliveries" : deletingDraft ? "Delete draft" : deletingFailed ? "Delete failed post" : "Delete queued post"} onClose={() => setAction(null)} busy={busy}>
      <Alert message={error}/>
      <p>{action.type === "retry" ? `Meadow will retry only the delivery to ${action.item.accountName}.${action.item.chatMessagesSent ? ` The first ${action.item.chatMessagesSent} confirmed chat messages will not be sent again.` : ""}` : action.type === "cancel" ? "Pending deliveries for this post will be removed from the queue. Published posts and media already sent to TikTok remain in history." : deletingDraft ? "Permanently remove this saved draft from the project? Uploaded media will remain in your media library." : deletingFailed ? "Remove this post and its unpublished deliveries from Meadow? A failed or unconfirmed delivery may already have reached a platform; check that platform if you need to remove it there." : "Remove this post and its unpublished deliveries from the project?"}</p>
      {action.type === "retry" && action.item.status === "needs_review" && <Check checked={confirmed} onChange={event => setConfirmed(event.target.checked)}>{retryConfirmation(action.item)}</Check>}
      <div className="bridge-modal-actions"><button className="bridge-button secondary" onClick={() => setAction(null)}>Go back</button><button className={`bridge-button ${action.type === "retry" ? "" : "danger"}`} disabled={busy || action.type === "retry" && action.item.status === "needs_review" && !confirmed} onClick={perform}>{busy ? "Saving…" : action.type === "retry" ? "Retry delivery" : action.type === "delete" ? deletingDraft ? "Delete draft" : "Delete post" : "Cancel deliveries"}</button></div>
    </Modal>}
    {bulkAction && <Modal title={`Delete ${bulkAction.items.length} ${bulkAction.items.length === 1 ? "post" : "posts"}`} onClose={() => setBulkAction(null)} busy={busy}>
      <p>Permanently remove these {bulkAction.items.length} {bulkAction.items.length === 1 ? "post" : "posts"} and their unpublished deliveries from Meadow? Uploaded media will remain in your media library.</p>
      {bulkAction.section === "failed" && <p>A failed or unconfirmed delivery may already have reached a platform. Check the platform if you need to remove content there.</p>}
      <ul className="bridge-post-bulk-preview">{bulkAction.items.slice(0, 5).map(post => <li key={post.id}>{post.title || post.caption?.slice(0, 90) || "Media post"}</li>)}</ul>
      {bulkAction.items.length > 5 && <p className="bridge-small">And {bulkAction.items.length - 5} more.</p>}
      {busy && <p className="bridge-small" role="status">Deleting {bulkProgress} of {bulkAction.items.length}…</p>}
      <div className="bridge-modal-actions"><button className="bridge-button secondary" disabled={busy} onClick={() => setBulkAction(null)}>Go back</button><button className="bridge-button danger" disabled={busy} onClick={performBulkDelete}>{busy ? "Deleting…" : `Delete ${bulkAction.items.length} ${bulkAction.items.length === 1 ? "post" : "posts"}`}</button></div>
    </Modal>}
    <input type="file" ref={fileInput} hidden multiple accept="image/*,video/*,.pdf,.doc,.docx,.ppt,.pptx" onChange={event => { uploadEditingMedia(event.target.files); event.target.value = ""; }}/>
    {editing && <Modal title="Edit queued post" wide onClose={() => setEditing(null)} busy={busy || uploading}><Alert message={error}/><fieldset className="bridge-composer-workspace" disabled={busy}><PostEditor post={editing} onChange={setEditing} accounts={accounts} accountsReady={accountsReady} media={media} catalog={catalog} uploading={uploading} uploadProgress={uploadProgress} onCancelUpload={() => uploadController.current?.abort()} onPickMedia={() => fileInput.current?.click()} onRefreshOptions={refreshOptions} compact/></fieldset><div className="bridge-modal-actions"><button className="bridge-button secondary" disabled={uploading} onClick={() => setEditing(null)}>Discard changes</button><button className="bridge-button" disabled={busy || uploading} onClick={save}>{busy ? "Validating & saving…" : "Save & update queue"}</button></div></Modal>}
  </>;
}
