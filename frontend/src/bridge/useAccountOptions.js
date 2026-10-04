import { useEffect, useRef, useState } from "react";
import { api } from "./BridgeApi.js";
import { accountOptionsVersion, createAccountOptionsRequests, mergeAccountOptions } from "./accountOptions.js";

// Keep the account list authoritative on the very first render after a refresh.
// Only cache options here; mirroring the whole list in state briefly exposed an
// old empty list when a saved draft's accounts finished loading.
export function useAccountOptions(projectId, accounts, selectedIds) {
  const [details, setDetails] = useState({});
  const selected = accounts.filter(account => account.status === "connected" && selectedIds.includes(account.id));
  const selectionVersion = selected.map(account => `${account.id}:${accountOptionsVersion(account)}`).sort().join(",");
  const scope = `${projectId}:${selectionVersion}`, currentScope = useRef(scope);
  currentScope.current = scope;
  const requests = useRef(null);
  if (!requests.current) requests.current = createAccountOptionsRequests({
    request: (...args) => api.project(...args),
    onChange(context, patch) {
      if (context.scope !== currentScope.current) return;
      setDetails(current => {
        const previous = current[context.accountId];
        const cached = previous?.projectId === context.projectId && previous.version === context.version ? previous : {};
        return { ...current, [context.accountId]: { ...cached, projectId: context.projectId, version: context.version, ...patch } };
      });
    },
  });
  useEffect(() => {
    for (const account of selected) requests.current.load(projectId, account, { scope });
    return () => requests.current.cancelAll();
  }, [scope]);
  function refreshOptions(accountId) {
    const account = selected.find(item => item.id === accountId);
    if (account) return requests.current.load(projectId, account, { force: true, scope });
  }
  return { accounts: accounts.map(account => mergeAccountOptions(account, details[account.id], projectId)), refreshOptions };
}
