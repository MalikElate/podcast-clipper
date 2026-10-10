# Deployment

Meadow needs a persistent Node server with FFmpeg and a writable SQLite/media directory. The frontend can be served by Express from the same HTTPS origin or by a Cloudflare Worker that routes backend paths to a Cloudflare Container. The backend cannot run directly in the Worker runtime because it uses child processes and local files.

The Docker and Compose files support self-hosting. Production uses `findmeadow.com` for the public site and `app.findmeadow.com` for the authenticated product, and is managed by Cloudflare Workers Builds: only pushes to `main` trigger a build and deployment, and preview builds are disabled. Normal releases deploy through `main`. The one-time preservation procedure below requires a Worker-only Wrangler deployment before replacing a legacy container.

## Concurrent changes

Normal code changes must arrive through a pull request into `main`. The required `Tests and build` check validates frontend tests, backend tests, and the production frontend/prerender build. Branch protection requires the PR to be up to date with main so concurrent changes are validated together. Each task uses its own worktree; after another PR merges, integrate main and rerun checks before merging. Do not bypass this process with a direct push or a production Wrangler deployment from an older checkout. Follow [AGENTS.md](../AGENTS.md) for the parallel-task workflow.

## Prepare configuration

1. Copy `backend/.env.example` to `backend/.env` and `frontend/.env.example` to `frontend/.env`.
2. Configure Clerk for the `findmeadow.com` root domain, add `app.findmeadow.com` to its allowed subdomains, set `VITE_CLERK_PUBLISHABLE_KEY` for the frontend build, and supply `CLERK_SECRET_KEY` and `CLERK_PUBLISHABLE_KEY` to the backend runtime. Clerk shares sessions across subdomains of its production root domain. Set Clerk's component paths to `https://app.findmeadow.com/sign-in`, `https://app.findmeadow.com/sign-up`, `https://findmeadow.com/` after sign-out, and `https://app.findmeadow.com/oauth-consent` for OAuth consent. Keep Clerk's Account Portal disabled so `accounts.findmeadow.com` does not expose a second authentication flow.
3. Generate separate random values for `BRIDGE_ENCRYPTION_KEY` and `BRIDGE_MEDIA_SIGNING_KEY`.
4. Set `BRIDGE_APP_URL` to the authenticated product origin (`https://app.findmeadow.com`) and `BRIDGE_PUBLIC_URL` to the public callback/API origin (`https://findmeadow.com`), without trailing paths. This keeps existing provider callbacks and webhooks stable while sending users back to the app subdomain. Set `BRIDGE_TRUST_PROXY` to the exact trusted proxy hop count.
5. Supply the platform application credentials and callbacks described in [platforms.md](platforms.md). Leave unfinished platforms disabled through `BRIDGE_DISABLED_PLATFORMS` until their applications are approved and tested.
   For Telegram, store `TELEGRAM_BOT_TOKEN` and a separate random `TELEGRAM_WEBHOOK_SECRET` as secrets, and set `TELEGRAM_BOT_USERNAME` without the leading `@`. Startup registers `<BRIDGE_PUBLIC_URL>/api/telegram/webhook` with Telegram.
6. Create monthly and yearly recurring Stripe Prices for Starter, Creator, Growth, and Pro. Set `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and the eight `STRIPE_PRICE_*` values listed in `backend/.env.example`. Register `https://findmeadow.com/api/stripe/webhook` for `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `customer.subscription.paused`, `customer.subscription.resumed`, `invoice.payment_failed`, `invoice.payment_action_required`, and `invoice.payment_succeeded`. Configure the default Stripe Customer Portal to support the eight global Meadow prices, payment-method updates, invoice history, and cancellation at the end of the paid period. Regional subscriptions use a separate portal configuration with plan switching disabled; Meadow creates and stores it on first use.

