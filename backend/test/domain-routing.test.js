import assert from "node:assert/strict";
import test from "node:test";
import { appDomainRedirect } from "../../cloudflare/domainRouting.js";

test("marketing dashboard links move to the app subdomain without losing state", () => {
  assert.equal(
    appDomainRedirect("https://findmeadow.com/dashboard/connections?project=one&connection=two"),
    "https://app.findmeadow.com/dashboard/connections?project=one&connection=two",
  );
  assert.equal(appDomainRedirect("https://www.findmeadow.com/dashboard"), "https://app.findmeadow.com/dashboard");
});

test("public, API, and app-domain requests are not redirected", () => {
  assert.equal(appDomainRedirect("https://findmeadow.com/pricing"), null);
  assert.equal(appDomainRedirect("https://findmeadow.com/api/bridge/config"), null);
  assert.equal(appDomainRedirect("https://app.findmeadow.com/dashboard"), null);
});
