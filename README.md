# Bridge

Bridge is a publishing workspace with a standalone podcast clipping studio. Projects keep each user's social accounts, media, posts, queue, and analytics separate. The original Node/Express, React/Vite, Firebase, Python, and FFmpeg stack is preserved.

## Implemented workflows

- Firebase Google and email/password sign-in, with ownership enforced on every project API.
- Direct provider adapters for Instagram, TikTok, YouTube, Facebook Pages, X, LinkedIn, Pinterest, Threads, Bluesky, and Google Business Profile. No third-party publishing intermediary is used.
- A private media library for supported images, videos, and documents; account-specific format validation, titles, captions, and publishing settings.
- Single and bulk composition, up to 100 posts per submission, with a validation and queue preview before submission.
- Manual date/time/timezone scheduling, including explicit handling of daylight-saving transitions.
- Separate durable deliveries for every account, automatic quota overflow queues, subsequent submissions joining the existing queue, queue editing/deletion/reordering, and independent retries.
- Per-post and per-account analytics, the same post across accounts, combined post totals, comparison of selected posts, and an account's best-performing posts. Missing metrics remain unavailable instead of becoming zero.
- YouTube source clipping with local Whisper timestamps, Gemini moment selection, vertical FFmpeg rendering, subtitles, clip ranking, and individual or bulk ZIP downloads. Clips can be downloaded without connecting social accounts or publishing anything.

Collaborators and pricing/billing are intentionally deferred. Provider restrictions mean the publishing API supports a subset of each platform's native app features; see [platform setup and formats](docs/platforms.md).

## Current readiness

The application and native provider adapters are implemented locally. Automated checks cover the domain, authenticated HTTP API, provider contracts using simulated responses, real FFmpeg rendering, and the original downloader tests. No real social-account connection or live publication was performed. Production use still requires Firebase configuration, platform applications/permissions, public HTTPS callbacks/media, and a persistent server.

The local preview disables real account connections and publishing. It does not fabricate accounts, published posts, quotas, or analytics.

## Run locally

Requirements: Node 22.12+, npm, FFmpeg/ffprobe with ASS subtitle support, and Python 3. Clipping also needs the Python dependencies and external API keys; publishing-only operation does not require Gemini or RapidAPI.

```bash
npm --prefix backend ci
cp backend/.env.example backend/.env
python3 -m venv backend/.venv
backend/.venv/bin/pip install -r backend/requirements.txt
```

Set `PYTHON_BIN` to the absolute path of that virtual environment's Python. Fill in the backend settings described in [deployment](docs/deployment.md). The first transcription downloads the selected Whisper model.

```bash
npm --prefix frontend ci
cp frontend/.env.example frontend/.env
```

Enable Google and/or Email/Password in Firebase Authentication, add the app's domain to Firebase's authorized domains, and fill in the frontend web configuration. Supply the corresponding Firebase Admin service account privately to the backend. Browser Firebase configuration is public; Admin credentials and social-app secrets must remain server-side.

Run each process in a separate terminal:

```bash
cd backend
npm run dev
```

```bash
cd frontend
npm run dev
```

Open [Bridge locally](http://localhost:5173). Vite proxies `/api`, `/media`, `/oauth`, and `/downloads` to port 8787.

For an explicit local preview without Firebase credentials, run the backend with `BRIDGE_LOCAL_PREVIEW=1` and Vite with `VITE_BRIDGE_LOCAL_PREVIEW=true`. The preview backend binds only to loopback, requires a special preview request header, and disables connections and publishing. Never use a preview frontend build for production.

## Configuration

Sanitized templates: [backend/.env.example](backend/.env.example) and [frontend/.env.example](frontend/.env.example).

- `BRIDGE_ENCRYPTION_KEY`: base64-encoded 32-byte key for encrypted social credentials.
- `BRIDGE_MEDIA_SIGNING_KEY`: a separate strong random secret for expiring media links.
- `BRIDGE_PUBLIC_URL`: externally accessible HTTPS API/media origin; also the callback origin.
- `BRIDGE_APP_URL`: browser app origin.
- `BRIDGE_DATA_DIR`: persistent database, media, and temporary clipping storage.
- `BRIDGE_DISABLED_PLATFORMS`: comma-separated adapter IDs to hide/disable.
- `BRIDGE_CLIPPING_ENABLED=false`: remove the clipping tool and stop its worker.
- `BRIDGE_PUBLISHING_ENABLED=false`: pause the publishing worker while keeping saved queues.

A public deployment can serve the frontend and API from one origin. The included Dockerfile and Compose configuration provide that topology. [Deployment instructions](docs/deployment.md) include secrets, persistent storage, reverse proxy expectations, backups, and the remaining live acceptance checks.

## Validation

```bash
cd backend
npm test
```

```bash
cd frontend
npm test
npm run build
```

FFmpeg must be installed for the media integration tests. Provider tests use simulated network responses and test credentials; they do not contact or post to real accounts. The clipping integration test uses a synthetic source and simulated transcription/AI selections, with actual audio extraction, caption rendering, media probing, durable storage, and download tickets.

## Extending Bridge

[Architecture and extension points](docs/architecture.md) describe service boundaries, the provider contract, storage, queue state transitions, and how to add or remove features. `BridgeApplication` is the composition root; services receive their dependencies through constructors rather than locating global singletons.

```text
backend/src/bridge/
  BridgeApplication.js       composition and authenticated HTTP routes
  core/                     errors, credential vault, leases, bounded processes
  storage/                  SQLite repository and private media storage
  services/                 projects, accounts, posts, quotas, jobs, analytics
  platforms/                base contract, registry, transport, native adapters
backend/src/lib/            original downloader, FFmpeg, Whisper, Gemini pipeline
frontend/src/bridge/        project shell and feature modules
backend/test/              domain, API, providers, clipping and downloader tests
```

Source videos and audio are removed after each clipping job. Generated clips and uploaded media remain until deleted. Bridge retains published history locally; deleting content from a social platform is outside this initial release. Media links are bearer links and expire after 30 minutes for browser access or 24 hours for provider retrieval. ZIP download tickets expire after two minutes and are single-use.
