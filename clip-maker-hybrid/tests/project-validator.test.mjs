// tests/project-validator.test.mjs
// DS-02 + DS-03A tests. Run via `node --test tests/`.
// DS-01 tests in tests/schema.test.mjs are NOT touched.
//
// Total: 35 tests
//   §A  Valid paths                            (2)
//   §B  Schema-invalid + Layer B skip          (1)
//   §C  Reference rules (R1,R5,R7,R8,R9,R10)      (6)
//   §D  Multiple errors + immutability         (3)
//   §E  Invalid input variants                 (4)
//   §F  ISSUE_CODES export                     (1)
//   §G  JSON Pointer escaping (helper)         (2)
//   §H  Input guard robustness (Date/Map/class/Object.create(null)) (4)
//   §I  DS-03A R7 Scene Layer Asset References (12)

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { validateProject, ISSUE_CODES } from "../validators/ProjectValidator.js";
import { escapeJsonPointerToken } from "../validators/issues.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const VALID_DIR = join(ROOT, "fixtures", "valid");
const INVALID_DIR = join(ROOT, "fixtures", "invalid");
const REF_INVALID_DIR = join(ROOT, "fixtures", "reference-invalid");

function loadJson(p) {
  return JSON.parse(readFileSync(p, "utf8"));
}

function codesOf(result) {
  return result.errors.map((e) => e.code);
}

// =========================================================================
// §A  Valid paths
// =========================================================================

test("§A1 valid project passes schema and reference layers", () => {
  const project = loadJson(join(VALID_DIR, "legacy-imported.json"));
  const result = validateProject(project);

  assert.equal(result.valid, true, JSON.stringify(result.errors, null, 2));
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.warnings, []);
  assert.deepEqual(result.all, []);
  assert.deepEqual(result.meta.layers, ["schema", "reference"]);
  assert.equal(result.meta.referenceSkipped, false);
});

test("§A2 cartoon-story passes both layers", () => {
  const project = loadJson(join(VALID_DIR, "cartoon-story.json"));
  const result = validateProject(project);
  assert.equal(result.valid, true, JSON.stringify(result.errors, null, 2));
});

// =========================================================================
// §B  Schema-invalid + Layer B skip
// =========================================================================

test("§B1 schema-invalid project fails and reference layer is skipped", () => {
  const project = loadJson(join(INVALID_DIR, "invalid-resolution.json"));
  const result = validateProject(project);

  assert.equal(result.valid, false);
  assert.ok(result.errors.length > 0);
  assert.deepEqual(result.meta.layers, ["schema"]);
  assert.equal(result.meta.referenceSkipped, true);

  for (const code of codesOf(result)) {
    assert.ok(code.startsWith("SCHEMA_"), `unexpected code ${code}`);
  }
});

// =========================================================================
// §C  Reference rules
// =========================================================================

test("§C1 character map key mismatch fails via R1 only", () => {
  const project = loadJson(join(REF_INVALID_DIR, "duplicate-character-id.json"));
  const result = validateProject(project);

  assert.equal(result.valid, false);
  assert.deepEqual(result.meta.layers, ["schema", "reference"]);
  assert.equal(result.meta.referenceSkipped, false);

  const codes = codesOf(result);
  assert.deepEqual(codes, [ISSUE_CODES.REF_CHARACTER_KEY_MISMATCH]);

  const err = result.errors[0];
  assert.equal(err.path, "/assets/characters/char_hero/id");
  assert.equal(err.entityId, "char_hero");
  assert.equal(err.context.mapKey, "char_hero");
  assert.equal(err.context.declaredId, "char_other");
});

test("§C2 valid character view asset reference passes R5", () => {
  const project = loadJson(join(VALID_DIR, "minimal-project.json"));
  const result = validateProject(project);
  assert.ok(
    !codesOf(result).includes(ISSUE_CODES.REF_CHARACTER_VIEW_ASSET_MISSING),
    "R5 should not fire for a resolved view asset"
  );
});

