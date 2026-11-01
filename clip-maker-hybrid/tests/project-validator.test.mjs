// tests/project-validator.test.mjs
// DS-02 + DS-03A + DS-03B + DS-04 + DS-05 + DS-06 tests. Run via `node --test tests/`.
// DS-01 tests in tests/schema.test.mjs are NOT touched.
//
// Total: 66 tests
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
