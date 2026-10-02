import { Icon } from "./Icons.jsx";
import { FORMAT_LABELS } from "./platforms.js";
import { Alert, Badge, dateTime, MediaThumb, Modal, PlatformBadge } from "./ui.jsx";
import { canCancelRemaining, isTikTokInbox, tiktokProcessingMessage } from "./deliveryPresentation.js";
import { failed, pending, postSectionDate } from "./postListOrder.js";

const postTitle = post => post.title || (post.media?.length ? "Media post" : post.caption ? "Text post" : "Untitled post");
const formatLabel = format => FORMAT_LABELS[format] || (format === "auto" ? "Automatic" : format || "Automatic");
const settingLabels = {
  aiGenerated: "AI-generated content", allowComments: "Allow comments", allowDuet: "Allow Duet", allowStitch: "Allow Stitch",
  altText: "Media alt text", announcementColor: "Announcement color", autoMusic: "Recommended music", boardId: "Board",
  brandedContent: "Paid partnership", consent: "TikTok music confirmation", deliveryMode: "TikTok delivery", languageCode: "Post language",
  link: "Destination link", madeForKids: "Made for kids", messageType: "Chat message type", ownBrand: "Own brand promotion",
  privacy: "Visibility or audience", replies: "Follow-up messages", replyToMessageId: "Reply to message", syntheticMedia: "Altered or synthetic content",
  thumbnailMediaId: "Video thumbnail", uploadConsent: "TikTok upload confirmation",
};

