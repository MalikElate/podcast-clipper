import test from "node:test";
import assert from "node:assert/strict";
import { HttpTransport } from "../src/bridge/platforms/HttpTransport.js";

const host = "https://open.tiktokapis.com/v2";
const logId = "202210112248442CB9319E1FB30C1073F3";
const requestError = (status, code, extra = {}) => new HttpTransport({ fetcher: async () => Response.json({ error: { code, message: "private-token private-client-secret", log_id: logId, ...extra } }, { status }) });
const publicError = error => JSON.stringify({ ...error, message: error.message });

test("TikTok Direct Post, inbox, and photo initialization errors identify a safe actionable cause", async () => {
  const cases = [
    ["post/publish/video/init/", 403, "unaudited_client_can_only_post_to_private_accounts", /account private and select Only me/],
    ["post/publish/video/init/", 403, "url_ownership_unverified", /verify the media domain or URL prefix/],
    ["post/publish/inbox/video/init/", 403, "url_ownership_unverified", /verify the media domain or URL prefix/],
    ["post/publish/content/init/", 403, "privacy_level_option_mismatch", /choose an available audience/],
    ["post/publish/video/init/", 403, "spam_risk_user_banned_from_posting", /Resolve the account restriction/],
    ["post/publish/content/init/", 403, "reached_active_user_cap", /daily allowance for active publishing users/],
    ["post/publish/content/init/", 400, "app_version_check_failed", /31\.8 or newer/],
  ];
  for (const [endpoint, status, code, expected] of cases) {
    await assert.rejects(requestError(status, code).request(`${host}/${endpoint}`, { method: "POST", token: "private-token", json: {} }), error => {
      assert.match(error.message, expected, code);
      assert.equal(error.code, "provider_rejected");
      assert.equal(error.reconnect, false);
      assert.equal(error.retryable, false);
      assert.equal(error.uncertain, false);
      assert.deepEqual(error.details, { provider: "tiktok", httpStatus: status, providerCode: code, logId });
      assert.ok(error.message.includes(`TikTok code: ${code}`));
      assert.ok(error.message.includes(`reference: ${logId}`));
      assert.doesNotMatch(publicError(error), /private-token|private-client-secret/);
      return true;
    });
  }
});

test("TikTok missing grants are not treated as expired tokens on any API error status", async () => {
  for (const endpoint of ["post/publish/video/init/", "post/publish/inbox/video/init/", "post/publish/creator_info/query/"]) {
    for (const status of [200, 401, 403]) {
      await assert.rejects(requestError(status, "scope_not_authorized").request(`${host}/${endpoint}`, { method: "POST", json: {} }), error => {
        assert.equal(error.code, "provider_permissions");
        assert.equal(error.authFailure, undefined);
        assert.equal(error.reconnect, false);
        assert.match(error.message, /Reconnect TikTok and allow the required permission/);
        assert.equal(error.details.providerCode, "scope_not_authorized");
        return true;
      });
    }
  }
});

test("TikTok JSON allowance errors keep their existing retry behavior including HTTP 200 creator responses", async () => {
  for (const status of [200, 403]) {
    for (const code of ["spam_risk_too_many_posts", "spam_risk_too_many_pending_share", "rate_limit_exceeded"]) {
      await assert.rejects(requestError(status, code).request(`${host}/post/publish/creator_info/query/`, { method: "POST", safeToRetry: true }), error => {
        assert.equal(error.code, "rate_limited");
        assert.equal(error.retryable, true);
        assert.equal(error.reconnect, false);
        assert.equal(error.uncertain, false);
        assert.equal(error.details.providerCode, code);
        return true;
      });
    }
    await assert.rejects(requestError(status, "reached_active_user_cap").request(`${host}/post/publish/creator_info/query/`), error => !error.retryable && error.code === "provider_rejected");
  }
});

test("TikTok invalid access tokens retain renewal behavior and successful responses pass through", async () => {
  for (const status of [200, 400, 401]) {
    await assert.rejects(requestError(status, "access_token_invalid").request(`${host}/user/info/`), error => error.reconnect && error.authFailure === "access_token" && error.details.providerCode === "access_token_invalid");
  }
  const data = { data: { publish_id: "example-publish-id" }, error: { code: "ok", message: "", log_id: logId } };
  const http = new HttpTransport({ fetcher: async () => Response.json(data) });
  assert.deepEqual(await http.request(`${host}/post/publish/video/init/`, { method: "POST" }), data);
});

test("unrecognized TikTok responses never expose messages, arbitrary codes, or malformed log IDs", async () => {
  for (const code of ["private-token", "private_client_secret", "https://example.test/?access_token=private-token", { token: "private-token" }]) {
    await assert.rejects(requestError(403, code, { log_id: "private-log-secret", detail: "private-detail-secret" }).request(`${host}/post/publish/video/init/`, { method: "POST" }), error => {
      assert.equal(error.code, "provider_rejected");
      assert.match(error.message, /without a recognized error code/);
      assert.deepEqual(error.details, { provider: "tiktok", httpStatus: 403 });
      assert.doesNotMatch(publicError(error), /private|access_token|https:/);
      return true;
    });
  }
});

test("TikTok error mapping is limited to the exact API host and leaves OAuth grant handling intact", async () => {
  await assert.rejects(requestError(403, "url_ownership_unverified").request("https://open.tiktokapis.com.example.test/posts"), error => {
    assert.doesNotMatch(error.message, /TikTok/);
    assert.deepEqual(error.details, { providerCode: "url_ownership_unverified" });
    return true;
  });
  for (const [code, reconnect, authFailure] of [["invalid_grant", true, "grant"], ["invalid_client", false, undefined]]) {
    const http = new HttpTransport({ fetcher: async () => Response.json({ error: code, error_description: "private-secret" }, { status: 400 }) });
    await assert.rejects(http.request(`${host}/oauth/token/`, { method: "POST" }), error => {
      assert.equal(error.reconnect, reconnect);
      assert.equal(error.authFailure, authFailure);
      assert.doesNotMatch(publicError(error), /private-secret/);
      return true;
    });
  }
});
