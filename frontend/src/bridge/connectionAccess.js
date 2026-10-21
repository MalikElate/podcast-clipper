// Keep paid connections unavailable until the server has checked the account.
export const PAID_CONNECTION_PLATFORMS = ["facebook", "instagram", "threads"];

export function platformConnectionAccess(platform, access) {
  const paidPlatforms = Array.isArray(access?.paidPlatforms) ? access.paidPlatforms : PAID_CONNECTION_PLATFORMS;
  if (!paidPlatforms.includes(platform)) return "allowed";
  if (access?.hasPaidAccess === true) return "allowed";
  if (access?.hasPaidAccess === false) return "upgrade";
  return "checking";
}

export function requirePaidConnectionAccess(access) {
  return { paidPlatforms: access?.paidPlatforms || PAID_CONNECTION_PLATFORMS, hasPaidAccess: false };
}
