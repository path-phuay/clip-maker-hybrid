// tests/project-validator.test.mjs
// DS-02 through DS-09D3 tests. Run via `node --test tests/`.
// DS-01 tests in tests/schema.test.mjs are NOT touched.
//
// Total: 148 tests
//   §A  Valid paths                            (2)
//   §B  Schema-invalid + Layer B skip          (1)
//   §C  Reference rules (R1,R5,R7,R8,R9,R10)      (6)
//   §D  Multiple errors + immutability         (3)
//   §E  Invalid input variants                 (4)
//   §F  ISSUE_CODES export                     (1)
//   §G  JSON Pointer escaping (helper)         (2)
//   §H  Input guard robustness (Date/Map/class/Object.create(null)) (4)
//   §I  DS-03A R7 Scene Layer Asset References (12)
//   §J  DS-03B R11 Camera Target Actor References (10)
//   §K  DS-04 R12 Camera Focus Target Actor References (11)
//   §L  DS-05 R13 Character Rig Asset References (10)
//   §M  DS-06 R14 Asset Registry Map Key Integrity (10)
//   §N  DS-07 R15/R16 Audio and Music Asset References (10)
//   §O  DS-08 R17 Audio Asset Map Key Integrity (5)
//   §P  DS-09A R18 Duplicate Scene/Shot IDs (5)
//   §Q  DS-09B T1/T2/T3 Temporal Integrity (13)
//   §R  DS-09C1 Nested Collection Duplicate IDs (8)
//   §S  DS-09C2 T4 Graphic Start Bounds (7)
//   §T  DS-09C3 T5 Timeline Track Project Duration Bounds (9)
//   §U  DS-09C4 T6/T7 Transition Duration Semantics (8)
//   §V  DS-09D3 C1 Consecutive Camera Shot Type Variety (7)
//
// Total: 148 tests

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
// §J  DS-03B — R11 Camera Target Actor References
// =========================================================================

function makeActor(characterId) {
  return {
    characterId,
    view: "front",
    position: { x: 0.5, y: 0.5 },
    facing: "right",
    action: "idle",
  };
}

test("§J1 R11 accepts a targetId matching an actor in the same shot", () => {
  const project = loadJson(join(VALID_DIR, "minimal-project.json"));
  project.shots[0].camera.targetId = "char_hero";
  project.shots[0].actors = [makeActor("char_hero")];

  const result = validateProject(project);
  assert.equal(result.valid, true, JSON.stringify(result.errors, null, 2));
  assert.ok(!codesOf(result).includes(ISSUE_CODES.REF_CAMERA_TARGET_ACTOR_MISSING));
});

test("§J2 R11 reports targetId when no actor in the shot matches", () => {
  const project = loadJson(join(REF_INVALID_DIR, "missing-camera-target-actor.json"));
  const result = validateProject(project);

  assert.equal(result.valid, false);
  const errors = result.errors.filter((e) => e.code === ISSUE_CODES.REF_CAMERA_TARGET_ACTOR_MISSING);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].path, "/shots/0/camera/targetId");
  assert.equal(errors[0].entityId, "char_missing_target");
  assert.deepEqual(errors[0].context, { shotId: "shot_001", targetId: "char_missing_target" });
});

test("§J3 R11 does not resolve an actor found only in another shot", () => {
  const project = loadJson(join(VALID_DIR, "minimal-project.json"));
  project.shots[0].camera.targetId = "char_hero";
  project.shots.push({
    id: "shot_002",
    sceneId: "scene_001",
    start: 3,
    duration: 3,
    camera: { shotType: "medium", angle: "eye_level" },
    actors: [makeActor("char_hero")],
  });

  const result = validateProject(project);
  const errors = result.errors.filter((e) => e.code === ISSUE_CODES.REF_CAMERA_TARGET_ACTOR_MISSING);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].path, "/shots/0/camera/targetId");
});

test("§J4 R11 reports a target when the shot has no actors", () => {
  const project = loadJson(join(REF_INVALID_DIR, "missing-camera-target-actor.json"));
  const result = validateProject(project);
  assert.ok(codesOf(result).includes(ISSUE_CODES.REF_CAMERA_TARGET_ACTOR_MISSING));
});

test("§J5 R11 accepts a camera without targetId", () => {
  const project = loadJson(join(VALID_DIR, "minimal-project.json"));
  const result = validateProject(project);
  assert.equal(result.valid, true, JSON.stringify(result.errors, null, 2));
  assert.ok(!codesOf(result).includes(ISSUE_CODES.REF_CAMERA_TARGET_ACTOR_MISSING));
});

test("§J6 R11 accepts one matching actor among multiple actors", () => {
  const project = loadJson(join(VALID_DIR, "minimal-project.json"));
  project.shots[0].camera.targetId = "char_hero";
  // Keep both actor references valid under R9 while only one matches R11.
  project.assets.characters.char_other = {
    ...structuredClone(project.assets.characters.char_hero),
    id: "char_other",
    name: "Other",
  };
  project.shots[0].actors = [makeActor("char_other"), makeActor("char_hero")];

  const result = validateProject(project);
  assert.equal(result.valid, true, JSON.stringify(result.errors, null, 2));
});

test("§J7 R11 reports only shots whose camera target is unresolved", () => {
  const project = loadJson(join(VALID_DIR, "minimal-project.json"));
  project.shots[0].camera.targetId = "char_missing_a";
  project.shots.push({
    id: "shot_002",
    sceneId: "scene_001",
    start: 3,
    duration: 3,
    camera: { shotType: "medium", angle: "eye_level", targetId: "char_hero" },
    actors: [makeActor("char_hero")],
  });
  project.shots.push({
    id: "shot_003",
    sceneId: "scene_001",
    start: 6,
    duration: 3,
    camera: { shotType: "medium", angle: "eye_level", targetId: "char_missing_b" },
    actors: [],
  });

  const result = validateProject(project);
  const errors = result.errors.filter((e) => e.code === ISSUE_CODES.REF_CAMERA_TARGET_ACTOR_MISSING);
  assert.deepEqual(errors.map((e) => e.path), [
    "/shots/0/camera/targetId",
    "/shots/2/camera/targetId",
  ]);
  assert.deepEqual(errors.map((e) => e.entityId), ["char_missing_a", "char_missing_b"]);
});

test("§J8 schema-invalid projects skip R11 reference validation", () => {
  const project = loadJson(join(REF_INVALID_DIR, "missing-camera-target-actor.json"));
  project.project.resolution.width = 0;

  const result = validateProject(project);
  assert.equal(result.valid, false);
  assert.deepEqual(result.meta.layers, ["schema"]);
  assert.equal(result.meta.referenceSkipped, true);
  assert.ok(codesOf(result).every((code) => code.startsWith("SCHEMA_")));
  assert.ok(!codesOf(result).includes(ISSUE_CODES.REF_CAMERA_TARGET_ACTOR_MISSING));
});

test("§J9 R11 reports canonical JSON Pointer and entityId", () => {
  const project = loadJson(join(REF_INVALID_DIR, "missing-camera-target-actor.json"));
  const result = validateProject(project);
  const error = result.errors.find((e) => e.code === ISSUE_CODES.REF_CAMERA_TARGET_ACTOR_MISSING);

  assert.ok(error);
  assert.equal(error.severity, "error");
  assert.equal(error.path, "/shots/0/camera/targetId");
  assert.equal(error.entityId, "char_missing_target");
});

test("§J10 R11 validation does not mutate valid or invalid projects", () => {
  const validProject = loadJson(join(VALID_DIR, "minimal-project.json"));
  validProject.shots[0].camera.targetId = "char_hero";
  validProject.shots[0].actors = [makeActor("char_hero")];
  const validSnapshot = structuredClone(validProject);
  const validResult = validateProject(validProject);
  assert.equal(validResult.valid, true);
  assert.deepEqual(validProject, validSnapshot);

  const invalidProject = loadJson(join(REF_INVALID_DIR, "missing-camera-target-actor.json"));
  const invalidSnapshot = structuredClone(invalidProject);
  const invalidResult = validateProject(invalidProject);
  assert.equal(invalidResult.valid, false);
  assert.ok(codesOf(invalidResult).includes(ISSUE_CODES.REF_CAMERA_TARGET_ACTOR_MISSING));
  assert.deepEqual(invalidProject, invalidSnapshot);
});

// =========================================================================
// §K  DS-04 — R12 Camera Focus Target Actor References
// =========================================================================

test("§K1 R12 accepts a focus target matching an actor in the same shot", () => {
  const project = loadJson(join(VALID_DIR, "minimal-project.json"));
  project.shots[0].camera.focus = { targetId: "char_hero" };
  project.shots[0].actors = [makeActor("char_hero")];

  const result = validateProject(project);
  assert.equal(result.valid, true, JSON.stringify(result.errors, null, 2));
  assert.ok(!codesOf(result).includes(ISSUE_CODES.REF_CAMERA_FOCUS_TARGET_ACTOR_MISSING));
});

test("§K2 R12 reports a focus target when no actor in the shot matches", () => {
  const project = loadJson(join(REF_INVALID_DIR, "missing-camera-focus-target-actor.json"));
  const result = validateProject(project);

  assert.equal(result.valid, false);
  const errors = result.errors.filter((e) => e.code === ISSUE_CODES.REF_CAMERA_FOCUS_TARGET_ACTOR_MISSING);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].path, "/shots/0/camera/focus/targetId");
  assert.equal(errors[0].entityId, "char_missing_focus_target");
});

test("§K3 R12 does not resolve an actor found only in another shot", () => {
  const project = loadJson(join(VALID_DIR, "minimal-project.json"));
  project.shots[0].camera.focus = { targetId: "char_hero" };
  project.shots.push({
    id: "shot_002",
    sceneId: "scene_001",
    start: 3,
    duration: 3,
    camera: { shotType: "medium", angle: "eye_level" },
    actors: [makeActor("char_hero")],
  });

  const result = validateProject(project);
  const errors = result.errors.filter((e) => e.code === ISSUE_CODES.REF_CAMERA_FOCUS_TARGET_ACTOR_MISSING);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].path, "/shots/0/camera/focus/targetId");
});

test("§K4 R12 reports a focus target when the shot has no actors", () => {
  const project = loadJson(join(REF_INVALID_DIR, "missing-camera-focus-target-actor.json"));
  const result = validateProject(project);
  assert.ok(codesOf(result).includes(ISSUE_CODES.REF_CAMERA_FOCUS_TARGET_ACTOR_MISSING));
});

test("§K5 R12 accepts a camera without focus", () => {
  const project = loadJson(join(VALID_DIR, "minimal-project.json"));
  const result = validateProject(project);
  assert.equal(result.valid, true, JSON.stringify(result.errors, null, 2));
  assert.ok(!codesOf(result).includes(ISSUE_CODES.REF_CAMERA_FOCUS_TARGET_ACTOR_MISSING));
});

test("§K6 R12 accepts focus without targetId", () => {
  const project = loadJson(join(VALID_DIR, "minimal-project.json"));
  project.shots[0].camera.focus = { dofBlur: 2 };

  const result = validateProject(project);
  assert.equal(result.valid, true, JSON.stringify(result.errors, null, 2));
});

test("§K7 R12 accepts one matching actor among multiple actors", () => {
  const project = loadJson(join(VALID_DIR, "minimal-project.json"));
  project.shots[0].camera.focus = { targetId: "char_hero" };
  project.assets.characters.char_other = {
    ...structuredClone(project.assets.characters.char_hero),
    id: "char_other",
    name: "Other",
  };
  project.shots[0].actors = [makeActor("char_other"), makeActor("char_hero")];

  const result = validateProject(project);
  assert.equal(result.valid, true, JSON.stringify(result.errors, null, 2));
});

