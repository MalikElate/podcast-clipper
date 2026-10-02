# Welcome email

New accounts receive one message from Meadow. Everything else a user is sent
about their account comes from Clerk or Stripe.

Clerk posts `user.created` to `<BRIDGE_PUBLIC_URL>/api/clerk/webhook`, the same
signed endpoint that already handles `user.deleted`. The handler reads the
primary verified address from the event and sends through Resend.

## Behaviour

The account exists before the webhook fires, so a failed send never undoes a
signup. An unconfigured service, an address-less account, a rejection from
Resend and a network failure all return `false`, log a warning, and leave the
webhook answering `200` so Clerk does not retry a delivery that cannot succeed.

Clerk can deliver `user.created` more than once. Each send carries
`Idempotency-Key: meadow-welcome-<clerk user id>`, so one account receives one
welcome even when an event is redelivered.

Names come from the signup form and are escaped before they reach the HTML
body. A signup with no first name is greeted without one.

The address and phone number live in `frontend/src/siteContact.js` and in
`backend/src/bridge/services/WelcomeEmailService.js`. The backend cannot import
across packages at runtime, so `backend/test/welcome-email.test.js` compares the
two copies and fails when they drift.

## Configuration

| Variable | Purpose |
| --- | --- |
| `RESEND_API_KEY` | Resend API key. Unset disables sending entirely. |
| `MEADOW_EMAIL_FROM` | Sender. Defaults to `Meadow <hello@findmeadow.com>`. |

Leaving `RESEND_API_KEY` unset is safe: deploying this code without it changes
nothing for signups.

## Activation

Not yet active. Live sending has not been verified; the steps below have not
been completed.

1. Create a Resend account and verify `findmeadow.com` as a sending domain.
   Resend supplies the DKIM and SPF records; add them in Cloudflare DNS
   alongside the existing records and wait for Resend to report verification.
2. Add `RESEND_API_KEY` with `npx wrangler secret put RESEND_API_KEY`. Set
   `MEADOW_EMAIL_FROM` only to override the default sender.
3. In the Clerk dashboard, add `user.created` to the existing webhook endpoint
   at `<BRIDGE_PUBLIC_URL>/api/clerk/webhook`. The signing secret is unchanged.
4. The container reads secrets at startup, so a secret change takes effect only
   after the next rollout from `main`.
5. Create a test account and confirm the message arrives, that the address and
   phone number are correct, and that the dashboard link opens the workspace.
6. Check the message is not placed in spam. Until the domain has sent for a
   while, add a DMARC record if one is missing.

Do not describe new users as receiving a welcome email until step 5 succeeds.
