# Affiliate program

Meadow includes self-serve affiliate enrollment, first-touch referral attribution, and a commission ledger. The default program pays 20% on attributed subscription payments and keeps a referral click valid for 30 days. Both values are configurable.

## Customer flow

1. An authenticated user joins from **Configuration → Affiliate program**.
2. Meadow issues a link in the form `https://findmeadow.com/?ref=partner-code`.
3. The browser records the click without personal data and keeps the attribution locally until it expires.
4. After the referred visitor signs in or creates an account, Meadow locks the first valid affiliate to that customer. Self-referrals are rejected.
5. Successful billing events add commission to the affiliate's pending balance. Refunds create negative adjustments.

## Billing integration

Set a strong `BRIDGE_AFFILIATE_SECRET` in the backend environment. A billing webhook should call the conversion endpoint after it has verified the payment provider's own webhook signature.

```http
POST /api/bridge/internal/affiliate/conversions
X-Bridge-Affiliate-Secret: <BRIDGE_AFFILIATE_SECRET>
Content-Type: application/json

{
  "customerUid": "firebase-user-id",
  "externalId": "invoice-or-payment-id",
  "amountCents": 3900,
  "currency": "USD",
  "type": "purchase",
  "occurredAt": 1789128000000
}
```

Use a unique `externalId` for every provider event. Repeating the same event is safe and returns the existing ledger entry; reusing its ID with different data is rejected. Send refunds with `type: "refund"`, a new external ID, a positive `amountCents`, and the original payment ID as `relatedExternalId`. Meadow stores both the refunded amount and commission as negative values and applies the original payment's commission rate.

After review or payout, move a ledger entry through its settlement state:

```http
PATCH /api/bridge/internal/affiliate/conversions/<conversion-id>
X-Bridge-Affiliate-Secret: <BRIDGE_AFFILIATE_SECRET>
Content-Type: application/json

{ "status": "approved" }
```

Supported states are `pending`, `approved`, `paid`, and `reversed`. The payout provider should mark commission `paid` only after the transfer succeeds.

## Configuration

- `BRIDGE_AFFILIATE_SECRET`: private secret required by conversion and settlement endpoints.
- `BRIDGE_AFFILIATE_COMMISSION_BPS`: commission in basis points. `2000` means 20%.
- `BRIDGE_AFFILIATE_ATTRIBUTION_DAYS`: click-to-signup attribution window in days.

The database snapshots the affiliate's commission rate on every conversion so historical balances remain stable if the program rate changes later.
