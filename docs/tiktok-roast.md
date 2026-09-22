# Free TikTok roast

Public page: `/tiktok-roast`. Public endpoint: `POST /api/tools/tiktok-roast` with JSON `{ "handle": "creator" }`.

The edge Worker reads TikTok's public creator embed and extracts only the matching profile and up to ten public captions. It does not use connected accounts, OAuth credentials, private content, video/audio downloads, thumbnails, or performance data. TikTok can change or restrict the embed; unavailable data returns an honest error, never a fabricated report.

The documented score is deterministic: filler=1, thin=0.5, strong=0, divided by scored captions. Empty captions are unscored; at least three readable captions are required. The rubric favors distinct textual context and flags repeated text, bait, short promotional instructions and hashtag-only captions. It is an editorial caption check, not video quality, AI detection, or a measure of the creator. English phrase matching and short-form language have limitations.

Optional Cloudflare Workers AI (`@cf/meta/llama-3.1-8b-instruct`) changes only the punchline. A separate `RoastBudget` Durable Object allows at most 100 optional inference attempts per UTC day; it stores only date/count. A missing/failed/exhausted AI binding uses the evidence-based default roast. Never fall back to invented profile data. Inputs are bounded to six 250-character captions for AI; output max 180 tokens. Change the daily cap only as an intentional operating-cost decision.

`ROAST_LIMITER` allows five requests per IP per 60 seconds per Cloudflare location. Public results are cached at the edge for one hour; the API itself uses `no-store`. No persistent creator report is saved. Copy links prefill the handle for a fresh roast; the PNG share card preserves the result. Nothing is posted on a visitor's behalf.

Deployment adds the AI binding, rate limiter namespace 1001, and migration `v2-roast-budget`. Existing backend bindings, storage and container configuration are unchanged. The public route is handled before the authenticated backend proxy.

Validation: `node --test backend/test/tiktok-roast.test.js`, frontend tests/build, and `npx wrangler deploy --dry-run`. Browser-test a real public profile, invalid input, responsive layout, copy and download; verify TikTok availability again from the production edge after deploying.