For the fixed Sub-Saharan Africa catalog, see [regional pricing](regional-pricing.md). The Cloudflare Worker reads the visitor country from `request.cf.country` and overwrites the private `x-meadow-visitor-country` header. The container sets `BRIDGE_TRUST_COUNTRY_HEADER=1` and also recognizes Cloudflare's runtime-injected `CLOUDFLARE_APPLICATION_ID` marker, so a new container image started by an older Durable Object still trusts the Worker-sanitized country header. A self-hosted backend must only enable `BRIDGE_TRUST_COUNTRY_HEADER` behind an edge that overwrites this header from trusted IP geolocation. `/api/pricing` and checkout use the same country catalog. All 33 native charge currencies in the catalog appear in Stripe's US merchant card-presentment list; six unsupported native currencies use EUR. Verify the merchant's account country, enabled payment methods, representative native and fallback Checkout sessions in test mode, and the webhook/portal path before production rollout. No live purchase is needed for routine release checks.

## Subscription confirmation and recovery

Checkout returns to `/dashboard/billing` with a Stripe session ID. Meadow verifies the signed-in owner and retrieves the current subscription directly from Stripe before confirming payment. The portal return and Refresh billing button also retrieve current subscription state. Global webhook updates map configured Price IDs. Regional Checkout creates a recurring Stripe Price inline in the selected native or fallback currency; webhook updates verify its product, amount, currency, interval, owner, and stored Checkout key before accepting it. Delayed events and original Checkout metadata cannot undo a plan change. Stripe Adaptive Pricing is disabled for Checkout so the amount and currency shown by Meadow are the amount and currency sent to Stripe.

Concurrent checkout requests reuse the same unpaid session; choosing another plan expires the previous session. The checkout request and its idempotency key are durably stored before contacting Stripe, allowing a lost response to be recovered after restart. If an unresolved attempt is over 23 hours old, checkout stops with `checkout_pending`. An operator must inspect Stripe's request logs using the stored key and reconcile any matching session/subscription before clearing that attempt; never blindly retry it with a new key. Account deletion also recovers outstanding attempts before expiring checkout and canceling subscriptions.

## Meta Pixel

The shared HTML head loads `frontend/src/metaPixel.js` with public Pixel ID `1591452026328293`. It records `PageView` on production Meadow hosts, including client-side route changes, and stays off in development and local previews. It honors the existing analytics preference, Do Not Track, and Global Privacy Control. Automatic form capture and advanced matching are disabled; no signup or purchase conversions are inferred from page views.

The wrapper skips URLs carrying draft IDs, OAuth parameters, checkout session IDs, and unknown parameters. Campaign parameters remain available for ad attribution. A script-only integration lets the privacy preference govern all events, including when the visitor changes it during a visit. There is no unconditional noscript tracking image.

After deployment, use Meta Events Manager's Test Events or Meta Pixel Helper on the public site to confirm the pixel and PageView. Avoid sending fake conversions to the live pixel.

## Google Analytics 4

The public GA4 web stream uses Measurement ID `G-VVMXZECLCS`. The ID is a public frontend build input, not an API secret. `frontend/src/googleAnalytics.js` uses it by default on `findmeadow.com`, `www.findmeadow.com`, and `app.findmeadow.com`; `VITE_GA4_MEASUREMENT_ID` can override it in a frontend build. Localhost and preview hosts never load the tag. The current Docker Compose build does not forward a GA4 override, so self-hosted Compose builds use the default unless its build arguments are extended.

GA4 starts automatically on production hosts when Meadow’s existing usage analytics setting is enabled. There is no separate GA4 control or analytics consent popup. The shared one-year `meadow_analytics` preference cookie, supported Do Not Track, and Global Privacy Control govern collection. A legacy `meadow_ga_analytics=off` choice is migrated to usage analytics off before analytics initialization; a legacy `on` choice is retired without overriding any existing opt-out. The Google tag uses first-party analytics cookies while enabled and loads no script or measurement ping while usage analytics is off. Its configuration denies advertising storage, advertising user data, and ad personalization, disables Google signals, and sets sanitized page location and referrer for automatic as well as manual events. Keep **Enhanced measurement off** in the GA4 web stream, including history-change page views; otherwise Google can double-count Meadow's manual page views or collect additional scroll, link, download, video, and form events beyond the reviewed event set.

Meadow sends sanitized `page_view` events and, after the associated action, `sign_up`, `social_account_connected`, and `post_scheduled`. Page addresses contain static paths and selected `utm_*` campaign labels, not account IDs, OAuth parameters, draft IDs, or arbitrary query strings. The tag does not send Meadow names, email addresses, post text, media, or social-account identities. These events are acquisition and activation signals, not authoritative billing or publishing records.

