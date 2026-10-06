# Meadow MCP API

Meadow exposes a stateless Streamable HTTP endpoint at `https://findmeadow.com/mcp`. It supports workspace API keys and, when `CLERK_MCP_ISSUER` is configured, Clerk OAuth sign-in for ChatGPT and other compatible MCP clients.

```http
Authorization: Bearer br_live_…
```

Keys have the same workspace access as their owner, are displayed once, and can be revoked immediately. Keep them in a secret manager. API keys remain suitable for private clients that can supply a fixed bearer header; public ChatGPT connections use OAuth instead.

## OAuth sign-in

The public metadata endpoint is `https://findmeadow.com/.well-known/oauth-protected-resource/mcp`; the root `/.well-known/oauth-protected-resource` is an alias. Metadata identifies `https://findmeadow.com/mcp` as the resource and the configured Clerk issuer as the authorization server. Clerk handles sign-in, explicit consent, S256 PKCE, authorization-code exchange, and refresh tokens.

The MCP accepts only RS256 OAuth access JWTs of type `at+jwt` or `application/at+jwt`, with a verified Clerk issuer, the exact MCP resource audience, an unexpired validity window, and a Clerk user subject. Browser session and OIDC ID tokens are rejected. Configure Clerk's **Include Audience** setting so the requested OAuth `resource` is included in `aud`. Opaque OAuth tokens are not supported by this verifier.

Every OAuth token needs `meadow:read`, which permits the read tools. Tools that change something need a second scope as well:

| Scope | Tools |
| --- | --- |
| `meadow:read` | `get_profile`, `list_projects`, `list_accounts`, `list_posts`, `get_post`, `get_account_options`, `preview_post`, `get_analytics` |
| `meadow:draft` | `create_draft` |
| `meadow:media` | `upload_media`, `create_upload_url` |
| `meadow:publish` | `publish_post`, `publish_draft` |

These permissions apply only to the authenticated user's existing workspace ownership; they never authorize reading or publishing to another user’s project. API keys are not scoped: a key has its owner's full access, as it does on the REST API. Account deletion blocks MCP access through the same privacy guard as API keys. Clerk-issued JWTs otherwise remain valid until expiry, even after the OAuth grant is revoked; configure token format/expiry and explain this limitation before launch.

Anonymous clients can initialize the protocol and inspect tool descriptors. They cannot retrieve a profile, project, account, post, analytics, upload media, create a draft or publish: each handler returns an OAuth linking challenge before touching workspace services. Invalid credentials receive HTTP 401 with a protected-resource metadata challenge. OAuth credentials missing a tool's second scope receive a tool error with an `insufficient_scope` challenge naming it. Tool descriptors declare the required scopes both at the root and in `_meta.securitySchemes`.

OAuth access tokens are bound to the `/mcp` resource and are not accepted by the REST API. An OAuth client that needs the REST upload route gets a one-time upload token from `create_upload_url` instead.