test("§C3 missing character view asset reference fails via R5", () => {
  const base = loadJson(join(VALID_DIR, "minimal-project.json"));
  const bad = structuredClone(base);
  bad.assets.characters.char_hero.views.front = "asset_does_not_exist";

  const result = validateProject(bad);
  assert.equal(result.valid, false);

  const r5 = result.errors.filter((e) => e.code === ISSUE_CODES.REF_CHARACTER_VIEW_ASSET_MISSING);
  assert.equal(r5.length, 1);
  assert.equal(r5[0].path, "/assets/characters/char_hero/views/front");
  assert.equal(r5[0].context.assetId, "asset_does_not_exist");
});

test("§C4 missing shot scene reference fails via R8", () => {
  const base = loadJson(join(VALID_DIR, "minimal-project.json"));
  const bad = structuredClone(base);
  bad.shots[0].sceneId = "scene_nonexistent";

  const result = validateProject(bad);
  assert.equal(result.valid, false);

  const r8 = result.errors.filter((e) => e.code === ISSUE_CODES.REF_SHOT_SCENE_MISSING);
  assert.equal(r8.length, 1);
  assert.equal(r8[0].path, "/shots/0/sceneId");
  assert.equal(r8[0].context.sceneId, "scene_nonexistent");
});

test("§C5 missing actor character reference fails via R9 (no R10 cascade)", () => {
  const base = loadJson(join(VALID_DIR, "legacy-imported.json"));
  const bad = structuredClone(base);
  bad.shots[0].actors[0].characterId = "char_nonexistent";

  const result = validateProject(bad);
  assert.equal(result.valid, false);

  const r9 = result.errors.filter((e) => e.code === ISSUE_CODES.REF_SHOT_CHARACTER_MISSING);
  assert.equal(r9.length, 1);
  assert.equal(r9[0].path, "/shots/0/actors/0/characterId");
  assert.equal(r9[0].context.characterId, "char_nonexistent");

  const r10 = result.errors.filter((e) => e.code === ISSUE_CODES.REF_ACTOR_VIEW_UNDECLARED);
  assert.equal(r10.length, 0);
});

test("§C6 undeclared actor view fails via R10", () => {
  const base = loadJson(join(VALID_DIR, "cartoon-story.json"));
  const bad = structuredClone(base);
  bad.shots[0].actors[0].view = "back";

  const result = validateProject(bad);
  assert.equal(result.valid, false);

  const r10 = result.errors.filter((e) => e.code === ISSUE_CODES.REF_ACTOR_VIEW_UNDECLARED);
  assert.equal(r10.length, 1);
  assert.equal(r10[0].path, "/shots/0/actors/0/view");
  assert.equal(r10[0].context.requestedView, "back");
  assert.ok(r10[0].context.declaredViews.includes("front"));
  assert.ok(!r10[0].context.declaredViews.includes("back"));
});

// =========================================================================
// §I  DS-03A — R7 Scene Layer Asset References
// =========================================================================

test("§I1 R7 resolves scene-layer assets from assets.vector", () => {
  const project = loadJson(join(VALID_DIR, "minimal-project.json"));
  const result = validateProject(project);
  assert.equal(result.valid, true, JSON.stringify(result.errors, null, 2));
  assert.ok(!codesOf(result).includes(ISSUE_CODES.REF_SCENE_LAYER_ASSET_MISSING));
});

test("§I2 R7 resolves scene-layer assets from assets.props", () => {
  const project = loadJson(join(VALID_DIR, "minimal-project.json"));
  const asset = project.assets.vector.asset_sky;
  delete project.assets.vector.asset_sky;
  project.assets.props = { asset_sky: asset };

  const result = validateProject(project);
  assert.equal(result.valid, true, JSON.stringify(result.errors, null, 2));
});

test("§I3 R7 resolves scene-layer assets from assets.graphics", () => {
  const project = loadJson(join(VALID_DIR, "minimal-project.json"));
  const asset = project.assets.vector.asset_sky;
  delete project.assets.vector.asset_sky;
  project.assets.graphics = { asset_sky: asset };

  const result = validateProject(project);
  assert.equal(result.valid, true, JSON.stringify(result.errors, null, 2));
});

