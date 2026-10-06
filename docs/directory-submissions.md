# Directory submission copy

Copy for listing Meadow in MCP and SaaS directories. Nothing here has been
submitted; each listing is a decision for a person to make.

Every claim below is checked against the codebase. **The MCP server reads a
workspace, uploads media, saves drafts, and publishes or schedules posts.**
Publishing and uploading are separate OAuth permissions the user grants when
connecting. It does not connect accounts. A listing that overclaims will be
corrected by the first person who tries it, and several of these directories
review submissions.

Platform counts: **11 platforms accept posts** (Instagram, TikTok, YouTube,
Facebook, X, LinkedIn, Pinterest, Threads, Bluesky, Telegram, Google Business),
and **Twitch and Kick accept channel chat**. Thirteen platform pages exist, but
thirteen is not the number of posting destinations.

Do not claim ratings, review counts, user numbers, or customer logos. None
exist.

## One-liners

**Under 60 characters**

> Publish to 11 social platforms from Claude.

**Under 100 characters**

> An MCP server that lets an AI client draft, schedule and publish posts on 11 social platforms.

**Under 160 characters**

> Meadow's MCP server lets Claude or any MCP client upload media and draft, schedule or publish posts on 11 social platforms, plus Twitch and Kick chat.

## Paragraph

> Meadow is a social publishing workspace with an MCP server. A supported AI
> client can read your connected accounts, look at past posts and cached
> analytics, upload images and video, and prepare a post that targets several
> platforms at once, each with its own wording. It can save the post as a draft
> for review, or publish or schedule it. Publishing is a separate permission
> the user grants when connecting, and every post appears in the Meadow
> calendar with the status of each destination.
>
> Eleven platforms accept posts: Instagram, TikTok, YouTube, Facebook, X,
> LinkedIn, Pinterest, Threads, Bluesky, Telegram and Google Business. Twitch
> and Kick accept channel chat. Webhooks report the outcome of every delivery.

## Technical details for a listing form

| Field | Value |
| --- | --- |
| Server URL | `https://findmeadow.com/mcp` |
| Transport | HTTP |
| Authentication | Meadow API key as `Authorization: Bearer`, or OAuth for clients that support it |
| Scopes | `meadow:read` for the eight read tools, plus `meadow:draft` for `create_draft`, `meadow:media` for `upload_media` and `create_upload_url`, and `meadow:publish` for `publish_post` and `publish_draft` |
| Tools | `get_profile`, `list_projects`, `list_accounts`, `list_posts`, `get_post`, `get_account_options`, `preview_post`, `get_analytics`, `create_draft`, `upload_media`, `create_upload_url`, `publish_post`, `publish_draft` |
| Pricing | Free plan with 5 connected accounts; paid plans from $29/month |
| Docs | `https://findmeadow.com/developers/` |
| Support | hello@findmeadow.com |

## Where to submit

### MCP directories

- **Anthropic connector directory** — review whether Meadow meets the current
  listing requirements before submitting; a server that only drafts may be
  categorised differently from one that acts.
- **Official MCP registry** — `github.com/modelcontextprotocol/registry`.
  Submission is a pull request, so the description above goes in a file rather
  than a form.
- **Smithery** — `smithery.ai`. Hosted-server listing.
- **mcp.so** — community directory, submission form.
- **ChatGPT apps** — check whether a draft-only connector fits the current
  app submission criteria before spending time on it.

### SaaS directories

- **Product Hunt** — a launch, not a listing. Worth holding until the platform
  review statuses are resolved, because the first comment will ask which
  platforms actually connect today.
- **AlternativeTo** — list against Buffer, Hootsuite, Later and Postiz. The
  honest differentiator is the MCP server and the draft-then-review boundary,
  not feature parity.
- **SaaSHub** — straightforward listing, same copy as above.

## Before submitting anything

Several platform integrations are implemented but not verified as connectable:
see `docs/kick-twitch-setup.md`, `docs/meta-app-review.md` and
`docs/google-app-review.md`. A directory listing invites strangers to try the
product. Check which destinations a new account can actually connect, and
either resolve the gaps or keep the listing copy to what works today.
