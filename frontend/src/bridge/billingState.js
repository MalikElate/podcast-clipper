export const SUBSCRIPTION_STATUSES = new Set(["active", "trialing", "past_due", "unpaid", "incomplete", "paused"]);

export function checkoutNotice({ checkoutStatus, paymentStatus, billing } = {}) {
  if (checkoutStatus === "expired") return { message: "This checkout expired. Choose a plan to start again.", pending: false };
  if (checkoutStatus === "complete" && paymentStatus === "paid" && billing?.status === "active") return { message: "Payment confirmed. Your subscription is active.", pending: false };
  if (checkoutStatus === "complete" && paymentStatus === "no_payment_required" && ["active", "trialing"].includes(billing?.status)) return { message: billing.status === "trialing" ? "Your trial is active." : "Your subscription is active. No payment was due today.", pending: false };
  return { message: "We’re confirming your payment with Stripe. Your billing details will update when it completes.", pending: true };
}

export function billingWarning(status) {
  if (["past_due", "unpaid"].includes(status)) return "Your subscription payment needs attention. Open Manage billing to update your payment method or pay the outstanding invoice.";
  if (status === "incomplete") return "Your first payment hasn’t completed. Open Manage billing to finish payment.";
  if (status === "paused") return "Your subscription is paused. Open Manage billing to review it.";
  return "";
}
