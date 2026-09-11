# Deployment

Meadow needs a persistent Node server with FFmpeg and a writable SQLite/media directory. The frontend can be served by Express from the same HTTPS origin or by a Cloudflare Worker that routes backend paths to a Cloudflare Container. The backend cannot run directly in the Worker runtime because it uses child processes and local files.

The Docker and Compose files support self-hosting. Production on `findmeadow.com` is managed by Cloudflare Workers Builds: only pushes to `main` trigger a build and deployment, and preview builds are disabled. Do not run Wrangler production deployment commands from a local machine.

## Prepare configuration

1. Copy `backend/.env.example` to `backend/.env` and `frontend/.env.example` to `frontend/.env`.
2. Configure Clerk, add the production hostname to its allowed origins, set `VITE_CLERK_PUBLISHABLE_KEY` for the frontend build, and supply `CLERK_SECRET_KEY` and `CLERK_PUBLISHABLE_KEY` to the backend runtime.
3. Generate separate random values for `BRIDGE_ENCRYPTION_KEY` and `BRIDGE_MEDIA_SIGNING_KEY`.
4. Set `BRIDGE_APP_URL` and `BRIDGE_PUBLIC_URL` to the canonical public HTTPS origin without a trailing path. Set `BRIDGE_TRUST_PROXY` to the exact trusted proxy hop count.
5. Supply the platform application credentials and callbacks described in [platforms.md](platforms.md). Leave unfinished platforms disabled through `BRIDGE_DISABLED_PLATFORMS` until their applications are approved and tested.

Never copy runtime secrets into `VITE_*` variables. The Clerk publishable key and analytics project tokens are public frontend build inputs. Do not change the encryption key without migrating or re-encrypting stored credentials. Keep copies of signing and encryption keys separate from data backups.

Workspace API keys are created from Configuration → API Keys. The full key is displayed once; store it in the client's secret manager and send it as `Authorization: Bearer br_live_…`. Revocation immediately stops new authenticated requests.

## Build and run

From the repository root on a Docker host:

```sh
docker compose --env-file frontend/.env up --build -d
```

Compose passes Clerk and optional PostHog public settings to the frontend build and supplies backend secrets only at runtime. It mounts `bridge-data` at `/data`, runs as the unprivileged Node user, and exposes the service at `127.0.0.1:8787`. Put an HTTPS reverse proxy in front of it and preserve the named volume across updates.

The reverse proxy must support large request bodies, media byte ranges, and long upload timeouts. Set its upload limit consistently with `BRIDGE_MAX_UPLOAD_MB` (default 1 GiB). Provider retrieval of signed `/media/...` URLs and `/oauth/...` callbacks must be publicly reachable without a login wall.

Allow outbound HTTPS to Clerk, enabled providers, and Bluesky identity/PDS endpoints. Start with one container. Reserve disk space for uploaded media and generated derivatives, then observe CPU, memory, disk, and queue latency before increasing workload.

The `/health` route verifies that the process responds. It does not verify platform credentials, provider quota, external service status, or available disk space.

## Updates, backups, and recovery

- Pause new publishing with `BRIDGE_PUBLISHING_ENABLED=false` during a controlled migration; retain the persistent volume and encryption key.
- Stop the application before a filesystem backup of `/data`, or use SQLite's online backup API with a coordinated media snapshot. Copying only `bridge.sqlite` while WAL writes are active can miss transactions.
- Back up the database and media together. The database contains encrypted tokens, and the separate encryption key is required to restore connections.
- Allow at least 40 seconds for shutdown. Claims that outlive the process recover after their lease expires. Check `needs_review` deliveries on the social account before approving a retry.
- Monitor storage and worker error logs. Uploaded media and history have no automatic retention policy in this release.

## Live acceptance before public launch

These checks require actual provider credentials and approved test accounts:

1. Sign up and confirm that two users cannot access each other's projects or signed media URLs.
2. Connect each enabled provider, select the intended profile, page, channel, or location, and test reconnection and revocation.
3. Publish a permitted test item for each enabled format and verify its content, privacy, and status on the platform.
4. Compare supported metrics with provider results and confirm that unavailable or delayed values stay marked as unavailable.
5. Schedule a small test set, restart the server while work is queued, and verify continued delivery and permitted rate-limit behavior.
6. Complete provider app details, domain verification, privacy and deletion instructions, access reviews, and public-use approvals.

## Verified locally

- Backend domain, authenticated API, provider contract, and media tests.
- FFmpeg video probing and thumbnail creation on synthetic media.
- Frontend unit tests and production bundle.

These checks do not claim a live social publication, Docker image build, or production deployment.
