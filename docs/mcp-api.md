# Meadow MCP API

Meadow exposes a stateless Streamable HTTP endpoint at `https://findmeadow.com/mcp`. The first release is a private API integration: clients authenticate with a workspace API key created under Configuration → API Keys.

```http
Authorization: Bearer br_live_…
```

Keys have the same workspace access as their owner, are displayed once, and can be revoked immediately. Keep them in a secret manager. This authentication method is suitable for MCP clients that can supply a fixed bearer header. Public ChatGPT distribution requires the later OAuth phase.

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
