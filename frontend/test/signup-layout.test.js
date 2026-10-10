import assert from "node:assert/strict";
import test from "node:test";
import { handleSignupTab, syncSigninLayout, syncSignupLayout } from "../src/signupLayout.js";

function entryForm(value = "") {
  const fields = { classList: new Set() };
  fields.classList.add = fields.classList.add.bind(fields.classList);
  const action = { classList: new Set() };
  const form = { querySelector: () => ({ parentElement: action }) };
  action.parentElement = form;
  const email = { value, closest: () => form };
  const emailRow = { parentElement: fields, querySelector: () => email };
  const passwordAttributes = new Map();
  const passwordControls = [{ tabIndex: -1 }, { tabIndex: -1 }];
  const passwordRow = {
    parentElement: fields,
    getAttribute: name => passwordAttributes.get(name),
    setAttribute: (name, value) => passwordAttributes.set(name, value),
    querySelectorAll: () => passwordControls,
  };
  const root = {
    dataset: {},
    querySelector: selector => ({
      ".cl-formFieldRow__emailAddress": emailRow,
      ".cl-formFieldRow__identifier": emailRow,
      ".cl-formFieldRow__password": passwordRow,
    })[selector] || null,
  };
  return { root, email, emailRow, passwordRow, passwordControls, fields, action };
}

test("a blank signup initially hides the password; typing and clearing update it", () => {
  const { root, email } = entryForm();
  syncSignupLayout(root);
  assert.equal(root.dataset.signupEntry, "true");
  assert.equal(root.dataset.emailEntered, "false");
  email.value = "person@example.com";
  syncSignupLayout(root);
  assert.equal(root.dataset.emailEntered, "true");
  email.value = "   ";
  syncSignupLayout(root);
  assert.equal(root.dataset.emailEntered, "false");
});

test("a restored or autofilled email reveals the password without needing to type", () => {
  const { root } = entryForm("person@example.com");
  syncSignupLayout(root);
  assert.equal(root.dataset.emailEntered, "true");
});

test("verification steps restore Clerk's normal layout", () => {
  const { root } = entryForm("person@example.com");
  syncSignupLayout(root);
  root.querySelector = () => null;
  syncSignupLayout(root);
  assert.equal(root.dataset.signupEntry, "false");
  assert.equal(root.dataset.emailEntered, "false");
});

test("unrelated email and password fields do not trigger the signup layout", () => {
  const { root, passwordRow } = entryForm();
  passwordRow.parentElement = {};
  syncSignupLayout(root);
  assert.equal(root.dataset.signupEntry, "false");
});

test("sign-in reveals Clerk's native password accessibly after email and hides it on clearing", () => {
  const { root, email, passwordRow, passwordControls } = entryForm();
  syncSigninLayout(root);
  assert.equal(root.dataset.signupEntry, "true");
  assert.equal(passwordRow.getAttribute("aria-hidden"), "true");
  assert.deepEqual(passwordControls.map(control => control.tabIndex), [-1, -1]);
  email.value = "person@example.com";
  syncSigninLayout(root);
  assert.equal(passwordRow.getAttribute("aria-hidden"), "false");
  assert.deepEqual(passwordControls.map(control => control.tabIndex), [0, 0]);
  email.value = "";
  syncSigninLayout(root);
  assert.equal(passwordRow.getAttribute("aria-hidden"), "true");
  assert.deepEqual(passwordControls.map(control => control.tabIndex), [-1, -1]);
});

test("sign-in password recovery and verification steps retain Clerk's normal layout", () => {
  const { root } = entryForm();
  root.querySelector = () => null;
  syncSigninLayout(root);
  assert.equal(root.dataset.signupEntry, "false");
});

test("keyboard navigation follows email, providers, then password in either direction", () => {
  const focused = [];
  const element = (name, group, visible = true) => ({
    name, tabIndex: 0,
    matches: selector => selector === ".cl-socialButtonsBlockButton__facebook" && name === "Facebook",
    getClientRects: () => visible ? [{}] : [],
    closest: selector => selector.split(", ").includes(group),
    focus: () => focused.push(name),
  });
  const email = element("email", ".cl-formFieldRow__emailAddress");
  const password = element("password", ".cl-formFieldRow__password");
  const facebook = element("Facebook", ".cl-socialButtonsRoot");
  const google = element("Google", ".cl-socialButtonsRoot");
  const hidden = element("hidden submit", null, false);
  const root = { dataset: { signupEntry: "true" }, querySelectorAll: () => [hidden, email, password, google, facebook] };
  const previousStyle = globalThis.getComputedStyle;
  globalThis.getComputedStyle = () => ({ visibility: "visible" });
  try {
    const event = (target, shiftKey = false) => ({
      key: "Tab", target, shiftKey, preventDefault() { this.prevented = true; },
    });
    handleSignupTab(event(email), root);
    handleSignupTab(event(google), root);
    handleSignupTab(event(password, true), root);
    assert.deepEqual(focused, ["Facebook", "password", "Google"]);
    const last = event(password);
    handleSignupTab(last, root);
    assert.equal(last.prevented, undefined, "Tab may leave the card at its last control");
    const first = event(email, true);
    handleSignupTab(first, root);
    assert.equal(first.prevented, undefined, "Shift+Tab may leave the card at its first control");
  } finally {
    globalThis.getComputedStyle = previousStyle;
  }
});
