// OpenAI's plugin portal verifies that we own the MCP's domain by fetching
// this path and expecting the exact token it issued, as plain text.
export const OPENAI_APPS_CHALLENGE_PATH = "/.well-known/openai-apps-challenge";

export function openaiAppsChallengeResponse(token) {
  const value = String(token || "").trim();
  if (!value) return new Response("Not found", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  return new Response(value, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}
