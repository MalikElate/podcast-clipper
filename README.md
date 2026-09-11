# Bridge

Bridge is a publishing workspace for planning, scheduling, and measuring social content across multiple platforms. It also contains a podcast clipping pipeline that downloads a permitted YouTube source, transcribes it locally with Whisper, asks Gemini to select moments, and renders vertical subtitled clips with FFmpeg.

## Product workflows

- Clerk sign-in, with ownership enforced on every project API.
- Project-scoped accounts, media, posts, queues, analytics, and API keys.
- Native provider adapters for Instagram, TikTok, YouTube, Facebook Pages, X, LinkedIn, Pinterest, Threads, Bluesky, and Google Business Profile.
- Single and bulk composition for up to 100 posts, with per-account validation and independent delivery state.
- Manual date, time, and timezone scheduling with daylight-saving handling.
- Private media storage, expiring media links, and single-use ZIP download tickets.
- Local Whisper timestamps, Gemini moment selection, FFmpeg rendering, subtitles, clip ranking, and ZIP downloads.

Collaborators and payment-provider checkout are deferred. The Billing screen describes planned tiers but cannot change a subscription. Platform APIs support a subset of each native app's features; see [platform setup and formats](docs/platforms.md).

## Cloudflare deployment

The production topology combines a Cloudflare Worker and one named Cloudflare Container:

- The Worker serves the compiled Vite app.
- `/api/*`, `/media/*`, `/oauth/*`, `/downloads/*`, and `/health` are routed to the Express backend container.
- The container runs Node.js, SQLite, Python, FFmpeg, and faster-whisper on port 8787.
- Cloudflare Workers Builds deploys the `main` branch. Pushing to `main` is the only production deployment path; non-production builds are disabled.

The configured `standard-2` container requires a Workers Paid plan. Bridge data and generated media are stored on the container filesystem. Back them up or move them to durable external storage before relying on the deployment for production records; container replacement can remove local state.

The frontend build needs:

```dotenv
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
VITE_POSTHOG_KEY=phc_...
VITE_POSTHOG_HOST=https://us.i.posthog.com
```

The Worker must have these backend secrets:

```text
CLERK_SECRET_KEY
CLERK_PUBLISHABLE_KEY
BRIDGE_ENCRYPTION_KEY
BRIDGE_MEDIA_SIGNING_KEY
RAPIDAPI_KEY
GEMINI_API_KEY
```

Add platform client IDs and secrets for each enabled provider. The complete list is in [backend/.env.example](backend/.env.example). Add secrets with `npx wrangler secret put NAME` or in the Cloudflare dashboard. Never commit secret values.

The RapidAPI key must be subscribed to the two downloader providers used by the backend: Cloud API Hub - YouTube Downloader and YouTube MP3.

Cloudflare Workers Builds is connected to `MalikElate/podcast-clipper` with `main` as the production branch, `npm run build` as the build command, and `npx wrangler deploy` as the remote deploy command. Preview builds are disabled. Do not run production deployment commands from a local machine; push the reviewed commit to `main` and let Cloudflare build and deploy it. The Worker is configured for `findmeadow.com` and `www.findmeadow.com`.

## Local development

Requirements:

- Node.js 22.12 or newer
- FFmpeg and ffprobe with ASS subtitle support
- Python 3 and the packages in `backend/requirements.txt`

Install dependencies and create local configuration:

```sh
npm install
npm ci --prefix frontend
npm ci --prefix backend
python3 -m pip install -r backend/requirements.txt
cp frontend/.env.example frontend/.env
cp backend/.env.example backend/.env
```

Run the backend and frontend in separate terminals:

```sh
npm run dev --prefix backend
npm run dev --prefix frontend
```

Vite proxies the backend routes to `http://localhost:8787`. For development without Clerk credentials, set `BRIDGE_LOCAL_PREVIEW=1` in the backend and `VITE_BRIDGE_LOCAL_PREVIEW=true` in the frontend. Preview mode binds the backend to loopback and disables connections and publishing.

The Compose setup builds the frontend and backend into one image, mounts persistent data at `/data`, and exposes the service at `127.0.0.1:8787`. Set `VITE_CLERK_PUBLISHABLE_KEY` before building and put private runtime values in `backend/.env`.

## Validation

```sh
npm run check
```

This runs frontend and backend tests and creates the production frontend bundle. Provider tests use simulated responses and do not publish to real accounts. The clipping integration test uses a synthetic source and real FFmpeg processing.

## Configuration and extension

Use [backend/.env.example](backend/.env.example) and [frontend/.env.example](frontend/.env.example) as sanitized templates. The main Bridge settings are:

- `BRIDGE_ENCRYPTION_KEY`: a base64-encoded 32-byte key for social credentials.
- `BRIDGE_MEDIA_SIGNING_KEY`: a separate random secret for expiring media links.
- `BRIDGE_PUBLIC_URL`: the public API, media, and OAuth callback origin.
- `BRIDGE_APP_URL`: the browser app origin.
- `BRIDGE_DATA_DIR`: the SQLite, media, and clipping-data directory.
- `BRIDGE_DISABLED_PLATFORMS`: comma-separated adapter IDs to hide.
- `BRIDGE_CLIPPING_ENABLED=false`: disable the clipping worker.
- `BRIDGE_PUBLISHING_ENABLED=false`: pause publishing while retaining queued work.

[Architecture and extension points](docs/architecture.md) describes the provider contract, storage, queues, and service boundaries. [Deployment instructions](docs/deployment.md) covers secrets, reverse proxies, backups, and live acceptance checks.

Only process media you are authorized to download, publish, and reuse.
