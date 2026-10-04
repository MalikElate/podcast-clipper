# Integration examples

Outlines for two things that do not exist yet: an n8n workflow template and a
small example repository. Both are described here so the shape can be agreed
before either is built.

The same constraint applies to both: Meadow's public contract reads a workspace
and saves drafts. Neither example can publish, and an example that implies
otherwise would waste the time of whoever tries it.

## n8n workflow template

**Name:** Draft a Meadow post from an RSS feed

**What it does.** Watches a feed, writes a short caption for each new item, and
saves it to Meadow as a draft targeting several platforms. A person opens
Meadow, reviews what arrived, and publishes.

**Why it is worth building.** It answers "automate my social posting" without
pretending to automate the part that carries risk. The review step is a
feature for anyone whose account matters.

**Nodes**

1. **RSS Feed Trigger** — poll a feed on a schedule.
2. **Filter** — drop items already seen, keyed on the item GUID.
3. **AI node (optional)** — draft a caption from the title and summary. Any
   model node works; the template should not hard-code a vendor.
4. **HTTP Request → Meadow MCP** — call `create_draft` at
   `https://findmeadow.com/mcp` with `Authorization: Bearer <key>`. Pass the
   item GUID as `requestId` so a re-run does not create a second draft.
5. **No-op / notification** — optionally notify a channel that a draft is
   waiting.

**Credentials.** One Meadow API key with `meadow:read` and `meadow:draft`.

**What to state clearly in the template description.** The workflow produces
drafts. Nothing reaches a social platform until a person publishes it in
Meadow.

**Open question.** n8n templates are usually submitted as JSON to n8n's
template library, which has its own review. Worth checking whether a template
whose main action is an MCP call is accepted before building it.

## Example repository

**Name:** `meadow-draft-example`

**Size.** Small on purpose. One file of real logic, a README that can be read
in two minutes, and no framework.

**What it demonstrates.** Authenticating against the MCP endpoint, listing the
connected accounts in a project, and creating one draft that targets two of
them with different text per destination. Then reading the draft back to show
it exists and has not been published.

**Structure**

```
meadow-draft-example/
  README.md          what this does, what it cannot do, how to run it
  .env.example       MEADOW_API_KEY=
  index.js           ~80 lines: connect, list_accounts, create_draft, get_post
  package.json       one dependency: @modelcontextprotocol/sdk
```

**README must say**, near the top, that the example creates a draft and cannot
publish, and that publishing happens in Meadow. Someone cloning a repo called
"example" will assume it does the whole job unless told otherwise.

**Worth adding if the first version lands well:** a second script showing a
webhook receiver that verifies a signature and logs `post.completed`, since
that is the half of the loop the MCP contract does not cover.

**Licence.** MIT, matching the expectation for a vendor example.

**Where it lives.** A separate public repository rather than a folder in this
one, so it can be cloned without the product source.

## Not proposed

A "publish from code" example, because there is no public endpoint that
publishes. If that contract is ever added, it changes both outlines above and
most of `docs/directory-submissions.md`.