test("§K8 R12 reports only shots whose focus target is unresolved", () => {
  const project = loadJson(join(VALID_DIR, "minimal-project.json"));
  project.shots[0].camera.focus = { targetId: "char_missing_a" };
  project.shots.push({
    id: "shot_002",
    sceneId: "scene_001",
    start: 3,
    duration: 3,
    camera: { shotType: "medium", angle: "eye_level", focus: { targetId: "char_hero" } },
    actors: [makeActor("char_hero")],
  });
  project.shots.push({
    id: "shot_003",
    sceneId: "scene_001",
    start: 6,
    duration: 3,
    camera: { shotType: "medium", angle: "eye_level", focus: { targetId: "char_missing_b" } },
    actors: [],
  });

  const result = validateProject(project);
  const errors = result.errors.filter((e) => e.code === ISSUE_CODES.REF_CAMERA_FOCUS_TARGET_ACTOR_MISSING);
  assert.deepEqual(errors.map((e) => e.path), [
    "/shots/0/camera/focus/targetId",
    "/shots/2/camera/focus/targetId",
  ]);
  assert.deepEqual(errors.map((e) => e.entityId), ["char_missing_a", "char_missing_b"]);
});

test("§K9 schema-invalid projects skip R12 reference validation", () => {
  const project = loadJson(join(REF_INVALID_DIR, "missing-camera-focus-target-actor.json"));
  project.project.resolution.width = 0;

  const result = validateProject(project);
  assert.equal(result.valid, false);
  assert.deepEqual(result.meta.layers, ["schema"]);
  assert.equal(result.meta.referenceSkipped, true);
  assert.ok(codesOf(result).every((code) => code.startsWith("SCHEMA_")));
  assert.ok(!codesOf(result).includes(ISSUE_CODES.REF_CAMERA_FOCUS_TARGET_ACTOR_MISSING));
});

test("§K10 R12 reports canonical JSON Pointer, issue code, and entityId", () => {
  const project = loadJson(join(REF_INVALID_DIR, "missing-camera-focus-target-actor.json"));
  const result = validateProject(project);
  const error = result.errors.find((e) => e.code === ISSUE_CODES.REF_CAMERA_FOCUS_TARGET_ACTOR_MISSING);

  assert.ok(error);
  assert.equal(error.severity, "error");
  assert.equal(error.code, "REF_CAMERA_FOCUS_TARGET_ACTOR_MISSING");
  assert.equal(error.path, "/shots/0/camera/focus/targetId");
  assert.equal(error.entityId, "char_missing_focus_target");
  assert.deepEqual(error.context, {
    shotId: "shot_001",
    targetId: "char_missing_focus_target",
  });
});

test("§K11 R12 validation does not mutate valid or invalid projects", () => {
  const validProject = loadJson(join(VALID_DIR, "minimal-project.json"));
  validProject.shots[0].camera.focus = { targetId: "char_hero" };
  validProject.shots[0].actors = [makeActor("char_hero")];
  const validSnapshot = structuredClone(validProject);
  const validResult = validateProject(validProject);
  assert.equal(validResult.valid, true);
  assert.deepEqual(validProject, validSnapshot);

  const invalidProject = loadJson(join(REF_INVALID_DIR, "missing-camera-focus-target-actor.json"));
  const invalidSnapshot = structuredClone(invalidProject);
  const invalidResult = validateProject(invalidProject);
  assert.equal(invalidResult.valid, false);
  assert.ok(codesOf(invalidResult).includes(ISSUE_CODES.REF_CAMERA_FOCUS_TARGET_ACTOR_MISSING));
  assert.deepEqual(invalidProject, invalidSnapshot);
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

// =========================================================================
// §L  DS-05 R13 Character Rig Asset References
// =========================================================================

test("§L1 R13 valid character rig asset resolves in assets.rigs", () => {
  const project = loadJson(join(VALID_DIR, "cartoon-story.json"));
  const result = validateProject(project);
  assert.equal(result.valid, true, JSON.stringify(result.errors, null, 2));
  assert.ok(!codesOf(result).includes(ISSUE_CODES.REF_CHARACTER_RIG_ASSET_MISSING));
});

test("§L2 R13 missing rig asset reports a reference error", () => {
  const project = loadJson(join(REF_INVALID_DIR, "missing-character-rig-asset.json"));
  const result = validateProject(project);
  assert.equal(result.valid, false);
  assert.ok(codesOf(result).includes(ISSUE_CODES.REF_CHARACTER_RIG_ASSET_MISSING));
});

test("§L3 R13 validates rigs independently for multiple characters", () => {
  const project = loadJson(join(VALID_DIR, "cartoon-story.json"));
  const source = structuredClone(project.assets.characters.char_hero);
  source.id = "char_second";
  source.name = "Second";
  source.rig = { type: "humanoid", assetId: "rig_humanoid_basic" };
  project.assets.characters.char_second = source;
  const result = validateProject(project);
  assert.equal(result.valid, true, JSON.stringify(result.errors, null, 2));
});

test("§L4 R13 reports every character with a missing rig asset", () => {
  const project = loadJson(join(VALID_DIR, "cartoon-story.json"));
  const source = structuredClone(project.assets.characters.char_hero);
  source.id = "char_second";
  source.name = "Second";
  source.rig = { type: "quadruped_simplified", assetId: "rig_missing_second" };
  project.assets.characters.char_second = source;
  project.assets.characters.char_hero.rig.assetId = "rig_missing_first";
  const result = validateProject(project);
  const errors = result.errors.filter(
    (e) => e.code === ISSUE_CODES.REF_CHARACTER_RIG_ASSET_MISSING
  );
  assert.equal(errors.length, 2);
  assert.deepEqual(errors.map((e) => e.entityId).sort(), ["char_hero", "char_second"]);
});

test("§L5 R13 rig type none skips asset reference validation", () => {
  const project = loadJson(join(VALID_DIR, "cartoon-story.json"));
  project.assets.characters.char_hero.rig = {
    type: "none",
    assetId: "rig_not_required"
  };
  const result = validateProject(project);
  assert.equal(result.valid, true, JSON.stringify(result.errors, null, 2));
  assert.ok(!codesOf(result).includes(ISSUE_CODES.REF_CHARACTER_RIG_ASSET_MISSING));
});

test("§L6 R13 characters without rig pass", () => {
  const project = loadJson(join(VALID_DIR, "legacy-imported.json"));
  const result = validateProject(project);
  assert.equal(result.valid, true, JSON.stringify(result.errors, null, 2));
});

test("§L7 R13 missing optional rigs registry is treated as missing reference", () => {
  const project = loadJson(join(VALID_DIR, "cartoon-story.json"));
  delete project.assets.rigs;
  const result = validateProject(project);
  assert.equal(result.valid, false);
  assert.equal(
    result.errors.filter((e) => e.code === ISSUE_CODES.REF_CHARACTER_RIG_ASSET_MISSING).length,
    1
  );
});

test("§L8 R13 reports canonical path, code, entityId, and context", () => {
  const project = loadJson(join(REF_INVALID_DIR, "missing-character-rig-asset.json"));
  const result = validateProject(project);
  const error = result.errors.find(
    (e) => e.code === ISSUE_CODES.REF_CHARACTER_RIG_ASSET_MISSING
  );
  assert.ok(error);
  assert.equal(error.severity, "error");
  assert.equal(error.path, "/assets/characters/char_hero/rig/assetId");
  assert.equal(error.entityId, "char_hero");
  assert.deepEqual(error.context, {
    characterId: "char_hero",
    rigType: "humanoid",
    assetId: "rig_missing"
  });
});

test("§L9 R13 schema-invalid projects skip reference validation", () => {
  const project = loadJson(join(VALID_DIR, "cartoon-story.json"));
  project.project.fps = 0;
  project.assets.characters.char_hero.rig.assetId = "rig_missing";
  const result = validateProject(project);
  assert.equal(result.meta.referenceSkipped, true);
  assert.ok(!codesOf(result).includes(ISSUE_CODES.REF_CHARACTER_RIG_ASSET_MISSING));
});

test("§L10 R13 validation does not mutate valid or invalid projects", () => {
  const validProject = loadJson(join(VALID_DIR, "cartoon-story.json"));
  const validSnapshot = structuredClone(validProject);
  validateProject(validProject);
  assert.deepEqual(validProject, validSnapshot);

  const invalidProject = loadJson(join(REF_INVALID_DIR, "missing-character-rig-asset.json"));
  const invalidSnapshot = structuredClone(invalidProject);
  const result = validateProject(invalidProject);
  assert.ok(codesOf(result).includes(ISSUE_CODES.REF_CHARACTER_RIG_ASSET_MISSING));
  assert.deepEqual(invalidProject, invalidSnapshot);
});


// =========================================================================
// §M  DS-06 R14 Asset Registry Map Key Integrity
// =========================================================================

test("§M1 R14 matching vector map key and id passes", () => {
  const project = loadJson(join(VALID_DIR, "cartoon-story.json"));
  const result = validateProject(project);
  assert.equal(result.valid, true, JSON.stringify(result.errors, null, 2));
  assert.ok(!codesOf(result).includes(ISSUE_CODES.REF_ASSET_MAP_KEY_MISMATCH));
});

test("§M2 R14 mismatched vector map key and id reports an error", () => {
  const project = loadJson(join(REF_INVALID_DIR, "asset-registry-map-key-mismatch.json"));
  const result = validateProject(project);
  const errors = result.errors.filter(e => e.code === ISSUE_CODES.REF_ASSET_MAP_KEY_MISMATCH);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].context.registry, "vector");
});

test("§M3 R14 detects mismatched props registry entry", () => {
  const project = loadJson(join(VALID_DIR, "cartoon-story.json"));
  project.assets.props = { prop_one: { id: "prop_other", kind: "svg", uri: "props/one.svg" } };
  const result = validateProject(project);
  assert.ok(codesOf(result).includes(ISSUE_CODES.REF_ASSET_MAP_KEY_MISMATCH));
  assert.equal(result.errors.find(e => e.code === ISSUE_CODES.REF_ASSET_MAP_KEY_MISMATCH).context.registry, "props");
});

test("§M4 R14 detects mismatched graphics registry entry", () => {
  const project = loadJson(join(VALID_DIR, "cartoon-story.json"));
  project.assets.graphics = { graphic_one: { id: "graphic_other", kind: "svg", uri: "graphics/one.svg" } };
  const result = validateProject(project);
  assert.ok(codesOf(result).includes(ISSUE_CODES.REF_ASSET_MAP_KEY_MISMATCH));
  assert.equal(result.errors.find(e => e.code === ISSUE_CODES.REF_ASSET_MAP_KEY_MISMATCH).context.registry, "graphics");
});

test("§M5 R14 detects mismatched rigs registry entry", () => {
  const project = loadJson(join(VALID_DIR, "cartoon-story.json"));
  project.assets.rigs.rig_humanoid_basic.id = "rig_other";
  const result = validateProject(project);
  assert.ok(codesOf(result).includes(ISSUE_CODES.REF_ASSET_MAP_KEY_MISMATCH));
  assert.equal(result.errors.find(e => e.code === ISSUE_CODES.REF_ASSET_MAP_KEY_MISMATCH).context.registry, "rigs");
});