Deployment alone does not configure the Clerk OAuth client or complete marketplace review. See [deployment configuration](deployment.md#configure-mcp-oauth) for the required production provider settings.

## Tools

| Tool | Behavior |
| --- | --- |
| `get_profile` | Identifies the connected Meadow profile. |
| `list_projects` | Lists the profile's owned projects. |
| `list_accounts` | Lists cached connected-account data for a project. |
| `list_posts` | Lists drafts, scheduled posts, and publishing history with bounded pagination. |
| `get_post` | Returns one post by ID, with the status of each delivery. |
| `create_draft` | Saves one non-empty draft without publishing it. A stable `requestId` makes retries idempotent. |
| `get_account_options` | Fetches one account's current publishing options from its platform: TikTok privacy choices, interaction limits and permissions, Pinterest boards, and any known posting allowance. |
| `upload_media` | Adds an image, video, PDF, Word or PowerPoint file to a project and returns its media ID. |
| `create_upload_url` | Returns a one-time, 30-minute link for uploading one large local file. |
| `preview_post` | Validates a post against every selected account without queueing it. |
| `publish_post` | Publishes a post now or schedules it. A stable `requestId` makes retries idempotent. |
| `publish_draft` | Publishes or schedules a saved draft with its saved content and settings. |
| `get_analytics` | Returns cached project totals and compact account summaries without refreshing social providers. |

The tools do not connect or remove accounts, edit or cancel queued posts, or refresh analytics. Use the dashboard or the REST API for those.

## Uploading media

`upload_media` takes exactly one source:

- `url`: a public HTTP or HTTPS address on the standard port. Meadow downloads it, following up to three redirects. Every hop must resolve to a public address, and the checked address is pinned to the connection. The download stops at the upload size limit or after two minutes.
- `data`: base64 file bytes, optionally as a `data:` URL, up to 10 MB. Authenticated `/mcp` requests accept JSON bodies up to 16 MB for this.
- `file`: a file the user attached in ChatGPT. The tool declares it in `_meta["openai/fileParams"]`, so ChatGPT supplies `{ download_url, file_id }`, and Meadow downloads it like a `url`.

Files go through the same type, size and processing checks as dashboard uploads. For a large local file, `create_upload_url` returns an `uploadUrl` and an `Authorization` header. POST the file as multipart field `file`, at exactly the declared byte size, within 30 minutes; the response contains the media record. The link works once.

## Publishing

1. Upload any media and note the returned media IDs.
2. For TikTok and Pinterest accounts, call `get_account_options`.
3. Call `preview_post` with the same input you plan to publish. Fix every error it reports.
4. Call `publish_post` with a new `requestId`, or `publish_draft` for a saved draft.

Without `schedule`, a post goes out now. A scheduled post takes `schedule: { mode: "scheduled", localDateTime: "2026-10-08T09:30" }`, in the project's time zone unless `timeZone` is given. `overrides`, keyed by account ID, sets a different caption, title, format, time or platform settings per account. Platforms that need settings reject a post without them:

| Platform | `overrides[accountId].settings` |
| --- | --- |
| TikTok | `privacy` (one of `get_account_options`' `privacyOptions`) and `consent: true` for TikTok's Music Usage Confirmation. Or `deliveryMode: "inbox"` with `uploadConsent: true` to send it to the TikTok inbox. Optional: `allowComments`, `allowDuet`, `allowStitch`, `brandedContent`, `ownBrand`, `aiGenerated`, `autoMusic`. |
| YouTube | `privacy` (`public`, `unlisted` or `private`) and `madeForKids` (boolean). |
| Pinterest | `boardId` from `get_account_options`, optional `link`. |
| Bluesky | Optional `altText`. |
| Google Business | Optional `languageCode`. |
| Twitch, Kick | Optional `replies` (up to 10 follow-up messages) and `replyToMessageId`. |

The server instructions tell the assistant to ask the user for privacy, audience and consent choices rather than choosing them itself, and to confirm content, accounts and time before publishing.

Publishing queues one delivery per account and returns the post. A post is live only when `get_post` reports its deliveries as `published`. A retry with the same `requestId` and input returns the original post with `duplicate: true`. Reusing a `requestId` for different content is rejected. When validation fails, the tool error includes each destination's errors. Plan limits, rate limits and delivery behave exactly as they do for dashboard and REST submissions. Webhooks report each delivery's outcome.

## TikTok inbox delivery status

`list_posts` and `get_post` can return `awaiting_publish` when a TikTok inbox upload has been delivered and the user must finish editing and posting in TikTok. Treat it as a completed transfer, not a published post. A post containing a mixture of confirmed publications and completed inbox transfers also uses `awaiting_publish` once all its deliveries are complete; inspect individual deliveries for their outcomes.

TikTok deliveries expose `deliveryMode` (`direct` or `inbox`). An inbox handoff has `deliveredAt` rather than `publishedAt`; do not invent a public post URL, claim the post is live, or retry the transfer because it is awaiting the user's action. Direct publishing remains the default. An inbox item stays awaiting publication in Meadow after the user finishes in TikTok because Meadow does not infer that later publication from the transfer alone.

Saving a Meadow draft with `create_draft` is separate from sending content to the TikTok inbox. The MCP draft tool does not send media to TikTok.

## Local inspection

Run Meadow, create an API key in the dashboard, then start MCP Inspector:

```sh
npx @modelcontextprotocol/inspector
```

Select Streamable HTTP, enter `http://127.0.0.1:8787/mcp`, and configure the `Authorization` header with the API key. The endpoint accepts `POST`; stateless `GET` and `DELETE` requests return HTTP 405.
