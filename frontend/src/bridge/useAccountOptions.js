import { useEffect, useState } from "react";
import { api } from "./BridgeApi.js";

const accountVersion = account => `${account.status}:${account.updatedAt || 0}`;

// Keep the account list authoritative on the very first render after a refresh.
// Only cache options here; mirroring the whole list in state briefly exposed an
// old empty list when a saved draft's accounts finished loading.
export function useAccountOptions(projectId, accounts, selectedIds) {
  const [details, setDetails] = useState({});
  const selected = accounts.filter(account => account.status === "connected" && selectedIds.includes(account.id));
  const selectionVersion = selected.map(account => `${account.id}:${accountVersion(account)}`).sort().join(",");
  useEffect(() => {
    const controller = new AbortController();
    for (const account of selected) {
      const version = accountVersion(account);
      api.project(projectId, `/accounts/${account.id}/options`, { signal: controller.signal }).then(({ options }) => {
        if (!controller.signal.aborted) setDetails(current => ({ ...current, [account.id]: { projectId, version, options, optionsError: null } }));
      }).catch(error => {
        if (!controller.signal.aborted) setDetails(current => ({ ...current, [account.id]: { projectId, version, optionsError: error.message } }));
      });
    }
    return () => controller.abort();
  }, [projectId, selectionVersion]);
  return accounts.map(account => {
    const cached = details[account.id];
    return cached?.projectId === projectId && cached.version === accountVersion(account)
      ? { ...account, ...(cached.options ? { options: cached.options } : {}), optionsError: cached.optionsError }
      : account;
  });
}