test("§M6 R14 reports every mismatch across multiple registries", () => {
  const project = loadJson(join(VALID_DIR, "cartoon-story.json"));
  project.assets.vector.asset_hero_front.id = "wrong_vector";
  project.assets.props = { prop_one: { id: "wrong_prop", kind: "svg", uri: "props/one.svg" } };
  project.assets.graphics = { graphic_one: { id: "wrong_graphic", kind: "svg", uri: "graphics/one.svg" } };
  project.assets.rigs.rig_humanoid_basic.id = "wrong_rig";
  const result = validateProject(project);
  const errors = result.errors.filter(e => e.code === ISSUE_CODES.REF_ASSET_MAP_KEY_MISMATCH);
  assert.equal(errors.length, 4);
  assert.deepEqual(errors.map(e => e.context.registry), ["vector", "props", "graphics", "rigs"]);
});

test("§M7 R14 absent optional registries pass", () => {
  const project = loadJson(join(VALID_DIR, "minimal-project.json"));
  const result = validateProject(project);
  assert.equal(result.valid, true, JSON.stringify(result.errors, null, 2));
  assert.ok(!codesOf(result).includes(ISSUE_CODES.REF_ASSET_MAP_KEY_MISMATCH));
});

test("§M8 R14 reports canonical path, code, entityId, and context", () => {
  const project = loadJson(join(REF_INVALID_DIR, "asset-registry-map-key-mismatch.json"));
  const result = validateProject(project);
  const error = result.errors.find(e => e.code === ISSUE_CODES.REF_ASSET_MAP_KEY_MISMATCH);
  assert.ok(error);
  assert.equal(error.severity, "error");
  assert.equal(error.path, "/assets/vector/asset_hero_front/id");
  assert.equal(error.entityId, "asset_hero_front");
  assert.deepEqual(error.context, {
    registry: "vector",
    mapKey: "asset_hero_front",
    declaredId: "asset_wrong_id"
  });
});

test("§M9 R14 schema-invalid projects skip reference validation", () => {
  const project = loadJson(join(VALID_DIR, "cartoon-story.json"));
  project.project.fps = 0;
  project.assets.vector.asset_hero_front.id = "asset_wrong_id";
  const result = validateProject(project);
  assert.equal(result.meta.referenceSkipped, true);
  assert.ok(!codesOf(result).includes(ISSUE_CODES.REF_ASSET_MAP_KEY_MISMATCH));
});

test("§M10 R14 validation does not mutate valid or invalid projects", () => {
  const validProject = loadJson(join(VALID_DIR, "cartoon-story.json"));
  const validSnapshot = structuredClone(validProject);
  validateProject(validProject);
  assert.deepEqual(validProject, validSnapshot);

  const invalidProject = loadJson(join(REF_INVALID_DIR, "asset-registry-map-key-mismatch.json"));
  const invalidSnapshot = structuredClone(invalidProject);
  const result = validateProject(invalidProject);
  assert.ok(codesOf(result).includes(ISSUE_CODES.REF_ASSET_MAP_KEY_MISMATCH));
  assert.deepEqual(invalidProject, invalidSnapshot);
});


// =========================================================================
// §N  DS-07 R15/R16 Audio and Music Asset References
// =========================================================================

test("§N1 R15 audio track resolves an asset in assets.audio", () => {
  const project = loadJson(join(VALID_DIR, "cartoon-story.json"));
  project.assets.audio = { voice_001: { id: "voice_001", uri: "audio/voice.wav" } };
  const result = validateProject(project);
  assert.ok(!codesOf(result).includes(ISSUE_CODES.REF_AUDIO_TRACK_ASSET_MISSING));
});

test("§N2 R15 reports an audio track with a missing asset", () => {
  const project = loadJson(join(REF_INVALID_DIR, "missing-audio-assets.json"));
  const result = validateProject(project);
  assert.ok(codesOf(result).includes(ISSUE_CODES.REF_AUDIO_TRACK_ASSET_MISSING));
});

test("§N3 R16 music track resolves an asset in assets.audio", () => {
  const project = loadJson(join(VALID_DIR, "minimal-project.json"));
  project.timeline.musicTracks.push({ id: "music_track_1", assetId: "music_001", start: 0 });
  project.assets.audio = { music_001: { id: "music_001", uri: "audio/music.mp3" } };
  const result = validateProject(project);
  assert.ok(!codesOf(result).includes(ISSUE_CODES.REF_MUSIC_TRACK_ASSET_MISSING));
});

test("§N4 R16 reports a music track with a missing asset", () => {
  const project = loadJson(join(REF_INVALID_DIR, "missing-audio-assets.json"));
  const result = validateProject(project);
  assert.ok(codesOf(result).includes(ISSUE_CODES.REF_MUSIC_TRACK_ASSET_MISSING));
});

test("§N5 R15 reports every unresolved audio track", () => {
  const project = loadJson(join(VALID_DIR, "minimal-project.json"));
  project.timeline.audioTracks.push(
    { id: "voice_a", assetId: "missing_a", start: 0 },
    { id: "voice_b", assetId: "missing_b", start: 1 }
  );
  const result = validateProject(project);
  const errors = result.errors.filter(e => e.code === ISSUE_CODES.REF_AUDIO_TRACK_ASSET_MISSING);
  assert.equal(errors.length, 2);
});

test("§N6 R16 reports every unresolved music track", () => {
  const project = loadJson(join(VALID_DIR, "minimal-project.json"));
  project.timeline.musicTracks.push(
    { id: "music_a", assetId: "missing_a", start: 0 },
    { id: "music_b", assetId: "missing_b", start: 1 }
  );
  const result = validateProject(project);
  const errors = result.errors.filter(e => e.code === ISSUE_CODES.REF_MUSIC_TRACK_ASSET_MISSING);
  assert.equal(errors.length, 2);
});

test("§N7 R15/R16 report canonical paths and issue context", () => {
  const project = loadJson(join(VALID_DIR, "minimal-project.json"));
  project.timeline.audioTracks.push({ id: "voice_x", assetId: "voice_missing", start: 0 });
  project.timeline.musicTracks.push({ id: "music_x", assetId: "music_missing", start: 0 });
  const result = validateProject(project);
  const audio = result.errors.find(e => e.code === ISSUE_CODES.REF_AUDIO_TRACK_ASSET_MISSING);
  const music = result.errors.find(e => e.code === ISSUE_CODES.REF_MUSIC_TRACK_ASSET_MISSING);
  assert.deepEqual(
    { severity: audio.severity, path: audio.path, entityId: audio.entityId, context: audio.context },
    { severity: "error", path: "/timeline/audioTracks/0/assetId", entityId: "voice_missing", context: { trackId: "voice_x", assetId: "voice_missing", trackIndex: 0 } }
  );
  assert.deepEqual(
    { severity: music.severity, path: music.path, entityId: music.entityId, context: music.context },
    { severity: "error", path: "/timeline/musicTracks/0/assetId", entityId: "music_missing", context: { trackId: "music_x", assetId: "music_missing", trackIndex: 0 } }
  );
});

test("§N8 absent optional audio registry reports referenced assets as missing", () => {
  const project = loadJson(join(VALID_DIR, "cartoon-story.json"));
  delete project.assets.audio;
  const result = validateProject(project);
  assert.ok(codesOf(result).includes(ISSUE_CODES.REF_AUDIO_TRACK_ASSET_MISSING));
});

test("§N9 schema-invalid projects skip R15/R16 reference validation", () => {
  const project = loadJson(join(VALID_DIR, "cartoon-story.json"));
  project.project.fps = 0;
  const result = validateProject(project);
  assert.equal(result.meta.referenceSkipped, true);
  assert.ok(!codesOf(result).includes(ISSUE_CODES.REF_AUDIO_TRACK_ASSET_MISSING));
  assert.ok(!codesOf(result).includes(ISSUE_CODES.REF_MUSIC_TRACK_ASSET_MISSING));
});

test("§N10 R15/R16 validation does not mutate valid or invalid projects", () => {
  const validProject = loadJson(join(VALID_DIR, "minimal-project.json"));
  validProject.assets.audio = { sound_001: { id: "sound_001", uri: "audio/sound.wav" } };
  validProject.timeline.audioTracks.push({ id: "audio_ok", assetId: "sound_001", start: 0 });
  const validSnapshot = structuredClone(validProject);
  validateProject(validProject);
  assert.deepEqual(validProject, validSnapshot);

  const invalidProject = loadJson(join(VALID_DIR, "minimal-project.json"));
  invalidProject.timeline.musicTracks.push({ id: "music_bad", assetId: "missing_music", start: 0 });
  const invalidSnapshot = structuredClone(invalidProject);
  const result = validateProject(invalidProject);
  assert.ok(codesOf(result).includes(ISSUE_CODES.REF_MUSIC_TRACK_ASSET_MISSING));
  assert.deepEqual(invalidProject, invalidSnapshot);
});


// =========================================================================
// §O  DS-08 R17 Audio Asset Map Key Integrity
// =========================================================================

test("§O1 R17 matching audio map key and id passes", () => {
  const project = loadJson(join(VALID_DIR, "minimal-project.json"));
  project.assets.audio = { voice_001: { id: "voice_001", uri: "audio/voice.wav" } };
  const result = validateProject(project);
  assert.equal(result.valid, true, JSON.stringify(result.errors, null, 2));
  assert.ok(!codesOf(result).includes(ISSUE_CODES.REF_ASSET_MAP_KEY_MISMATCH));
});

test("§O2 R17 mismatched audio map key and id reports an error", () => {
  const project = loadJson(join(VALID_DIR, "minimal-project.json"));
  project.assets.audio = { voice_001: { id: "voice_wrong", uri: "audio/voice.wav" } };
  const result = validateProject(project);
  const errors = result.errors.filter(e => e.code === ISSUE_CODES.REF_ASSET_MAP_KEY_MISMATCH);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].context.registry, "audio");
});

test("§O3 R17 reports every mismatch in the audio registry", () => {
  const project = loadJson(join(VALID_DIR, "minimal-project.json"));
  project.assets.audio = {
    voice_001: { id: "voice_wrong", uri: "audio/voice.wav" },
    music_001: { id: "music_wrong", uri: "audio/music.mp3" }
  };
  const result = validateProject(project);
  const errors = result.errors.filter(e => e.code === ISSUE_CODES.REF_ASSET_MAP_KEY_MISMATCH);
  assert.equal(errors.length, 2);
  assert.deepEqual(errors.map(e => e.context.mapKey), ["voice_001", "music_001"]);
});

test("§O4 R17 reports canonical path, issue code, entityId, and context", () => {
  const project = loadJson(join(VALID_DIR, "minimal-project.json"));
  project.assets.audio = { voice_001: { id: "voice_wrong", uri: "audio/voice.wav" } };
  const result = validateProject(project);
  const error = result.errors.find(e => e.code === ISSUE_CODES.REF_ASSET_MAP_KEY_MISMATCH);
  assert.ok(error);
  assert.deepEqual(
    { severity: error.severity, code: error.code, path: error.path, entityId: error.entityId, context: error.context },
    {
      severity: "error",
      code: "REF_ASSET_MAP_KEY_MISMATCH",
      path: "/assets/audio/voice_001/id",
      entityId: "voice_001",
      context: { registry: "audio", mapKey: "voice_001", declaredId: "voice_wrong" }
    }
  );
});

