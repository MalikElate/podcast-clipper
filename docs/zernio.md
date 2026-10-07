# Zernio publishing

Meadow uses [Zernio](https://docs.zernio.com) for new connections to Snapchat, Facebook, Instagram, Threads, and Pinterest. TikTok moved back to Meadow's own TikTok app on October 7, 2026, after TikTok approved the Direct Post audit; existing Zernio TikTok connections keep working through Zernio.

## How it works

- `backend/src/bridge/platforms/ZernioProvider.js` wraps each native adapter. With `ZERNIO_API_KEY` set, **new** connections for the platforms in `ZERNIO_PLATFORMS` go through Zernio's hosted connect flow. Users still sign in once, on the platform's own consent screen.
- New workspaces reuse their Meadow owner's existing Zernio profile, so the same social account retains its provider ID across those workspaces. Profile resolution is serialized per owner. The first profile is named `meadow-<projectId>`; historical workspace bindings are retained. Zernio returns to `https://findmeadow.com/oauth/<platform>/callback`. Meadow confirms that the returned account belongs to the workspace's saved profile and applies the [owner-scoped duplicate check](account-connections.md).
- Zernio accounts store `{ zernioAccountId, zernioProfileId }` as credentials. Accounts connected natively before the switch keep their tokens and keep publishing through the native adapter.
- Posts are created with an `Idempotency-Key` per delivery, scheduled 30 seconds ahead, and polled until Zernio reports `published` or `failed`. Disconnecting an account in Meadow also disconnects it in Zernio.
- TikTok can confirm publication before returning its public post ID and link. Later analytics syncs reconcile those fields against the same provider account and post, repairing existing deliveries without reposting them. The resolved ID also prevents the connected-account analytics feed from counting that video twice.
- Post metrics are read from [Zernio analytics](https://docs.zernio.com/analytics/get-analytics), scoped to the saved account and profile. The dashboard also reads connected-account posts from the last 90 days, including posts published directly on the network, and removes overlaps with Meadow deliveries. It loads up to 500 posts per account and labels partial totals when more pages remain. Reported zeros stay zero; absent metrics stay unavailable. Pending syncs and refresh failures preserve prior readings and display an explanation. Analytics access depends on the Zernio plan; a missing entitlement is shown without marking the social account disconnected.
- Connected-account reports use a bounded, 30-minute in-memory cache and refresh at most once per minute per non-Pinterest connection. Background refreshes rotate through two accounts every minute, with at least 15 minutes between refreshes of an account. They do not create publishing records or import media. Cached reports disappear when the backend restarts, then reload through refresh. Pinterest connected-account metrics are returned only for the refresh request and are never cached or saved. The separate 180-day account views endpoint remains unavailable for Zernio connections.

## Status — October 7, 2026

`ZERNIO_API_KEY` remains installed as a production secret. `wrangler.jsonc` sets `ZERNIO_PLATFORMS=snapchat,facebook,instagram,threads,pinterest`, and the backend default matches. TikTok left the list on October 7 when TikTok approved Meadow's Direct Post audit; `TIKTOK_DIRECT_POST_PRIVATE_ONLY` is now `false`. New TikTok connections use Meadow's production client (`TIKTOK_CLIENT_KEY_V2` / `TIKTOK_CLIENT_SECRET_V2`); keep the original pair for older native grants. See [TikTok app review](tiktok-app-review.md). The backend container reads its environment when it starts, so configuration changes take effect through the next normal rollout from `main`.

Existing Zernio TikTok accounts keep their account IDs, scheduled deliveries, history, and Zernio publishing; they are not revoked or moved automatically. A Zernio grant cannot be converted into a native one, so an owner who wants their TikTok on Meadow's own app must use **Connect TikTok** again and then disconnect the Zernio copy. TikTok's native open ID differs from the Zernio account ID, so the two connections are separate accounts in Meadow. Natively connected TikTok accounts feed Swipe or Push through TikTok's `video.list`.

## Configuration

| Name | Where | Value |
| --- | --- | --- |
| `ZERNIO_API_KEY` | Cloudflare production **secret** | API key from the Zernio dashboard (`sk_…`). Never commit it. |
| `ZERNIO_PLATFORMS` | Cloudflare variable (optional) | Comma-separated list. Defaults to TikTok, Snapchat, Facebook, Instagram, Threads, and Pinterest. Production explicitly uses that list. |

The key must be installed through Cloudflare's secret settings. When a platform's native integration is ready for production publishing, including any separate posting audit, remove it from `ZERNIO_PLATFORMS` so that new connections use Meadow's own app again. Existing Zernio connections keep working either way while the key is set.

Snapchat is a closed beta on Zernio. Until Zernio approves the account, connecting Snapchat shows Zernio's error.
