# Privacy and account deletion

The policy version is `2026-09-12`. The dashboard requires a recorded agreement before loading workspace features. API keys cannot accept policies or close an account. Existing queued work remains paused until its owner accepts the current version. The public policy and terms are built into `/privacy` and `/terms`.

## Before production rollout

1. Keep `BRIDGE_DATA_DIR` on persistent storage and keep maintenance running. Jobs survive process restarts when the database survives. The current Cloudflare Container filesystem is not a durable external store: container replacement can lose pending external cleanup along with other state. Do not claim verified deletion completion after restoring an old database. Migrate to durable storage, or implement and verify an external deletion journal and restore procedure, before relying on this deployment for production retention guarantees.
2. Configure `CLERK_WEBHOOK_SIGNING_SECRET` and register `https://findmeadow.com/api/clerk/webhook` for `user.deleted`. This handles account deletion outside Meadow. The account deletion button itself uses the existing server-side Clerk secret.
3. Register `https://findmeadow.com/api/tiktok/webhook` for `authorization.removed`. Verification uses `TIKTOK_CLIENT_SECRET`, checks the configured client key, and rejects signatures outside a five-minute window. Test using TikTok's real webhook test facility before approving the integration. Old removal events do not delete a connection authorized later.
4. Configure `POSTHOG_PROJECT_ID`, `POSTHOG_PERSONAL_API_KEY` (`person:read` and `person:write`), and the appropriate `POSTHOG_API_HOST` (`https://us.posthog.com` or `https://eu.posthog.com`). Previous frontend versions identified users in PostHog. Without these secrets, cleanup remains pending for operator follow-up. Set `BRIDGE_POSTHOG_LEGACY_DATA=false` only on a deployment known never to have collected identified PostHog data, or after verifying the historical project is fully erased. These are runtime values, never frontend build secrets. The Worker forwards them to the container.
5. Confirm Stripe cancellation and Clerk deletion with disposable test accounts. Provider callbacks, production scopes, Pinterest Standard access, and YouTube/TikTok audits remain separate requirements. Passing local tests does not establish platform approval or legal compliance.
6. Run the job report at least daily and alert on failures, requests approaching seven days, or `manual_revocation_required`. Cloudflare may sleep an inactive container after two hours; arrange a reliable scheduler to wake the backend and run maintenance, or use a continuously running backend. Background JavaScript timers alone are not a durable scheduler.

This change does not deploy itself or configure external app dashboards. Production deployment continues through Workers Builds on `main`.

## What the workflows do

- `GET /api/bridge/privacy` returns current policy agreement and account-deletion status. `POST /api/bridge/privacy/consent` requires the current version and an explicit `accepted: true`. Authenticated data responses use `Cache-Control: no-store`.
- `DELETE /api/bridge/privacy/account` requires a signed-in session and `{"confirmation":"DELETE"}`. It derives ownership from authentication, ignores supplied user identifiers, revokes API keys immediately, blocks future workspace requests, and returns a deletion reference with HTTP 202.
- A durable job waits for active authenticated work and publishing/credential leases, then removes every owned workspace record, original upload, thumbnail, prepared variant, pending OAuth state, and social connection. It retries billing cancellation, Clerk deletion, and historical PostHog cleanup separately. Late Stripe webhooks cannot recreate a deleted account; active subscriptions reported for that account are canceled.
- Removing a connection erases its profile, credentials, options, delivery records, metrics, and destination overrides. Matching remote accounts or shared authorizations across the same owner's workspaces are included. Other owners' workspace data and the user's original content remain. Existing OAuth requests for that platform are invalidated so a late callback cannot restore the connection.
- Google and TikTok revocation uses encrypted credentials in a separate retry job, retained for no more than seven days from the request. Local profile and publishing data do not wait for remote revocation. When revocation cannot be confirmed by the deadline, credentials are destroyed and an operator receipt remains for thirty days. The user must then remove Meadow in the provider's connected-app settings. Google revocation can affect the full grant, including other Google channels or clients sharing it.
- Pinterest's current revoke endpoint supports **system-user tokens only**, so it is not used for regular Pinterest OAuth connections. Meadow destroys the stored credentials and directs users to Pinterest's connected-app settings. Other adapters without revocation support also require platform-side removal.
- Product tracking through PostHog and optional GA4 scripts is disabled. Social post metrics remain available. Historical PostHog deletion records persist the person UUID before submitting deletion and wait for the provider's verified deletion status. Ambiguous or merged profiles require manual follow-up rather than deletion of another user's data. PostHog’s documented deletion-status endpoint confirms event deletion; if recording deletion was also queued, the job requires operator verification of those recordings before completion.

