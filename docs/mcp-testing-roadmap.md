# Meadow MCP testing roadmap

This roadmap takes Meadow from the current API-key MCP release to a public, OAuth-connected ChatGPT integration. A phase advances only when its exit criteria are met. Production publishing remains outside the MCP tool contract until a separate write-safety review is complete.

## Suggested six-week sequence

| Week | Focus | Deliverable |
| --- | --- | --- |
| 1 | Phases 1–2 | Internal users complete the API-key journeys and the edge-case suite is automated. |
| 2 | Phases 3–4 | Security, durability, rate-limit, cold-start, and load evidence is recorded. |
| 3–4 | Phase 5 | OAuth sign-in, consent, token refresh, revocation, and ChatGPT conversation tests pass. |
| 5 | Phase 6, wave one | Read-only external beta with monitoring and support feedback. |
| 6 | Phase 6, wave two and Phase 7 | Draft creation beta, final regression, release review, and public launch decision. |

Pause the schedule whenever a phase misses its exit criteria. Fix and rerun that phase before inviting a wider group.

## Current baseline

Completed:

- The production Streamable HTTP endpoint is live at `https://findmeadow.com/mcp`.
- Missing API keys receive an authenticated JSON-RPC error instead of application data.
- The official MCP SDK connects, discovers all seven tools, reads a workspace, and creates an idempotent draft.
- Empty drafts are rejected.
- A key cannot read another owner's project.
- A manual local smoke test created, retrieved, listed, and discarded a temporary draft, then revoked its temporary key.
- The backend suite, frontend suite, production frontend build, and Cloudflare configuration validation pass.

## Phase 1: private API-key acceptance

**Goal:** prove that a real user can configure a compatible MCP client without developer assistance.

Run with 3–5 internal testers and non-production social accounts.

Test journeys:

1. Create an API key in Meadow and connect a Streamable HTTP MCP client.
2. List projects and select the intended workspace.
3. List connected accounts, including the empty-account state.
4. List drafts and publishing history, including pagination and status filters.
5. Retrieve one post by ID.
6. Save a text draft, refresh Meadow in the browser, and confirm it appears in Posts.
7. Repeat the same draft request with the same `requestId` and confirm that no duplicate is created.
8. Attempt to save an empty draft and confirm that Meadow explains what is missing.
9. Read cached analytics, including a workspace with no analytics yet.
10. Revoke the key and confirm that the next MCP request is rejected.

Exit criteria:

- Every tester completes connection and draft creation without database or CLI access.
- No duplicate drafts are created during retries.
- Revoked keys stop working on the next request.
- No test exposes another user's projects, posts, accounts, or analytics.
- All failures return a useful, non-sensitive message.
- No critical or high-severity defect remains open.

## Phase 2: contract and edge-case coverage

**Goal:** make the tool contract predictable for different AI clients and imperfect inputs.

Automate these cases in `backend/test/mcp.test.js`:

- Missing, malformed, expired, and revoked credentials.
- Unsupported HTTP methods, malformed JSON-RPC, unknown tools, and invalid arguments.
- Empty workspaces and projects with large post histories.
- `list_posts` boundaries: offset zero, final page, maximum limit, invalid status, and no matches.
- Missing and foreign project or post IDs.
- Drafts containing text only, title only, media only, and supported format values.
- Maximum caption, title, account, and media limits.
- Concurrent calls using the same `requestId`.
- Reusing a `requestId` with different content.
- Structured output matching each advertised output schema.
- Tool annotations remaining read-only or additive as intended.

Exit criteria:

- The complete MCP test suite is repeatable locally and in the production build pipeline.
- Tool schemas and returned structured content agree in every case.
- Idempotency remains correct under concurrent retries.
- Errors never contain stack traces, credentials, internal paths, or provider tokens.

## Phase 3: security, privacy, and durability

**Goal:** verify that the remote server is safe before inviting external testers.

Checks:

- Attempt horizontal access between two real test users for every tool that accepts an ID.
- Confirm API keys are displayed once, stored only as digests, omitted from logs, and immediately revocable.
- Confirm rate limiting works per authenticated user without blocking unrelated users.
- Review request and error logs for captions, credentials, or unnecessary personal data.
- Restart and replace the Cloudflare container, then confirm projects, drafts, key records, and idempotency records survive.
- Exercise a failed durable-state write and confirm Meadow does not acknowledge a draft it failed to persist.
- Verify account deletion and project deletion remove MCP access to the deleted data.
- Confirm MCP tools use cached provider data and do not silently contact or publish to social platforms.

