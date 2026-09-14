# Privacy and account deletion

The policy version is `2026-09-12`; connection notices use `2026-09-12-connections-1`. Users enter the dashboard without a policy gate. Each Pinterest, TikTok, YouTube, or Google Business Profile connection and reconnection requires its own explicit agreement before OAuth starts. API keys cannot give that agreement or close an account. Existing authorized connections, queued work, and analytics do not depend on the former workspace-wide agreement. Full policy links and all four data notices are available under Settings → Privacy & Account; the public policy and terms remain available at `/privacy` and `/terms`.

## Before production rollout

1. Verify the initial database/media migration described in [deployment instructions](deployment.md). Cloudflare commits the database, deletion markers, and pending cleanup jobs to its Durable Object, and stores referenced media in private R2. Preserve those bindings and the encryption/signing keys when replacing the container. Normal startup restores the latest committed snapshot; unavailable or invalid state fails closed. The current SQLite snapshot limit is 32 MiB and the backend permits one active writer. Self-hosted deployments without this bridge still need a persistent `BRIDGE_DATA_DIR` volume.
2. Configure `CLERK_WEBHOOK_SIGNING_SECRET` and register `https://findmeadow.com/api/clerk/webhook` for `user.deleted`. This handles account deletion outside Meadow. The account deletion button itself uses the existing server-side Clerk secret.
3. Register `https://findmeadow.com/api/tiktok/webhook` for `authorization.removed`. Verification uses `TIKTOK_CLIENT_SECRET`, checks the configured client key, and rejects signatures outside a five-minute window. Test using TikTok's real webhook test facility before approving the integration. Old removal events do not delete a connection authorized later.
4. Configure `POSTHOG_PROJECT_ID`, `POSTHOG_PERSONAL_API_KEY` (`person:read` and `person:write`), and the appropriate `POSTHOG_API_HOST` (`https://us.posthog.com` or `https://eu.posthog.com`). Previous frontend versions identified users in PostHog. Without these secrets, cleanup remains pending for operator follow-up. Set `BRIDGE_POSTHOG_LEGACY_DATA=false` only on a deployment known never to have collected identified PostHog data, or after verifying the historical project is fully erased. These are runtime values, never frontend build secrets. The Worker forwards them to the container.
5. Confirm Stripe cancellation and Clerk deletion with disposable test accounts. Provider callbacks, production scopes, Pinterest Standard access, and YouTube/TikTok audits remain separate requirements. Passing local tests does not establish platform approval or legal compliance.
6. Run the job report at least daily and alert on failures, requests approaching seven days, or `manual_revocation_required`. The configured daily Worker cron wakes the backend for connection and privacy maintenance even if the container has slept. Monitor scheduled-run failures; background JavaScript timers only run while the backend is awake. Self-hosting needs equivalent scheduling or a continuously running backend.

This change does not deploy itself or configure external app dashboards. Production deployment continues through Workers Builds on `main`.

## What the workflows do

- `GET /api/bridge/privacy` returns account-deletion status. `GET /api/bridge/privacy/connections` lists the four notices; `GET /api/bridge/privacy/connections/:platform` retrieves one. Authenticated data responses use `Cache-Control: no-store`.
- Signing out does not disconnect social accounts. Stored authorizations remain until explicit disconnection, account deletion, or a verified platform removal event. Meadow renews credentials proactively and on supported access-token failures; temporary provider errors keep the connection for retry. Revoked grants, fixed authorization lifetimes, and changed platform permissions can still require reconnection. Credential renewal does not extend the retention period for cached API data.
- A covered platform’s existing `POST /api/bridge/projects/:projectId/accounts/connect/:platform` endpoint requires a browser session and `consent: { accepted: true, platform, version }` for that exact platform and current notice. The server stamps acceptance time and binds the receipt to its single-use OAuth state, pending connection, and attached account. Missing, stale, and cross-platform consent is rejected before token exchange. A previous receipt does not skip the prompt on another connection attempt. Legacy pending OAuth requests for these platforms need to restart; existing attached accounts remain usable.
- `DELETE /api/bridge/privacy/account` requires a signed-in session and `{"confirmation":"DELETE"}`. It derives ownership from authentication, ignores supplied user identifiers, revokes API keys immediately, blocks future workspace requests, and returns a deletion reference with HTTP 202.
- A durable job waits for active authenticated work and publishing/credential leases, then removes every owned workspace record, original upload, thumbnail, prepared variant, pending OAuth state, and social connection. Media manifests are committed before R2 deletion, and failures remain pending for retry. Individually deleted media is hidden while cleanup is pending. Billing cancellation, Clerk deletion, and historical PostHog cleanup retry separately. Late Stripe webhooks cannot recreate a deleted account; active subscriptions reported for that account are canceled.
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

