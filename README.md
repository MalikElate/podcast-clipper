# Meadow

Meadow is a publishing workspace for creating, scheduling, and analyzing social posts. Each user's accounts, media, posts, queue, and analytics stay isolated in a private default workspace.

## Implemented workflows

- Clerk sign-in, with ownership enforced on every project API.
- Direct provider adapters for Instagram, TikTok, YouTube, Facebook Pages, X, LinkedIn, Pinterest, Threads, Bluesky, and Google Business Profile.
- Saved social connections survive sign-out and container replacement, with proactive token renewal. Provider revocation, expired grants, or changed permissions can still require reconnection.
- Media upload inside the composer, destination-specific formats and settings, validation, and queue preview.
- Single-post composition with manual date, time, and timezone scheduling.
- Durable deliveries for every account, automatic quota overflow queues, queue editing, deletion, reordering, and independent retries.
- Per-post and per-account analytics, combined totals, post comparisons, and best-performing posts. Missing metrics remain unavailable instead of becoming zero.
- Public pricing, Stripe subscription Checkout, webhook-backed billing status, and Stripe Customer Portal management.
- Configuration screens for project settings, service readiness, API-key management, plan comparison, and Privacy & Account.
- Platform-specific privacy notices before Pinterest, TikTok, YouTube, and Google Business Profile connections, durable account and connection erasure, TikTok authorization-removal webhooks, and platform data retention.

The working clipping studio, affiliate program, multi-workspace controls, standalone media library, and bulk composer controls are deferred. Their complete implementations are preserved on the `deferred-features` branch and are absent from the active application code. The Clipping studio page remains as a coming-soon notice. Collaborators and paid-plan entitlement enforcement are also deferred. See [deferred features](docs/deferred-features.md) for the preserved scope and [platform setup and formats](docs/platforms.md) for provider limitations.

The local preview disables real account connections and publishing. It does not fabricate accounts, published posts, quotas, or analytics.

## Cloudflare deployment

Production combines a Cloudflare Worker and a named Cloudflare Container. The Worker serves the Vite application and routes backend paths to the Express container. Cloudflare Workers Builds deploys only the `main` branch for `findmeadow.com` and `www.findmeadow.com`; pushing to `main` is the production deployment path.

The Cloudflare backend commits SQLite snapshots to its Durable Object and saves original media, thumbnails, and prepared variants in private R2 storage. The container restores the committed database before serving and downloads media into a local cache as needed. Successful API responses wait for database persistence. The current implementation supports one active backend writer and SQLite snapshots up to 32 MiB; unavailable storage or an oversized snapshot fails closed. Follow [deployment instructions](docs/deployment.md) to preserve existing data before the first durable-storage rollout, and keep encryption and signing keys stable across replacements.

The frontend build requires a Clerk publishable key. Product analytics scripts are disabled:

```dotenv
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
```

The backend requires Clerk, media-signing, encryption, and enabled platform credentials. The complete list is in [backend/.env.example](backend/.env.example). Add private values with `npx wrangler secret put NAME` or in the Cloudflare dashboard; never commit them.

## Local development

Requirements: Node.js 22.12 or newer, npm, and FFmpeg/ffprobe for uploaded-video inspection and previews.

```sh
npm install
npm ci --prefix frontend
npm ci --prefix backend
cp frontend/.env.example frontend/.env
cp backend/.env.example backend/.env
```

Run the backend and frontend in separate terminals:

```sh
npm run dev --prefix backend
npm run dev --prefix frontend
```

Vite proxies backend routes to `http://localhost:8787`. For development without Clerk credentials, set `BRIDGE_LOCAL_PREVIEW=1` in the backend and `VITE_BRIDGE_LOCAL_PREVIEW=true` in the frontend. Preview mode binds the backend to loopback and disables connections and publishing.

## Validation

```sh
npm run check
```

This runs the frontend and backend tests and creates the production frontend bundle. Provider tests use simulated responses and do not publish to real accounts.

## Architecture

[Architecture and extension points](docs/architecture.md) describes service boundaries, storage, queue state transitions, and the provider contract. [Deployment instructions](docs/deployment.md) covers secrets, reverse proxies, backups, and remaining live acceptance checks.

See [privacy operations](docs/privacy-operations.md) for required deletion secrets, webhooks, maintenance, processor follow-up, and backup handling before rollout.

Uploaded media remains until deleted. Removing a connection also erases its stored delivery history and metrics; account deletion removes every owned workspace. Otherwise Meadow retains published history, subject to platform-specific API-data retention; deleting content from a social platform is outside this release. Media links are bearer links and expire after 30 minutes for browser access or 24 hours for provider retrieval.