Exit criteria:

- Cross-user access attempts fail in every tested path.
- No raw API key or provider credential appears in application logs.
- Durable data survives a controlled container rollout.
- The service fails closed when durable persistence is unavailable.
- Privacy deletion behavior is documented and verified.

## Phase 4: reliability and performance

**Goal:** establish normal performance and behavior under load before OAuth increases traffic.

Measure:

- Warm and cold-start latency for every tool.
- Error rate and latency at normal traffic, at the 120-request-per-minute user limit, and just above it.
- Ten concurrent reads and five concurrent draft creations for separate users.
- Container sleep, wake, rollout, and rollback behavior.
- Client retry behavior for timeouts, network interruption, HTTP 429, and HTTP 5xx.

Initial release targets:

- At least 99% successful MCP requests, excluding invalid user input and deliberate rate-limit tests.
- Warm read requests have a p95 below 2 seconds.
- Draft creation has a p95 below 3 seconds when the container is warm.
- A cold start completes within 15 seconds and never creates a duplicate draft.
- A failed request can be retried safely with the same draft `requestId`.

Exit criteria:

- Targets hold during a one-hour controlled test.
- Alerts distinguish authentication errors, user input errors, rate limits, persistence failures, and server failures.
- A rollback procedure is tested against a non-production deployment.

## Phase 5: OAuth and ChatGPT connection

**Goal:** replace manually copied API keys with a normal Meadow sign-in and consent flow.

Test journeys:

1. Add Meadow as a remote MCP connection in ChatGPT.
2. Sign in to Meadow, review requested access, approve, and return successfully to ChatGPT.
3. Decline consent and confirm no connection is created.
4. Sign out, reconnect, and switch between two Meadow users without leaking the previous user's data.
5. Let an access token expire and confirm refresh succeeds without another consent prompt when allowed.
6. Revoke the ChatGPT connection in Meadow and confirm subsequent calls fail.
7. Remove the connection in ChatGPT and confirm Meadow can no longer be called from that connection.
8. Repeat the core read and draft journeys through ChatGPT conversations.

Conversation acceptance prompts:

- “Show my Meadow projects.”
- “List the drafts in my selected project.”
- “Save this caption as a draft in Meadow.”
- “Show the draft you just created.”
- “What are my cached analytics totals?”
- “Publish this post now.” The assistant must explain that the current Meadow tool set can save a draft but cannot publish.

Exit criteria:

- Sign-in, consent, refresh, revocation, and reconnection all work reliably.
- The connected Meadow identity always matches the visible signed-in user.
- ChatGPT discovers all intended tools and uses `create_draft` only when the user asks to save content.
- The integration never claims a draft was published.
- No API key needs to be copied by the user.

## Phase 6: limited external beta

**Goal:** validate the integration with real workflows before broad availability.

Invite 10–25 users in two waves. Start with read-only usage, then enable draft creation after the first wave shows no access or reliability issue.

Track:

- Connection completion rate.
- Tool calls by name, success rate, and latency without recording post content.
- Draft duplicates, empty-draft attempts, and user-cancelled actions.
- Authentication, consent, and token-refresh failures.
- Support requests and the step where users became confused.

Exit criteria:

- At least 90% of invited users connect without assistance.
- At least 95% of valid tool calls succeed.
- Zero confirmed cross-user access, credential exposure, or unintended publication.
- No unresolved critical or high-severity defect.
- Help text covers the most common setup and usage questions.

## Phase 7: public release gate

Release only when:

- All previous exit criteria remain satisfied on the release candidate.
- Automated MCP, backend, frontend, and deployment checks pass from a clean checkout.
- Production monitoring and alerts are active.
- OAuth client details, support contact, privacy policy, and user-facing connection instructions are current.
- Key and OAuth revocation procedures have been exercised.
- The rollback owner and incident-response steps are documented.
- The public tool descriptions match actual Meadow behavior.

After release, review errors, latency, connection completion, and user reports daily for the first week, then weekly. Add publishing tools only through a separate roadmap covering explicit confirmation, previews, destination selection, idempotency, partial failures, and uncertain provider outcomes.
