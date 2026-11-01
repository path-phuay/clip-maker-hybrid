// validators/ReferenceValidator.js
// Layer B: semantic reference validation.
// Implements ONLY the Architecture-Owner-approved rules:
//   R1, R5, R7, R8, R9, R10, R11.
// Does NOT mutate input. Reads only. Returns { errors: Issue[] }.
//
// Precondition: caller (ProjectValidator) must only invoke this when
// Layer A (schema) succeeded. This module does NOT re-validate schema shape.
//
// JSON Pointer escaping: every dynamic object key is escaped per RFC 6901
// via escapeJsonPointerToken() before being inserted into an Issue.path.

import {
  ISSUE_CODES,
  makeIssue,
  escapeJsonPointerToken,
} from "./issues.js";

/**
 * Build a JSON Pointer path for an Issue. Dynamic tokens are escaped.
 * Static parts are authored constants and already safe.
 *
 * @param {string[]} segments - ordered path segments, all escaped here
 * @returns {string}
 */
function pointer(segments) {
  return "/" + segments.map(escapeJsonPointerToken).join("/");
}

/**
 * R1 — Every entry in assets.characters must have entry.id === map key.
 *
 * @param {Object} project
 * @param {import("./issues.js").Issue[]} out
 */
function checkCharacterMapKeyIntegrity(project, out) {
  const characters = project.assets?.characters ?? {};
  for (const [key, character] of Object.entries(characters)) {
    if (!character || typeof character !== "object") continue;
    if (character.id !== key) {
      out.push(
        makeIssue({
          severity: "error",
          code: ISSUE_CODES.REF_CHARACTER_KEY_MISMATCH,
          message:
            `Character entry at assets.characters["${key}"] has id ` +
            `"${character.id}" which does not match its map key "${key}".`,
          path: pointer(["assets", "characters", key, "id"]),
          entityId: key,
          context: { mapKey: key, declaredId: character.id },
        })
      );
    }
  }
}

/**
 * R5 — Any declared view asset id on a character must exist in assets.vector.
 * Only checks views that are actually present (front is schema-required;
 * others optional).
 *
 * @param {Object} project
 * @param {import("./issues.js").Issue[]} out
 */
function checkCharacterViewAssets(project, out) {
  const characters = project.assets?.characters ?? {};
  const vector = project.assets?.vector ?? {};
  const VIEW_NAMES = ["front", "threeQuarter", "side", "back"];

  for (const [charKey, character] of Object.entries(characters)) {
    const views = character?.views;
    if (!views || typeof views !== "object") continue;

    for (const viewName of VIEW_NAMES) {
      if (!(viewName in views)) continue;
      const assetId = views[viewName];
      if (typeof assetId !== "string") continue;
      if (!Object.prototype.hasOwnProperty.call(vector, assetId)) {
        out.push(
          makeIssue({
            severity: "error",
            code: ISSUE_CODES.REF_CHARACTER_VIEW_ASSET_MISSING,
            message:
              `Character "${charKey}" view "${viewName}" references asset ` +
              `"${assetId}" which is not present in assets.vector.`,
            path: pointer(["assets", "characters", charKey, "views", viewName]),
            entityId: charKey,
            context: { characterId: charKey, view: viewName, assetId },
          })
        );
      }
    }
  }
}

/**
 * R7 — Every scene-layer asset id must resolve in at least one asset registry:
 * assets.vector, assets.props, or assets.graphics.
 *
 * Registry membership is based on own keys. A single matching registry is
 * sufficient; optional registries may be absent. Schema validation guarantees
 * the referenced collection shapes before this function is called.
 *
 * @param {Object} project
 * @param {import("./issues.js").Issue[]} out
 */
function checkSceneLayerAssetReferences(project, out) {
  const vector = project.assets?.vector ?? {};
  const props = project.assets?.props ?? {};
  const graphics = project.assets?.graphics ?? {};
  const registries = [vector, props, graphics];

  project.scenes.forEach((scene, sceneIndex) => {
    scene.layers.forEach((layer, layerIndex) => {
      layer.assetIds.forEach((assetId, assetIndex) => {
        const exists = registries.some((registry) =>
          Object.prototype.hasOwnProperty.call(registry, assetId)
        );
        if (exists) return;

        out.push(
          makeIssue({
            severity: "error",
            code: ISSUE_CODES.REF_SCENE_LAYER_ASSET_MISSING,
            message:
              `Scene layer references asset "${assetId}" which does not exist ` +
              "in assets.vector, assets.props, or assets.graphics.",
            path: pointer([
              "scenes",
              String(sceneIndex),
              "layers",
              String(layerIndex),
              "assetIds",
              String(assetIndex),
            ]),
            entityId: assetId,
            context: { assetId, sceneIndex, layerIndex, assetIndex },
          })
        );
      });
    });
  });
}

/**
 * R11 — A camera targetId must match the characterId of at least one actor
 * in the same shot. One matching actor instance is sufficient.
 *
 * @param {Object} project
 * @param {import("./issues.js").Issue[]} out
 */
function checkCameraTargetActorReferences(project, out) {
  const shots = project.shots ?? [];

  shots.forEach((shot, shotIndex) => {
    if (!shot || typeof shot !== "object") return;
    const targetId = shot.camera?.targetId;
    if (typeof targetId !== "string") return;

    const actors = Array.isArray(shot.actors) ? shot.actors : [];
    const hasTargetActor = actors.some(
      (actor) => actor && typeof actor === "object" &&
        actor.characterId === targetId
    );
    if (hasTargetActor) return;

    out.push(
      makeIssue({
        severity: "error",
        code: ISSUE_CODES.REF_CAMERA_TARGET_ACTOR_MISSING,
        message:
          `Camera targetId "${targetId}" does not match any actor characterId in this shot.`,
        path: pointer(["shots", String(shotIndex), "camera", "targetId"]),
        entityId: targetId,
        context: { shotId: shot.id, targetId },
      })
    );
  });
}