After a `main` deployment, verify a new production visitor with usage analytics enabled loads `googletagmanager.com/gtag/js` and sends one sanitized `page_view` without a popup or separate GA4 control. Use GA4 Realtime or Tag Assistant to confirm delivery. Turn usage analytics off through the Privacy page or Settings → Privacy & Account and verify the tag sends no new events and GA cookies are cleared; repeat with GPC/DNT and a legacy Google Analytics refusal. Confirm a prior refusal is preserved as usage analytics off and can be changed through the shared control. Confirm **Enhanced measurement** remains off in Admin → Data streams → Meadow web stream. Test real sign-up and product actions only with authorized disposable accounts; do not fabricate live conversions.

## Trybe purchase attribution

Set `TRYBE_ORDERS_API_KEY` to the private `sk_` Orders API key from Trybe → Integrations → Universal Pixel, and set `TRYBE_STORE_ID` to that pixel's store ID. The read-only Brand API `tk_live_` key cannot submit orders. The public pixel configuration lives in `frontend/public/trybe-pixel.js`; its store ID must match the backend. `track.findmeadow.com` is a DNS-only CNAME to `proxy.jointrybe.com`, verified in Trybe before enabling the script.

Checkout copies the pixel's `ugc_vid_{storeId}` cookie into Stripe Checkout and subscription metadata. The verified `invoice.payment_succeeded` webhook submits paid live-mode invoices (initial purchases and renewals) to `https://jointrybe.com/attribution/v1/orders`. Values use the invoice's actual amount paid and currency, including Stripe's zero/three-decimal currency rules. The invoice ID is the order ID; local delivery receipts and Trybe's duplicate-order response prevent double counting when Stripe retries, including after container replacement. Non-2xx or unsuccessful Trybe responses cause a 503 so Stripe can retry. Never log request payloads or API keys.

Test-mode, unpaid, zero-value, unrelated-product invoices and invoices without a Trybe visitor ID are not sent. Missing visitor IDs are logged without customer details. Attribution needs the browser pixel to load before checkout; the server never fabricates a visitor ID. Renewals retain the original subscription's visitor attribution. No retroactive orders or refund adjustments are sent by this integration.

Run `node --test test/trybe.test.js` in `backend` for signed webhook, currency, retry and deduplication checks. For live acceptance, confirm the tracking script sets its visitor cookie, the cookie is copied into a real Checkout's subscription metadata, and a genuine successful payment appears in Trybe. Do not submit fake purchases to the live Orders API.

Never copy runtime secrets into `VITE_*` variables. The Clerk publishable key and analytics project tokens are public frontend build inputs. Do not change the encryption key without migrating or re-encrypting stored credentials. Keep copies of signing and encryption keys separate from data backups.

Workspace API keys are created from Configuration → API Keys. The full key is displayed once; store it in the client's secret manager and send it as `Authorization: Bearer br_live_…`. Revocation immediately stops new authenticated REST and MCP requests. The MCP endpoint is `https://findmeadow.com/mcp`; see [MCP API](mcp-api.md). Public ChatGPT connections use the OAuth configuration below rather than a manually supplied API key.

### Configure MCP OAuth

Production passes the public `CLERK_MCP_ISSUER=https://clerk.findmeadow.com` setting from the Worker into the backend. Self-hosted deployments may set their own Clerk HTTPS issuer origin; leaving it unset keeps the existing API-key-only mode. The Worker routes both protected-resource metadata paths to the backend instead of the static asset layer.

In the Meadow production Clerk instance, configure OAuth applications:

