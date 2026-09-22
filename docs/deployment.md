# Deployment

Meadow needs a persistent Node server with FFmpeg and a writable SQLite/media directory. The frontend can be served by Express from the same HTTPS origin or by a Cloudflare Worker that routes backend paths to a Cloudflare Container. The backend cannot run directly in the Worker runtime because it uses child processes and local files.

The Docker and Compose files support self-hosting. Production uses `findmeadow.com` for the public site and `app.findmeadow.com` for the authenticated product, and is managed by Cloudflare Workers Builds: only pushes to `main` trigger a build and deployment, and preview builds are disabled. Normal releases deploy through `main`. The one-time preservation procedure below requires a Worker-only Wrangler deployment before replacing a legacy container.

## Prepare configuration

1. Copy `backend/.env.example` to `backend/.env` and `frontend/.env.example` to `frontend/.env`.
2. Configure Clerk for the `findmeadow.com` root domain, add `app.findmeadow.com` to its allowed subdomains, set `VITE_CLERK_PUBLISHABLE_KEY` for the frontend build, and supply `CLERK_SECRET_KEY` and `CLERK_PUBLISHABLE_KEY` to the backend runtime. Clerk shares sessions across subdomains of its production root domain.
3. Generate separate random values for `BRIDGE_ENCRYPTION_KEY` and `BRIDGE_MEDIA_SIGNING_KEY`.
4. Set `BRIDGE_APP_URL` to the authenticated product origin (`https://app.findmeadow.com`) and `BRIDGE_PUBLIC_URL` to the public callback/API origin (`https://findmeadow.com`), without trailing paths. This keeps existing provider callbacks and webhooks stable while sending users back to the app subdomain. Set `BRIDGE_TRUST_PROXY` to the exact trusted proxy hop count.
5. Supply the platform application credentials and callbacks described in [platforms.md](platforms.md). Leave unfinished platforms disabled through `BRIDGE_DISABLED_PLATFORMS` until their applications are approved and tested.
   For Telegram, store `TELEGRAM_BOT_TOKEN` and a separate random `TELEGRAM_WEBHOOK_SECRET` as secrets, and set `TELEGRAM_BOT_USERNAME` without the leading `@`. Startup registers `<BRIDGE_PUBLIC_URL>/api/telegram/webhook` with Telegram.
6. Create monthly and yearly recurring Stripe Prices for Starter, Creator, Growth, and Pro. Set `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and the eight `STRIPE_PRICE_*` values listed in `backend/.env.example`. Register `https://findmeadow.com/api/stripe/webhook` for `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `customer.subscription.paused`, `customer.subscription.resumed`, `invoice.payment_failed`, `invoice.payment_action_required`, and `invoice.payment_succeeded`. Configure the Stripe Customer Portal to support the eight Meadow prices, payment-method updates, invoice history, and cancellation at the end of the paid period.

## Subscription confirmation and recovery

Checkout returns to `/dashboard/billing` with a Stripe session ID. Meadow verifies the signed-in owner and retrieves the current subscription directly from Stripe before confirming payment. The portal return and Refresh billing button also retrieve current subscription state. Webhook updates use Stripe's current subscription and configured Price IDs, so delayed events and original Checkout metadata cannot undo a plan change.

Concurrent checkout requests reuse the same unpaid session; choosing another plan expires the previous session. The checkout request and its idempotency key are durably stored before contacting Stripe, allowing a lost response to be recovered after restart. If an unresolved attempt is over 23 hours old, checkout stops with `checkout_pending`. An operator must inspect Stripe's request logs using the stored key and reconcile any matching session/subscription before clearing that attempt; never blindly retry it with a new key. Account deletion also recovers outstanding attempts before expiring checkout and canceling subscriptions.

## Trybe purchase attribution

Set `TRYBE_ORDERS_API_KEY` to the private `sk_` Orders API key from Trybe → Integrations → Universal Pixel, and set `TRYBE_STORE_ID` to that pixel's store ID. The read-only Brand API `tk_live_` key cannot submit orders. The public pixel configuration lives in `frontend/public/trybe-pixel.js`; its store ID must match the backend. `track.findmeadow.com` is a DNS-only CNAME to `proxy.jointrybe.com`, verified in Trybe before enabling the script.

