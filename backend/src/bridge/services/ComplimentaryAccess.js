// Grants are server configuration, never customer-supplied fields or Stripe
// subscription records. Exact Clerk IDs keep emails, prefixes and wildcards out.
export function parseComplimentaryProUids(value = "") {
  return new Set(String(value).split(",").map(uid => uid.trim()).filter(uid => /^user_[A-Za-z0-9]+$/.test(uid)));
}

export function hasOngoingSubscription(record) {
  // Preserve the financial view for unknown states too. Only Stripe's terminal
  // statuses establish that this subscription cannot renew or begin billing.
  return Boolean(record?.subscriptionId && !["canceled", "incomplete_expired"].includes(record.status));
}
