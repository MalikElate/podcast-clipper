export const firstConnectionWelcomeKey = userId => `meadow:first-connection-welcome:${userId}`;

export function shouldShowFirstConnectionWelcome({ userId, preview, dismissed, accounts, error, connectionId }) {
  return Boolean(
    userId && !preview && !dismissed && Array.isArray(accounts) && !error && !connectionId
    && !accounts.some(account => !["disconnected", "deleting"].includes(account.status))
  );
}