test("§O5 R17 schema-invalid projects skip reference validation and validation does not mutate input", () => {
  const schemaInvalid = loadJson(join(VALID_DIR, "minimal-project.json"));
  schemaInvalid.project.fps = 0;
  schemaInvalid.assets.audio = { voice_001: { id: "voice_wrong", uri: "audio/voice.wav" } };
  const invalidResult = validateProject(schemaInvalid);
  assert.equal(invalidResult.meta.referenceSkipped, true);
  assert.ok(!codesOf(invalidResult).includes(ISSUE_CODES.REF_ASSET_MAP_KEY_MISMATCH));

  const validInput = loadJson(join(VALID_DIR, "minimal-project.json"));
  validInput.assets.audio = { voice_001: { id: "voice_001", uri: "audio/voice.wav" } };
  const validSnapshot = structuredClone(validInput);
  validateProject(validInput);
  assert.deepEqual(validInput, validSnapshot);

  const referenceInvalid = loadJson(join(VALID_DIR, "minimal-project.json"));
  referenceInvalid.assets.audio = { voice_001: { id: "voice_wrong", uri: "audio/voice.wav" } };
  const referenceSnapshot = structuredClone(referenceInvalid);
  const referenceResult = validateProject(referenceInvalid);
  assert.ok(codesOf(referenceResult).includes(ISSUE_CODES.REF_ASSET_MAP_KEY_MISMATCH));
  assert.deepEqual(referenceInvalid, referenceSnapshot);
});

// =========================================================================
// §P  DS-09A R18 Duplicate Scene and Shot IDs
// =========================================================================

test("§P1 R18 unique scene and shot IDs pass", () => {
  const project = loadJson(join(VALID_DIR, "cartoon-story.json"));
  const result = validateProject(project);
  assert.equal(result.valid, true, JSON.stringify(result.errors, null, 2));
  assert.ok(!codesOf(result).includes(ISSUE_CODES.REF_DUPLICATE_ENTITY_ID));
});

test("§P2 R18 duplicate scene ID reports the later scene path", () => {
  const project = loadJson(join(VALID_DIR, "cartoon-story.json"));
  project.scenes.push({ ...structuredClone(project.scenes[0]) });
  const result = validateProject(project);
  const errors = result.errors.filter(e => e.code === ISSUE_CODES.REF_DUPLICATE_ENTITY_ID);
  assert.equal(errors.length, 1);
  assert.deepEqual(
    { severity: errors[0].severity, path: errors[0].path, entityId: errors[0].entityId, context: errors[0].context },
    {
      severity: "error",
      path: `/scenes/${project.scenes.length - 1}/id`,
      entityId: project.scenes[0].id,
      context: { collection: "scenes", id: project.scenes[0].id, firstIndex: 0, duplicateIndex: project.scenes.length - 1 }
    }
  );
});

test("§P3 R18 duplicate shot ID reports the later shot path", () => {
  const project = loadJson(join(VALID_DIR, "cartoon-story.json"));
  project.shots.push({ ...structuredClone(project.shots[0]) });
  const result = validateProject(project);
  const errors = result.errors.filter(e => e.code === ISSUE_CODES.REF_DUPLICATE_ENTITY_ID);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].path, `/shots/${project.shots.length - 1}/id`);
  assert.equal(errors[0].entityId, project.shots[0].id);
  assert.deepEqual(errors[0].context, {
    collection: "shots",
    id: project.shots[0].id,
    firstIndex: 0,
    duplicateIndex: project.shots.length - 1
  });
});

test("§P4 R18 reports every repeated occurrence within both collections", () => {
  const project = loadJson(join(VALID_DIR, "cartoon-story.json"));
  const scene = structuredClone(project.scenes[0]);
  const shot = structuredClone(project.shots[0]);
  project.scenes.push(scene, structuredClone(scene));
  project.shots.push(shot, structuredClone(shot));
  const result = validateProject(project);
  const errors = result.errors.filter(e => e.code === ISSUE_CODES.REF_DUPLICATE_ENTITY_ID);
  assert.equal(errors.length, 4);
  assert.deepEqual(errors.map(e => e.context.collection), ["scenes", "scenes", "shots", "shots"]);
});

test("§P5 R18 schema-invalid projects skip duplicate checks and validation does not mutate input", () => {
  const invalid = loadJson(join(VALID_DIR, "cartoon-story.json"));
  invalid.project.fps = 0;
  invalid.scenes.push(structuredClone(invalid.scenes[0]));
  const invalidSnapshot = structuredClone(invalid);
  const invalidResult = validateProject(invalid);
  assert.equal(invalidResult.meta.referenceSkipped, true);
  assert.ok(!codesOf(invalidResult).includes(ISSUE_CODES.REF_DUPLICATE_ENTITY_ID));
  assert.deepEqual(invalid, invalidSnapshot);

  const duplicate = loadJson(join(VALID_DIR, "cartoon-story.json"));
  duplicate.scenes.push(structuredClone(duplicate.scenes[0]));
  const duplicateSnapshot = structuredClone(duplicate);
  const duplicateResult = validateProject(duplicate);
  assert.ok(codesOf(duplicateResult).includes(ISSUE_CODES.REF_DUPLICATE_ENTITY_ID));
  assert.deepEqual(duplicate, duplicateSnapshot);
});


 
test("§Q9 T3 accepts a shot ending exactly at project.duration", () => {
  const p = loadJson(join(VALID_DIR, "cartoon-story.json"));
  p.shots[1].start = 8;
  p.shots[1].duration = 4;
  assert.ok(!codesOf(validateProject(p)).includes(ISSUE_CODES.TEMP_SHOT_EXCEEDS_PROJECT_DURATION));
});

test("§Q10 T3 rejects a shot ending after project.duration", () => {
  const p = loadJson(join(VALID_DIR, "cartoon-story.json"));
  p.shots[1].start = 8;
  p.shots[1].duration = 4.1;
  const e = validateProject(p).errors.find(x => x.code === ISSUE_CODES.TEMP_SHOT_EXCEEDS_PROJECT_DURATION);
  assert.ok(e);
  assert.equal(e.path, "/shots/1/duration");
  assert.equal(e.entityId, "shot_002");
  assert.equal(e.context.shotId, "shot_002");
  assert.equal(e.context.shotEnd, 12.1);
  assert.equal(e.context.projectDuration, 12);
  assert.ok(Math.abs(e.context.overflow - 0.1) < 1e-9);
});

test("§Q11 T3 allows trailing empty timeline space", () => {
  const p = loadJson(join(VALID_DIR, "cartoon-story.json"));
  assert.equal(p.project.duration, 12);
  assert.equal(Math.max(...p.shots.map(s => s.start + s.duration)), 7.5);
  assert.ok(!codesOf(validateProject(p)).includes(ISSUE_CODES.TEMP_SHOT_EXCEEDS_PROJECT_DURATION));
});

test("§Q12 T3 reports every shot exceeding project.duration", () => {
  const p = loadJson(join(VALID_DIR, "cartoon-story.json"));
  p.shots = [
    { ...structuredClone(p.shots[0]), id: "shot_late_a", start: 10, duration: 3 },
    { ...structuredClone(p.shots[1]), id: "shot_late_b", start: 11, duration: 2 }
  ];
  const errors = validateProject(p).errors.filter(x => x.code === ISSUE_CODES.TEMP_SHOT_EXCEEDS_PROJECT_DURATION);
  assert.equal(errors.length, 2);
  assert.deepEqual(errors.map(x => x.entityId), ["shot_late_a", "shot_late_b"]);
});

test("§Q13 T3 skips schema-invalid projects and does not mutate input", () => {
  const invalid = loadJson(join(VALID_DIR, "cartoon-story.json"));
  invalid.project.fps = 0;
  invalid.shots[1].start = 11;
  const invalidResult = validateProject(invalid);
  assert.equal(invalidResult.meta.referenceSkipped, true);
  assert.ok(!codesOf(invalidResult).includes(ISSUE_CODES.TEMP_SHOT_EXCEEDS_PROJECT_DURATION));

  const valid = loadJson(join(VALID_DIR, "cartoon-story.json"));
  const snapshot = structuredClone(valid);
  validateProject(valid);
  assert.deepEqual(valid, snapshot);
});

// =========================================================================
 // §Q  DS-09B T1/T2 Temporal Integrity
 // =========================================================================

test("§Q1 T1 adjacent shot intervals do not overlap", () => {
  const p = loadJson(join(VALID_DIR, "cartoon-story.json"));
  p.shots[1].start = p.shots[0].start + p.shots[0].duration;
  assert.ok(!codesOf(validateProject(p)).includes(ISSUE_CODES.TEMP_SHOT_OVERLAP));
});

test("§Q2 T1 gaps between shots are allowed", () => {
  const p = loadJson(join(VALID_DIR, "cartoon-story.json"));
  p.shots[1].start = 5;
  assert.ok(!codesOf(validateProject(p)).includes(ISSUE_CODES.TEMP_SHOT_OVERLAP));
});

test("§Q3 T1 reports overlap with path and interval context", () => {
  const p = loadJson(join(VALID_DIR, "cartoon-story.json"));
  p.shots[0].duration = 4;
  p.shots[1].start = 3;
  const e = validateProject(p).errors.find(x => x.code === ISSUE_CODES.TEMP_SHOT_OVERLAP);
  assert.ok(e);
  assert.deepEqual({path:e.path,entityId:e.entityId,context:e.context},{
    path:"/shots/1/start",entityId:"shot_002",
    context:{firstShotId:"shot_001",secondShotId:"shot_002",firstShotIndex:0,secondShotIndex:1,overlapStart:3,overlapEnd:4}
  });
});

test("§Q4 T1 reports each overlapping pair", () => {
  const p = loadJson(join(VALID_DIR, "cartoon-story.json"));
  const base = structuredClone(p.shots[0]);
  p.shots = [
    {...base,id:"shot_a",start:0,duration:5},
    {...base,id:"shot_b",start:1,duration:5},
    {...base,id:"shot_c",start:2,duration:5}
  ];
  assert.equal(validateProject(p).errors.filter(e=>e.code===ISSUE_CODES.TEMP_SHOT_OVERLAP).length,3);
});

test("§Q5 T2 graphic ending exactly at shot end passes", () => {
  const p = loadJson(join(VALID_DIR, "cartoon-story.json"));
  p.shots[0].graphics[0].start = 2.3;
  p.shots[0].graphics[0].duration = 1.2;
  assert.ok(!codesOf(validateProject(p)).includes(ISSUE_CODES.TEMP_GRAPHIC_OUTSIDE_SHOT));
});

test("§Q6 T2 reports graphic extending beyond shot end", () => {
  const p = loadJson(join(VALID_DIR, "cartoon-story.json"));
  p.shots[0].graphics[0].start = 3;
  p.shots[0].graphics[0].duration = 1;
  const e = validateProject(p).errors.find(x=>x.code===ISSUE_CODES.TEMP_GRAPHIC_OUTSIDE_SHOT);
  assert.ok(e);
  assert.deepEqual({path:e.path,entityId:e.entityId,context:e.context},{
    path:"/shots/0/graphics/0",entityId:"title_001",
    context:{shotId:"shot_001",graphicId:"title_001",shotEnd:3.5,graphicEnd:4}
  });
});

test("§Q7 T2 uses absolute timeline start values", () => {
  const p = loadJson(join(VALID_DIR, "cartoon-story.json"));
  p.shots[1].graphics = [{id:"title_002",type:"text",text:"Later",start:3.5,duration:4}];
  assert.ok(!codesOf(validateProject(p)).includes(ISSUE_CODES.TEMP_GRAPHIC_OUTSIDE_SHOT));
});

test("§Q8 T1/T2 skip schema-invalid projects and never mutate input", () => {
  const bad = loadJson(join(VALID_DIR, "cartoon-story.json"));
  bad.project.fps = 0;
  const r = validateProject(bad);
  assert.equal(r.meta.referenceSkipped,true);
  assert.ok(!codesOf(r).includes(ISSUE_CODES.TEMP_SHOT_OVERLAP));
  assert.ok(!codesOf(r).includes(ISSUE_CODES.TEMP_GRAPHIC_OUTSIDE_SHOT));
  const good = loadJson(join(VALID_DIR, "cartoon-story.json"));
  const snapshot = structuredClone(good);
  validateProject(good);
  assert.deepEqual(good,snapshot);
});


