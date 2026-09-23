import assert from "node:assert/strict";
import test from "node:test";
import { createAccountOperations } from "./accountOperations.js";

test("disconnects, another account refresh, OAuth, and attachment can run independently", () => {
  const operations = createAccountOperations();
  const disconnect = operations.start("account:one");
  const refresh = operations.start("account:two");
  const connect = operations.start("connect");
  const attach = operations.start("attach");
  assert.ok(disconnect && refresh && connect && attach);
  assert.equal(operations.start("account:one"), null);
  assert.equal(operations.start("connect"), null);
  operations.finish(refresh);
  for (const token of [disconnect, connect, attach]) assert.equal(operations.current(token), true);
});

test("a stale completion cannot clear a retry's lock", () => {
  const operations = createAccountOperations();
  const first = operations.start("account:one");
  operations.finish(first);
  const retry = operations.start("account:one");
  assert.equal(operations.finish(first), false);
  assert.equal(operations.current(retry), true);
  assert.equal(operations.start("account:one"), null);
});

test("navigation discards late responses without affecting operations in the next view", () => {
  const oldView = createAccountOperations();
  const request = oldView.start("connect");
  oldView.dispose();
  const nextView = createAccountOperations();
  const nextRequest = nextView.start("connect");
  assert.equal(oldView.current(request), false);
  assert.equal(oldView.finish(request), false);
  assert.equal(oldView.start("attach"), null);
  assert.equal(nextView.current(nextRequest), true);
});
