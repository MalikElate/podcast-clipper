import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { OPENAI_APPS_CHALLENGE_PATH, openaiAppsChallengeResponse } from "../../cloudflare/openaiAppsChallenge.js";

test("the OpenAI domain challenge is served as the bare token before Cloudflare assets", async () => {
  const source = await readFile(new URL("../../wrangler.jsonc", import.meta.url), "utf8");
  assert.ok(source.includes(`"run_worker_first": ["${OPENAI_APPS_CHALLENGE_PATH}"`));
  assert.match(source, /"OPENAI_APPS_CHALLENGE": "[A-Za-z0-9_-]{20,}"/);
  const response = openaiAppsChallengeResponse(" token-value_123 \n");
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "token-value_123");
  assert.match(response.headers.get("Content-Type"), /^text\/plain/);
  assert.equal(openaiAppsChallengeResponse("").status, 404);
  assert.equal(openaiAppsChallengeResponse(undefined).status, 404);
});
