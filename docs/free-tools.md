# Free social media tools

The public hub lives at `/free-tools/`. Ten tools, the media guide index, and seven platform guides are described in `frontend/src/tools/freeToolsCatalog.js`. The existing TikTok roast is also linked from the hub.

The catalog feeds app routing, static prerendering, page titles/descriptions, canonicals, and the existing sitemap. `check-public-html.mjs` verifies the routes, metadata, structured data, and links from the hub. All tool pages remain readable without JavaScript; interactive controls need JavaScript. The tool interface and ZIP library load separately from the main application.

## Processing

- UTM links, Unicode formatting, title checks, image decoding, cropping, and exports run locally. Files are not uploaded. Image input is limited to JPG, PNG, and WebP, 20 MB, and 40 megapixels. Custom exports are 100–4096 pixels per side. Multi-image exports use one continuous source crop and export each tile independently to bound canvas memory.
- Grid exports use three columns and 1–4 rows. Filenames indicate reverse posting order; carousel exports use 2–10 slides in forward order. Platform thumbnail crops and pinned posts can alter a profile grid after publishing.
- `POST /api/free-tools/check-handle` validates an Instagram/TikTok handle and requests a fixed public profile URL with redirects disabled, a timeout, and a response-size cap. It only returns `found` from matching structured identity evidence. Blocked, missing, private, malformed, or failed requests return `unconfirmed`. No response asserts registration availability.
- `POST /api/free-tools/generate` accepts bounded topic text and returns caption or tag suggestions. It uses the existing `ROAST_AI` binding with `@cf/meta/llama-3.3-70b-instruct-fp8-fast` and the same `ROAST_BUDGET` `daily` object as the roast: a combined maximum of 100 AI calls per UTC day. Unavailable or invalid AI responses produce explicitly labeled template/keyword suggestions and a non-sensitive reason code. The browser can also generate those fallbacks if the request fails. Verify model updates through an actual remote Workers AI binding: REST aliases can route differently and may continue to respond after a binding model is retired.
- The independent `FREE_TOOLS_LIMITER` binding permits 10 public requests per IP per minute. Missing limiter configuration fails closed. Browser origins are restricted to Meadow's production hosts. Responses are `no-store`; internal profile-evidence caches last 15 minutes for a match and 60 seconds for an unconfirmed result. Inputs are not explicitly logged or stored by these handlers.

## Validation and release

Run the repository's required frontend/backend tests and production build using Node 22. Unit coverage includes URL preservation, handle validation, Unicode conversion, title/tag limits, slice geometry, endpoint validation, upstream failure behavior, and AI budgeting/fallbacks. Check desktop and phone layouts, PNG dimensions, individual/ZIP downloads, and edited/generated content in a browser. Normal release is the main-branch Cloudflare Workers Builds pipeline; no secrets or manual production deployment are needed for these tools.

Media dimensions are working canvases, not universal upload limits. Each platform guide links to its source and includes a review date. Recheck the source and any scheduling/API constraints before revising a guide's recommendations.
