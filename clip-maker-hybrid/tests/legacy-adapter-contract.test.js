import test from "node:test";
import assert from "node:assert/strict";
import { inspectLegacyCompatibility } from "../src/adapters/LegacyAdapterContract.js";

test("inventories v2 features without claiming conversion", () => {
  const project = { schemaVersion: "2.0.0", scenes: [{ layers: [{}] }], shots: [{ actors: [{}], graphics: [{}, {}], effects: [{}] }], timeline: { audioTracks: [{}], musicTracks: [], subtitleTracks: [{}] }, legacyData: {} };
  const report = inspectLegacyCompatibility(project);
  assert.equal(report.conversionAvailable, false);
  assert.equal(report.rendererInvocationAllowed, false);
  assert.deepEqual(report.features.map(x => x.count), [1, 1, 2, 1, 1, 1]);
  assert.ok(report.features.every(x => x.status === "requires_verified_mapping"));
});

test("does not mutate source project", () => {
  const project = { schemaVersion: "2.0.0", scenes: [], shots: [], custom: { keep: true } };
  const before = structuredClone(project);
  inspectLegacyCompatibility(project);
  assert.deepEqual(project, before);
});

test("rejects invalid input and handles missing collections", () => {
  assert.throws(() => inspectLegacyCompatibility(null), TypeError);
  assert.throws(() => inspectLegacyCompatibility([]), TypeError);
  assert.deepEqual(inspectLegacyCompatibility({}).features.map(x => x.count), [0, 0, 0, 0, 0, 0]);
});