Inside the running backend container, use `node /app/scripts/privacy-jobs.js` instead. With no arguments the report is read-only; it includes references, stages, timestamps, and overdue flags without printing account identities, credentials, or provider response bodies. Keep reports restricted to authorized operators. Do not start a separate backend against the live Durable Object to inspect jobs: startup claims a new writer generation.

If automated PostHog cleanup cannot verify completion, locate the account using the pending job in the restricted database, verify ownership, finish deletion of its profile, events, and recordings in PostHog, and keep evidence in the support case. For a self-hosted persistent-volume deployment, stop the backend before acknowledging the verified analytics step, then restart it:

```sh
node backend/scripts/privacy-jobs.js --analytics-complete DELETION_REFERENCE --confirmed-in-posthog
```

This command writes the local SQLite file directly and must not be used on the Cloudflare deployment: it does not commit through the active writer's durable snapshot barrier. Keep an unverified Cloudflare job pending for operator follow-up; a durable manual override must be implemented before using it there. The command acknowledges only historical analytics cleanup. Billing, files, tokens, and identity deletion must still finish through their own steps. Never mark completion simply because a job is old or the provider accepted an asynchronous request.

## Retention and recovery

- Pending OAuth connection records expire after ten minutes; Bluesky authorization state expires after fifteen minutes. These limits do not expire attached social accounts. Maintenance removes expired pending records and abandoned uploads or unreferenced local cache files older than twenty-four hours. R2 objects referenced by deletion manifests are removed through retryable cleanup.
- Pinterest profiles and board lists are retrieved for the current operation; organic metrics are fetched only on explicit refresh and returned without saving them. Startup/maintenance clears legacy profile, option, and metric caches. Minimal OAuth routing and delivery bookkeeping remain for the publishing workflow; this does not establish that Pinterest has approved every retained field.
- YouTube profiles are checked daily where available. Profile caches, API metadata, and analytics are cleared when stale for thirty days without deleting the attached authorization. Metrics lookup removes video API identifiers and statistics when the video is absent. Failed authorization renewal marks the connection for reconnection; it does not silently erase it. YouTube is excluded from combined totals and derived engagement; raw metrics remain available per video.
- A minimal hashed identity marker and deletion reference remain after completion to reject stale sessions and delayed webhooks. Treat this marker as pseudonymous security data, not anonymous analytics. Pending processor and billing records are removed when those steps finish.
- SQLite uses secure deletion and checkpoints after erasure, and the updated snapshot replaces the committed Durable Object copy. This does not erase separate backups, infrastructure recovery copies, Cloudflare logs, or provider records. Set and document their retention and deletion schedules. Keep historical restores in maintenance, replay all later deletion markers and unfinished jobs, and remove erased media before exposing the restored service. Restoring an old database is not evidence that a deletion completed; an operator must verify the recovery set and outstanding external cleanup.

## Primary references checked September 12, 2026

- [YouTube developer policies](https://developers.google.com/youtube/terms/developer-policies)
- [Google token revocation](https://developers.google.com/identity/protocols/oauth2/web-server#tokenrevoke)
- [TikTok token management](https://developers.tiktok.com/docs/en/oauth-user-access-token-management)
- [TikTok webhook verification](https://developers.tiktok.com/docs/en/webhooks-verification)
- [Pinterest developer guidelines](https://policy.pinterest.com/en/developer-guidelines)
- [Pinterest OpenAPI specification](https://github.com/pinterest/api-description/blob/main/v5/openapi.yaml)
- [PostHog persons and deletion status API](https://posthog.com/docs/api/persons)
