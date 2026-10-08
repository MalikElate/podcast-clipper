export const AGENT_CLIENTS = [
  { id: "claude", name: "Claude", docs: "https://code.claude.com/docs/en/mcp" },
  { id: "chatgpt", name: "ChatGPT", docs: "https://developers.openai.com/plugins/deploy/connect-chatgpt" },
  { id: "codex", name: "Codex", docs: "https://learn.chatgpt.com/docs/extend/mcp?surface=cli" },
  { id: "cursor", name: "Cursor", docs: "https://prod.cursor.com/help/customization/mcp" },
  { id: "gemini", name: "Gemini CLI", docs: "https://geminicli.com/docs/tools/mcp-server/" },
  { id: "api", name: "CLI / API" },
  { id: "mcp", name: "Any MCP client" },
];

export function agentInstructions(client, { mcpUrl = "https://findmeadow.com/mcp", apiUrl = "https://findmeadow.com/api/bridge", oauthReady = false } = {}) {
  const apiAuth = "Bearer YOUR_MEADOW_API_KEY";
  if (client === "claude") return { title: "Connect Claude Code", text: oauthReady ? "Add Meadow, then open /mcp in Claude Code and sign in with your Meadow account." : "Create an API key above, replace the placeholder in this command, then add Meadow to Claude Code.", code: `claude mcp add --transport http meadow ${mcpUrl}${oauthReady ? "" : ` --header \"Authorization: ${apiAuth}\"`}`, note: oauthReady ? "In Claude’s web or desktop app, add the Meadow URL as a custom connector when your plan supports it. Use OAuth sign-in." : "Keep your API key private. Claude web and desktop connections require Meadow OAuth to be enabled on this server." };
  if (client === "chatgpt") return { title: "Connect ChatGPT", text: "In ChatGPT, enable Developer mode in Settings → Security and login. Open Plugins, select the plus button, and add a plugin named Meadow with this MCP server URL. Choose OAuth and sign in to Meadow.", code: mcpUrl, note: oauthReady ? "Developer mode availability depends on your ChatGPT account and workspace policy." : "Meadow OAuth is not enabled on this server yet. A server administrator must enable it before ChatGPT can connect." };
  if (client === "codex") return { title: "Connect Codex", text: oauthReady ? "Add the remote MCP server, then complete Meadow sign-in with the login command." : "Store your API key as MEADOW_API_KEY in your shell’s secret environment, then add this configuration to ~/.codex/config.toml.", code: oauthReady ? `codex mcp add meadow --url ${mcpUrl}\ncodex mcp login meadow` : `[mcp_servers.meadow]\nurl = "${mcpUrl}"\nbearer_token_env_var = "MEADOW_API_KEY"`, note: "You can also add remote MCP servers in Codex’s MCP settings." };
  if (client === "cursor") return { title: "Connect Cursor", text: "Add this configuration to .cursor/mcp.json in your project or your global MCP configuration. Save it and restart Cursor.", code: JSON.stringify({ mcpServers: { meadow: { url: mcpUrl, ...(!oauthReady ? { headers: { Authorization: apiAuth } } : {}) } } }, null, 2), note: oauthReady ? "When Cursor requests authentication, sign in with your Meadow account." : "Replace YOUR_MEADOW_API_KEY with a key created above. Keep the file private." };
  if (client === "gemini") return { title: "Connect Gemini CLI", text: "Add Meadow under mcpServers in your Gemini CLI settings.json. Replace YOUR_MEADOW_API_KEY with a key created above and keep the configuration private.", code: JSON.stringify({ mcpServers: { meadow: { httpUrl: mcpUrl, headers: { Authorization: apiAuth } } } }, null, 2), note: "Restart Gemini CLI and use /mcp to check that Meadow’s tools are available." };
  if (client === "api") return { title: "Use the REST API", text: "Create an API key above and store it as MEADOW_API_KEY in your secret environment. Send it as a Bearer token with requests.", code: `curl ${apiUrl}/projects \\\n  -H "Authorization: Bearer $MEADOW_API_KEY"`, note: "REST API keys have your workspace’s access, including publishing. Never expose keys in browser code or public repositories." };
  return { title: "Connect another MCP client", text: "Add a remote server using Streamable HTTP and this URL. Choose OAuth if your client supports it, or supply an API key in the Authorization header.", code: `${mcpUrl}\n\nAuthorization: ${apiAuth}`, note: "Create a separate API key for each client so you can revoke its access independently." };
}

/** One prompt for any agent that can make HTTP requests, including remote and
 * cloud agents: it signs in through a browser approval instead of a pasted key,
 * then uses the same key for MCP and the REST API. */
export function agentSetupPrompt({ mcpUrl = "https://findmeadow.com/mcp", apiUrl = "https://findmeadow.com/api/bridge", agentLoginUrl = "https://findmeadow.com/api/agent-login" } = {}) {
  return `Set up Meadow, my social media publishing tool, so you can use it for me.

MCP server (Streamable HTTP): ${mcpUrl}
REST API: ${apiUrl}
Agent sign-in: ${agentLoginUrl}

1. Reuse an existing key. If MEADOW_API_KEY is set in your environment, call GET ${apiUrl}/projects with the header "Authorization: Bearer $MEADOW_API_KEY". If that returns 200, skip to step 4.

2. Sign in. This works without a browser on your side, including on remote and cloud machines.
   a. POST ${agentLoginUrl} with JSON {"agentName": "<your product and where you run, e.g. Claude Code on my laptop>"}.
   b. Show me the verificationUrlComplete link and the userCode from the response, and ask me to approve. Do not open or approve it yourself.
   c. Every "interval" seconds, POST ${agentLoginUrl}/poll with JSON {"deviceCode": "<deviceCode from step a>"}.
      202 = still waiting. 200 = approved; the response contains apiKey. 403 = I declined; stop. 410 = expired; start again at step a.
   Never show the deviceCode or the apiKey in our conversation.

3. Store the key as MEADOW_API_KEY somewhere that persists and stays private, such as your secret store or environment configuration. If your files or environment are wiped between sessions, tell me exactly where to add MEADOW_API_KEY as a secret. Never commit it, log it or print it.

4. Connect the MCP server if you support remote MCP servers: add a server named "meadow" at ${mcpUrl} that sends "Authorization: Bearer <MEADOW_API_KEY>". Prefer reading the key from the environment variable.
   - Claude Code: claude mcp add --transport http meadow ${mcpUrl} --header "Authorization: Bearer $MEADOW_API_KEY"
   - Codex (~/.codex/config.toml): [mcp_servers.meadow] url = "${mcpUrl}" and bearer_token_env_var = "MEADOW_API_KEY"
   If you cannot add MCP servers, use the REST API with the same Authorization header. Main endpoints, under ${apiUrl}:
   GET /projects · GET /projects/{projectId}/accounts · GET /projects/{projectId}/accounts/{accountId}/options · POST /projects/{projectId}/media (multipart field "file") · POST /projects/{projectId}/posts/preview · POST /projects/{projectId}/posts · GET /projects/{projectId}/posts · GET /projects/{projectId}/analytics

5. Check it works: call list_projects (MCP) or GET ${apiUrl}/projects and tell me which Meadow workspace you reached.

Rules for using Meadow: never publish or schedule without my explicit confirmation of the content, accounts and time. Ask me for each platform's privacy, audience and consent choices (for example TikTok) instead of choosing them yourself. Preview a post before publishing it.`;
}