/**
 * R8 — Every shot.sceneId must resolve to an existing scene id.
 *
 * @param {Object} project
 * @param {import("./issues.js").Issue[]} out
 */
function checkShotSceneReferences(project, out) {
  const shots = project.shots ?? [];
  const scenes = project.scenes ?? [];
  const sceneIds = new Set();
  for (const scene of scenes) {
    if (scene && typeof scene.id === "string") sceneIds.add(scene.id);
  }

  shots.forEach((shot, i) => {
    if (!shot || typeof shot !== "object") return;
    const sceneId = shot.sceneId;
    if (typeof sceneId !== "string") return;
    if (!sceneIds.has(sceneId)) {
      out.push(
        makeIssue({
          severity: "error",
          code: ISSUE_CODES.REF_SHOT_SCENE_MISSING,
          message:
            `Shot "${shot.id ?? i}" references sceneId "${sceneId}" ` +
            `which does not exist in scenes[].id.`,
          path: pointer(["shots", String(i), "sceneId"]),
          entityId: shot.id,
          context: { shotId: shot.id, sceneId },
        })
      );
    }
  });
}

/**
 * R9 — Every shot actor's characterId must resolve in assets.characters.
 * R10 — Every shot actor's view must be declared on the resolved character.
 *
 * Combined in one pass. When R9 fails, R10 is NOT emitted for that actor
 * (a non-existent character cannot declare views). This is deliberate:
 * one root cause → one error.
 *
 * @param {Object} project
 * @param {import("./issues.js").Issue[]} out
 */
function checkShotActorReferences(project, out) {
  const shots = project.shots ?? [];
  const characters = project.assets?.characters ?? {};

  shots.forEach((shot, i) => {
    if (!shot || typeof shot !== "object") return;
    const actors = shot.actors;
    if (!Array.isArray(actors)) return;

    actors.forEach((actor, j) => {
      if (!actor || typeof actor !== "object") return;

      const characterId = actor.characterId;
      if (typeof characterId !== "string") return;

      const has = Object.prototype.hasOwnProperty.call(characters, characterId);
      if (!has) {
        out.push(
          makeIssue({
            severity: "error",
            code: ISSUE_CODES.REF_SHOT_CHARACTER_MISSING,
            message:
              `Shot "${shot.id ?? i}" actor[${j}] references characterId ` +
              `"${characterId}" which does not exist in assets.characters.`,
            path: pointer(["shots", String(i), "actors", String(j), "characterId"]),
            entityId: characterId,
            context: { shotId: shot.id, actorIndex: j, characterId },
          })
        );
        return; // Do not cascade R10 for a non-existent character.
      }

      // R10 — only if character exists.
      const view = actor.view;
      if (typeof view !== "string") return;

      const character = characters[characterId];
      const declaredViews =
        character && typeof character.views === "object" && character.views !== null
          ? Object.keys(character.views)
          : [];

      if (!declaredViews.includes(view)) {
        out.push(
          makeIssue({
            severity: "error",
            code: ISSUE_CODES.REF_ACTOR_VIEW_UNDECLARED,
            message:
              `Shot "${shot.id ?? i}" actor[${j}] requests view "${view}" ` +
              `but character "${characterId}" does not declare that view ` +
              `(declared: [${declaredViews.join(", ")}]).`,
            path: pointer(["shots", String(i), "actors", String(j), "view"]),
            entityId: characterId,
            context: {
              shotId: shot.id,
              actorIndex: j,
              characterId,
              requestedView: view,
              declaredViews,
            },
          })
        );
      }
    });
  });
}

/**
 * R12 — A camera focus targetId must match the characterId of at least one
 * actor in the same shot. One matching actor instance is sufficient.
 *
 * @param {Object} project
 * @param {import("./issues.js").Issue[]} out
 */
function checkCameraFocusTargetActorReferences(project, out) {
  const shots = project.shots ?? [];

  shots.forEach((shot, shotIndex) => {
    if (!shot || typeof shot !== "object") return;
    const targetId = shot.camera?.focus?.targetId;
    if (typeof targetId !== "string") return;

    const actors = Array.isArray(shot.actors) ? shot.actors : [];
    const hasTargetActor = actors.some(
      (actor) => actor && typeof actor === "object" &&
        actor.characterId === targetId
    );
    if (hasTargetActor) return;

    out.push(
      makeIssue({
        severity: "error",
        code: ISSUE_CODES.REF_CAMERA_FOCUS_TARGET_ACTOR_MISSING,
        message:
          `Camera focus targetId "${targetId}" does not match any actor characterId in this shot.`,
        path: pointer(["shots", String(shotIndex), "camera", "focus", "targetId"]),
        entityId: targetId,
        context: { shotId: shot.id, targetId },
      })
    );
  });
}

/**
 * Run all approved reference rules against a schema-valid project.
 * Never mutates input.
 *
 * @param {Object} project
 * @returns {{ errors: import("./issues.js").Issue[] }}
 */
export function validateReferences(project) {
  const out = [];
  checkCharacterMapKeyIntegrity(project, out); // R1
  checkCharacterViewAssets(project, out);      // R5
  checkSceneLayerAssetReferences(project, out); // R7
  checkShotSceneReferences(project, out);      // R8
  checkShotActorReferences(project, out);      // R9 + R10
  checkCameraTargetActorReferences(project, out); // R11
  checkCameraFocusTargetActorReferences(project, out); // R12
  return { errors: out };
}