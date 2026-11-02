import test from "node:test";
import assert from "node:assert/strict";
import { ImportRequestGuard } from "../src/core/ImportRequestGuard.js";
import { ProjectManager } from "../src/core/ProjectManager.js";

function deferred() {
  let resolve;
  let reject;

  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

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

test("stale asynchronous file reads cannot replace any state from the latest project", async () => {
  const guard = new ImportRequestGuard();
  const manager = new ProjectManager();

  const oldRead = deferred();
  const oldReadStarted = deferred();

  const oldFile = new File(["{}"], "old.json");

  oldFile.text = () => {
    oldReadStarted.resolve();
    return oldRead.promise;
  };

  // A starts first but its file read remains pending.
  const oldToken = guard.begin();

  const oldLoad = manager.loadFile(oldFile, {
    isCurrent: () => guard.isCurrent(oldToken)
  });

  await oldReadStarted.promise;

  // B starts later and completes before A.
  const newToken = guard.begin();

  const newFile = new File(
    ['{"project":{"title":"new"}}'],
    "new.json"
  );

  await manager.loadFile(newFile, {
    isCurrent: () => guard.isCurrent(newToken)
  });

  // Capture the complete state produced by B.
  const latestProject = manager.project;
  const latestRecord = manager.importRecord;
  const latestFileName = manager.fileName;

  assert.ok(latestProject);
  assert.ok(latestRecord);
  assert.equal(latestFileName, "new.json");
  assert.equal(latestProject.project.title, "new");

  // A finishes last. It must not overwrite B.
  oldRead.resolve("{}");

  await oldLoad;

  assert.strictEqual(
    manager.project,
    latestProject,
    "stale request A must not replace project B"
  );

  assert.strictEqual(
    manager.importRecord,
    latestRecord,
    "stale request A must not replace importRecord B"
  );

  assert.equal(
    manager.fileName,
    latestFileName,
    "stale request A must not replace fileName B"
  );

  assert.equal(manager.project.project.title, "new");
});
