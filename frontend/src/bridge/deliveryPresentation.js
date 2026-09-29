export const isTikTokInbox = destination => destination?.platform === "tiktok" && (destination.deliveryMode || destination.settings?.deliveryMode) === "inbox";

export const isDeliveryComplete = delivery => ["published", "awaiting_publish", "cancelled"].includes(delivery.status);

export const canCancelRemaining = post => !post.deliveries.some(delivery => ["publishing", "processing"].includes(delivery.status)) && post.deliveries.some(delivery => !isDeliveryComplete(delivery));

export function deliveryMix(destinations) {
  const inbox = destinations.filter(isTikTokInbox).length;
  return { hasInbox: inbox > 0, onlyInbox: inbox > 0 && inbox === destinations.length };
}

export function submissionLabel(destinations, { scheduled = false, count = 1, youtube = false } = {}) {
  const { hasInbox, onlyInbox } = deliveryMix(destinations);
  if (scheduled) return onlyInbox ? "Schedule TikTok transfer" : hasInbox ? "Schedule publishing & transfer" : youtube ? "Schedule upload" : `Schedule ${count === 1 ? "post" : `${count} posts`}`;
  return onlyInbox ? "Send to TikTok" : hasInbox ? "Publish & send to TikTok" : youtube ? "Upload & publish now" : "Publish now";
}

export function retryConfirmation(delivery) {
  if (isTikTokInbox(delivery)) return "I checked my TikTok inbox and this upload was not received. Resending a received upload would create a duplicate.";
  if (["twitch", "kick"].includes(delivery.platform)) return `I checked the channel: message ${(delivery.chatMessagesSent || 0) + 1} was not sent. Previously confirmed messages will be kept.`;
  return "I checked the social account and this post was not published.";
}

export function tiktokProcessingMessage(delivery) {
  if (delivery?.platform !== "tiktok" || isTikTokInbox(delivery)) return null;
  if (delivery.status === "publishing") return { line: "Sending this post to TikTok", detail: "Meadow is securely transferring the selected media and settings." };
  if (delivery.status === "processing") return { line: "TikTok is processing this post", detail: "Meadow is checking TikTok for the final publishing result. No action is needed." };
  return null;
}