// =========================================================================
// §R  DS-09C1 R18 Nested Collection Duplicate IDs
// =========================================================================

test("§R1 R18 duplicate layer IDs are detected only among sibling layers", () => {
  const p = loadJson(join(VALID_DIR, "cartoon-story.json"));
  p.scenes[0].layers.push({ ...structuredClone(p.scenes[0].layers[0]) });
  const errors = validateProject(p).errors.filter(e => e.code === ISSUE_CODES.REF_DUPLICATE_ENTITY_ID);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].path, `/scenes/0/layers/${p.scenes[0].layers.length - 1}/id`);
  assert.equal(errors[0].context.collection, "scenes[].layers");
  assert.equal(errors[0].context.sceneId, p.scenes[0].id);
  assert.equal(errors[0].context.firstIndex, 0);
});

test("§R2 R18 duplicate graphic IDs are detected only among graphics in the same shot", () => {
  const p = loadJson(join(VALID_DIR, "cartoon-story.json"));
  p.shots[0].graphics.push({ ...structuredClone(p.shots[0].graphics[0]), start: 0, duration: 1 });
  const errors = validateProject(p).errors.filter(e => e.code === ISSUE_CODES.REF_DUPLICATE_ENTITY_ID);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].path, `/shots/0/graphics/${p.shots[0].graphics.length - 1}/id`);
  assert.equal(errors[0].context.collection, "shots[].graphics");
  assert.equal(errors[0].context.shotId, p.shots[0].id);
});

test("§R3 R18 duplicate effect IDs are detected among sibling effects", () => {
  const p = loadJson(join(VALID_DIR, "cartoon-story.json"));
  p.shots[0].effects = [
    { id: "effect_duplicate", type: "blur" },
    { id: "effect_duplicate", type: "glow" }
  ];
  const errors = validateProject(p).errors.filter(e => e.code === ISSUE_CODES.REF_DUPLICATE_ENTITY_ID);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].path, "/shots/0/effects/1/id");
  assert.equal(errors[0].context.collection, "shots[].effects");
});

test("§R4 R18 duplicate IDs in audio, music, and subtitle tracks are detected independently", () => {
  const p = loadJson(join(VALID_DIR, "cartoon-story.json"));
  p.timeline.audioTracks = [
    { id: "audio_duplicate", assetId: "voice_001", start: 0 },
    { id: "audio_duplicate", assetId: "voice_001", start: 1 }
  ];
  p.timeline.musicTracks = [
    { id: "music_duplicate", assetId: "voice_001", start: 0 },
    { id: "music_duplicate", assetId: "voice_001", start: 1 }
  ];
  p.timeline.subtitleTracks = [
    { id: "subtitle_duplicate", text: "Hello", start: 0, duration: 1 },
    { id: "subtitle_duplicate", text: "World", start: 1, duration: 1 }
  ];
  const errors = validateProject(p).errors.filter(e => e.code === ISSUE_CODES.REF_DUPLICATE_ENTITY_ID);
  assert.equal(errors.length, 3);
  assert.deepEqual(errors.map(e => e.context.collection), [
    "timeline.audioTracks", "timeline.musicTracks", "timeline.subtitleTracks"
  ]);
});

test("§R5 R18 identical nested IDs under different parents are allowed", () => {
  const p = loadJson(join(VALID_DIR, "cartoon-story.json"));
  const layer = structuredClone(p.scenes[0].layers[0]);
  p.scenes.push({ ...structuredClone(p.scenes[0]), id: "scene_extra", layers: [layer] });
  const graphic = { id: "graphic_shared", type: "text", text: "A", start: 0, duration: 1 };
  p.shots[0].graphics = [structuredClone(graphic)];
  p.shots[1].graphics = [structuredClone(graphic)];
  const errors = validateProject(p).errors.filter(e => e.code === ISSUE_CODES.REF_DUPLICATE_ENTITY_ID);
  assert.equal(errors.length, 0, JSON.stringify(errors, null, 2));
});

test("§R6 R18 reports every repeated occurrence within a nested collection", () => {
  const p = loadJson(join(VALID_DIR, "cartoon-story.json"));
  const layer = structuredClone(p.scenes[0].layers[0]);
  p.scenes[0].layers.push(structuredClone(layer), structuredClone(layer));
  const errors = validateProject(p).errors.filter(e => e.code === ISSUE_CODES.REF_DUPLICATE_ENTITY_ID);
  assert.equal(errors.length, 2);
  assert.deepEqual(errors.map(e => e.context.duplicateIndex), [4, 5]);
  assert.deepEqual(errors.map(e => e.context.firstIndex), [0, 0]);
});

test("§R7 R18 schema-invalid projects skip nested duplicate checks and validation does not mutate input", () => {
  const invalid = loadJson(join(VALID_DIR, "cartoon-story.json"));
  invalid.project.fps = 0;
  invalid.scenes[0].layers.push(structuredClone(invalid.scenes[0].layers[0]));
  const snapshot = structuredClone(invalid);
  const invalidResult = validateProject(invalid);
  assert.equal(invalidResult.meta.referenceSkipped, true);
  assert.ok(!codesOf(invalidResult).includes(ISSUE_CODES.REF_DUPLICATE_ENTITY_ID));
  assert.deepEqual(invalid, snapshot);

  const duplicate = loadJson(join(VALID_DIR, "cartoon-story.json"));
  duplicate.scenes[0].layers.push(structuredClone(duplicate.scenes[0].layers[0]));
  const duplicateSnapshot = structuredClone(duplicate);
  assert.ok(codesOf(validateProject(duplicate)).includes(ISSUE_CODES.REF_DUPLICATE_ENTITY_ID));
  assert.deepEqual(duplicate, duplicateSnapshot);
});

test("§R8 R18 valid project passes nested ID checks without mutation", () => {
  const p = loadJson(join(VALID_DIR, "cartoon-story.json"));
  const snapshot = structuredClone(p);
  const result = validateProject(p);
  assert.equal(result.valid, true, JSON.stringify(result.errors, null, 2));
  assert.deepEqual(p, snapshot);
});


// =========================================================================
// §S  DS-09C2 T4 Graphic Start Bounds
// =========================================================================

test("§S1 T4 accepts a graphic starting exactly at its shot start", () => {
  const p = loadJson(join(VALID_DIR, "cartoon-story.json"));
  p.shots[1].graphics = [{ id: "graphic_at_start", type: "text", text: "Start", start: 3.5, duration: 1 }];
  assert.ok(!codesOf(validateProject(p)).includes(ISSUE_CODES.TEMP_GRAPHIC_BEFORE_SHOT));
});

test("§S2 T4 rejects a graphic starting before its containing shot", () => {
  const p = loadJson(join(VALID_DIR, "cartoon-story.json"));
  p.shots[1].graphics = [{ id: "graphic_early", type: "text", text: "Early", start: 3.4, duration: 1 }];
  const e = validateProject(p).errors.find(x => x.code === ISSUE_CODES.TEMP_GRAPHIC_BEFORE_SHOT);
  assert.ok(e);
  assert.equal(e.path, "/shots/1/graphics/0/start");
  assert.equal(e.entityId, "graphic_early");
  assert.equal(e.context.shotId, "shot_002");
  assert.equal(e.context.graphicId, "graphic_early");
  assert.equal(e.context.shotStart, 3.5);
  assert.equal(e.context.graphicStart, 3.4);
  assert.ok(Math.abs(e.context.offset - 0.1) < 1e-9);
});

test("§S3 T4 reports every graphic starting before its shot", () => {
  const p = loadJson(join(VALID_DIR, "cartoon-story.json"));
  p.shots[1].graphics = [
    { id: "graphic_early_a", type: "text", text: "A", start: 2, duration: 0.5 },
    { id: "graphic_early_b", type: "text", text: "B", start: 3, duration: 0.2 }
  ];
  const errors = validateProject(p).errors.filter(x => x.code === ISSUE_CODES.TEMP_GRAPHIC_BEFORE_SHOT);
  assert.equal(errors.length, 2);
  assert.deepEqual(errors.map(x => x.entityId), ["graphic_early_a", "graphic_early_b"]);
});

test("§S4 T4 uses absolute timeline start values, not shot-relative offsets", () => {
  const p = loadJson(join(VALID_DIR, "cartoon-story.json"));
  p.shots[1].graphics = [{ id: "graphic_absolute", type: "text", text: "Later", start: 3.6, duration: 1 }];
  assert.ok(!codesOf(validateProject(p)).includes(ISSUE_CODES.TEMP_GRAPHIC_BEFORE_SHOT));
});

test("§S5 T4 is independent of T2 graphic end bounds", () => {
  const p = loadJson(join(VALID_DIR, "cartoon-story.json"));
  p.shots[1].graphics = [{ id: "graphic_early_end_valid", type: "text", text: "Early", start: 3, duration: 1 }];
  const errors = validateProject(p).errors;
  assert.ok(errors.some(x => x.code === ISSUE_CODES.TEMP_GRAPHIC_BEFORE_SHOT));
  assert.ok(!errors.some(x => x.code === ISSUE_CODES.TEMP_GRAPHIC_OUTSIDE_SHOT));
});

test("§S6 T4 skips schema-invalid projects and never mutates input", () => {
  const invalid = loadJson(join(VALID_DIR, "cartoon-story.json"));
  invalid.project.fps = 0;
  invalid.shots[1].graphics = [{ id: "graphic_early", type: "text", text: "Early", start: 2, duration: 1 }];
  const invalidSnapshot = structuredClone(invalid);
  const invalidResult = validateProject(invalid);
  assert.equal(invalidResult.meta.referenceSkipped, true);
  assert.ok(!codesOf(invalidResult).includes(ISSUE_CODES.TEMP_GRAPHIC_BEFORE_SHOT));
  assert.deepEqual(invalid, invalidSnapshot);

  const valid = loadJson(join(VALID_DIR, "cartoon-story.json"));
  const validSnapshot = structuredClone(valid);
  validateProject(valid);
  assert.deepEqual(valid, validSnapshot);
});

test("§S7 T4 does not report shots without graphics", () => {
  const p = loadJson(join(VALID_DIR, "cartoon-story.json"));
  p.shots[1].graphics = [];
  assert.ok(!codesOf(validateProject(p)).includes(ISSUE_CODES.TEMP_GRAPHIC_BEFORE_SHOT));
});


// =========================================================================
// §T  DS-09C3 T5 Timeline Track Project Duration Bounds
// =========================================================================

test("§T1 T5 accepts timeline tracks ending exactly at project.duration", () => {
  const p = loadJson(join(VALID_DIR, "cartoon-story.json"));
  p.timeline.audioTracks = [{ id: "audio_at_end", assetId: "voice_001", start: 10, duration: 2 }];
  p.timeline.musicTracks = [{ id: "music_at_end", assetId: "voice_001", start: 10, duration: 2 }];
  p.timeline.subtitleTracks = [{ id: "subtitle_at_end", text: "End", start: 10, duration: 2 }];
  const errors = validateProject(p).errors.filter(e => e.code === ISSUE_CODES.TEMP_TIMELINE_TRACK_EXCEEDS_PROJECT_DURATION);
  assert.equal(errors.length, 0);
});

test("§T2 T5 rejects tracks whose start is after project.duration", () => {
  const p = loadJson(join(VALID_DIR, "cartoon-story.json"));
  p.timeline.audioTracks = [{ id: "audio_late", assetId: "voice_001", start: 12.1 }];
  p.timeline.musicTracks = [{ id: "music_late", assetId: "voice_001", start: 12.2 }];
  p.timeline.subtitleTracks = [{ id: "subtitle_late", text: "Late", start: 12.3, duration: 0.2 }];
  const errors = validateProject(p).errors.filter(e => e.code === ISSUE_CODES.TEMP_TIMELINE_TRACK_EXCEEDS_PROJECT_DURATION);
  assert.equal(errors.length, 3);
  assert.deepEqual(errors.map(e => e.path), [
    "/timeline/audioTracks/0/start",
    "/timeline/musicTracks/0/start",
    "/timeline/subtitleTracks/0/start"
  ]);
});

