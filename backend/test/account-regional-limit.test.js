import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { AccountService } from "../src/bridge/services/AccountService.js";
import { ProjectService } from "../src/bridge/services/ProjectService.js";
import { SecretVault } from "../src/bridge/core/SecretVault.js";
import { SqliteStore } from "../src/bridge/storage/SqliteStore.js";

function fixture(t) {
  const now = Date.parse("2026-10-09T12:00:00Z");
  const store = new SqliteStore();
  const projects = new ProjectService(store);
  const project = projects.create("alice", { name: "Main" });
  const vault = new SecretVault(randomBytes(32).toString("base64"));
  const registry = { get: platform => ({
    authorizationUrl: async ({ state }) => `https://authorize.example/${platform}?state=${state}`,
    exchange: async ({ code }) => ({ accessToken: code }),
    accounts: async ({ accessToken }) => accessToken.split(",").map(remoteId => ({ remoteId, label: remoteId })),
  }) };
  const accounts = new AccountService({ store, projects, registry, vault, clock: () => now });
  t.after(() => store.db.close());

  async function begin(ids, { startCountry, callbackCountry, projectId = project.id } = {}) {
    const { url } = await accounts.start("alice", projectId, "x", {}, { countryCode: startCountry });
    const state = new URL(url).searchParams.get("state");
    const result = await accounts.callback("x", new URLSearchParams({ state, code: ids.join(",") }), { countryCode: callbackCountry });
    return { ...result, projectId, state };
  }
  async function connect(id, options) { return begin([id], options); }
  return { now, store, projects, project, vault, accounts, begin, connect };
}

const limitError = error => error.code === "account_limit_reached" && error.status === 409;

test("Sub-Saharan Free accounts stop at two new connections while reconnects and existing data remain intact", async t => {
  const h = fixture(t);
  await h.connect("first", { startCountry: "CM" });
  await h.connect("second", { startCountry: "cm" });
  await assert.rejects(h.connect("third", { startCountry: "CM" }), limitError);
  assert.deepEqual(h.accounts.list("alice", h.project.id).map(item => item.remoteId).sort(), ["first", "second"]);

  const before = h.store.list("account", { ownerUid: "alice", limit: null }).find(item => item.remoteId === "first");
  h.store.put("account", { ...before, status: "reconnect_required" });
  await h.connect("first", { startCountry: "CM" });
  const reconnected = h.store.get("account", before.id);
  assert.equal(reconnected.id, before.id);
  assert.equal(reconnected.status, "connected");

  // Visiting the region never deletes an account that was connected elsewhere.
  await h.connect("third", { startCountry: "US" });
  await assert.rejects(h.connect("fourth", { startCountry: "CM" }), limitError);
  await h.connect("second", { startCountry: "CM" });
  assert.equal(h.accounts.list("alice", h.project.id).length, 3);

  for (const status of ["incomplete", "unpaid", "paused", "past_due"]) {
    h.store.put("billing", { id: "alice", ownerUid: "alice", status, planId: "starter" });
    await assert.rejects(h.connect("fourth", { startCountry: "CM" }), limitError, `${status} is not paid access`);
  }
  h.store.put("billing", { id: "alice", ownerUid: "alice", status: "active", planId: "starter" });
  await h.connect("fourth", { startCountry: "CM" });
  assert.equal(h.accounts.list("alice", h.project.id).length, 4);
});

test("regional limit counts the whole user and rejects oversized selections atomically", async t => {
  const h = fixture(t);
  const pending = await h.begin(["one", "two", "three"], { startCountry: "NG" });
  const saved = h.store.get("connection", pending.connectionId);
  assert.equal(saved.countryCode, "NG");
  assert.throws(() => h.accounts.attach("alice", h.project.id, pending.connectionId, ["one", "two", "three"]), limitError);
  assert.equal(h.accounts.list("alice", h.project.id).length, 0);
  assert.ok(h.store.get("connection", pending.connectionId), "a rejected selection can be corrected");

  h.accounts.attach("alice", h.project.id, pending.connectionId, ["one", "two"]);
  const before = h.store.list("account", { ownerUid: "alice", limit: null }).find(item => item.remoteId === "one");
  const another = await h.begin(["one", "three"], { startCountry: "NG" });
  assert.throws(() => h.accounts.attach("alice", h.project.id, another.connectionId, ["one", "three"]), limitError);
  assert.equal(h.store.get("account", before.id).revision, before.revision, "failed batches do not rewrite a reconnect");

  const otherProject = h.projects.create("alice", { name: "Other" });
  await assert.rejects(h.connect("three", { startCountry: "NG", projectId: otherProject.id }), limitError);
  assert.equal(h.accounts.list("alice", h.project.id).length, 2);
  assert.equal(h.accounts.list("alice", otherProject.id).length, 0);
});

test("the latest browser IP context wins and Telegram uses the browser start country", async t => {
  const h = fixture(t);
  await h.connect("one", { startCountry: "US", callbackCountry: "CM" });
  await h.connect("two", { startCountry: "CM", callbackCountry: "CM" });
  await assert.rejects(h.connect("three", { startCountry: "US", callbackCountry: "CM" }), limitError);

  const pending = await h.begin(["three", "four"], { startCountry: "US", callbackCountry: "US" });
  assert.throws(() => h.accounts.attach("alice", h.project.id, pending.connectionId, ["three"], { countryCode: "NG" }), limitError);
  h.accounts.attach("alice", h.project.id, pending.connectionId, ["three"], { countryCode: "US" });

  const { url } = await h.accounts.start("alice", h.project.id, "telegram", {}, { countryCode: "CM" });
  const state = new URL(url).searchParams.get("state");
  assert.equal(h.store.peekState(SecretVault.hash(state), h.now).countryCode, "CM");
  await assert.rejects(h.accounts.completeTelegramConnection(state, { id: -1004, type: "channel", title: "Updates" }), limitError);
  assert.equal(h.accounts.list("alice", h.project.id).length, 3);
});
