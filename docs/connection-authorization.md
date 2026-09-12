# Platform authorization screens

Every Connect and Reconnect action starts a fresh authorization request on the selected platform. The platform identifies the app, authenticates the account, and decides how to show the requested permissions and registered policy links. Meadow's connection notice describes Meadow's data handling before this redirect; it does not replace the platform's authorization.

The platform's permissions screen usually summarizes access and links to policies. It is not a full privacy-policy document. Meadow cannot replace its contents or guarantee the same screen for every platform, existing authorization, or account type.

## Implemented behavior

| Platform | Native flow and repeat-connection behavior |
| --- | --- |
| TikTok | `www.tiktok.com/v2/auth/authorize/` with `disable_auto_auth=1` requests the authorization page on every attempt, including previously authorized sessions. |
| YouTube and Google Business Profile | Google's authorization endpoint with `prompt=consent select_account` requests both consent and account selection. Existing offline access and PKCE remain enabled. |
| Pinterest | Pinterest's documented OAuth approval page receives the requested account, board, and Pin scopes on every attempt. Pinterest does not document an extra parameter to force repeat consent. |
| Bluesky | The official AT Protocol OAuth client sends `prompt=consent` to the account's authorization server. Public client metadata includes Meadow's `policy_uri` and `tos_uri`. A user's independent server controls its display. |
| Instagram | Instagram Business Login uses the documented `force_reauth=true` setting, replacing the old `force_authentication` parameter. This forces account authentication; it does not promise a repeat review of every previously granted permission. |
| Threads | The current `threads.com/oauth/authorize` endpoint opens Threads' authorization window with the requested scopes. No documented repeat-consent override is added. |
| Facebook | Facebook's native Login Dialog receives the Page and analytics scopes. Its `auth_type=rerequest` option only re-asks declined permissions; it does not force a full review of granted permissions, so it is not used as a substitute for repeat consent. |
| LinkedIn | LinkedIn's authorization endpoint receives the requested scopes. LinkedIn explicitly skips its consent screen for an existing permission grant. There is no documented force-consent setting in its authorization-code flow. |
| X | X's OAuth 2.0 authorization page receives the requested scopes and PKCE challenge. Its documented OAuth 2.0 flow has no force-consent option; OAuth 1.0 login parameters are not added to this flow. |

Connections are not revoked and permissions are not expanded just to make a provider show a screen. Existing connections keep working. A user who needs to review an existing grant can use the platform's connected-app settings. Providers still awaiting credentials or app approval remain unavailable until configured.

## App registration and verification

In each enabled provider's developer console, register the Meadow name, correct callback, `https://findmeadow.com/privacy/`, and `https://findmeadow.com/terms/` in its supported app fields. These console values determine the links shown by the provider and are separate from the authorization URL. Bluesky obtains these fields from the public client metadata instead.

Before enabling a provider, test with both a first-time account and a previously authorized account. Confirm the native page identifies the intended account and permissions, verify its policy links, cancel once, then complete authorization as the account owner. Automated tests validate generated requests and connection state; they do not establish that the provider displayed or approved a live account's consent screen.

## Provider references

- [TikTok Login Kit for Web](https://developers.tiktok.com/docs/en/login-kit-web)
- [Google web-server OAuth](https://developers.google.com/identity/protocols/oauth2/web-server)
- [Pinterest authentication and authorization](https://developers.pinterest.com/docs/getting-started/set-up-authentication-and-authorization/)
- [AT Protocol OAuth and client metadata](https://atproto.com/specs/oauth), [official OAuth client](https://github.com/bluesky-social/atproto/tree/main/packages/oauth/oauth-client)
- [Instagram Business Login](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login/business-login)
- [Threads authorization window](https://developers.facebook.com/documentation/threads/get-started/get-access-tokens-and-permissions)
- [Facebook Login Dialog](https://developers.facebook.com/documentation/facebook-login/guides/advanced/manual-flow)
- [LinkedIn authorization-code flow](https://learn.microsoft.com/en-us/linkedin/shared/authentication/authorization-code-flow)
- [X OAuth 2.0 authorization](https://docs.x.com/fundamentals/authentication/oauth-2-0/authorization-code)
