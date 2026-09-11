# Meadow

Meadow is a publishing workspace for creating, scheduling, and analyzing social posts. Each user's accounts, media, posts, queue, and analytics remain isolated in a private default workspace.

## Implemented workflows

- Firebase Google and email/password sign-in, with ownership enforced on every project API.
- Direct provider adapters for Instagram, TikTok, YouTube, Facebook Pages, X, LinkedIn, Pinterest, Threads, Bluesky, and Google Business Profile. No third-party publishing intermediary is used.
- A private media library for supported images, videos, and documents; account-specific format validation, titles, captions, and publishing settings.
- Single-post composition with destination-specific formats and settings, plus validation and queue preview before submission.
- Manual date/time/timezone scheduling, including explicit handling of daylight-saving transitions.
- Separate durable deliveries for every account, automatic quota overflow queues, subsequent submissions joining the existing queue, queue editing/deletion/reordering, and independent retries.
- Per-post and per-account analytics, the same post across accounts, combined post totals, comparison of selected posts, and an account's best-performing posts. Missing metrics remain unavailable instead of becoming zero.
- Configuration screens for workspace/project settings, service readiness, API-key management, and plan comparison. API keys are stored as hashes, shown only once, and can authenticate REST and CLI requests until revoked.

The working clipping studio, affiliate program, multi-workspace controls, standalone media library, and bulk composer controls are deferred. Their complete implementations are preserved on the `deferred-features` branch and are absent from the active application code. The Clipping studio page remains as a coming-soon notice. Collaborators and payment-provider checkout are also deferred. The Billing screen presents the planned tiers but cannot change a subscription yet. Provider restrictions mean the publishing API supports a subset of each platform's native app features; see [platform setup and formats](docs/platforms.md).

## Current readiness

The application and native provider adapters are implemented locally. Automated checks cover the domain, authenticated HTTP API, provider contracts using simulated responses, and media processing. No real social-account connection or live publication was performed. Production use still requires Firebase configuration, platform applications/permissions, public HTTPS callbacks/media, and a persistent server.

The local preview disables real account connections and publishing. It does not fabricate accounts, published posts, quotas, or analytics.

## Run locally

Requirements: Node 22.12+, npm, and FFmpeg/ffprobe for video inspection and preview generation.

```bash
npm --prefix backend ci
cp backend/.env.example backend/.env
```

Fill in the backend settings described in [deployment](docs/deployment.md).

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

Open [Meadow locally](http://localhost:5173). Vite proxies `/api`, `/media`, and `/oauth` to port 8787.

For an explicit local preview without Firebase credentials, run the backend with `BRIDGE_LOCAL_PREVIEW=1` and Vite with `VITE_BRIDGE_LOCAL_PREVIEW=true`. The preview backend binds only to loopback, requires a special preview request header, and disables connections and publishing. Never use a preview frontend build for production.

## Configuration

Sanitized templates: [backend/.env.example](backend/.env.example) and [frontend/.env.example](frontend/.env.example).

- `BRIDGE_ENCRYPTION_KEY`: base64-encoded 32-byte key for encrypted social credentials.
- `BRIDGE_MEDIA_SIGNING_KEY`: a separate strong random secret for expiring media links.
- `BRIDGE_PUBLIC_URL`: externally accessible HTTPS API/media origin; also the callback origin.
- `BRIDGE_APP_URL`: browser app origin.
- `BRIDGE_DATA_DIR`: persistent database and media storage.
- `BRIDGE_DISABLED_PLATFORMS`: comma-separated adapter IDs to hide/disable.
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

FFmpeg must be installed for the media integration tests. Provider tests use simulated network responses and test credentials; they do not contact or post to real accounts.

## Extending Meadow

[Architecture and extension points](docs/architecture.md) describe service boundaries, the provider contract, storage, queue state transitions, and how to add or remove features. `BridgeApplication` is the composition root; services receive their dependencies through constructors rather than locating global singletons.

```text
backend/src/bridge/
  BridgeApplication.js       composition and authenticated HTTP routes
  core/                     errors, credential vault, leases, bounded processes
  storage/                  SQLite repository and private media storage
  services/                 projects, accounts, posts, quotas, jobs, analytics
  platforms/                base contract, registry, transport, native adapters
frontend/src/bridge/        project shell and feature modules
backend/test/              domain, API, provider, and media tests
```

Uploaded media remains until deleted. Meadow retains published history locally; deleting content from a social platform is outside this initial release. Media links are bearer links and expire after 30 minutes for browser access or 24 hours for provider retrieval.
