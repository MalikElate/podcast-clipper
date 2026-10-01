import test from "node:test";
import assert from "node:assert/strict";
import { WelcomeEmailService, clerkSignupContact, welcomeEmailContent, CONTACT_EMAIL, CONTACT_PHONE, CONTACT_PHONE_DISPLAY } from "../src/bridge/services/WelcomeEmailService.js";
import * as siteContact from "../../frontend/src/siteContact.js";

const quiet = { warn() {} };

test("the published contact details and the emailed ones are the same", () => {
  assert.equal(CONTACT_EMAIL, siteContact.CONTACT_EMAIL);
  assert.equal(CONTACT_PHONE, siteContact.CONTACT_PHONE);
  assert.equal(CONTACT_PHONE_DISPLAY, siteContact.CONTACT_PHONE_DISPLAY);
});

test("the welcome email carries both ways to reach a person", () => {
  const { text, html, subject } = welcomeEmailContent({ firstName: "Ada" });
  assert.equal(subject, "Welcome to Meadow");
  assert.match(text, /^Hi Ada,/);
  for (const body of [text, html]) {
    assert.ok(body.includes(CONTACT_EMAIL), "the support address must appear");
    assert.ok(body.includes(CONTACT_PHONE_DISPLAY), "the phone number must appear");
  }
  assert.ok(html.includes('href="mailto:hello@findmeadow.com"'));
  assert.ok(html.includes('href="tel:+16122237014"'));
});

test("a signup without a name still reads as a sentence", () => {
  assert.match(welcomeEmailContent({}).text, /^Hi,/);
  assert.match(welcomeEmailContent({ firstName: "  " }).text, /^Hi,/);
});

test("a name cannot inject markup into the email", () => {
  const { html } = welcomeEmailContent({ firstName: '<img src=x onerror="alert(1)">' });
  assert.ok(!html.includes("<img"), "a name must not become an element");
  assert.ok(html.includes("&lt;img"), "a name must be shown as text");
});

test("the primary address is preferred, and a signup can have none", () => {
  const data = { id: "user_1", first_name: "Ada", primary_email_address_id: "idb", email_addresses: [{ id: "ida", email_address: "old@example.com" }, { id: "idb", email_address: "ada@example.com" }] };
  assert.deepEqual(clerkSignupContact(data), { email: "ada@example.com", firstName: "Ada", userId: "user_1" });
  assert.equal(clerkSignupContact({ id: "user_2" }).email, "");
  assert.equal(clerkSignupContact({ id: "u", email_addresses: [{ id: "x", email_address: "only@example.com" }] }).email, "only@example.com");
});

test("nothing is sent until a key is configured", async () => {
  let called = false;
  const service = new WelcomeEmailService({ env: {}, fetcher: async () => { called = true; }, logger: quiet });
  assert.equal(service.configured, false);
  assert.equal(await service.sendWelcome({ email: "ada@example.com" }), false);
  assert.equal(called, false, "an unconfigured service must not call out");
});

test("a configured service sends one idempotent message to the new account", async () => {
  const calls = [];
  const service = new WelcomeEmailService({ env: { RESEND_API_KEY: "re_test" }, fetcher: async (url, init) => { calls.push({ url, init }); return { ok: true, status: 200 }; }, logger: quiet });
  assert.equal(await service.sendWelcome({ email: "ada@example.com", firstName: "Ada", userId: "user_1" }), true);
  assert.equal(calls.length, 1);
  const [{ url, init }] = calls;
  assert.equal(url, "https://api.resend.com/emails");
  assert.equal(init.headers.Authorization, "Bearer re_test");
  assert.equal(init.headers["Idempotency-Key"], "meadow-welcome-user_1");
  const body = JSON.parse(init.body);
  assert.deepEqual(body.to, ["ada@example.com"]);
  assert.equal(body.reply_to, CONTACT_EMAIL);
  assert.ok(body.from.includes(CONTACT_EMAIL));
});

test("a signup is never undone by an email that fails", async () => {
  const rejected = new WelcomeEmailService({ env: { RESEND_API_KEY: "re_test" }, fetcher: async () => ({ ok: false, status: 422 }), logger: quiet });
  assert.equal(await rejected.sendWelcome({ email: "ada@example.com" }), false);
  const offline = new WelcomeEmailService({ env: { RESEND_API_KEY: "re_test" }, fetcher: async () => { throw new Error("network down"); }, logger: quiet });
  assert.equal(await offline.sendWelcome({ email: "ada@example.com" }), false);
});

test("an account with no address is not emailed", async () => {
  let called = false;
  const service = new WelcomeEmailService({ env: { RESEND_API_KEY: "re_test" }, fetcher: async () => { called = true; return { ok: true }; }, logger: quiet });
  assert.equal(await service.sendWelcome({ email: "" }), false);
  assert.equal(called, false);
});
