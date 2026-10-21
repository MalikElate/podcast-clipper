import { invariant } from "../core/errors.js";

export const PAID_PLATFORMS = Object.freeze(["facebook", "instagram", "threads"]);
const PAID_PLANS = new Set(["starter", "creator", "growth", "pro"]);
const PAID_STATUSES = new Set(["active", "trialing"]);

export function hasPaidAccess(record, complimentary = false) {
  // Checkout attempts and subscriptions awaiting payment are not paid access.
  return complimentary || PAID_PLANS.has(record?.planId) && PAID_STATUSES.has(record?.status);
}

export function platformAccess(record, complimentary = false) {
  return { paidPlatforms: [...PAID_PLATFORMS], hasPaidAccess: hasPaidAccess(record, complimentary) };
}

export function assertPlatformAccess(platform, paidAccess) {
  invariant(!PAID_PLATFORMS.includes(platform) || paidAccess,
    "Facebook, Instagram, and Threads connections require a paid Meadow plan. Upgrade to connect or use these accounts.",
    { status: 403, code: "paid_plan_required" });
}
