# Zernio publishing

Meadow uses [Zernio](https://docs.zernio.com) for new connections to TikTok, Snapchat, Facebook, Instagram, Threads, and Pinterest. TikTok was restored to Zernio on September 30 while Meadow's separate Direct Post audit remains pending.

## How it works

- `backend/src/bridge/platforms/ZernioProvider.js` wraps each native adapter. With `ZERNIO_API_KEY` set, **new** connections for the platforms in `ZERNIO_PLATFORMS` go through Zernio's hosted connect flow. Users still sign in once, on the platform's own consent screen.
- New workspaces reuse their Meadow owner's existing Zernio profile, so the same social account retains its provider ID across those workspaces. Profile resolution is serialized per owner. The first profile is named `meadow-<projectId>`; historical workspace bindings are retained. Zernio returns to `https://findmeadow.com/oauth/<platform>/callback`. Meadow confirms that the returned account belongs to the workspace's saved profile and applies the [owner-scoped duplicate check](account-connections.md).
- Zernio accounts store `{ zernioAccountId, zernioProfileId }` as credentials. Accounts connected natively before the switch keep their tokens and keep publishing through the native adapter.
- Posts are created with an `Idempotency-Key` per delivery, scheduled 30 seconds ahead, and polled until Zernio reports `published` or `failed`. Disconnecting an account in Meadow also disconnects it in Zernio.
- Post metrics and account views aren't available for Zernio connections yet.

## Status — September 30, 2026

`ZERNIO_API_KEY` remains installed as a production secret for the six platforms above. `wrangler.jsonc` explicitly sets `ZERNIO_PLATFORMS=tiktok,snapchat,facebook,instagram,threads,pinterest`; the backend default matches. Retain TikTok's production credentials (`TIKTOK_CLIENT_KEY_V2` and `TIKTOK_CLIENT_SECRET_V2`) and the original pair for existing native production and Sandbox grants. See [TikTok app review](tiktok-app-review.md) for those grants. The backend container reads its environment when it starts, so configuration changes take effect through the next normal rollout from `main`.

The TikTok developer portal shows Meadow live in production as of September 28, with Login Kit, Direct Post, and the four requested scopes enabled. Its separate Direct Post audit still offers **Apply**, so `TIKTOK_DIRECT_POST_PRIVATE_ONLY=true` remains in place. App approval alone does not lift TikTok's unaudited-client restrictions.

Existing native TikTok accounts retain their account IDs, credentials, scheduled deliveries, and history, and keep using the native adapter. Native credentials cannot be converted into a Zernio grant: their owners must use **Connect TikTok** to authorize through Zernio. Existing Zernio connections and in-flight deliveries continue using Zernio. No accounts or scheduled posts are automatically merged, moved, or revoked by this routing change.

## Configuration

| Name | Where | Value |
| --- | --- | --- |
| `ZERNIO_API_KEY` | Cloudflare production **secret** | API key from the Zernio dashboard (`sk_…`). Never commit it. |
| `ZERNIO_PLATFORMS` | Cloudflare variable (optional) | Comma-separated list. Defaults to TikTok, Snapchat, Facebook, Instagram, Threads, and Pinterest. Production explicitly uses that list. |

The key must be installed through Cloudflare's secret settings. When a platform's native integration is ready for production publishing, including any separate posting audit, remove it from `ZERNIO_PLATFORMS` so that new connections use Meadow's own app again. Existing Zernio connections keep working either way while the key is set.

Snapchat is a closed beta on Zernio. Until Zernio approves the account, connecting Snapchat shows Zernio's error.
