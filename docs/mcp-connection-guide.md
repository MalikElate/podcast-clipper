# Connect to Meadow MCP for testing

Use this guide to test the current private MCP connection. It uses a temporary Meadow API key. Direct ChatGPT connection will use OAuth in a later release and will not require these manual steps.

## 1. Create a temporary Meadow key

1. Sign in to Meadow.
2. Open **Configuration**.
3. Open **API Keys**.
4. Select **Create API key**.
5. Name it `MCP test`.
6. Copy the key when Meadow displays it. The full key is shown only once.

The key starts with `br_live_`. Do not paste it into chat, screenshots, source code, or a committed file.

## 2. Start MCP Inspector

Open Terminal and enter these commands one line at a time:

```sh
read -s "MEADOW_API_KEY?Paste your Meadow API key: "
echo
npx @modelcontextprotocol/inspector@latest --server-url https://findmeadow.com/mcp --transport http --header "Authorization: Bearer $MEADOW_API_KEY"
```

The first run may ask permission to download the official Inspector package. Accept it. Keep the Terminal window open while testing.

The Inspector should open in the browser with these settings:

- Server URL: `https://findmeadow.com/mcp`
- Transport: HTTP / Streamable HTTP
- Header name: `Authorization`
- Header value: `Bearer br_live_…`

Select **Connect**.

## 3. Confirm the connection

Open **Tools** and refresh the tool list. Meadow should show:

- `get_profile`
- `list_projects`
- `list_accounts`
- `list_posts`
- `get_post`
- `create_draft`
- `get_analytics`

Run `get_profile`. It should return the connected Meadow workspace identity.

Run `list_projects`. Copy the `id` of the project you want to test. This is the `projectId` used by the other tools.

## 4. Read Meadow data

Run `list_posts` with:

```json
{
  "projectId": "PASTE_PROJECT_ID_HERE",
  "limit": 20,
  "offset": 0
}
```

Then run `get_analytics` with:

```json
{
  "projectId": "PASTE_PROJECT_ID_HERE"
}
```

An empty post list or zero analytics is valid when the project has no data yet.

## 5. Create a test draft

Run `create_draft` with:

```json
{
  "projectId": "PASTE_PROJECT_ID_HERE",
  "requestId": "meadow-manual-test-0001",
  "caption": "Testing the Meadow MCP connection"
}
```

A successful result has `status: "draft"`. Refresh Meadow's **Posts** page and confirm that the test draft appears. The MCP tool saves the draft; it does not publish it.

Run the same request again with the same `requestId`. Meadow should return the same post with `duplicate: true` instead of creating another draft.

## 6. Clean up

1. Discard the test draft from Meadow's Posts page.
2. Return to **Configuration → API Keys**.
3. Revoke the `MCP test` key.
4. Stop Inspector in Terminal with **Control-C**.
5. Remove the key from the current shell:

```sh
unset MEADOW_API_KEY
```

The revoked key must fail on the next connection attempt. This confirms that revocation works.

## Troubleshooting

| Result | Meaning | Action |
| --- | --- | --- |
| `A Meadow API key is required` | The Authorization header was not sent. | Restart Inspector with the command in step 2. |
| `This API key is invalid or has been revoked` | The key is wrong or no longer active. | Create a new temporary key. |
| `Project not found` | The supplied project ID is wrong or belongs to another user. | Run `list_projects` again and copy its exact `id`. |
| `Add text, a title, or media before saving this draft` | The draft is empty. | Add a caption or title and retry. |
| The browser displays JSON at `/mcp` | The MCP URL was opened like a webpage. | Use Inspector; `/mcp` is a machine endpoint. |

MCP Inspector's current configuration supports ad-hoc HTTP servers through `--server-url`, `--transport http`, and repeatable `--header` options. See the [official Inspector server configuration](https://github.com/modelcontextprotocol/inspector/blob/main/docs/mcp-server-configuration.md).