test("§T3 T5 rejects tracks whose end exceeds project.duration", () => {
  const p = loadJson(join(VALID_DIR, "cartoon-story.json"));
  p.timeline.audioTracks = [{ id: "audio_over", assetId: "voice_001", start: 11, duration: 1.1 }];
  p.timeline.musicTracks = [{ id: "music_over", assetId: "voice_001", start: 11, duration: 1.2 }];
  p.timeline.subtitleTracks = [{ id: "subtitle_over", text: "Over", start: 11, duration: 1.3 }];
  const errors = validateProject(p).errors.filter(e => e.code === ISSUE_CODES.TEMP_TIMELINE_TRACK_EXCEEDS_PROJECT_DURATION);
  assert.equal(errors.length, 3);
  assert.deepEqual(errors.map(e => e.path), [
    "/timeline/audioTracks/0/duration",
    "/timeline/musicTracks/0/duration",
    "/timeline/subtitleTracks/0/duration"
  ]);
});

test("§T4 T5 checks every track independently and reports all violations", () => {
  const p = loadJson(join(VALID_DIR, "cartoon-story.json"));
  p.timeline.audioTracks = [
    { id: "audio_bad_a", assetId: "voice_001", start: 11, duration: 2 },
    { id: "audio_bad_b", assetId: "voice_001", start: 13 }
  ];
  p.timeline.musicTracks = [{ id: "music_bad", assetId: "voice_001", start: 0, duration: 13 }];
  const errors = validateProject(p).errors.filter(e => e.code === ISSUE_CODES.TEMP_TIMELINE_TRACK_EXCEEDS_PROJECT_DURATION);
  assert.equal(errors.length, 3);
  assert.deepEqual(errors.map(e => e.entityId), ["audio_bad_a", "audio_bad_b", "music_bad"]);
});

test("§T5 T5 accepts audio and music tracks without optional duration when start is in range", () => {
  const p = loadJson(join(VALID_DIR, "cartoon-story.json"));
  p.timeline.audioTracks = [{ id: "audio_no_duration", assetId: "voice_001", start: 11.9 }];
  p.timeline.musicTracks = [{ id: "music_no_duration", assetId: "voice_001", start: 12 }];
  const errors = validateProject(p).errors.filter(e => e.code === ISSUE_CODES.TEMP_TIMELINE_TRACK_EXCEEDS_PROJECT_DURATION);
  assert.equal(errors.length, 0);
});

test("§T6 T5 reports canonical issue fields and overflow context", () => {
  const p = loadJson(join(VALID_DIR, "cartoon-story.json"));
  p.timeline.subtitleTracks = [{ id: "subtitle_overflow", text: "Overflow", start: 11, duration: 1.5 }];
  const e = validateProject(p).errors.find(x => x.code === ISSUE_CODES.TEMP_TIMELINE_TRACK_EXCEEDS_PROJECT_DURATION);
  assert.ok(e);
  assert.equal(e.severity, "error");
  assert.equal(e.path, "/timeline/subtitleTracks/0/duration");
  assert.equal(e.entityId, "subtitle_overflow");
  assert.deepEqual(e.context, {
    collection: "subtitleTracks",
    trackId: "subtitle_overflow",
    trackIndex: 0,
    trackStart: 11,
    trackEnd: 12.5,
    projectDuration: 12,
    overflow: 0.5
  });
});

test("§T7 T5 allows empty timeline track collections", () => {
  const p = loadJson(join(VALID_DIR, "cartoon-story.json"));
  p.timeline.audioTracks = [];
  p.timeline.musicTracks = [];
  p.timeline.subtitleTracks = [];
  const errors = validateProject(p).errors.filter(e => e.code === ISSUE_CODES.TEMP_TIMELINE_TRACK_EXCEEDS_PROJECT_DURATION);
  assert.equal(errors.length, 0);
});

test("§T8 T5 skips schema-invalid projects and never mutates input", () => {
  const invalid = loadJson(join(VALID_DIR, "cartoon-story.json"));
  invalid.project.fps = 0;
  invalid.timeline.subtitleTracks[0].start = 20;
  const invalidSnapshot = structuredClone(invalid);
  const invalidResult = validateProject(invalid);
  assert.equal(invalidResult.meta.referenceSkipped, true);
  assert.ok(!codesOf(invalidResult).includes(ISSUE_CODES.TEMP_TIMELINE_TRACK_EXCEEDS_PROJECT_DURATION));
  assert.deepEqual(invalid, invalidSnapshot);

  const valid = loadJson(join(VALID_DIR, "cartoon-story.json"));
  const validSnapshot = structuredClone(valid);
  validateProject(valid);
  assert.deepEqual(valid, validSnapshot);
});

test("§T9 T5 uses absolute timeline start values", () => {
  const p = loadJson(join(VALID_DIR, "cartoon-story.json"));
  p.timeline.subtitleTracks = [{ id: "subtitle_absolute", text: "Absolute", start: 11.5, duration: 0.5 }];
  const errors = validateProject(p).errors.filter(e => e.code === ISSUE_CODES.TEMP_TIMELINE_TRACK_EXCEEDS_PROJECT_DURATION);
  assert.equal(errors.length, 0);
});


// =========================================================================
// §U  DS-09C4 T6/T7 Transition Duration Semantics
// =========================================================================

test("§U1 T6 accepts positive-duration fade, wipe, and slide transitions", () => {
  const p = loadJson(join(VALID_DIR, "cartoon-story.json"));
  for (const type of ["fade", "wipe", "slide"]) {
    p.shots[0].transitionOut = { type, duration: 0.25 };
    const errors = validateProject(p).errors.filter(e => e.code === ISSUE_CODES.TEMP_TRANSITION_DURATION_NOT_POSITIVE);
    assert.equal(errors.length, 0, type);
  }
});

test("§U2 T6 rejects zero-duration non-cut transitions", () => {
  const p = loadJson(join(VALID_DIR, "cartoon-story.json"));
  p.shots[0].transitionOut = { type: "fade", duration: 0 };
  const e = validateProject(p).errors.find(x => x.code === ISSUE_CODES.TEMP_TRANSITION_DURATION_NOT_POSITIVE);
  assert.ok(e);
  assert.equal(e.path, "/shots/0/transitionOut/duration");
  assert.equal(e.entityId, p.shots[0].id);
  assert.deepEqual(e.context, {
    shotId: p.shots[0].id,
    transitionType: "fade",
    transitionDuration: 0
  });
});

test("§U3 T6 does not flag a cut transition with zero duration", () => {
  const p = loadJson(join(VALID_DIR, "cartoon-story.json"));
  p.shots[0].transitionOut = { type: "cut", duration: 0 };
  const errors = validateProject(p).errors.filter(e => e.code === ISSUE_CODES.TEMP_TRANSITION_DURATION_NOT_POSITIVE);
  assert.equal(errors.length, 0);
});

test("§U4 T7 accepts transition duration equal to shot duration", () => {
  const p = loadJson(join(VALID_DIR, "cartoon-story.json"));
  p.shots[0].transitionOut = { type: "fade", duration: p.shots[0].duration };
  const errors = validateProject(p).errors.filter(e => e.code === ISSUE_CODES.TEMP_TRANSITION_EXCEEDS_SHOT_DURATION);
  assert.equal(errors.length, 0);
});

test("§U5 T7 rejects transition duration longer than its owning shot", () => {
  const p = loadJson(join(VALID_DIR, "cartoon-story.json"));
  p.shots[0].transitionOut = { type: "wipe", duration: p.shots[0].duration + 0.5 };
  const e = validateProject(p).errors.find(x => x.code === ISSUE_CODES.TEMP_TRANSITION_EXCEEDS_SHOT_DURATION);
  assert.ok(e);
  assert.equal(e.path, "/shots/0/transitionOut/duration");
  assert.equal(e.entityId, p.shots[0].id);
  assert.deepEqual(e.context, {
    shotId: p.shots[0].id,
    transitionType: "wipe",
    transitionDuration: p.shots[0].duration + 0.5,
    shotDuration: p.shots[0].duration,
    overflow: 0.5
  });
});

test("§U6 T7 reports every transition exceeding its own shot duration", () => {
  const p = loadJson(join(VALID_DIR, "cartoon-story.json"));
  p.shots[0].transitionOut = { type: "fade", duration: p.shots[0].duration + 0.1 };
  p.shots[1].transitionOut = { type: "slide", duration: p.shots[1].duration + 0.2 };
  const errors = validateProject(p).errors.filter(e => e.code === ISSUE_CODES.TEMP_TRANSITION_EXCEEDS_SHOT_DURATION);
  assert.equal(errors.length, 2);
  assert.deepEqual(errors.map(e => e.entityId), [p.shots[0].id, p.shots[1].id]);
});

test("§U7 T6/T7 do not require a following shot or validate transition adjacency", () => {
  const p = loadJson(join(VALID_DIR, "cartoon-story.json"));
  p.shots = [p.shots[0]];
  p.shots[0].transitionOut = { type: "fade", duration: 0.2 };
  const errors = validateProject(p).errors.filter(e =>
    e.code === ISSUE_CODES.TEMP_TRANSITION_DURATION_NOT_POSITIVE ||
    e.code === ISSUE_CODES.TEMP_TRANSITION_EXCEEDS_SHOT_DURATION
  );
  assert.equal(errors.length, 0);
});

test("§U8 T6/T7 skip schema-invalid projects and never mutate input", () => {
  const invalid = loadJson(join(VALID_DIR, "cartoon-story.json"));
  invalid.project.fps = 0;
  invalid.shots[0].transitionOut = { type: "fade", duration: 0 };
  const invalidSnapshot = structuredClone(invalid);
  const invalidResult = validateProject(invalid);
  assert.equal(invalidResult.meta.referenceSkipped, true);
  assert.ok(!codesOf(invalidResult).includes(ISSUE_CODES.TEMP_TRANSITION_DURATION_NOT_POSITIVE));
  assert.ok(!codesOf(invalidResult).includes(ISSUE_CODES.TEMP_TRANSITION_EXCEEDS_SHOT_DURATION));
  assert.deepEqual(invalid, invalidSnapshot);

  const valid = loadJson(join(VALID_DIR, "cartoon-story.json"));
  valid.shots[0].transitionOut = { type: "fade", duration: 0.2 };
  const validSnapshot = structuredClone(valid);
  validateProject(valid);
  assert.deepEqual(valid, validSnapshot);
});


// =========================================================================
// §V  DS-09D3 C1 Consecutive Camera Shot Type Variety
// =========================================================================

test("§V1 C1 accepts consecutive shots with different shot types", () => {
  const p = loadJson(join(VALID_DIR, "cartoon-story.json"));
  p.shots[0].camera.shotType = "wide";
  p.shots[1].camera.shotType = "close_up";
  const errors = validateProject(p).errors.filter(e => e.code === ISSUE_CODES.COMP_CAMERA_VARIETY_CONSECUTIVE_REPEAT);
  assert.equal(errors.length, 0);
});