test("§I4 R7 reports a missing scene-layer asset with canonical issue fields", () => {
  const project = loadJson(join(REF_INVALID_DIR, "missing-scene-layer-asset.json"));
  const result = validateProject(project);

  assert.equal(result.valid, false);
  const errors = result.errors.filter((e) => e.code === ISSUE_CODES.REF_SCENE_LAYER_ASSET_MISSING);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].path, "/scenes/0/layers/0/assetIds/0");
  assert.equal(errors[0].entityId, "asset_missing_scene_layer");
  assert.equal(errors[0].context.assetId, "asset_missing_scene_layer");
});

test("§I5 R7 reports only missing IDs in a mixed resolved/unresolved assetIds list", () => {
  const project = loadJson(join(VALID_DIR, "minimal-project.json"));
  project.scenes[0].layers[0].assetIds = [
    "asset_sky",
    "asset_missing_a",
    "asset_missing_b",
  ];

  const result = validateProject(project);
  const errors = result.errors.filter((e) => e.code === ISSUE_CODES.REF_SCENE_LAYER_ASSET_MISSING);
  assert.deepEqual(errors.map((e) => e.path), [
    "/scenes/0/layers/0/assetIds/1",
    "/scenes/0/layers/0/assetIds/2",
  ]);
  assert.deepEqual(errors.map((e) => e.entityId), ["asset_missing_a", "asset_missing_b"]);
});

test("§I6 R7 reports missing references from multiple layers", () => {
  const project = loadJson(join(VALID_DIR, "minimal-project.json"));
  project.scenes[0].layers.push(
    { id: "buildings", type: "environment", depth: 10, assetIds: ["asset_buildings_missing"] },
    { id: "road", type: "ground", depth: 20, assetIds: ["asset_road_missing"] }
  );

  const result = validateProject(project);
  const errors = result.errors.filter((e) => e.code === ISSUE_CODES.REF_SCENE_LAYER_ASSET_MISSING);
  assert.deepEqual(errors.map((e) => e.path), [
    "/scenes/0/layers/1/assetIds/0",
    "/scenes/0/layers/2/assetIds/0",
  ]);
});

test("§I7 R7 accepts an empty assetIds array", () => {
  const project = loadJson(join(VALID_DIR, "minimal-project.json"));
  project.scenes[0].layers[0].assetIds = [];

  const result = validateProject(project);
  assert.equal(result.valid, true, JSON.stringify(result.errors, null, 2));
});

test("§I8 R7 safely searches remaining registries when optional registries are absent", () => {
  const project = loadJson(join(VALID_DIR, "minimal-project.json"));
  const asset = project.assets.vector.asset_sky;
  delete project.assets.vector.asset_sky;
  project.assets.props = { asset_sky: asset };
  // assets.vector retains the character-view asset; assets.graphics is omitted.

  const result = validateProject(project);
  assert.equal(result.valid, true, JSON.stringify(result.errors, null, 2));
});

test("§I9 schema-invalid projects skip R7 reference validation", () => {
  const project = loadJson(join(VALID_DIR, "minimal-project.json"));
  project.scenes[0].layers[0].depth = 101;
  project.scenes[0].layers[0].assetIds = ["asset_missing_schema_invalid"];

  const result = validateProject(project);
  assert.equal(result.valid, false);
  assert.deepEqual(result.meta.layers, ["schema"]);
  assert.equal(result.meta.referenceSkipped, true);
  assert.ok(codesOf(result).every((code) => code.startsWith("SCHEMA_")));
  assert.ok(!codesOf(result).includes(ISSUE_CODES.REF_SCENE_LAYER_ASSET_MISSING));
});