function SettingValue({ name, value, media }) {
  if (name === "thumbnailMediaId") {
    const item = media.find(entry => entry.id === value);
    return item ? <a href={item.url} target="_blank" rel="noreferrer">{item.filename}</a> : "Media no longer available";
  }
  if (Array.isArray(value)) return <ol>{value.map((entry, index) => <li key={index}>{entry && typeof entry === "object" ? JSON.stringify(entry) : String(entry)}</li>)}</ol>;
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (value && typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function CompactPostCard({ post, section, accountId, project, onView }) {
  const postDate = postSectionDate(post, section, accountId);
  return <article className="bridge-panel bridge-post-card bridge-post-compact">
    <div className="bridge-post-card-heading">
      {post.media[0] && <div className="bridge-post-thumbnail"><MediaThumb media={post.media[0]}/></div>}
      <div className="bridge-grow"><h3>{postTitle(post)}</h3><small>{postDate.label} {dateTime(postDate.time, project.timeZone)}</small></div>
    </div>
    <div className="bridge-post-compact-footer"><Badge status={post.status}/><button className="bridge-button secondary small bridge-post-view" aria-label={`View details for ${postTitle(post)}`} onClick={onView}>View</button></div>
  </article>;
}

function PostMedia({ items }) {
  if (!items.length) return <p className="bridge-small">No media attached.</p>;
  return <div className="bridge-post-detail-media">{items.map((item, index) => <figure key={item.id}>
    <div className="bridge-post-detail-media-preview"><MediaThumb media={item} playable/></div>
    <figcaption><span>{index + 1}. {item.filename}</span><a href={item.url} target="_blank" rel="noreferrer">Open file</a></figcaption>
  </figure>)}</div>;
}

function DestinationContent({ source, post, media, snapshot = false }) {
  if (!source) return null;
  const titleChanged = source.title !== undefined && source.title !== post.title;
  const captionChanged = source.caption !== undefined && source.caption !== post.caption;
  const formatChanged = source.format && source.format !== post.format;
  const mediaChanged = Array.isArray(source.mediaIds) && source.mediaIds.join("\0") !== (post.mediaIds || []).join("\0");
  const settings = Object.entries(source.settings || {});
  if (!titleChanged && !captionChanged && !formatChanged && !mediaChanged && !settings.length && !source.localDateTime) return null;
  const mediaById = new Map([...media, ...(post.media || [])].map(item => [item.id, item]));
  return <div className="bridge-post-destination-content"><strong>{snapshot ? "Saved delivery content" : "Custom destination content"}</strong>
    {titleChanged && <p><span>Title</span>{source.title || "No title"}</p>}
    {captionChanged && <p><span>Text</span>{source.caption || "No text"}</p>}
    {formatChanged && <p><span>Format</span>{formatLabel(source.format)}</p>}
    {source.localDateTime && <p><span>Custom schedule</span>{source.localDateTime.replace("T", " ")}</p>}
    {mediaChanged && <div><span>Media sent with this delivery</span><ul>{source.mediaIds.map(id => { const item = mediaById.get(id); return <li key={id}>{item ? <a href={item.url} target="_blank" rel="noreferrer">{item.filename}</a> : "Media no longer available"}</li>; })}</ul></div>}
    {settings.length > 0 && <dl className="bridge-post-setting-list">{settings.map(([name, value]) => <div key={name}><dt>{settingLabels[name] || name.replace(/([A-Z])/g, " $1").replace(/^./, letter => letter.toUpperCase())}</dt><dd><SettingValue name={name} value={value} media={media}/></dd></div>)}</dl>}
  </div>;
}

export default function PostDetails({ post, project, accounts, media, catalog, accountId, section, selectedQueue, busy, error, onClose, onAction, onEdit, onEditDraft, onMove }) {
  const timeZone = project.timeZone;
  return <Modal title={postTitle(post)} wide className="bridge-post-detail-modal" onClose={onClose} busy={busy}>
    <Alert message={error}/>
    <div className="bridge-post-detail-status"><Badge status={post.status}/><span>{post.deliveries.length} {post.deliveries.length === 1 ? "delivery" : "deliveries"}</span></div>
    <div className="bridge-post-detail-meta">
      <span><strong>Format</strong>{formatLabel(post.format)}</span>
      <span><strong>Created</strong>{dateTime(post.createdAt, timeZone)}</span>
      <span><strong>Last updated</strong>{dateTime(post.updatedAt, timeZone)}</span>
      {post.schedule?.mode === "scheduled" && <span><strong>Schedule</strong>{post.schedule.localDateTime?.replace("T", " ") || "Custom destination times"} · {post.schedule.timeZone || timeZone}</span>}
    </div>
    <section className="bridge-post-detail-section"><h3>Text</h3><p className="bridge-post-full-text">{post.caption || "No text added."}</p></section>
    <section className="bridge-post-detail-section"><h3>Media</h3><PostMedia items={post.media}/></section>
    <section className="bridge-post-detail-section"><h3>Destinations</h3>
      {post.deliveries.length ? <div className="bridge-deliveries">{post.deliveries.map(delivery => {
        const processing = tiktokProcessingMessage(delivery);
        return <div className="bridge-post-detail-delivery" key={delivery.id}>
          <div className="bridge-post-detail-delivery-heading"><PlatformBadge platform={delivery.platform} catalog={catalog}/><strong>{delivery.accountName}</strong><Badge status={delivery.status}/></div>
          <div className="bridge-post-detail-delivery-body">
            <span>{processing?.line || (delivery.status === "published" ? `Published ${dateTime(delivery.publishedAt, timeZone)}` : delivery.status === "awaiting_publish" ? `Sent to TikTok ${dateTime(delivery.deliveredAt, timeZone)}` : `${isTikTokInbox(delivery) ? "Transfer to TikTok · " : ""}${dateTime(section === "scheduled" && Number.isFinite(delivery.requestedAt) ? delivery.requestedAt : delivery.dueAt, timeZone)}`)}{!processing && delivery.estimated ? " · estimate" : ""}</span>
            {processing && <small>{processing.detail}</small>}
            {delivery.status === "awaiting_publish" && <small>Open the inbox notification in TikTok to finish editing and post.</small>}
            {delivery.delayed && pending.includes(delivery.status) && <small>Waiting for posting allowance</small>}
            {delivery.chatMessagesSent > 0 && <small>{delivery.chatMessagesSent} chat {delivery.chatMessagesSent === 1 ? "message confirmed" : "messages confirmed"}</small>}
            {delivery.error && <p className="bridge-validation-error">{delivery.error}</p>}
            <div className="bridge-post-delivery-times">
              {Number.isFinite(delivery.requestedAt) && <small>Requested {dateTime(delivery.requestedAt, timeZone)}</small>}
              {Number.isFinite(delivery.dueAt) && <small>Due {dateTime(delivery.dueAt, timeZone)}</small>}
              {Number.isFinite(delivery.deliveredAt) && <small>Sent {dateTime(delivery.deliveredAt, timeZone)}</small>}
              {Number.isFinite(delivery.publishedAt) && <small>Published {dateTime(delivery.publishedAt, timeZone)}</small>}
            </div>
            <DestinationContent source={delivery.contentSnapshot || post.overrides?.[delivery.accountId]} post={post} media={media} snapshot={Boolean(delivery.contentSnapshot)}/>
          </div>
          <div className="bridge-inline-actions bridge-post-detail-delivery-actions">
            {accountId && section === "scheduled" && pending.includes(delivery.status) && <>
              <button className="bridge-icon-button" aria-label={`Move ${delivery.accountName} delivery earlier`} disabled={busy || selectedQueue[0]?.id === delivery.id} onClick={() => onMove(delivery.id, -1)}><Icon name="up" size={17}/></button>
              <button className="bridge-icon-button" aria-label={`Move ${delivery.accountName} delivery later`} disabled={busy || selectedQueue.at(-1)?.id === delivery.id} onClick={() => onMove(delivery.id, 1)}><Icon name="down" size={17}/></button>
            </>}
            {delivery.url && <a className="bridge-icon-button" href={delivery.url} target="_blank" rel="noreferrer" aria-label="View published post"><Icon name="external" size={17}/></a>}
            {failed.includes(delivery.status) && <button className="bridge-button secondary small" onClick={() => onAction("retry", delivery)}>Retry</button>}
          </div>
        </div>;
      })}</div> : post.accountIds?.length ? <div className="bridge-deliveries">{post.accountIds.map(id => {
        const account = accounts.find(item => item.id === id);
        return <div className="bridge-post-detail-delivery" key={id}><div className="bridge-post-detail-delivery-heading"><PlatformBadge platform={account?.platform} catalog={catalog}/><strong>{account?.label || "Disconnected account"}</strong><Badge status="draft"/></div><div className="bridge-post-detail-delivery-body"><DestinationContent source={post.overrides?.[id]} post={post} media={media}/></div></div>;
      })}</div> : <p className="bridge-small">No destinations selected.</p>}
    </section>
    <div className="bridge-post-actions">
      {post.status === "draft" ? <button className="bridge-button secondary small" onClick={() => onEditDraft(post)}>Continue editing</button> : post.editable && <button className="bridge-button secondary small" onClick={() => onEdit(post)}>Edit post</button>}
      {canCancelRemaining(post) && <button className="bridge-text-button" onClick={() => onAction("cancel", post)}>Cancel remaining</button>}
      {post.deletable && !post.deliveries.some(item => ["published", "awaiting_publish"].includes(item.status) || item.chatMessagesSent > 0) && <button className="bridge-icon-button" onClick={() => onAction("delete", post)} aria-label={post.status === "draft" ? "Delete draft" : "Delete queued post"}><Icon name="trash" size={17}/></button>}
    </div>
  </Modal>;
}
