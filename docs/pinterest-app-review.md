# Pinterest app setup and review

## App details

Use the following values when registering Meadow in the Pinterest Developer Platform:

| Field | Value |
| --- | --- |
| App name | Meadow |
| Website | `https://findmeadow.com/` |
| Privacy policy | `https://findmeadow.com/privacy/` |
| Terms of service | `https://findmeadow.com/terms/` |
| OAuth redirect URI | `https://findmeadow.com/oauth/pinterest/callback` |

Suggested application description:

> Meadow is a social media publishing workspace. A user explicitly connects their own Pinterest account through Pinterest OAuth, chooses a Pinterest board, uploads or selects an image, video, or multi-image post, reviews its title, description, destination link, board, and publishing time, then chooses to publish or schedule that individual Pin. Meadow uses the Pinterest API to list the authorized user's boards, create the requested Pin, show its Pinterest link and delivery status, and retrieve the Pin's available performance metrics for that same user. Users can disconnect Pinterest at any time. Meadow never asks for or stores a user's Pinterest password or session cookies.

Request only the scopes used by the shipped integration:

- `user_accounts:read` identifies the authorized account.
- `boards:read` lets the user choose one of their boards.
- `pins:read` retrieves the published Pin and its available analytics.
- `pins:write` creates the Pin selected by the user.

The callback must be registered exactly as written. Pinterest rejects OAuth requests when the callback differs or redirects to another URI.

## Access sequence

1. Sign in with the Pinterest business account that will administer Meadow and verify its email address.
2. From **My apps**, accept the Pinterest Developer Terms and submit Meadow for Trial access.
3. After Trial approval, copy the app ID and secret from the app's **Configure** page and register the production redirect URI.
4. Add the app ID as `PINTEREST_CLIENT_ID` and the secret as `PINTEREST_CLIENT_SECRET` in the Cloudflare production environment. Never put either value in a `VITE_*` variable or commit it.
5. Test OAuth, board selection, and publication with Trial access. Pins created under Trial access are Sandbox entities visible only to their creator.
6. Record the complete live integration and submit an upgrade request for Standard access. Standard access is required before Meadow can publish ordinary Pins for customers.

## Standard access demo

Record one continuous flow that shows:

1. `https://findmeadow.com/` and its public privacy policy.
2. The user clicking **Connect Pinterest** in Meadow.
3. Pinterest's OAuth consent screen with the requested scopes.
4. The authorized account returning to Meadow with its board choices.
5. The user selecting a board, adding an image, title, description, and optional destination link.
6. The user deliberately choosing **Publish now** for that Pin.
7. Meadow reporting the successful delivery and opening the resulting Pin on Pinterest.
8. Meadow retrieving the Pin's available metrics in Analytics.
9. The user disconnecting the Pinterest account from Meadow.

Pinterest requires the demo to show the real OAuth flow and a working Pinterest API action. A wireframe or a general Meadow tour is not sufficient. Before recording, use a non-sensitive test asset that the recording account owns and keep the browser address bar visible when showing the public URLs.

## Production acceptance

After Standard approval, run one live test for each enabled format: a single-image Pin, a multi-image Pin where the account supports it, and a video Pin. Confirm the board, title, description, destination link, Pinterest URL, and delayed analytics. Then test token refresh, account disconnection, and reconnection without re-publishing the test Pin.

Pinterest's current setup and access requirements are documented in [Connect app](https://developer.pinterest.com/docs/getting-started/connect-app/), [Access tiers](https://developer.pinterest.com/docs/key-concepts/access-tiers/), and the [Developer guidelines](https://policy.pinterest.com/en/developer-guidelines).