test("§I10 R7 reports all missing IDs across multiple scenes", () => {
  const project = loadJson(join(VALID_DIR, "minimal-project.json"));
  project.scenes.push({
    id: "scene_002",
    title: "Second Scene",
    layers: [
      { id: "sky_2", type: "background", depth: 0, assetIds: ["asset_missing_scene_2"] },
      { id: "foreground_2", type: "foreground", depth: 30, assetIds: ["asset_missing_scene_2b"] },
    ],
  });

  const result = validateProject(project);
  const errors = result.errors.filter((e) => e.code === ISSUE_CODES.REF_SCENE_LAYER_ASSET_MISSING);
  assert.deepEqual(errors.map((e) => e.path), [
    "/scenes/1/layers/0/assetIds/0",
    "/scenes/1/layers/1/assetIds/0",
  ]);
});

test("§I11 R7 validation does not mutate a valid project", () => {
  const project = loadJson(join(VALID_DIR, "minimal-project.json"));
  const snapshot = structuredClone(project);

  const result = validateProject(project);

  assert.equal(result.valid, true);
  assert.deepEqual(project, snapshot);
});

test("§I12 R7 validation does not mutate an invalid project", () => {
  const project = loadJson(join(REF_INVALID_DIR, "missing-scene-layer-asset.json"));
  const snapshot = structuredClone(project);

  const result = validateProject(project);

  assert.equal(result.valid, false);
  assert.ok(codesOf(result).includes(ISSUE_CODES.REF_SCENE_LAYER_ASSET_MISSING));
  assert.deepEqual(project, snapshot);
});

// =========================================================================
// §D  Multiple errors + immutability
// =========================================================================

test("§D1 multiple reference errors are reported together", () => {
  const base = loadJson(join(VALID_DIR, "cartoon-story.json"));
  const bad = structuredClone(base);

  bad.shots[0].sceneId = "scene_missing";
  bad.shots[0].actors[0].characterId = "char_missing";
  bad.assets.characters.char_hero.views.front = "asset_missing";

  const result = validateProject(bad);
  assert.equal(result.valid, false);

  const codes = new Set(codesOf(result));
  assert.ok(codes.has(ISSUE_CODES.REF_SHOT_SCENE_MISSING));
  assert.ok(codes.has(ISSUE_CODES.REF_SHOT_CHARACTER_MISSING));
  assert.ok(codes.has(ISSUE_CODES.REF_CHARACTER_VIEW_ASSET_MISSING));
  assert.ok(result.errors.length >= 3);
});

test("§D2 validateProject does not mutate input (deep-equal after call)", () => {
  const project = loadJson(join(VALID_DIR, "cartoon-story.json"));
  const snapshot = structuredClone(project);

  validateProject(project);

  assert.deepEqual(project, snapshot, "input project must be untouched");
});

test("§D3 validateProject does not mutate input even on reference failure", () => {
  const project = loadJson(join(REF_INVALID_DIR, "duplicate-character-id.json"));
  const snapshot = structuredClone(project);

  const result = validateProject(project);

  assert.equal(result.valid, false);
  assert.deepEqual(project, snapshot, "input project must be untouched on failure");
});

// =========================================================================
// §E  Invalid input variants (basic)
// =========================================================================

test("§E1 invalid input (null) returns INPUT_INVALID, does not throw", () => {
  let result;
  assert.doesNotThrow(() => { result = validateProject(null); });
  assert.equal(result.valid, false);
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0].code, ISSUE_CODES.INPUT_INVALID);
  assert.equal(result.errors[0].context.receivedType, "null");
  assert.deepEqual(result.meta.layers, []);
  assert.equal(result.meta.referenceSkipped, false);
});

test("§E2 invalid input (undefined) returns INPUT_INVALID, does not throw", () => {
  let result;
  assert.doesNotThrow(() => { result = validateProject(undefined); });
  assert.equal(result.valid, false);
  assert.equal(result.errors[0].code, ISSUE_CODES.INPUT_INVALID);
  assert.equal(result.errors[0].context.receivedType, "undefined");
});

test("§E3 invalid input (array) returns INPUT_INVALID, does not throw", () => {
  let result;
  assert.doesNotThrow(() => { result = validateProject([1, 2, 3]); });
  assert.equal(result.valid, false);
  assert.equal(result.errors[0].code, ISSUE_CODES.INPUT_INVALID);
  assert.equal(result.errors[0].context.receivedType, "array");
});

