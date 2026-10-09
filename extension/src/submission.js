import { submitComposerPosts as submitShared, previewErrors } from "../../frontend/src/bridge/composerSubmission.js";
import { api } from "./api.js";

export { previewErrors };

// Reuse the app's validation/submission contract while keeping both requests
// under the same connected identity, even if another extension tab reconnects.
export async function submitComposerPosts({ apiClient = api, ...options }) {
  const connection = await apiClient.forCurrentConnection();
  return submitShared({ ...options, apiClient: connection });
}