test("§V2 C1 reports consecutive chronological shots with the same shot type", () => {
  const p = loadJson(join(VALID_DIR, "cartoon-story.json"));
  p.shots[0].camera.shotType = "wide";
  p.shots[1].camera.shotType = "wide";
  const e = validateProject(p).errors.find(x => x.code === ISSUE_CODES.COMP_CAMERA_VARIETY_CONSECUTIVE_REPEAT);
  assert.ok(e);
  assert.equal(e.severity, "error");
  assert.equal(e.path, "/shots/1/camera/shotType");
  assert.equal(e.entityId, p.shots[1].id);
  assert.deepEqual(e.context, {
    previousShotId: p.shots[0].id,
    currentShotId: p.shots[1].id,
    shotType: "wide",
    previousShotIndex: 0,
    currentShotIndex: 1
  });
});

test("§V3 C1 uses chronological order rather than shots array order", () => {
  const p = loadJson(join(VALID_DIR, "cartoon-story.json"));
  const first = { ...p.shots[0], id: "later", start: 5, camera: { ...p.shots[0].camera, shotType: "wide" } };
  const second = { ...p.shots[1], id: "earlier", start: 0, camera: { ...p.shots[1].camera, shotType: "wide" } };
  p.shots = [first, second];
  const e = validateProject(p).errors.find(x => x.code === ISSUE_CODES.COMP_CAMERA_VARIETY_CONSECUTIVE_REPEAT);
  assert.ok(e);
  assert.equal(e.entityId, "later");
  assert.equal(e.path, "/shots/0/camera/shotType");
  assert.equal(e.context.previousShotId, "earlier");
  assert.equal(e.context.currentShotId, "later");
});

test("§V4 C1 reports every consecutive repeated shot type", () => {
  const p = loadJson(join(VALID_DIR, "cartoon-story.json"));
  const base = p.shots[0];
  p.shots = [
    { ...base, id: "s1", start: 0, camera: { ...base.camera, shotType: "wide" } },
    { ...base, id: "s2", start: 2, camera: { ...base.camera, shotType: "wide" } },
    { ...base, id: "s3", start: 4, camera: { ...base.camera, shotType: "wide" } },
    { ...base, id: "s4", start: 6, camera: { ...base.camera, shotType: "close_up" } }
  ];
  const errors = validateProject(p).errors.filter(e => e.code === ISSUE_CODES.COMP_CAMERA_VARIETY_CONSECUTIVE_REPEAT);
  assert.equal(errors.length, 2);
  assert.deepEqual(errors.map(e => e.entityId), ["s2", "s3"]);
});

test("§V5 C1 allows the same shot type when another shot type separates them", () => {
  const p = loadJson(join(VALID_DIR, "cartoon-story.json"));
  const base = p.shots[0];
  p.shots = [
    { ...base, id: "s1", start: 0, camera: { ...base.camera, shotType: "wide" } },
    { ...base, id: "s2", start: 2, camera: { ...base.camera, shotType: "medium" } },
    { ...base, id: "s3", start: 4, camera: { ...base.camera, shotType: "wide" } }
  ];
  const errors = validateProject(p).errors.filter(e => e.code === ISSUE_CODES.COMP_CAMERA_VARIETY_CONSECUTIVE_REPEAT);
  assert.equal(errors.length, 0);
});

test("§V6 C1 skips schema-invalid projects and never mutates input", () => {
  const invalid = loadJson(join(VALID_DIR, "cartoon-story.json"));
  invalid.project.fps = 0;
  invalid.shots[0].camera.shotType = invalid.shots[1].camera.shotType;
  const invalidSnapshot = structuredClone(invalid);
  const result = validateProject(invalid);
  assert.equal(result.meta.referenceSkipped, true);
  assert.ok(!codesOf(result).includes(ISSUE_CODES.COMP_CAMERA_VARIETY_CONSECUTIVE_REPEAT));
  assert.deepEqual(invalid, invalidSnapshot);

  const valid = loadJson(join(VALID_DIR, "cartoon-story.json"));
  const snapshot = structuredClone(valid);
  validateProject(valid);
  assert.deepEqual(valid, snapshot);
});

test("§V7 C1 does not report projects with fewer than two shots", () => {
  const p = loadJson(join(VALID_DIR, "cartoon-story.json"));
  p.shots = [p.shots[0]];
  const errors = validateProject(p).errors.filter(e => e.code === ISSUE_CODES.COMP_CAMERA_VARIETY_CONSECUTIVE_REPEAT);
  assert.equal(errors.length, 0);
});


// =========================================================================
// §W  DS-09E1 R19 Graphic Asset References
// =========================================================================

test("§W1 R19 accepts a graphic whose assetId resolves in assets.graphics", () => {
  const p = loadJson(join(VALID_DIR, "cartoon-story.json"));
  p.assets.graphics ??= {};
  p.assets.graphics.badge_001 = { id: "badge_001", kind: "svg", uri: "assets/badge.svg" };
  p.shots[0].graphics[0].assetId = "badge_001";
  const errors = validateProject(p).errors.filter(e => e.code === ISSUE_CODES.REF_GRAPHIC_ASSET_MISSING);
  assert.equal(errors.length, 0);
});

test("§W2 R19 reports a missing graphic asset with canonical issue fields", () => {
  const p = loadJson(join(VALID_DIR, "cartoon-story.json"));
  p.shots[0].graphics[0].assetId = "missing_badge";
  const e = validateProject(p).errors.find(x => x.code === ISSUE_CODES.REF_GRAPHIC_ASSET_MISSING);
  assert.ok(e);
  assert.equal(e.severity, "error");
  assert.equal(e.path, "/shots/0/graphics/0/assetId");
  assert.equal(e.entityId, p.shots[0].graphics[0].id);
  assert.deepEqual(e.context, {
    shotId: p.shots[0].id,
    graphicId: p.shots[0].graphics[0].id,
    assetId: "missing_badge"
  });
});

test("§W3 R19 ignores graphics without an optional assetId", () => {
  const p = loadJson(join(VALID_DIR, "cartoon-story.json"));
  const errors = validateProject(p).errors.filter(e => e.code === ISSUE_CODES.REF_GRAPHIC_ASSET_MISSING);
  assert.equal(errors.length, 0);
});

test("§W4 R19 resolves only against assets.graphics, not other asset registries", () => {
  const p = loadJson(join(VALID_DIR, "cartoon-story.json"));
  p.assets.vector.vector_only = { id: "vector_only", kind: "svg", uri: "assets/vector.svg" };
  p.assets.props ??= {};
  p.assets.props.prop_only = { id: "prop_only", kind: "svg", uri: "assets/prop.svg" };
  p.shots[0].graphics[0].assetId = "vector_only";
  p.shots[1].graphics = [{ id: "graphic_002", type: "icon", start: 4, duration: 1, assetId: "prop_only" }];
  const errors = validateProject(p).errors.filter(e => e.code === ISSUE_CODES.REF_GRAPHIC_ASSET_MISSING);
  assert.deepEqual(errors.map(e => e.context.assetId), ["vector_only", "prop_only"]);
});

test("§W5 R19 reports every unresolved graphic asset reference", () => {
  const p = loadJson(join(VALID_DIR, "cartoon-story.json"));
  p.shots[0].graphics[0].assetId = "missing_one";
  p.shots[1].graphics = [{ id: "graphic_002", type: "icon", start: 4, duration: 1, assetId: "missing_two" }];
  const errors = validateProject(p).errors.filter(e => e.code === ISSUE_CODES.REF_GRAPHIC_ASSET_MISSING);
  assert.equal(errors.length, 2);
  assert.deepEqual(errors.map(e => e.context.assetId), ["missing_one", "missing_two"]);
});

test("§W6 R19 treats an absent optional graphics registry as missing when referenced", () => {
  const p = loadJson(join(VALID_DIR, "cartoon-story.json"));
  delete p.assets.graphics;
  p.shots[0].graphics[0].assetId = "not_registered";
  const errors = validateProject(p).errors.filter(e => e.code === ISSUE_CODES.REF_GRAPHIC_ASSET_MISSING);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].context.assetId, "not_registered");
});

test("§W7 R19 skips schema-invalid projects and does not mutate input", () => {
  const invalid = loadJson(join(VALID_DIR, "cartoon-story.json"));
  invalid.project.fps = 0;
  invalid.shots[0].graphics[0].assetId = "missing_asset";
  const invalidSnapshot = structuredClone(invalid);
  const result = validateProject(invalid);
  assert.equal(result.meta.referenceSkipped, true);
  assert.ok(!codesOf(result).includes(ISSUE_CODES.REF_GRAPHIC_ASSET_MISSING));
  assert.deepEqual(invalid, invalidSnapshot);

  const valid = loadJson(join(VALID_DIR, "cartoon-story.json"));
  valid.shots[0].graphics[0].assetId = "missing_asset";
  const validSnapshot = structuredClone(valid);
  validateProject(valid);
  assert.deepEqual(valid, validSnapshot);
});


// =========================================================================
// §X  DS-09E2 R20 Type-driven Effect Asset References
// =========================================================================

test("§X1 R20 accepts all contracted no-asset Effect Types without assetId", () => {
  const p = loadJson(join(VALID_DIR, "cartoon-story.json"));
  p.shots[0].effects = [
    "color_adjustment", "blur", "drop_shadow",
    "glow", "vignette", "film_grain"
  ].map((type, index) => ({ id: `effect_${index}`, type }));
  const errors = validateProject(p).errors.filter(e =>
    e.code === ISSUE_CODES.REF_EFFECT_ASSET_REQUIRED ||
    e.code === ISSUE_CODES.REF_EFFECT_ASSET_MISSING
  );
  assert.equal(errors.length, 0);
});

test("§X2 R20 requires assetId for texture_overlay with canonical issue fields", () => {
  const p = loadJson(join(VALID_DIR, "cartoon-story.json"));
  p.shots[0].effects = [{ id: "texture_001", type: "texture_overlay" }];
  const e = validateProject(p).errors.find(x =>
    x.code === ISSUE_CODES.REF_EFFECT_ASSET_REQUIRED
  );
  assert.ok(e);
  assert.equal(e.severity, "error");
  assert.equal(e.path, "/shots/0/effects/0/assetId");
  assert.equal(e.entityId, "texture_001");
  assert.deepEqual(e.context, {
    shotId: p.shots[0].id,
    effectId: "texture_001",
    effectType: "texture_overlay",
    registry: "graphics"
  });
});

test("§X3 R20 accepts texture_overlay when assetId resolves in assets.graphics", () => {
  const p = loadJson(join(VALID_DIR, "cartoon-story.json"));
  p.assets.graphics = {
    texture_001: { id: "texture_001", kind: "svg", uri: "assets/texture.svg" }
  };
  p.shots[0].effects = [{
    id: "effect_texture",
    type: "texture_overlay",
    assetId: "texture_001"
  }];
  const errors = validateProject(p).errors.filter(e =>
    e.code === ISSUE_CODES.REF_EFFECT_ASSET_REQUIRED ||
    e.code === ISSUE_CODES.REF_EFFECT_ASSET_MISSING
  );
  assert.equal(errors.length, 0);
});

test("§X4 R20 rejects texture_overlay assets found only in another registry", () => {
  const p = loadJson(join(VALID_DIR, "cartoon-story.json"));
  p.assets.vector.vector_texture = {
    id: "vector_texture", kind: "svg", uri: "assets/texture.svg"
  };
  p.shots[0].effects = [{
    id: "effect_texture",
    type: "texture_overlay",
    assetId: "vector_texture"
  }];
  const e = validateProject(p).errors.find(x =>
    x.code === ISSUE_CODES.REF_EFFECT_ASSET_MISSING
  );
  assert.ok(e);
  assert.equal(e.path, "/shots/0/effects/0/assetId");
  assert.equal(e.entityId, "effect_texture");
  assert.deepEqual(e.context, {
    shotId: p.shots[0].id,
    effectId: "effect_texture",
    effectType: "texture_overlay",
    assetId: "vector_texture",
    registry: "graphics"
  });
});

