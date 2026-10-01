# Meadow MCP API

Meadow exposes a stateless Streamable HTTP endpoint at `https://findmeadow.com/mcp`. It supports workspace API keys and, when `CLERK_MCP_ISSUER` is configured, Clerk OAuth sign-in for ChatGPT and other compatible MCP clients.

```http
Authorization: Bearer br_live_…
```

Keys have the same workspace access as their owner, are displayed once, and can be revoked immediately. Keep them in a secret manager. API keys remain suitable for private clients that can supply a fixed bearer header; public ChatGPT connections use OAuth instead.

## OAuth sign-in

The public metadata endpoint is `https://findmeadow.com/.well-known/oauth-protected-resource/mcp`; the root `/.well-known/oauth-protected-resource` is an alias. Metadata identifies `https://findmeadow.com/mcp` as the resource and the configured Clerk issuer as the authorization server. Clerk handles sign-in, explicit consent, S256 PKCE, authorization-code exchange, and refresh tokens.

The MCP accepts only RS256 OAuth access JWTs of type `at+jwt` or `application/at+jwt`, with a verified Clerk issuer, the exact MCP resource audience, an unexpired validity window, and a Clerk user subject. Browser session and OIDC ID tokens are rejected. Configure Clerk's **Include Audience** setting so the requested OAuth `resource` is included in `aud`. Opaque OAuth tokens are not supported by this verifier.

`meadow:read` permits the six read tools. `create_draft` requires both `meadow:read` and `meadow:draft`. These permissions apply only to the authenticated user's existing workspace ownership; they never authorize reading another user’s project. The MCP tools still cannot publish or queue posts. Account deletion blocks MCP access through the same privacy guard as API keys. Clerk-issued JWTs otherwise remain valid until expiry, even after the OAuth grant is revoked; configure token format/expiry and explain this limitation before launch.

Anonymous clients can initialize the protocol and inspect tool descriptors. They cannot retrieve a profile, project, account, post, analytics, or create a draft: each handler returns an OAuth linking challenge before touching workspace services. Invalid credentials receive HTTP 401 with a protected-resource metadata challenge. Read-only OAuth credentials attempting `create_draft` receive a tool error with an `insufficient_scope` challenge. Tool descriptors declare the required scopes both at the root and in `_meta.securitySchemes`.

Deployment alone does not configure the Clerk OAuth client or complete marketplace review. See [deployment configuration](deployment.md#configure-mcp-oauth) for the required production provider settings.

## Tools

| Tool | Behavior |
| --- | --- |
| `get_profile` | Identifies the connected Meadow profile. |
| `list_projects` | Lists the profile's owned projects. |
| `list_accounts` | Lists cached connected-account data for a project. |
| `list_posts` | Lists drafts, scheduled posts, and publishing history with bounded pagination. |
| `get_post` | Returns one post by ID. |
| `create_draft` | Saves one non-empty draft without publishing it. A stable `requestId` makes retries idempotent. |
| `get_analytics` | Returns cached project totals and compact account summaries without refreshing social providers. |

The initial tool contract does not connect accounts, upload media, refresh provider data, queue posts, or publish. Continue using the authenticated product and REST upload flow for those actions.

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
