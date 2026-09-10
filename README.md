# Podcast Clipper

Podcast Clipper turns a public YouTube podcast into ranked, subtitled vertical clips. The React frontend uses Clerk for authentication and PostHog for product analytics. The media pipeline runs in a Cloudflare Container so it can use Node.js, Python, FFmpeg, and faster-whisper.

## Cloudflare architecture

- A Cloudflare Worker serves the compiled Vite app as static assets.
- Requests under `/api/*` and `/files/*` are routed to one named Cloudflare Container.
- The container runs the Express backend from `backend/Dockerfile` on port 8787.
- The named instance keeps in-memory job state and generated clips together while it is awake.
- Cloudflare Workers Builds is connected to the GitHub `main` branch. Pushing to `main` is the only deployment trigger.

Cloudflare Containers requires a Workers Paid plan. The `standard-2` instance provides 1 vCPU, 6 GiB RAM, and 12 GB disk for video processing. The instance sleeps after two idle hours, so its in-memory history and generated files are temporary. A later production-hardening pass should move job state to durable storage and clips to R2.

## Required configuration

The frontend build needs these public variables:

```dotenv
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
VITE_POSTHOG_KEY=phc_...
VITE_POSTHOG_HOST=https://us.i.posthog.com
```

The Worker needs these secrets, which it passes to the backend container:

```text
CLERK_SECRET_KEY
CLERK_PUBLISHABLE_KEY
RAPIDAPI_KEY
GEMINI_API_KEY
```

Add each secret with `npx wrangler secret put NAME`, or configure it in the Cloudflare dashboard. Never commit secret values.

The RapidAPI key must be subscribed to the two providers used by the backend:

- Cloud API Hub - YouTube Downloader
- YouTube MP3

## Local development

Requirements:

- Node.js 22.12 or newer
- FFmpeg and ffprobe on `PATH`
- Python 3 with the packages in `backend/requirements.txt`

Create `frontend/.env` from `frontend/.env.example` and `backend/.env` from `backend/.env.example`, then install dependencies:

```sh
npm install
npm ci --prefix frontend
npm ci --prefix backend
python3 -m pip install -r backend/requirements.txt
```

Run the backend and frontend in separate terminals:

```sh
npm run dev --prefix backend
npm run dev --prefix frontend
```

Vite proxies `/api` and `/files` to `http://localhost:8787` during development.

## Checks

```sh
npm run check
```

This runs the frontend and backend tests and creates the production frontend bundle.

## Deployment

The Cloudflare project uses `wrangler.jsonc` and `cloudflare/worker.js`. For a local deployment, run:

```sh
npm run build
npm run deploy
```

For GitHub-triggered deployment, connect `MalikElate/podcast-clipper` in Cloudflare Workers Builds, select `main` as the production branch, set the build command to `npm run build`, and set the deploy command to `npm run deploy`.

## Current product limitations

- Job state and output files are local to the active container and disappear after the instance is replaced or sleeps.
- The API has no billing, quotas, or per-user processing limits yet.
- Rendered clip URLs are shareable by URL.
- The vertical reframe uses a center crop or padded layout and does not track faces.
- RapidAPI receives the YouTube video ID, Gemini receives the timestamped transcript, and Whisper/FFmpeg processing runs in the Cloudflare Container.
- Only process media you are authorized to download and reuse.
