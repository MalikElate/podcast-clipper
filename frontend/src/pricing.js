import { appHref } from "./siteUrls.js";

export const PLANS = [
  {
    id: "free",
    name: "Free",
    description: "For getting started",
    monthly: 0,
    yearly: 0,
    accounts: "5 connected social accounts",
    features: ["Create and schedule posts", "AI agent access", "No credit card required"],
  },
  {
    id: "starter",
    name: "Starter",
    description: "For new creators",
    monthly: 29,
    yearly: 24,
    accounts: "10 connected social accounts",
    features: ["Multiple accounts per platform", "Unlimited posts", "Schedule posts", "AI agent access", "Carousel posts", "Human support"],
  },
  {
    id: "creator",
    name: "Creator",
    description: "For growing creators",
    monthly: 39,
    yearly: 33,
    accounts: "25 connected social accounts",
    popular: true,
    features: ["Everything in Starter", "Bulk video scheduling", "Content studio access", "Analytics", "Human support"],
  },
  {
    id: "pro",
    name: "Pro",
    description: "For scaling brands",
    monthly: 99,
    yearly: 83,
    accounts: "Unlimited connected accounts",
    best: true,
    features: ["Everything in Creator", "Viral growth reports", "Priority human support", "Invite team members", "Advanced API access", "Priority processing", "Viral growth consulting"],
  },
];

export const PAID_PLANS = PLANS.filter(plan => plan.id !== "free");

export function planHref(plan, cycle) {
  return plan.id === "free" ? appHref("/dashboard") : `/pricing?checkout=${encodeURIComponent(plan.id)}&cycle=${cycle}`;
}

export function planBillingNote(plan, yearly) {
  return plan.id === "free" ? "No credit card required" : yearly ? `Billed $${plan.yearly * 12} yearly` : "Billed monthly";
}