1. Keep **Require PKCE** enabled. Enable **Include Audience**, retain **JWT access tokens**, and keep the OAuth consent screen enabled.
2. Define `meadow:read` for viewing owned projects, account metadata, saved posts, and cached analytics; `meadow:draft` for saving new drafts; `meadow:media` for uploading media; and `meadow:publish` for publishing and scheduling posts. Assign only appropriate scopes to each OAuth client; defining or advertising a scope does not grant it.
3. Prefer a pre-registered, allowlisted ChatGPT CIMD client. For Clerk issuers advertising `authorization_response_iss_parameter_supported: true`, OpenAI documents the stable client metadata URL `https://chatgpt.com/oauth/client.json` and callback `https://chatgpt.com/connector_platform_oauth_redirect`. Confirm the exact values shown in the OpenAI connection page. Enable CIMD discovery after configuring the client and permitted scopes; keep unknown clients and DCR disabled unless separately intended.
4. Grant the ChatGPT client `meadow:read`, `meadow:draft`, `meadow:media`, `meadow:publish`, and the OIDC/refresh scopes required for linking. Ensure any OIDC scopes advertised in issuer metadata are enabled for the client. Do not grant `private_metadata` or `public_metadata` for this integration. Default scopes, if used, must not silently add broader access.
5. For Claude connectors, either enable DCR (Claude registers itself through the `registration_endpoint` in issuer metadata), or pre-register a public client with callback `https://claude.ai/api/mcp/auth_callback` and give users its client ID for the connector's advanced settings. With neither, Claude cannot obtain a client ID and sign-in cannot start.
6. Test sign-in, consent, code exchange with `resource=https://findmeadow.com/mcp`, refresh, and an actual access JWT through an MCP client. Confirm `iss`, `aud`, expiry, token type, and granted Meadow scopes. Test denied consent, wrong resources, cross-owner project access, and rejection of each tool whose scope was not granted. Test publishing only with a private test account, and schedule test posts far enough ahead to cancel them.

OAuth setup and a healthy metadata endpoint are prerequisites, not proof of marketplace approval. OpenAI business verification, domain challenge, reviewer credentials, executed review cases, and the demo recording remain separate submission steps.

