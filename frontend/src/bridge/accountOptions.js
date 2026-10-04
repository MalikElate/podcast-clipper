export const accountOptionsVersion = account => `${account.status}:${account.updatedAt || 0}:${account.optionsUpdatedAt || 0}`;

export function mergeAccountOptions(account, cached, projectId) {
  return cached?.projectId === projectId && cached.version === accountOptionsVersion(account)
    ? { ...account, ...(cached.options ? { options: cached.options } : {}), optionsError: cached.optionsError, optionsLoading: cached.optionsLoading }
    : account;
}

// An aborted read may still resolve, so identity as well as the signal guards
// updates when a retry, account change, or workspace change supersedes it.
export function createAccountOptionsRequests({ request, onChange }) {
  const pending = new Map();
  return {
    async load(projectId, account, { force = false, scope } = {}) {
      pending.get(account.id)?.abort();
      const controller = new AbortController();
      pending.set(account.id, controller);
      const context = { projectId, accountId: account.id, version: accountOptionsVersion(account), scope };
      const current = () => !controller.signal.aborted && pending.get(account.id) === controller;
      onChange(context, { optionsLoading: true });
      try {
        const { options } = await request(projectId, `/accounts/${encodeURIComponent(account.id)}/options${force ? "?refresh=1" : ""}`, { signal: controller.signal });
        if (current()) onChange(context, { options, optionsError: null, optionsLoading: false });
      } catch (error) {
        if (current()) onChange(context, { optionsError: error.message, optionsLoading: false });
      } finally {
        if (pending.get(account.id) === controller) pending.delete(account.id);
      }
    },
    cancelAll() {
      for (const controller of pending.values()) controller.abort();
      pending.clear();
    },
  };
}
