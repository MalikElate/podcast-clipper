# Zernio publishing

Meadow uses [Zernio](https://docs.zernio.com) for new connections to Snapchat, Facebook, Instagram, Threads, and Pinterest. TikTok connects directly through Meadow's approved TikTok app.

## How it works

- `backend/src/bridge/platforms/ZernioProvider.js` wraps each native adapter. With `ZERNIO_API_KEY` set, **new** connections for the platforms in `ZERNIO_PLATFORMS` go through Zernio's hosted connect flow. Users still sign in once, on the platform's own consent screen.
- Each Meadow workspace gets one Zernio profile (`meadow-<projectId>`), saved in the `zernioProfile` store record. Zernio returns to `https://findmeadow.com/oauth/<platform>/callback`. Meadow then confirms that the returned account belongs to that workspace's profile.
- Zernio accounts store `{ zernioAccountId, zernioProfileId }` as credentials. Accounts connected natively before the switch keep their tokens and keep publishing through the native adapter.
- Posts are created with an `Idempotency-Key` per delivery, scheduled 30 seconds ahead, and polled until Zernio reports `published` or `failed`. Disconnecting an account in Meadow also disconnects it in Zernio.
- Post metrics and account views aren't available for Zernio connections yet.

## Status — September 28, 2026

`ZERNIO_API_KEY` remains installed as a production secret for the five platforms above. `wrangler.jsonc` explicitly sets `ZERNIO_PLATFORMS=snapchat,facebook,instagram,threads,pinterest`; the backend default matches. TikTok's existing `TIKTOK_CLIENT_KEY` and `TIKTOK_CLIENT_SECRET` drive Login Kit and the native Content Posting API adapter. The backend container reads its environment when it starts, so configuration changes take effect through the next normal rollout from `main`.

The TikTok developer portal shows Meadow live in production as of September 28, with Login Kit, Direct Post, and the four requested scopes enabled. Its separate Direct Post audit still offers **Apply**, so `TIKTOK_DIRECT_POST_PRIVATE_ONLY=true` remains in place. App approval alone does not lift TikTok's unaudited-client restrictions.

Existing native TikTok accounts retain their account IDs, credentials, scheduled deliveries, and history. Legacy Zernio credentials cannot be converted into a TikTok grant: their owners must authorize Meadow directly through **Connect TikTok**. The legacy adapter remains available for already-connected Zernio accounts and in-flight deliveries; this routing change does not revoke accounts or erase history.

## Configuration

| Name | Where | Value |
| --- | --- | --- |
| `ZERNIO_API_KEY` | Cloudflare production **secret** | API key from the Zernio dashboard (`sk_…`). Never commit it. |
| `ZERNIO_PLATFORMS` | Cloudflare variable (optional) | Comma-separated list. Defaults to Snapchat, Facebook, Instagram, Threads, and Pinterest. Production explicitly uses that list. |

The key must be installed through Cloudflare's secret settings. After a platform's native app is approved, remove it from `ZERNIO_PLATFORMS` so that new connections use Meadow's own app again. Existing Zernio connections keep working either way while the key is set.

Snapchat is a closed beta on Zernio. Until Zernio approves the account, connecting Snapchat shows Zernio's error.
