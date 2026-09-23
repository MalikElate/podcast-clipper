import { Check, Field } from "./ui.jsx";

const privacyNames = { PUBLIC_TO_EVERYONE: "Everyone", MUTUAL_FOLLOW_FRIENDS: "Friends", FOLLOWER_OF_CREATOR: "Followers", SELF_ONLY: "Only me" };

export function DestinationSettings({ account, settings = {}, onChange, hasVideo, hasImages }) {
  const update = (key, value) => onChange({ ...settings, [key]: value });
  const creator = account.options?.creator;
  const inbox = settings.deliveryMode === "inbox";
  const permissions = account.options?.tiktokPermissions;
  const privateOnly = account.options?.tiktokDirectPostPrivateOnly === true;
  const privacyOptions = (creator?.privacyOptions || []).filter(value => !privateOnly || value === "SELF_ONLY");
  const restrictedAudience = privateOnly && settings.privacy && settings.privacy !== "SELF_ONLY";
  return <div className="bridge-destination-settings">
    {["twitch", "kick"].includes(account.platform) && <>
      <p className="bridge-small">Posts go to your channel’s chat as your account. Each message allows 500 characters. Links are welcome; media uploads are unavailable.</p>
      {account.platform === "twitch" && <>
        <Field label="Twitch post type"><select value={settings.messageType || "message"} onChange={event => onChange({ ...settings, messageType: event.target.value, replyToMessageId: "" })}><option value="message">Chat message</option><option value="announcement">Announcement</option></select></Field>
        {settings.messageType === "announcement" && <Field label="Announcement color"><select value={settings.announcementColor || "primary"} onChange={event => update("announcementColor", event.target.value)}><option value="primary">Channel color</option><option value="blue">Blue</option><option value="green">Green</option><option value="orange">Orange</option><option value="purple">Purple</option></select></Field>}
        <p className="bridge-small">During Twitch Shared Chat, chat messages can appear in every participating channel.</p>
      </>}
      {settings.messageType !== "announcement" && <Field label="Reply to a message (optional)" hint="Paste a message ID from this channel to start with a reply."><input value={settings.replyToMessageId || ""} maxLength={128} onChange={event => update("replyToMessageId", event.target.value.trim())} placeholder="Message ID"/></Field>}
      {(settings.replies || []).map((reply, index) => <div key={index}>
        <Field label={`${settings.messageType === "announcement" ? "Follow-up announcement" : "Follow-up reply"} ${index + 1}`} hint="Sent after the preceding message succeeds. Up to 500 characters."><textarea rows={3} value={reply} onChange={event => update("replies", settings.replies.map((text, position) => position === index ? event.target.value : text))}/></Field>
        <button type="button" className="bridge-text-button" onClick={() => update("replies", settings.replies.filter((_, position) => position !== index))}>Remove follow-up {index + 1}</button>
      </div>)}
      {(settings.replies || []).length < 10 && <button type="button" className="bridge-button secondary small" onClick={() => update("replies", [...(settings.replies || []), ""])}>Add {settings.messageType === "announcement" ? "follow-up announcement" : "reply"}</button>}
    </>}
    {account.platform === "youtube" && <>
      <Field label="Visibility"><select value={settings.privacy || ""} onChange={event => update("privacy", event.target.value)}><option value="">Choose visibility</option><option value="public">Public</option><option value="unlisted">Unlisted</option><option value="private">Private</option></select></Field>
      <Field label="Audience"><select value={settings.madeForKids === undefined ? "" : String(settings.madeForKids)} onChange={event => update("madeForKids", event.target.value === "" ? undefined : event.target.value === "true")}><option value="">Is this made for kids?</option><option value="false">No, this is not made for kids</option><option value="true">Yes, this is made for kids</option></select></Field>
      <Check checked={settings.syntheticMedia === true} onChange={event => update("syntheticMedia", event.target.checked)}>Contains realistic altered or synthetic content</Check>
    </>}
    {account.platform === "tiktok" && <>
      <Field label="TikTok delivery"><select value={inbox ? "inbox" : "direct"} onChange={event => onChange({ ...settings, deliveryMode: event.target.value, uploadConsent: false })}><option value="direct">Publish directly from Meadow</option><option value="inbox">Send to TikTok to finish editing</option></select></Field>
      {inbox ? <>
        <p className="bridge-small">Meadow sends your media to TikTok. Open the inbox notification in the TikTok app to finish editing and post it yourself. This does not publish automatically or save to your device’s drafts.</p>
        {hasVideo && <p className="bridge-small">Add the video caption, music, audience, and other publishing settings in TikTok. The text entered in Meadow is not sent with this video.</p>}
        {hasImages && <p className="bridge-small">Your photo title and caption are sent with the images. Review them and choose music, audience, and other publishing settings in TikTok.</p>}
        {permissions?.canUpload !== true && <p className="bridge-notice" role="status">Reconnect this TikTok account from Connections and allow video upload before sending media to TikTok.</p>}
        <Check checked={settings.uploadConsent === true} onChange={event => update("uploadConsent", event.target.checked)}>I agree to send this media to TikTok and understand I must open TikTok to finish editing and publish.</Check>
      </> : <>
      {permissions?.canPublish === false && <p className="bridge-notice" role="status">Reconnect this TikTok account from Connections and allow direct publishing.</p>}
      {creator && <div className="bridge-creator-info">{creator.avatar && <img src={creator.avatar} alt=""/>}<span>Posting to <strong>{creator.nickname}</strong><small>@{creator.username} · Videos up to {creator.maxVideoSeconds}s</small></span></div>}
      {privateOnly && <p className="bridge-notice" role="status">TikTok direct posts are limited to Only me during testing. Choose Only me for each post.{restrictedAudience && " The previous audience is no longer available."}</p>}
      <Field label="Who can see this post?" hint="TikTok requires an audience choice for each post."><select value={restrictedAudience ? "" : settings.privacy || ""} onChange={event => update("privacy", event.target.value)}><option value="">Choose an audience</option>{privacyOptions.map(value => <option key={value} value={value} disabled={settings.brandedContent && value === "SELF_ONLY"}>{privacyNames[value] || value}</option>)}</select></Field>
      <div className="bridge-check-grid"><Check checked={settings.allowComments === true} disabled={creator?.commentsDisabled || !creator} onChange={event => update("allowComments", event.target.checked)}>Allow comments</Check>{hasVideo && <><Check checked={settings.allowDuet === true} disabled={creator?.duetDisabled || !creator} onChange={event => update("allowDuet", event.target.checked)}>Allow Duet</Check><Check checked={settings.allowStitch === true} disabled={creator?.stitchDisabled || !creator} onChange={event => update("allowStitch", event.target.checked)}>Allow Stitch</Check></>}</div>
      {hasImages && <Check checked={settings.autoMusic === true} onChange={event => update("autoMusic", event.target.checked)}>Let TikTok add recommended music</Check>}
      <Check checked={settings.ownBrand === true} onChange={event => update("ownBrand", event.target.checked)}>Promotes my own brand</Check>
      <Check checked={settings.brandedContent === true} onChange={event => update("brandedContent", event.target.checked)}>Paid partnership with a third-party brand</Check>
      {(settings.ownBrand || settings.brandedContent) && <p className="bridge-small">TikTok will label this {settings.brandedContent ? "Paid partnership" : "Promotional content"}.</p>}
      <Check checked={settings.aiGenerated === true} onChange={event => update("aiGenerated", event.target.checked)}>Contains AI-generated content</Check>
      <Check checked={settings.consent === true} onChange={event => update("consent", event.target.checked)}>By posting, I agree to TikTok’s <a href="https://www.tiktok.com/legal/page/global/music-usage-confirmation/en" target="_blank" rel="noreferrer">Music Usage Confirmation</a>{settings.brandedContent && <> and <a href="https://www.tiktok.com/legal/page/global/bc-policy/en" target="_blank" rel="noreferrer">Branded Content Policy</a></>}.</Check>
      </>}
    </>}
    {account.platform === "pinterest" && <><Field label="Board"><select value={settings.boardId || ""} onChange={event => update("boardId", event.target.value)}><option value="">Choose a board</option>{(account.options?.boards || []).map(board => <option key={board.id} value={board.id}>{board.name}</option>)}</select></Field><Field label="Destination link (optional)"><input type="url" value={settings.link || ""} onChange={event => update("link", event.target.value)} placeholder="https://…"/></Field></>}
    {account.platform === "bluesky" && (hasImages || hasVideo) && <Field label="Media alt text"><textarea rows={2} value={settings.altText || ""} maxLength={1000} onChange={event => update("altText", event.target.value)} placeholder="Describe the media for people using screen readers"/></Field>}
    {account.platform === "google_business" && <Field label="Post language"><input value={settings.languageCode || "en"} maxLength={15} onChange={event => update("languageCode", event.target.value)} placeholder="en"/></Field>}
  </div>;
}
