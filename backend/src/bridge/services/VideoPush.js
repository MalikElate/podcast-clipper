/** Video-post preparation for reviewed Dropper batches. */
export const clipVideoText = (text, limit) => {
  const characters = [...String(text || "")];
  return characters.length > limit ? `${characters.slice(0, limit - 1).join("").trimEnd()}…` : characters.join("");
};

export async function prepareVideoPush({ store, registry, posts, uid, projectId, source, media, accountIds, overrides: savedOverrides = {}, schedule }) {
  const caption = source.caption || "";
  const titleLine = String(source.title || caption).split("\n").map(value => value.trim()).find(Boolean) || "Video";
  const overrides = Object.fromEntries(accountIds.map(id => {
    const account = store.get("account", id), limit = registry.get(account.platform)?.capabilities?.captionLimit;
    return [id, { ...(savedOverrides[id]?.settings ? { settings: savedOverrides[id].settings } : {}), ...(limit && [...caption].length > limit ? { caption: clipVideoText(caption, limit) } : {}) }];
  }));
  const item = { caption, title: clipVideoText(titleLine.replace(/[<>]/g, ""), 100), mediaIds: [media.id], accountIds, overrides, format: "auto", schedule };
  const preview = await posts.preview(uid, projectId, { items: [item] });
  const rejected = preview.rows[0].destinations.filter(destination => destination.errors.length).map(destination => ({ accountId: destination.accountId, accountName: destination.accountName, platform: destination.platform, errors: destination.errors.slice(0, 3) }));
  const accepted = accountIds.filter(id => !rejected.some(entry => entry.accountId === id));
  return { item: { ...item, accountIds: accepted, overrides: Object.fromEntries(accepted.map(id => [id, overrides[id]])) }, rejected };
}
