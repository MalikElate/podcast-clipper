import assert from "node:assert/strict";
import test from "node:test";
import { withVisitorCountry } from "../../cloudflare/visitorCountry.js";

test("Cloudflare country replaces a forged visitor header", () => {
  const incoming = new Request("https://findmeadow.com/api/bridge/billing/checkout", {
    method: "POST",
    headers: { "x-meadow-visitor-country": "CM", "content-type": "application/json" },
    body: "{}",
  });
  Object.defineProperty(incoming, "cf", { value: { country: "US" } });
  const forwarded = withVisitorCountry(incoming);
  assert.equal(forwarded.headers.get("x-meadow-visitor-country"), "US");
  assert.equal(forwarded.headers.get("content-type"), "application/json");
});

test("unknown Cloudflare country removes a forged visitor header", () => {
  const incoming = new Request("https://findmeadow.com/api/pricing", { headers: { "x-meadow-visitor-country": "NG" } });
  Object.defineProperty(incoming, "cf", { value: { country: "T1" } });
  assert.equal(withVisitorCountry(incoming).headers.has("x-meadow-visitor-country"), false);
});