test("§E4 invalid input (string) returns INPUT_INVALID, does not throw", () => {
  let result;
  assert.doesNotThrow(() => { result = validateProject("not a project"); });
  assert.equal(result.valid, false);
  assert.equal(result.errors[0].code, ISSUE_CODES.INPUT_INVALID);
  assert.equal(result.errors[0].context.receivedType, "string");
});

// =========================================================================
// §F  ISSUE_CODES export shape
// =========================================================================

test("§F1 ISSUE_CODES is exported and frozen", () => {
  assert.equal(typeof ISSUE_CODES, "object");
  assert.ok(Object.isFrozen(ISSUE_CODES));
  assert.equal(ISSUE_CODES.REF_CHARACTER_KEY_MISMATCH, "REF_CHARACTER_KEY_MISMATCH");
  assert.equal(ISSUE_CODES.INPUT_INVALID, "INPUT_INVALID");
});

// =========================================================================
// §G  JSON Pointer escaping (helper-level)
//
// NOTE: The schema's propertyNames pattern for assets.characters keys is
// `^[a-zA-Z][a-zA-Z0-9_\-]{0,127}$`, which forbids `~` and `/` in map keys.
// Therefore a schema-valid project cannot contain a characters key with
// `/` or `~`, and end-to-end validation of escaped paths cannot be
// exercised through validateProject(). We test the escaping helper
// directly instead.
// =========================================================================

test("§G1 escapeJsonPointerToken escapes '/' to '~1'", () => {
  assert.equal(escapeJsonPointerToken("char/hero"), "char~1hero");
  assert.equal(escapeJsonPointerToken("/"), "~1");
  assert.equal(escapeJsonPointerToken("a/b/c"), "a~1b~1c");
});

test("§G2 escapeJsonPointerToken escapes '~' to '~0'", () => {
  assert.equal(escapeJsonPointerToken("char~hero"), "char~0hero");
  assert.equal(escapeJsonPointerToken("~"), "~0");
  assert.equal(escapeJsonPointerToken("a~b~c"), "a~0b~0c");
});

// =========================================================================
// §H  Input guard robustness
// =========================================================================

test("§H1 Date instance returns INPUT_INVALID, does not throw", () => {
  let result;
  assert.doesNotThrow(() => { result = validateProject(new Date()); });
  assert.equal(result.valid, false);
  assert.equal(result.errors[0].code, ISSUE_CODES.INPUT_INVALID);
  assert.equal(result.errors[0].context.receivedType, "instance of Date");
});

test("§H2 Map instance returns INPUT_INVALID, does not throw", () => {
  let result;
  assert.doesNotThrow(() => { result = validateProject(new Map()); });
  assert.equal(result.valid, false);
  assert.equal(result.errors[0].code, ISSUE_CODES.INPUT_INVALID);
  assert.equal(result.errors[0].context.receivedType, "instance of Map");
});

test("§H3 class instance returns INPUT_INVALID, does not throw", () => {
  class Foo { constructor() { this.x = 1; } }
  let result;
  assert.doesNotThrow(() => { result = validateProject(new Foo()); });
  assert.equal(result.valid, false);
  assert.equal(result.errors[0].code, ISSUE_CODES.INPUT_INVALID);
  assert.equal(result.errors[0].context.receivedType, "instance of Foo");
});

test("§H4 Object.create(null) is accepted as plain-object input", () => {
  // Build a minimal schema-valid project on a null-prototype object root.
  const base = loadJson(join(VALID_DIR, "minimal-project.json"));
  const nullProtoRoot = Object.assign(Object.create(null), base);

  let result;
  assert.doesNotThrow(() => { result = validateProject(nullProtoRoot); });
  // Should NOT be rejected by input guard.
  assert.notEqual(result.errors[0]?.code, ISSUE_CODES.INPUT_INVALID);
  // Should be a full validation result.
  assert.ok(Array.isArray(result.errors));
  assert.equal(result.valid, true, JSON.stringify(result.errors, null, 2));
});