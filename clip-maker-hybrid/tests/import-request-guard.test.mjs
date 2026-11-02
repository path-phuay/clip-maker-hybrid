import test from "node:test";
import assert from "node:assert/strict";
import { ImportRequestGuard } from "../src/core/ImportRequestGuard.js";

test("only the newest import request remains current", () => {
  const guard = new ImportRequestGuard();
  const first = guard.begin();
  const second = guard.begin();
  assert.equal(guard.isCurrent(first), false);
  assert.equal(guard.isCurrent(second), true);
});

test("a failed or rejected request can be invalidated before a later completion", () => {
  const guard = new ImportRequestGuard();
  const pending = guard.begin();
  guard.invalidate();
  assert.equal(guard.isCurrent(pending), false);
});

test("unknown tokens are never current", () => {
  const guard = new ImportRequestGuard();
  guard.begin();
  assert.equal(guard.isCurrent(0), false);
  assert.equal(guard.isCurrent(99), false);
});