Posts already published are not deleted from social platforms. A request already sent to a provider may still complete. Full account deletion requests immediate subscription cancellation; it does not create an automatic refund. Stripe's required accounting records may remain.

## Inspect and resolve jobs

Run from the backend's runtime environment with its real `BRIDGE_DATA_DIR`:

```sh
node backend/scripts/privacy-jobs.js
```

Inside the backend container, use `node /app/scripts/privacy-jobs.js` instead. The report includes references, stages, timestamps, and overdue flags. It does not print account identities, credentials, or provider response bodies. Keep reports restricted to authorized operators.

If automated PostHog cleanup cannot verify completion, locate the account using the pending job in the restricted database, verify ownership, finish deletion of its profile, events, and recordings in PostHog, and keep evidence in the support case. Only after that verification, acknowledge the analytics step:

```sh
node backend/scripts/privacy-jobs.js --analytics-complete DELETION_REFERENCE --confirmed-in-posthog
```

This acknowledges only historical analytics cleanup. Billing, local files, tokens, and identity deletion must still finish through their own steps. Never mark completion simply because a job is old or the provider accepted an asynchronous request.

## Retention and recovery

- OAuth connection records expire after ten minutes; Bluesky authorization state expires after fifteen minutes. Maintenance removes expired records and abandoned uploads or unreferenced media files older than twenty-four hours.
- Pinterest profiles and board lists are retrieved for the current operation; organic metrics are fetched only on explicit refresh and returned without saving them. Startup/maintenance clears legacy profile, option, and metric caches. Minimal OAuth routing and delivery bookkeeping remain for the publishing workflow; this does not establish that Pinterest has approved every retained field.
- YouTube profiles are checked daily where available. API metadata and analytics are removed if they have not been refreshed within thirty days. Metrics lookup removes video API identifiers and statistics when the video is absent. Loss of authorization triggers connection-data cleanup. YouTube is excluded from combined totals and derived engagement; raw metrics remain available per video.
- A minimal hashed identity marker and deletion reference remain after completion to reject stale sessions and delayed webhooks. Treat this marker as pseudonymous security data, not anonymous analytics. Pending processor and billing records are removed when those steps finish.
- SQLite uses secure deletion and checkpoints after erasure. This does not erase external backups, snapshots, Cloudflare logs, or provider records. Set and document infrastructure log retention and a recovery-copy deletion schedule. Protect copies from ordinary access, replay all deletion markers before exposing a restored database, and remove erased media from restored storage. An operator must verify those steps for a deletion request that involves backups.

## Primary references checked September 12, 2026

- [YouTube developer policies](https://developers.google.com/youtube/terms/developer-policies)
- [Google token revocation](https://developers.google.com/identity/protocols/oauth2/web-server#tokenrevoke)
- [TikTok token management](https://developers.tiktok.com/docs/en/oauth-user-access-token-management)
- [TikTok webhook verification](https://developers.tiktok.com/docs/en/webhooks-verification)
- [Pinterest developer guidelines](https://policy.pinterest.com/en/developer-guidelines)
- [Pinterest OpenAPI specification](https://github.com/pinterest/api-description/blob/main/v5/openapi.yaml)
- [PostHog persons and deletion status API](https://posthog.com/docs/api/persons)
