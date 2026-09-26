# Zernio publishing

Meadow uses [Zernio](https://docs.zernio.com) to connect and publish to platforms whose native Meadow app is still awaiting review: TikTok, Snapchat, Facebook, Instagram, Threads, and Pinterest.

## How it works

- `backend/src/bridge/platforms/ZernioProvider.js` wraps each native adapter. With `ZERNIO_API_KEY` set, **new** connections for the platforms in `ZERNIO_PLATFORMS` go through Zernio's hosted connect flow. Users still sign in once, on the platform's own consent screen.
- Each Meadow workspace gets one Zernio profile (`meadow-<projectId>`), saved in the `zernioProfile` store record. Zernio returns to `https://findmeadow.com/oauth/<platform>/callback`. Meadow then confirms that the returned account belongs to that workspace's profile.
- Zernio accounts store `{ zernioAccountId, zernioProfileId }` as credentials. Accounts connected natively before the switch keep their tokens and keep publishing through the native adapter.
- Posts are created with an `Idempotency-Key` per delivery, scheduled 30 seconds ahead, and polled until Zernio reports `published` or `failed`. Disconnecting an account in Meadow also disconnects it in Zernio.
- Post metrics and account views aren't available for Zernio connections yet.

## Status — September 26, 2026

`ZERNIO_API_KEY` is installed as a production secret with `wrangler secret put`. `ZERNIO_PLATFORMS` is unset, so all six platforms connect through Zernio. The backend container reads its environment when it starts, so a secret change takes effect only after the next normal rollout from `main`.

## Configuration

| Name | Where | Value |
| --- | --- | --- |
| `ZERNIO_API_KEY` | Cloudflare production **secret** | API key from the Zernio dashboard (`sk_…`). Never commit it. |
| `ZERNIO_PLATFORMS` | Cloudflare variable (optional) | Comma-separated list. Defaults to all six platforms above. |

The key must be installed through Cloudflare's secret settings. After a platform's native app is approved, remove it from `ZERNIO_PLATFORMS` so that new connections use Meadow's own app again. Existing Zernio connections keep working either way while the key is set.

Snapchat is a closed beta on Zernio. Until Zernio approves the account, connecting Snapchat shows Zernio's error.