test("§X5 R20 ignores Effect Types not listed in the approved contract", () => {
  const p = loadJson(join(VALID_DIR, "cartoon-story.json"));
  p.shots[0].effects = [{
    id: "future_effect",
    type: "future_custom_effect",
    assetId: "not_registered"
  }];
  const errors = validateProject(p).errors.filter(e =>
    e.code === ISSUE_CODES.REF_EFFECT_ASSET_REQUIRED ||
    e.code === ISSUE_CODES.REF_EFFECT_ASSET_MISSING
  );
  assert.equal(errors.length, 0);
});

test("§X6 R20 reports every unresolved contracted Effect asset reference", () => {
  const p = loadJson(join(VALID_DIR, "cartoon-story.json"));
  p.shots[0].effects = [
    { id: "effect_a", type: "texture_overlay", assetId: "missing_a" },
    { id: "effect_b", type: "texture_overlay", assetId: "missing_b" }
  ];
  const errors = validateProject(p).errors.filter(e =>
    e.code === ISSUE_CODES.REF_EFFECT_ASSET_MISSING
  );
  assert.equal(errors.length, 2);
  assert.deepEqual(errors.map(e => e.context.assetId), ["missing_a", "missing_b"]);
});

test("§X7 R20 skips schema-invalid projects and never mutates input", () => {
  const invalid = loadJson(join(VALID_DIR, "cartoon-story.json"));
  invalid.project.fps = 0;
  invalid.shots[0].effects = [{
    id: "effect_texture",
    type: "texture_overlay",
    assetId: "missing_texture"
  }];
  const invalidSnapshot = structuredClone(invalid);
  const invalidResult = validateProject(invalid);
  assert.equal(invalidResult.meta.referenceSkipped, true);
  assert.ok(!invalidResult.errors.some(e =>
    e.code === ISSUE_CODES.REF_EFFECT_ASSET_REQUIRED ||
    e.code === ISSUE_CODES.REF_EFFECT_ASSET_MISSING
  ));
  assert.deepEqual(invalid, invalidSnapshot);

  const valid = loadJson(join(VALID_DIR, "cartoon-story.json"));
  valid.shots[0].effects = [{
    id: "effect_texture",
    type: "texture_overlay",
    assetId: "missing_texture"
  }];
  const validSnapshot = structuredClone(valid);
  validateProject(valid);
  assert.deepEqual(valid, validSnapshot);
});


test("§X8 R20 reports a missing texture asset when assets.graphics is absent", () => {
  const p = loadJson(join(VALID_DIR, "cartoon-story.json"));
  delete p.assets.graphics;
  p.shots[0].effects = [{
    id: "effect_texture",
    type: "texture_overlay",
    assetId: "texture_missing"
  }];
  const e = validateProject(p).errors.find(x =>
    x.code === ISSUE_CODES.REF_EFFECT_ASSET_MISSING
  );
  assert.ok(e);
  assert.equal(e.context.registry, "graphics");
  assert.equal(e.context.assetId, "texture_missing");
});


// =========================================================================
// §Y  DS-09E3B Effect Parameter Contract v1
// =========================================================================

test("§Y1 DS-09E3 accepts omitted params for every contracted Effect Type", () => {
  const p = loadJson(join(VALID_DIR, "cartoon-story.json"));
  p.shots[0].effects = [
    "color_adjustment", "blur", "drop_shadow",
    "glow", "vignette", "film_grain", "texture_overlay"
  ].map((type, index) => ({
    id: `effect_${index}`,
    type,
    ...(type === "texture_overlay" ? { assetId: "texture_asset" } : {})
  }));
  p.assets.graphics ??= {};
  p.assets.graphics.texture_asset = {
    id: "texture_asset", kind: "svg", uri: "assets/texture.svg"
  };
  const codes = [
    ISSUE_CODES.REF_EFFECT_PARAMS_INVALID,
    ISSUE_CODES.REF_EFFECT_PARAM_UNKNOWN,
    ISSUE_CODES.REF_EFFECT_PARAM_TYPE_INVALID,
    ISSUE_CODES.REF_EFFECT_PARAM_OUT_OF_RANGE,
    ISSUE_CODES.REF_EFFECT_PARAM_FORMAT_INVALID
  ];
  assert.equal(validateProject(p).errors.filter(e => codes.includes(e.code)).length, 0);
});

test("§Y2 DS-09E3 accepts valid boundary values for numeric parameters", () => {
  const p = loadJson(join(VALID_DIR, "cartoon-story.json"));
  p.shots[0].effects = [
    { id: "a", type: "color_adjustment", params: { brightness: -1, contrast: 2, saturation: 0 } },
    { id: "b", type: "blur", params: { radius: 100 } },
    { id: "c", type: "drop_shadow", params: { offsetX: -100, offsetY: 100, blurRadius: 0, opacity: 1 } },
    { id: "d", type: "glow", params: { intensity: 2, radius: 0 } },
    { id: "e", type: "vignette", params: { intensity: 0, radius: 1 } },
    { id: "f", type: "film_grain", params: { amount: 1, size: 0 } },
    { id: "g", type: "texture_overlay", assetId: "texture_asset", params: { opacity: 0, blendMode: "soft-light" } }
  ];
  p.assets.graphics ??= {};
  p.assets.graphics.texture_asset = { id: "texture_asset", kind: "svg", uri: "assets/texture.svg" };
  const codes = [
    ISSUE_CODES.REF_EFFECT_PARAMS_INVALID,
    ISSUE_CODES.REF_EFFECT_PARAM_UNKNOWN,
    ISSUE_CODES.REF_EFFECT_PARAM_TYPE_INVALID,
    ISSUE_CODES.REF_EFFECT_PARAM_OUT_OF_RANGE,
    ISSUE_CODES.REF_EFFECT_PARAM_FORMAT_INVALID
  ];
  assert.equal(validateProject(p).errors.filter(e => codes.includes(e.code)).length, 0);
});

test("§Y3 DS-09E3 rejects params that are not an object", () => {
  const p = loadJson(join(VALID_DIR, "cartoon-story.json"));
  p.shots[0].effects = [{ id: "blur_1", type: "blur", params: [] }];
  const e = validateProject(p).errors.find(x => x.code === ISSUE_CODES.REF_EFFECT_PARAMS_INVALID);
  assert.ok(e);
  assert.equal(e.path, "/shots/0/effects/0/params");
  assert.equal(e.entityId, "blur_1");
});

test("§Y4 DS-09E3 rejects unknown parameters for a contracted Effect Type", () => {
  const p = loadJson(join(VALID_DIR, "cartoon-story.json"));
  p.shots[0].effects = [{ id: "blur_1", type: "blur", params: { strength: 5 } }];
  const e = validateProject(p).errors.find(x => x.code === ISSUE_CODES.REF_EFFECT_PARAM_UNKNOWN);
  assert.ok(e);
  assert.equal(e.path, "/shots/0/effects/0/params/strength");
  assert.equal(e.context.parameter, "strength");
});

test("§Y5 DS-09E3 rejects incorrect parameter data types", () => {
  const p = loadJson(join(VALID_DIR, "cartoon-story.json"));
  p.shots[0].effects = [{ id: "blur_1", type: "blur", params: { radius: "12" } }];
  const e = validateProject(p).errors.find(x => x.code === ISSUE_CODES.REF_EFFECT_PARAM_TYPE_INVALID);
  assert.ok(e);
  assert.equal(e.path, "/shots/0/effects/0/params/radius");
  assert.equal(e.context.expectedType, "number");
});

test("§Y6 DS-09E3 rejects numeric parameters outside inclusive bounds", () => {
  const p = loadJson(join(VALID_DIR, "cartoon-story.json"));
  p.shots[0].effects = [{ id: "blur_1", type: "blur", params: { radius: 100.01 } }];
  const e = validateProject(p).errors.find(x => x.code === ISSUE_CODES.REF_EFFECT_PARAM_OUT_OF_RANGE);
  assert.ok(e);
  assert.equal(e.path, "/shots/0/effects/0/params/radius");
  assert.equal(e.context.min, 0);
  assert.equal(e.context.max, 100);
});

test("§Y7 DS-09E3 validates Hex color formats and texture blend modes", () => {
  const p = loadJson(join(VALID_DIR, "cartoon-story.json"));
  p.shots[0].effects = [
    { id: "shadow_1", type: "drop_shadow", params: { color: "red" } },
    { id: "texture_1", type: "texture_overlay", assetId: "texture_asset", params: { blendMode: "hard-light" } }
  ];
  p.assets.graphics ??= {};
  p.assets.graphics.texture_asset = { id: "texture_asset", kind: "svg", uri: "assets/texture.svg" };
  const errors = validateProject(p).errors.filter(e => e.code === ISSUE_CODES.REF_EFFECT_PARAM_FORMAT_INVALID);
  assert.equal(errors.length, 2);
  assert.deepEqual(errors.map(e => e.path), [
    "/shots/0/effects/0/params/color",
    "/shots/0/effects/1/params/blendMode"
  ]);
});

test("§Y8 DS-09E3 reports multiple invalid parameters in one Effect", () => {
  const p = loadJson(join(VALID_DIR, "cartoon-story.json"));
  p.shots[0].effects = [{
    id: "color_1",
    type: "color_adjustment",
    params: { brightness: 2, contrast: "high", unknown: true }
  }];
  const errors = validateProject(p).errors.filter(e =>
    [
      ISSUE_CODES.REF_EFFECT_PARAM_UNKNOWN,
      ISSUE_CODES.REF_EFFECT_PARAM_TYPE_INVALID,
      ISSUE_CODES.REF_EFFECT_PARAM_OUT_OF_RANGE
    ].includes(e.code)
  );
  assert.equal(errors.length, 3);
});

test("§Y9 DS-09E3 leaves unknown Effect Types forward-compatible", () => {
  const p = loadJson(join(VALID_DIR, "cartoon-story.json"));
  p.shots[0].effects = [{
    id: "future_1",
    type: "future_custom_effect",
    params: { arbitrary: { nested: true } }
  }];
  const codes = [
    ISSUE_CODES.REF_EFFECT_PARAMS_INVALID,
    ISSUE_CODES.REF_EFFECT_PARAM_UNKNOWN,
    ISSUE_CODES.REF_EFFECT_PARAM_TYPE_INVALID,
    ISSUE_CODES.REF_EFFECT_PARAM_OUT_OF_RANGE,
    ISSUE_CODES.REF_EFFECT_PARAM_FORMAT_INVALID
  ];
  assert.equal(validateProject(p).errors.filter(e => codes.includes(e.code)).length, 0);
});

test("§Y10 DS-09E3 skips schema-invalid projects and never mutates input", () => {
  const invalid = loadJson(join(VALID_DIR, "cartoon-story.json"));
  invalid.project.fps = 0;
  invalid.shots[0].effects = [{ id: "blur_1", type: "blur", params: { radius: 200 } }];
  const invalidSnapshot = structuredClone(invalid);
  const invalidResult = validateProject(invalid);
  assert.equal(invalidResult.meta.referenceSkipped, true);
  assert.ok(!invalidResult.errors.some(e =>
    e.code === ISSUE_CODES.REF_EFFECT_PARAM_OUT_OF_RANGE
  ));
  assert.deepEqual(invalid, invalidSnapshot);

  const valid = loadJson(join(VALID_DIR, "cartoon-story.json"));
  valid.shots[0].effects = [{ id: "blur_1", type: "blur", params: { radius: 200 } }];
  const validSnapshot = structuredClone(valid);
  validateProject(valid);
  assert.deepEqual(valid, validSnapshot);
});
