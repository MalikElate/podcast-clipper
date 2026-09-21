# Kick and Twitch for Meadow

## Feature parity with Postiz

Checked against the [Twitch provider](https://github.com/gitroomhq/postiz-app/blob/main/libraries/nestjs-libraries/src/integrations/social/twitch.provider.ts), [Kick provider](https://github.com/gitroomhq/postiz-app/blob/main/libraries/nestjs-libraries/src/integrations/social/kick.provider.ts), and public [Twitch](https://postiz.com/channels/twitch) / [Kick](https://postiz.com/channels/kick) pages on September 21, 2026.

| Feature | Twitch | Kick |
| --- | --- | --- |
| Connect your own channel with OAuth | Yes | Yes, with PKCE |
| Publish now or schedule chat messages | Yes | Yes |
| Reply to an existing message | Yes | Yes |
| Follow-up reply thread | Yes | Yes |
| Colored chat announcements | Channel color, blue, green, orange, purple | Unavailable |
| Video uploads / broadcasting | Unavailable | Unavailable |
| Chat engagement analytics | Unavailable | Unavailable |

Meadow supports up to 10 follow-ups per delivery. Each chat message allows 500 characters; Kick also requires at most 2,048 UTF-8 bytes and counts graphemes. Follow-up announcements remain separate announcements, since Twitch does not return their message IDs. Twitch Shared Chat can distribute user-token messages to all participating channels; the composer discloses this.

## App registration

Customer-facing name: **Meadow**. Website: `https://findmeadow.com`. Privacy: `https://findmeadow.com/privacy/`. Terms: `https://findmeadow.com/terms/`. Do not put personal phone numbers, addresses or credentials in public app fields.

### Twitch

Use the existing owner account at [Twitch Developers](https://dev.twitch.tv/console/apps). Developer registration requires 2FA. Register a confidential web application with OAuth redirect `https://findmeadow.com/oauth/twitch/callback`. Store its client ID and secret as `TWITCH_CLIENT_ID` and `TWITCH_CLIENT_SECRET` in backend/Worker secrets.

Meadow requests only `user:write:chat` and `moderator:manage:announcements`. It validates the token's client, user, and scopes at connection time, before publishing, at process startup and every 50 minutes while running. A 30-minute Cloudflare wake-up runs only when Twitch is configured, preserving hourly checks while idle (and increasing idle container runtime).

### Kick

Use the existing owner account at [Kick developer settings](https://kick.com/settings/developer). Enable 2FA if required, and register **Meadow** with redirect `https://findmeadow.com/oauth/kick/callback`. Store `KICK_CLIENT_ID` and `KICK_CLIENT_SECRET` in backend/Worker secrets.

The authorization-code flow uses PKCE and scopes `user:read channel:read chat:write`. Discovery retains the channel identity and image but discards the email returned by the user endpoint. Both rotating refresh tokens and access tokens stay encrypted in Meadow.

## Delivery and retry behavior

Chat publishing requires explicit successful delivery confirmation and a message ID. A dropped message is a failure; an ambiguous response or timeout requires review. Each confirmed message is durably checkpointed before its follow-up. Retrying resumes at the first unconfirmed message; partially sent threads cannot be edited or erased from delivery history. For an uncertain result, inspect the channel and confirm that the first unconfirmed message was not sent before retrying. Cancel remaining stops unsent follow-ups. Twitch announcements require HTTP 204 and use an explicitly local receipt rather than an invented platform message ID.

Disconnect removes connection data and queues token revocation. Credentials held solely for failed revocation expire within seven days. Published messages remain on the platform.

## Activation status and acceptance

Code is implemented; production credentials and live posting remain unverified. Both developer tabs are waiting for owner sign-in. Do not advertise the integrations as connected until registration and the checks below succeed.

1. Register both apps and configure secrets with the callbacks above.
2. Connect each channel from Meadow and verify the channel name and encrypted token storage.
3. Submit one approved test chat message, then a two-message reply thread; verify the platform chat and Meadow's delivery records.
4. Verify a Twitch announcement with a selected color.
5. Schedule a future chat and verify it sends once at the selected time.
6. Verify disconnect stops queued work and revokes access, then reconnect.

References: [Twitch chat message](https://dev.twitch.tv/docs/api/reference#send-chat-message), [Twitch announcement](https://dev.twitch.tv/docs/api/reference#send-chat-announcement), [Twitch token validation](https://dev.twitch.tv/docs/authentication/validate-tokens/), [Kick chat](https://docs.kick.com/apis/chat), [Kick OAuth](https://docs.kick.com/getting-started/generating-tokens-oauth2-flow).
