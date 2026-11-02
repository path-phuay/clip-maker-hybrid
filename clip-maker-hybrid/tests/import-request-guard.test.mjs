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

import { ProjectManager } from "../src/core/ProjectManager.js";

test("stale asynchronous file reads cannot replace the latest project", async () => {
  const guard = new ImportRequestGuard();
  const manager = new ProjectManager();
  let finishOld;
  const oldFile = new File(["{}"], "old.json");
  oldFile.text = () => new Promise(resolve => { finishOld = resolve; });
  const oldToken = guard.begin();
  const oldLoad = manager.loadFile(oldFile, { isCurrent: () => guard.isCurrent(oldToken) });

  const newToken = guard.begin();
  const newFile = new File(['{"project":{"title":"new"}}'], "new.json");
  await manager.loadFile(newFile, { isCurrent: () => guard.isCurrent(newToken) });
  finishOld("{}");
  await oldLoad;

  assert.equal(manager.fileName, "new.json");
  assert.equal(manager.project.project.title, "new");
});
