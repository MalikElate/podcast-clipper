import test from "node:test";
import assert from "node:assert/strict";
import { AGENT_CLIENTS, agentInstructions } from "./agentSetup.js";

test("agent setup uses deployment endpoints and never embeds a user's key", () => {
  const config = { mcpUrl: "https://example.com/mcp", apiUrl: "https://example.com/api/bridge", oauthReady: true };
  for (const client of AGENT_CLIENTS) {
    const guide = agentInstructions(client.id, config);
    assert.match(guide.code, /example\.com/);
    assert.ok(!guide.code.includes("findmeadow.com"));
  }
  assert.match(agentInstructions("codex", config).code, /codex mcp login meadow/);
  assert.ok(!agentInstructions("cursor", config).code.includes("Authorization"));
  assert.equal(JSON.parse(agentInstructions("gemini", config).code).mcpServers.meadow.httpUrl, config.mcpUrl);
});

test("API-key-only deployments provide authentication and explain ChatGPT unavailability", () => {
  for (const client of ["claude", "cursor", "mcp"]) assert.match(agentInstructions(client).code, /YOUR_MEADOW_API_KEY/);
  assert.match(agentInstructions("codex").code, /bearer_token_env_var = "MEADOW_API_KEY"/);
  assert.match(agentInstructions("chatgpt").note, /OAuth is not enabled/);
});
