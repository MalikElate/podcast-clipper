import { api } from "./BridgeApi.js";

export function previewErrors(preview) {
  const messages = preview?.rows?.flatMap(row => row.destinations.flatMap(destination => destination.errors || [])) || [];
  return [...new Set(messages)].join(" · ") || "Some posts need changes before they can be queued.";
}

export async function submitComposerPosts({ projectId, items, requestId, draft, apiClient = api }) {
  const preview = await apiClient.project(projectId, "/posts/preview", { method: "POST", body: { items } });
  if (!preview.valid) {
    const error = new Error(previewErrors(preview));
    Object.assign(error, { code: "invalid_content", details: preview.rows });
    throw error;
  }
  return apiClient.project(projectId, "/posts", {
    method: "POST",
    body: { items, requestId, ...(draft ? { draftId: draft.id, revision: draft.revision } : {}) },
  });
}