References: [OpenAI authentication](https://developers.openai.com/plugins/build/auth), [Clerk MCP integration](https://clerk.com/docs/expressjs/guides/ai/mcp/build-mcp-server), and [Clerk OAuth configuration](https://clerk.com/docs/guides/configure/auth-strategies/oauth/how-clerk-implements-oauth).

## Build and run

From the repository root on a Docker host:

```sh
docker compose --env-file frontend/.env up --build -d
```

Compose passes Clerk and optional PostHog public-token overrides to the frontend build and supplies backend secrets only at runtime. It mounts `bridge-data` at `/data`, runs as the unprivileged Node user, and exposes the service at `127.0.0.1:8787`. Put an HTTPS reverse proxy in front of it and preserve the named volume across updates.

The reverse proxy must support large request bodies, media byte ranges, and long upload timeouts. Set its upload limit consistently with `BRIDGE_MAX_UPLOAD_MB` (default 1 GiB). Provider retrieval of signed `/media/...` URLs and `/oauth/...` callbacks must be publicly reachable without a login wall.

### Direct browser uploads to private R2

Production browsers send the selected filename, byte count, and a base64 preview of its first up to 64 KiB in the small authenticated upload-ticket request. Meadow checks this preview against supported formats before granting a direct PUT to R2's S3 endpoint. The signed ticket expires after one hour and fixes the object, method, content type, byte count and create-only condition. An admitted transfer has a further two hours to complete before Meadow expires its pending record. Meadow verifies the stored size, copies the staging object inside R2 to its immutable media namespace, and checks the complete file type against the ticket before marking it ready. The backend then prepares the file and thumbnail asynchronously; the browser polls until the media is ready. Processing resumes after container restarts. Supported upload types are JPG/JPEG, PNG, WebP, GIF, MP4, MOV, WebM, PDF, DOCX, and PPTX; audio and legacy DOC/PPT files are not supported. Publishing validation and per-platform conversions still apply.

Self-hosted local storage, older clients, and MCP retain the upload-token/multipart route. A legacy `{ bytes }` ticket remains valid: the full file is checked before durable storage, even though its type cannot be checked before the transfer. New token clients may also send `filename` and `sample` for early rejection.

Before releasing this path, create an R2 **Object Read & Write** API token restricted to `meadow-media`. Store its Access Key ID and Secret Access Key as Worker secrets `R2_UPLOAD_ACCESS_KEY_ID` and `R2_UPLOAD_SECRET_ACCESS_KEY`. The account ID and bucket are configured by `R2_UPLOAD_ACCOUNT_ID` and `R2_UPLOAD_BUCKET` in Wrangler. These credentials must never be frontend variables or container environment variables. Missing configuration returns an actionable storage error rather than silently sending large files through the proxy.

Merge the rule in `cloudflare/r2-cors.json` into the bucket's current CORS configuration; preserve unrelated rules. Only Meadow's three production origins can make the signed PUT with `Content-Type` and `If-None-Match`. Keep the bucket private. Likewise merge `cloudflare/r2-staging-lifecycle.json` into existing lifecycle rules. It expires only the `direct-uploads/` prefix after one day, including abandoned transfers and staging objects recreated with an unexpired ticket. Normal cleanup deletes staging alongside originals; expiration bounds retention when the client never confirms an upload or a grant outlives account deletion. Do not apply this lifecycle to permanent originals or derivatives.

The production `BRIDGE_MAX_UPLOAD_MB=5115` matches R2's actual single-request maximum (5 GiB minus 5 MiB), about 5 GB. Direct uploads bypass the site's 100 MB request-body cap, but are not unlimited; larger files require a separate multipart-upload implementation. Destination platforms may impose lower size, duration, resolution or format limits. See [R2 limits](https://developers.cloudflare.com/r2/platform/limits/) and [presigned URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/).

Allow outbound HTTPS to Clerk, enabled providers, and Bluesky identity/PDS endpoints. Start with one container. Reserve disk space for uploaded media and generated derivatives, then observe CPU, memory, disk, and queue latency before increasing workload.

The `/health` route verifies that the process responds. It does not verify platform credentials, provider quota, external service status, or available disk space.

## Updates, backups, and recovery

- Cloudflare uses the existing `BACKEND` Durable Object for verified SQLite snapshots and the private `MEADOW_MEDIA` R2 binding (`meadow-media`) for original media and derivatives. The container filesystem is a working cache. Keep the Durable Object namespace, its `primary` identity, R2 bucket, and credential encryption key across releases.
- Startup restores and verifies SQLite before accepting traffic. API responses and provider checkpoints wait for durable storage; storage failure returns an error instead of acknowledging an unsaved change. Never roll back to a filesystem-only image after this migration.
- The current snapshot implementation supports one active container and databases up to 32 MiB. Monitor size and latency; move to a larger shared database implementation before that limit. Exceeding it fails writes rather than silently dropping durability.
- A daily Cloudflare cron wakes the backend for connection renewal and cleanup even without visits. In-process maintenance runs every minute while awake. When Twitch is configured, an additional 30-minute cron keeps the backend awake for required hourly authorization checks; this increases idle container runtime. Preserve these crons and monitor renewal failures.
- Committed database snapshots include the next active Dropper slot or pending publishing delivery. A durable Container schedule wakes the backend at that time, including intervals longer than its idle timeout. Stopping or completing queued work updates or clears the wakeup with the next snapshot.
- Pause new publishing with `BRIDGE_PUBLISHING_ENABLED=false` during a controlled migration; retain the persistent volume and encryption key.
- Stop the application before a filesystem backup of `/data`, or use SQLite's online backup API with a coordinated media snapshot. Copying only `bridge.sqlite` while WAL writes are active can miss transactions.
- Back up the database and media together. The database contains encrypted tokens, and the separate encryption key is required to restore connections.
- Allow at least 40 seconds for shutdown. Claims that outlive the process recover after their lease expires. Check `needs_review` deliveries on the social account before approving a retry.
- Monitor storage and worker error logs. Uploaded media and history have no automatic retention policy in this release.

### Preserve an existing filesystem-only Cloudflare container

Do this before the first durable backend rollout. Do not replace or restart the old container until capture is verified. The temporary operator endpoint returns counts and checksums, never tokens or database contents.

1. Complete tests and the frontend build. Create the private `meadow-media` R2 bucket if absent. Record the existing container instance ID, creation time, and version.
2. Generate a fresh random `BRIDGE_MIGRATION_SECRET` into a mode-0600 JSON file outside the repository. Deploy this Worker with `wrangler deploy --containers-rollout=none --keep-vars --secrets-file <private-file>`. This preserves deployed container metadata and adds the secret in the same Worker version; do not use a separate container rollout or secret deployment first.
3. Verify the existing container instance and version are unchanged. Send authenticated requests to `/api/internal/durable-migration` using that secret as a Bearer token. `GET` returns status. `POST {"action":"preflight"}` checks database integrity and inventories referenced media without pausing the backend.
4. Require `missingActiveMediaFiles: 0` and a database within the size limit. `POST {"action":"capture"}` briefly gates backend traffic, drains active requests and workers, copies referenced files to R2 with checksum verification, and saves a SQLite snapshot including WAL transactions. Require `durable: true`, matching copied/file counts, and `GET` status `initialized: true`, `mode: "migration"` before proceeding.
5. Push the tested backend to `main` for the normal image build and rollout. The new process restores its snapshot and marks storage ready before reopening traffic. Verify healthy responses, `mode: "ready"`, and preserved record counts. Media downloads repopulate the local cache from R2.
6. Remove the temporary migration secret and local secret file after successful verification. Keep the admin endpoint disabled by leaving its secret unset.

If capture fails, keep the old image. Correct the problem and capture again, or use `POST {"action":"resume"}` to remove temporary migration media copies and restart the original workers. A paused migration does not expire the old container for inactivity. Do not resume the legacy image after a new durable backend has started. A failed restore stays unavailable rather than creating an empty database.

## Live acceptance before public launch

These checks require actual provider credentials and approved test accounts:

1. Sign up and confirm that two users cannot access each other's projects or signed media URLs.
2. Connect each enabled provider, select the intended profile, page, channel, or location, and test reconnection and revocation.
3. Publish a permitted test item for each enabled format and verify its content, privacy, and status on the platform.
4. Compare supported metrics with provider results and confirm that unavailable or delayed values stay marked as unavailable.
5. Schedule a small test set, restart the server while work is queued, and verify continued delivery and permitted rate-limit behavior.
6. Complete provider app details, domain verification, privacy and deletion instructions, access reviews, and public-use approvals.
7. Complete one Stripe test-mode Checkout for each billing frequency, confirm the webhook updates Meadow's Billing page, open the Customer Portal, and test cancellation before replacing test keys and Price IDs with live-mode values.

## Verified locally

- Backend domain, authenticated API, provider contract, and media tests.
- FFmpeg video probing and thumbnail creation on synthetic media.
- Frontend unit tests and production bundle.

These checks do not claim a live social publication, Docker image build, or production deployment.

## Product usage analytics

The production hosts `findmeadow.com`, `www.findmeadow.com`, and `app.findmeadow.com` use the public write-only token for Meadow’s US PostHog project 604661. Localhost and preview domains are excluded. `VITE_POSTHOG_ENABLED=false` disables the integration at build time; `VITE_POSTHOG_KEY` overrides the default public token. Keep **Settings → Web analytics → Cookieless tracking** enabled in the matching PostHog project or it will drop cookieless events. Never place a personal API key in a frontend variable.

Cloudflare serves the same-origin `/sprout` reverse proxy on all three production hosts. `/sprout/static/*` and `/sprout/array/*` use PostHog’s US asset origin; other proxy paths use its US ingestion origin. The Worker preserves request bodies and queries, forwards the trusted client IP required for cookieless hashing, and strips Meadow cookies, authentication headers, referrers, and upstream cookies. Ingestion is not cached. Browser opt-outs, DNT/GPC, event sanitization, and disabled recordings remain in effect. The PostHog UI and the backend’s historical-erasure API continue using PostHog directly.

Leave `VITE_POSTHOG_HOST` unset (or set to `/sprout`) in Workers Builds. Docker/Compose keeps its existing direct-US-host default because Express does not implement this proxy. A self-hosted deployment can set `VITE_POSTHOG_HOST` to its own equivalent proxy. After release, verify a normal browser page view sends a successful request to `/sprout/e/` (or `/sprout/i/v0/e/` when selected by the SDK configuration) and that `/sprout/array/<public-project-token>/config` returns PostHog configuration rather than HTML. See [PostHog’s Cloudflare guide](https://posthog.com/docs/advanced/proxy/cloudflare).

Page views follow browser history changes. Product events are emitted only after the corresponding API request succeeds: checkout started, post submitted (accepted, not confirmed published), draft saved, connection started, account connected/disconnected, and media uploaded. These are anonymous UI usage counts, not billing records or authoritative publishing outcomes. Counts cannot be linked to Meadow accounts or reliably joined across days. Consent preferences, DNT, GPC, network failures, and blockers can reduce observed counts. Legacy identified-data erasure still uses the backend runtime secrets described in `privacy-operations.md`.