Checkout copies the pixel's `ugc_vid_{storeId}` cookie into Stripe Checkout and subscription metadata. The verified `invoice.payment_succeeded` webhook submits paid live-mode invoices (initial purchases and renewals) to `https://jointrybe.com/attribution/v1/orders`. Values use the invoice's actual amount paid and currency, including Stripe's zero/three-decimal currency rules. The invoice ID is the order ID; local delivery receipts and Trybe's duplicate-order response prevent double counting when Stripe retries, including after container replacement. Non-2xx or unsuccessful Trybe responses cause a 503 so Stripe can retry. Never log request payloads or API keys.

Test-mode, unpaid, zero-value, unrelated-product invoices and invoices without a Trybe visitor ID are not sent. Missing visitor IDs are logged without customer details. Attribution needs the browser pixel to load before checkout; the server never fabricates a visitor ID. Renewals retain the original subscription's visitor attribution. No retroactive orders or refund adjustments are sent by this integration.

Run `node --test test/trybe.test.js` in `backend` for signed webhook, currency, retry and deduplication checks. For live acceptance, confirm the tracking script sets its visitor cookie, the cookie is copied into a real Checkout's subscription metadata, and a genuine successful payment appears in Trybe. Do not submit fake purchases to the live Orders API.

Never copy runtime secrets into `VITE_*` variables. The Clerk publishable key and analytics project tokens are public frontend build inputs. Do not change the encryption key without migrating or re-encrypting stored credentials. Keep copies of signing and encryption keys separate from data backups.

Workspace API keys are created from Configuration → API Keys. The full key is displayed once; store it in the client's secret manager and send it as `Authorization: Bearer br_live_…`. Revocation immediately stops new authenticated REST and MCP requests. The private MCP endpoint is `https://findmeadow.com/mcp`; see [MCP API](mcp-api.md). Public ChatGPT distribution still requires OAuth rather than a manually supplied API key.

## Build and run

From the repository root on a Docker host:

```sh
docker compose --env-file frontend/.env up --build -d
```

Compose passes Clerk and optional PostHog public-token overrides to the frontend build and supplies backend secrets only at runtime. It mounts `bridge-data` at `/data`, runs as the unprivileged Node user, and exposes the service at `127.0.0.1:8787`. Put an HTTPS reverse proxy in front of it and preserve the named volume across updates.

The reverse proxy must support large request bodies, media byte ranges, and long upload timeouts. Set its upload limit consistently with `BRIDGE_MAX_UPLOAD_MB` (default 1 GiB). Provider retrieval of signed `/media/...` URLs and `/oauth/...` callbacks must be publicly reachable without a login wall.

Allow outbound HTTPS to Clerk, enabled providers, and Bluesky identity/PDS endpoints. Start with one container. Reserve disk space for uploaded media and generated derivatives, then observe CPU, memory, disk, and queue latency before increasing workload.

The `/health` route verifies that the process responds. It does not verify platform credentials, provider quota, external service status, or available disk space.

## Updates, backups, and recovery

- Cloudflare uses the existing `BACKEND` Durable Object for verified SQLite snapshots and the private `MEADOW_MEDIA` R2 binding (`meadow-media`) for original media and derivatives. The container filesystem is a working cache. Keep the Durable Object namespace, its `primary` identity, R2 bucket, and credential encryption key across releases.
- Startup restores and verifies SQLite before accepting traffic. API responses and provider checkpoints wait for durable storage; storage failure returns an error instead of acknowledging an unsaved change. Never roll back to a filesystem-only image after this migration.
- The current snapshot implementation supports one active container and databases up to 32 MiB. Monitor size and latency; move to a larger shared database implementation before that limit. Exceeding it fails writes rather than silently dropping durability.
- A daily Cloudflare cron wakes the backend for connection renewal and cleanup even without visits. In-process maintenance runs every minute while awake. When Twitch is configured, an additional 30-minute cron keeps the backend awake for required hourly authorization checks; this increases idle container runtime. Preserve these crons and monitor renewal failures.
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

Page views follow browser history changes. Product events are emitted only after the corresponding API request succeeds: checkout started, post submitted (accepted, not confirmed published), draft saved, connection started, account connected/disconnected, and media uploaded. These are anonymous UI usage counts, not billing records or authoritative publishing outcomes. Counts cannot be linked to Meadow accounts or reliably joined across days. Consent preferences, DNT, GPC, network failures, and blockers can reduce observed counts. Legacy identified-data erasure still uses the backend runtime secrets described in `privacy-operations.md`.
