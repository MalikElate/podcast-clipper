// Questions answered on each platform page. Answers describe what Meadow's
// adapter supports and the limits it enforces; they do not claim a platform is
// connectable, because that depends on review status and workspace
// configuration. Keep numbers consistent with platformSpecs.js.
export const PLATFORM_FAQS = {
  instagram: [
    { q: "What kind of Instagram account does Meadow need?", a: "A Professional account, either Business or Creator. Instagram's publishing API does not accept personal profiles, so a personal account cannot be connected." },
    { q: "How long can an Instagram caption be?", a: "2,200 characters. Meadow counts the caption as you write it, and one post can carry different text for Instagram than for its other destinations." },
    { q: "Can Meadow schedule an Instagram carousel?", a: "Yes. An Instagram carousel holds up to 10 items, and photos and videos can be mixed in the same carousel." },
    { q: "What are the Instagram photo and video limits?", a: "Videos can run up to 15 minutes and 1,000 MB. Photos are limited to 8 MB. Meadow checks both before a post is queued rather than failing at delivery." },
    { q: "Which Instagram post types can Meadow publish?", a: "Photo, video, carousel and story posts. Instagram requires media on every post, so text-only posts are not possible." },
    { q: "Is Instagram available to connect right now?", a: "Connection availability depends on platform review status and your workspace configuration. The Connections page in Meadow shows which destinations your workspace can currently connect." },
  ],
  twitch: [
    { q: "What can Meadow send to Twitch?", a: "Chat messages to a channel you have authorized, up to 500 characters each, published immediately or scheduled for later." },
    { q: "Can Meadow post a Twitch announcement?", a: "Yes. Twitch announcements can use the channel colour or blue, green, orange or purple." },
    { q: "Can Meadow upload a video or start a broadcast on Twitch?", a: "No. Meadow's Twitch integration covers channel chat only. Video uploads, broadcasting and chat engagement analytics are not available through it." },
    { q: "Can Meadow send a follow-up message?", a: "Yes. A delivery can carry up to 10 follow-up messages as a reply thread. Each confirmed message is recorded before the next is sent, so a retry resumes at the first unconfirmed message instead of repeating the thread." },
    { q: "What permissions does Meadow request on Twitch?", a: "Only user:write:chat and moderator:manage:announcements. Meadow revalidates the token's client, user and scopes at connection time and before publishing." },
    { q: "Is Twitch available to connect right now?", a: "Connection availability depends on platform review status and your workspace configuration. The Connections page in Meadow shows which destinations your workspace can currently connect." },
  ],
  telegram: [
    { q: "What does Meadow need to post to a Telegram channel?", a: "Telegram does not use OAuth for this. You add Meadow's bot to the group, or make it an administrator of the channel with permission to post. Meadow then publishes as the bot rather than as your personal account." },
    { q: "How long can a Telegram post be?", a: "4,096 characters, which is far more than most social platforms allow. The same post can carry much shorter text to your other destinations, because Meadow lets you set the wording per account." },
    { q: "Can Meadow send an album of photos and videos?", a: "Yes. A Telegram album holds up to 10 items and photos and videos can be mixed in the same album. Photos are limited to 10 MB each and videos to 50 MB." },
    { q: "Can Meadow send a document or PDF?", a: "Yes, up to 50 MB. Telegram is one of the few destinations Meadow can send a document to; most social platforms accept only photos and video." },
    { q: "Is Telegram available to connect right now?", a: "Connection availability depends on platform review status and your workspace configuration. The Connections page in Meadow shows which destinations your workspace can currently connect." },
  ],
  google_business: [
    { q: "What does Meadow post to Google Business Profile?", a: "Local posts on a business location you have authorized: text, a photo, or several photos. Up to 10 images per post, each under 5 MB." },
    { q: "How long can a Google Business post be?", a: "1,500 characters. Local posts are read next to your business listing, so the useful length is usually far shorter than the limit." },
    { q: "Can Meadow report how a local post performed?", a: "No, and this is a Google limitation rather than a Meadow one. Google retired the endpoint that reported individual local post insights, with no replacement. Location-level performance is a different feature and is not reported as individual post results." },
    { q: "Can Meadow post a video to Google Business Profile?", a: "No. Meadow's Google Business integration covers text and photo posts." },
    { q: "Is Google Business Profile available to connect right now?", a: "Connection availability depends on platform review status and your workspace configuration. The Connections page in Meadow shows which destinations your workspace can currently connect." },
  ],
  kick: [
    { q: "What can Meadow send to Kick?", a: "Chat messages to a channel you have authorized, published immediately or scheduled for later." },
    { q: "How long can a Kick chat message be?", a: "500 characters, and Kick additionally caps a message at 2,048 UTF-8 bytes and counts graphemes. A message heavy in emoji reaches the byte limit before the character limit." },
    { q: "Does Kick support coloured announcements?", a: "No. Coloured announcements are a Twitch feature. Kick messages are sent as ordinary chat messages." },
    { q: "Can Meadow upload a video to Kick?", a: "No. Meadow's Kick integration covers channel chat only. Video uploads, broadcasting and chat engagement analytics are not available through it." },
    { q: "How does Meadow connect to Kick?", a: "Through Kick's OAuth authorization-code flow with PKCE, requesting user:read, channel:read and chat:write. Meadow keeps the channel identity and image and discards the email address Kick returns." },
    { q: "Is Kick available to connect right now?", a: "Connection availability depends on platform review status and your workspace configuration. The Connections page in Meadow shows which destinations your workspace can currently connect." },
  ],
};

export function faqsFor(platformId) {
  return PLATFORM_FAQS[platformId] || [];
}
