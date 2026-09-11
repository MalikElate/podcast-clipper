# Deployment

Bridge needs a Node/Python server with FFmpeg and a writable SQLite/media directory. The frontend can be served by Express from the same HTTPS origin, or by a Cloudflare Worker that routes backend paths to a Cloudflare Container. The backend itself cannot run in the Worker runtime because it uses child processes and local files.

The Docker/Compose files are provided for this topology. They were not built in this workspace because Docker is unavailable here. The native backend test suite and frontend build are validated separately. Nothing has been deployed to a public host by this implementation.

## Prepare configuration

1. Copy `backend/.env.example` to `backend/.env` and `frontend/.env.example` to `frontend/.env`.
2. Configure Clerk, add the production hostname to the allowed origins, set `VITE_CLERK_PUBLISHABLE_KEY` for the frontend build, and supply `CLERK_SECRET_KEY` and `CLERK_PUBLISHABLE_KEY` to the backend runtime.
3. Generate two independent random secrets. Store one as `BRIDGE_ENCRYPTION_KEY` and the other as `BRIDGE_MEDIA_SIGNING_KEY`. This command produces one key; run it separately for each:

   ```bash
   node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64')+'\n')"
   ```

4. Set `BRIDGE_APP_URL` and `BRIDGE_PUBLIC_URL` to the same canonical public HTTPS origin for a single-origin deployment. Do not include a trailing path. Set `BRIDGE_TRUST_PROXY` to the exact trusted proxy hop count.
5. Supply the platform application credentials and callbacks described in [platforms.md](platforms.md). Leave unfinished platforms disabled through `BRIDGE_DISABLED_PLATFORMS` until their applications are approved and tested.
6. For clipping, supply RapidAPI subscriptions/key and a Gemini key. The retained downloader uses both Cloud API Hub - YouTube Downloader and YouTube MP3. Select a Gemini model available to your account. Whisper and FFmpeg execute on the server; Gemini receives the timestamped transcript for clip selection.

Never copy runtime secrets into `VITE_*` variables. The Clerk publishable key and PostHog project token are public frontend build inputs. Do not change the encryption key without migrating or re-encrypting stored credentials; doing so makes existing connections unreadable. Keep backups of the keys separately from data backups.

Workspace API keys are created from Configuration → API Keys. The full key is displayed only once; store it in the client's secret manager and send it as `Authorization: Bearer br_live_…`. Revoking the key immediately stops new authenticated requests. Treat it with the same care as a Clerk session because it has the creating user's workspace access.

## Build and run

From the repository root on a Docker host:

```bash
docker compose --env-file frontend/.env up --build -d
```

The Compose file passes Clerk and optional PostHog public settings to the frontend build and supplies backend secrets only at runtime. It mounts `bridge-data` at `/data`, runs as the unprivileged Node user, and exposes the API only at `127.0.0.1:8787`. Put an HTTPS reverse proxy in front of it. Persist the named volume across updates; do not use `docker compose down -v` unless deleting all Bridge data is intended.

The reverse proxy must support large request bodies, media byte ranges, ZIP streaming, and long upload timeouts. Set its upload body limit consistently with `BRIDGE_MAX_UPLOAD_MB` (default 1 GiB). Provider retrieval of signed `/media/...` URLs and `/oauth/...` endpoints must be publicly reachable without a login wall. Signed URLs authorize only a particular media variant until expiry.

Allow outbound HTTPS to Clerk, the configured providers, the downloader providers, Gemini, Bluesky identity/PDS endpoints, and the Whisper model source. Start with one container. Reserve disk space for the source, extracted audio, generated clips, derivatives, and a cached Whisper model. Inspect actual CPU, memory, disk and queue latency before choosing capacity or increasing workload.

The `/health` route verifies that the application process is responding. It does not verify platform credentials, remaining provider quota, external service status, or available disk space.

## Updates, backups and recovery

- Pause new publishing with `BRIDGE_PUBLISHING_ENABLED=false` when performing a controlled migration; keep the original persistent volume and encryption key.
- Stop the application before a simple filesystem backup of `/data`, or use SQLite's online backup API plus a coordinated media snapshot. Copying only `bridge.sqlite` while WAL writes are active can miss transactions.
- Back up database and media together. The database contains encrypted tokens; the separate encryption key is required to restore connections.
- Allow at least 40 seconds for shutdown. Claims that outlive the process are recovered after their lease expires. Check `needs_review` deliveries on the social account before approving a retry.
- Source/audio scratch files are removed when a clipping job finishes. Abrupt termination can leave a job directory under `/data/clipping`; remove it only after confirming no worker owns that job. Generated clips live under `/data/media` and remain available independently.
- Monitor storage and worker error logs. Durable user media and history do not have an automatic retention/deletion policy in this release.

## Live acceptance before public launch

The remaining checks require actual provider credentials and approved test accounts. They were not run here.

1. Sign up/sign in and confirm two separate users cannot access each other's projects or signed download issuance.
2. Connect each enabled provider, select the intended profile/page/channel/location, and test reconnection/revocation.
3. Publish a permitted test item for each enabled format and verify its content, privacy and reported status directly on the platform.
4. Check supported metrics against provider results; verify unavailable or delayed metrics remain clearly marked.
5. Schedule a small test batch, restart the server with queued work, and verify continued delivery. Check rate-limit behavior using permitted test responses/allowances rather than deliberately spamming a real account.
6. Generate a clip from content you control, download one and a ZIP, and publish a selected clip. This verifies the external downloader, real Whisper environment and selected Gemini model together.
7. Complete provider-required app details, domain verification, privacy/data-deletion instructions, access reviews and public-use approvals. These belong to your platform applications and deployment configuration, not to hard-coded client credentials.

## Verified locally

- Backend domain, API, provider contract, clipping and downloader tests.
- Actual FFmpeg audio extraction, 1080×1920 subtitle rendering, video probing and thumbnail creation on synthetic media.
- Frontend unit tests and production bundle.
- Dependency audit and source whitespace checks.

No live social publication, real Whisper/Gemini/downloader end-to-end clipping run, Docker image build, or production deployment is claimed by those checks.
