// validators/ReferenceValidator.js
// Layer B: semantic reference validation.
// Implements ONLY the Architecture-Owner-approved rules:
//   R1, R5, R7, R8, R9, R10, R11, R12, R13, R14, R15, R16, R17, R18,
//   T1 (shot overlap), T2 (graphic bounds).
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
 * R14 — Every asset entry in vector, props, graphics, and rigs registries
 * must declare an id equal to its containing map key.
 *
 * @param {Object} project
 * @param {import("./issues.js").Issue[]} out
 */
function checkAssetRegistryMapKeyIntegrity(project, out) {
  const registries = ["vector", "props", "graphics", "rigs", "audio"];
  for (const registryName of registries) {
    const registry = project.assets?.[registryName];
    if (!registry || typeof registry !== "object") continue;

    for (const [mapKey, asset] of Object.entries(registry)) {
      if (!asset || typeof asset !== "object" || asset.id === mapKey) continue;
      out.push(
        makeIssue({
          severity: "error",
          code: ISSUE_CODES.REF_ASSET_MAP_KEY_MISMATCH,
          message:
            `Asset map key "${mapKey}" does not match declared id "${asset.id}" ` +
            `in assets.${registryName}.`,
          path: pointer(["assets", registryName, mapKey, "id"]),
          entityId: mapKey,
          context: { registry: registryName, mapKey, declaredId: asset.id },
        })
      );
    }
  }
}


/**
 * R15/R16 — Audio and music track assetIds must resolve in assets.audio.
 * Each unresolved track is reported independently with its timeline path.
 *
 * @param {Object} project
 * @param {import("./issues.js").Issue[]} out
 */
function checkTimelineAudioAssetReferences(project, out) {
  const audioAssets = project.assets?.audio ?? {};
  const trackGroups = [
    { registry: "audioTracks", tracks: project.timeline.audioTracks, code: ISSUE_CODES.REF_AUDIO_TRACK_ASSET_MISSING, label: "Audio" },
    { registry: "musicTracks", tracks: project.timeline.musicTracks, code: ISSUE_CODES.REF_MUSIC_TRACK_ASSET_MISSING, label: "Music" },
  ];

  for (const group of trackGroups) {
    group.tracks.forEach((track, trackIndex) => {
      const assetId = track.assetId;
      if (Object.prototype.hasOwnProperty.call(audioAssets, assetId)) return;

      out.push(
        makeIssue({
          severity: "error",
          code: group.code,
          message:
            `${group.label} track "${track.id}" references assetId "${assetId}" ` +
            "which does not exist in assets.audio.",
          path: pointer(["timeline", group.registry, String(trackIndex), "assetId"]),
          entityId: assetId,
          context: { trackId: track.id, assetId, trackIndex },
        })
      );
    });
  }
}

/**
 * R11 — A camera targetId must match the characterId of at least one actor
 * in the same shot. One matching actor instance is sufficient.
 *
 * @param {Object} project
 * @param {import("./issues.js").Issue[]} out
 */
/**
 * R13 — A character rig assetId must resolve in assets.rigs, except when
 * rig.type is "none". Every character with a missing rig asset is reported.
 *
 * @param {Object} project
 * @param {import("./issues.js").Issue[]} out
 */
function checkCharacterRigAssetReferences(project, out) {
  const characters = project.assets?.characters ?? {};
  const rigs = project.assets?.rigs ?? {};

  for (const [characterId, character] of Object.entries(characters)) {
    const rig = character?.rig;
    if (!rig || typeof rig !== "object" || rig.type === "none") continue;

    const assetId = rig.assetId;
    if (typeof assetId !== "string") continue;
    if (Object.prototype.hasOwnProperty.call(rigs, assetId)) continue;

    out.push(
      makeIssue({
        severity: "error",
        code: ISSUE_CODES.REF_CHARACTER_RIG_ASSET_MISSING,
        message:
          `Character "${characterId}" references rig asset "${assetId}" ` +
          "which does not exist in assets.rigs.",
        path: pointer(["assets", "characters", characterId, "rig", "assetId"]),
        entityId: characterId,
        context: { characterId, rigType: rig.type, assetId },
      })
    );
  }
}

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
 * R18 — IDs must be unique within each declared entity collection.
 * The first occurrence is canonical; each later sibling duplicate emits
 * one issue at the duplicate entry's id path. Nested collections are checked
 * independently for each parent entity.
 *
 * @param {Object} project
 * @param {import("./issues.js").Issue[]} out
 */
function checkDuplicateEntityIds(project, out) {
  const checkCollection = (entries, pathSegments, collection, parentContext = {}) => {
    const firstIndexById = new Map();
    entries.forEach((entry, index) => {
      if (!entry || typeof entry !== "object" || typeof entry.id !== "string") return;
      if (!firstIndexById.has(entry.id)) {
        firstIndexById.set(entry.id, index);
        return;
      }

      const firstIndex = firstIndexById.get(entry.id);
      out.push(
        makeIssue({
          severity: "error",
          code: ISSUE_CODES.REF_DUPLICATE_ENTITY_ID,
          message: `Duplicate id "${entry.id}" in ${collection}; first declared at index ${firstIndex}.`,
          path: pointer([...pathSegments, String(index), "id"]),
          entityId: entry.id,
          context: {
            collection,
            id: entry.id,
            firstIndex,
            duplicateIndex: index,
            ...parentContext,
          },
        })
      );
    });
  };

  // Top-level collections: each array is one independent ID namespace.
  checkCollection(project.scenes ?? [], ["scenes"], "scenes");
  checkCollection(project.shots ?? [], ["shots"], "shots");

  // Nested collections: uniqueness is scoped to siblings under one parent.
  (project.scenes ?? []).forEach((scene, sceneIndex) => {
    checkCollection(
      scene.layers ?? [],
      ["scenes", String(sceneIndex), "layers"],
      "scenes[].layers",
      { sceneId: scene.id, sceneIndex }
    );
  });

  (project.shots ?? []).forEach((shot, shotIndex) => {
    checkCollection(
      shot.graphics ?? [],
      ["shots", String(shotIndex), "graphics"],
      "shots[].graphics",
      { shotId: shot.id, shotIndex }
    );
    checkCollection(
      shot.effects ?? [],
      ["shots", String(shotIndex), "effects"],
      "shots[].effects",
      { shotId: shot.id, shotIndex }
    );
  });

  checkCollection(
    project.timeline.audioTracks ?? [],
    ["timeline", "audioTracks"],
    "timeline.audioTracks"
  );
  checkCollection(
    project.timeline.musicTracks ?? [],
    ["timeline", "musicTracks"],
    "timeline.musicTracks"
  );
  checkCollection(
    project.timeline.subtitleTracks ?? [],
    ["timeline", "subtitleTracks"],
    "timeline.subtitleTracks"
  );
}


/** T1 — Half-open [start,end) shot intervals; gaps allowed; array order irrelevant. */
function checkShotOverlaps(project, out) {
  const ordered = (project.shots ?? []).map((shot, index) => ({
    shot, index, start: shot.start, end: shot.start + shot.duration
  })).sort((a, b) => a.start - b.start || a.end - b.end || a.index - b.index);
  for (let i = 0; i < ordered.length; i += 1) {
    const a = ordered[i];
    for (let j = i + 1; j < ordered.length; j += 1) {
      const b = ordered[j];
      if (b.start >= a.end) break;
      const overlapStart = Math.max(a.start, b.start);
      const overlapEnd = Math.min(a.end, b.end);
      if (overlapStart >= overlapEnd) continue;
      out.push(makeIssue({
        severity: "error",
        code: ISSUE_CODES.TEMP_SHOT_OVERLAP,
        message: `Shot "${a.shot.id}" overlaps shot "${b.shot.id}" in the timeline.`,
        path: pointer(["shots", String(b.index), "start"]),
        entityId: b.shot.id,
        context: {
          firstShotId: a.shot.id, secondShotId: b.shot.id,
          firstShotIndex: a.index, secondShotIndex: b.index,
          overlapStart, overlapEnd
        }
      }));
    }
  }
}

/**
 * T4 — A graphic's absolute timeline start must be at or after its
 * containing shot's start. T2 separately enforces the upper/end bound.
 *
 * @param {Object} project
 * @param {import("./issues.js").Issue[]} out
 */
function checkGraphicStartBounds(project, out) {
  (project.shots ?? []).forEach((shot, shotIndex) => {
    (shot.graphics ?? []).forEach((graphic, graphicIndex) => {
      if (graphic.start >= shot.start) return;
      out.push(makeIssue({
        severity: "error",
        code: ISSUE_CODES.TEMP_GRAPHIC_BEFORE_SHOT,
        message: `Graphic "${graphic.id}" starts at ${graphic.start}s, before shot "${shot.id}" starts at ${shot.start}s.`,
        path: pointer(["shots", String(shotIndex), "graphics", String(graphicIndex), "start"]),
        entityId: graphic.id,
        context: {
          shotId: shot.id,
          graphicId: graphic.id,
          shotStart: shot.start,
          graphicStart: graphic.start,
          offset: shot.start - graphic.start
        }
      }));
    });
  });
}

/** T2 — graphic.start is absolute timeline seconds, per documented end formula. */
function checkGraphicShotBounds(project, out) {
  (project.shots ?? []).forEach((shot, shotIndex) => {
    const shotEnd = shot.start + shot.duration;
    (shot.graphics ?? []).forEach((graphic, graphicIndex) => {
      const graphicEnd = graphic.start + graphic.duration;
      if (graphicEnd <= shotEnd) return;
      out.push(makeIssue({
        severity: "error",
        code: ISSUE_CODES.TEMP_GRAPHIC_OUTSIDE_SHOT,
        message: `Graphic "${graphic.id}" ends at ${graphicEnd}s, after shot "${shot.id}" ends at ${shotEnd}s.`,
        path: pointer(["shots", String(shotIndex), "graphics", String(graphicIndex)]),
        entityId: graphic.id,
        context: { shotId: shot.id, graphicId: graphic.id, shotEnd, graphicEnd }
      }));
    });
  });
}

/**
 * T3 — Every shot must end at or before project.duration.
 * Trailing empty timeline space is allowed; this is an upper-bound check,
 * not a requirement that the final shot end exactly at project.duration.
 *
 * @param {Object} project
 * @param {import("./issues.js").Issue[]} out
 */
function checkShotProjectDurationBounds(project, out) {
  const projectDuration = project.project.duration;
  (project.shots ?? []).forEach((shot, shotIndex) => {
    const shotEnd = shot.start + shot.duration;
    if (shotEnd <= projectDuration) return;
    out.push(makeIssue({
      severity: "error",
      code: ISSUE_CODES.TEMP_SHOT_EXCEEDS_PROJECT_DURATION,
      message: `Shot "${shot.id}" ends at ${shotEnd}s, after project duration ${projectDuration}s.`,
      path: pointer(["shots", String(shotIndex), "duration"]),
      entityId: shot.id,
      context: {
        shotId: shot.id,
        shotEnd,
        projectDuration,
        overflow: shotEnd - projectDuration
      }
    }));
  });
}

/**
 * T5 — Timeline tracks must start and, when duration is present, end
 * at or before project.duration. Audio/music duration is optional in schema,
 * so tracks without it are checked only for their start position.
 *
 * @param {Object} project
 * @param {import("./issues.js").Issue[]} out
 */
function checkTimelineTrackProjectDurationBounds(project, out) {
  const projectDuration = project.project.duration;
  const collections = [
    ["audioTracks", project.timeline?.audioTracks ?? []],
    ["musicTracks", project.timeline?.musicTracks ?? []],
    ["subtitleTracks", project.timeline?.subtitleTracks ?? []]
  ];

  for (const [collection, tracks] of collections) {
    tracks.forEach((track, trackIndex) => {
      const trackEnd = typeof track.duration === "number"
        ? track.start + track.duration
        : undefined;
      if (track.start <= projectDuration &&
          (trackEnd === undefined || trackEnd <= projectDuration)) return;

      const startExceeds = track.start > projectDuration;
      const pathField = startExceeds ? "start" : "duration";
      const message = startExceeds
        ? `Timeline track "${track.id}" starts at ${track.start}s, after project duration ${projectDuration}s.`
        : `Timeline track "${track.id}" ends at ${trackEnd}s, after project duration ${projectDuration}s.`;
      out.push(makeIssue({
        severity: "error",
        code: ISSUE_CODES.TEMP_TIMELINE_TRACK_EXCEEDS_PROJECT_DURATION,
        message,
        path: pointer(["timeline", collection, String(trackIndex), pathField]),
        entityId: track.id,
        context: {
          collection,
          trackId: track.id,
          trackIndex,
          trackStart: track.start,
          ...(trackEnd === undefined ? {} : { trackEnd }),
          projectDuration,
          overflow: startExceeds
            ? track.start - projectDuration
            : trackEnd - projectDuration
        }
      }));
    });
  }
}


/**
 * T6/T7 — Validate outgoing transition duration semantics.
 * Non-cut transitions must have positive duration, and no transition may
 * last longer than its owning shot. The rule does not infer adjacency or
 * require a following shot.
 *
 * @param {Object} project
 * @param {import("./issues.js").Issue[]} out
 */
function checkTransitionDurationSemantics(project, out) {
  (project.shots ?? []).forEach((shot, shotIndex) => {
    const transition = shot.transitionOut;
    if (!transition) return;

    if (transition.type !== "cut" && transition.duration <= 0) {
      out.push(makeIssue({
        severity: "error",
        code: ISSUE_CODES.TEMP_TRANSITION_DURATION_NOT_POSITIVE,
        message: `Non-cut transition "${transition.type}" on shot "${shot.id}" must have a duration greater than 0s.`,
        path: pointer(["shots", String(shotIndex), "transitionOut", "duration"]),
        entityId: shot.id,
        context: {
          shotId: shot.id,
          transitionType: transition.type,
          transitionDuration: transition.duration
        }
      }));
    }

    if (transition.duration > shot.duration) {
      out.push(makeIssue({
        severity: "error",
        code: ISSUE_CODES.TEMP_TRANSITION_EXCEEDS_SHOT_DURATION,
        message: `Transition on shot "${shot.id}" lasts ${transition.duration}s, longer than the shot duration ${shot.duration}s.`,
        path: pointer(["shots", String(shotIndex), "transitionOut", "duration"]),
        entityId: shot.id,
        context: {
          shotId: shot.id,
          transitionType: transition.type,
          transitionDuration: transition.duration,
          shotDuration: shot.duration,
          overflow: transition.duration - shot.duration
        }
      }));
    }
  });
}


/**
 * C1 — Consecutive chronological shots must not repeat the same shotType.
 * Array order is not assumed to be timeline order.
 *
 * @param {Object} project
 * @param {import("./issues.js").Issue[]} out
 */
function checkConsecutiveCameraShotTypeVariety(project, out) {
  const ordered = (project.shots ?? [])
    .map((shot, index) => ({ shot, index }))
    .sort((a, b) =>
      a.shot.start - b.shot.start ||
      (a.shot.start + a.shot.duration) - (b.shot.start + b.shot.duration) ||
      a.index - b.index
    );

  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1];
    const current = ordered[index];
    const previousType = previous.shot.camera.shotType;
    const currentType = current.shot.camera.shotType;
    if (previousType !== currentType) continue;

    out.push(makeIssue({
      severity: "error",
      code: ISSUE_CODES.COMP_CAMERA_VARIETY_CONSECUTIVE_REPEAT,
      message: `Shot "${current.shot.id}" repeats camera shot type "${currentType}" from the preceding chronological shot.`,
      path: pointer(["shots", String(current.index), "camera", "shotType"]),
      entityId: current.shot.id,
      context: {
        previousShotId: previous.shot.id,
        currentShotId: current.shot.id,
        shotType: currentType,
        previousShotIndex: previous.index,
        currentShotIndex: current.index
      }
    }));
  }
}

/**
 * Run all approved reference and temporal rules against a schema-valid project.
 * Never mutates input.
 *
 * @param {Object} project
 * @returns {{ errors: import("./issues.js").Issue[] }}
 */
export function validateReferences(project) {
  const out = [];
  checkCharacterMapKeyIntegrity(project, out); // R1
  checkAssetRegistryMapKeyIntegrity(project, out); // R14 + R17
  checkCharacterViewAssets(project, out);      // R5
  checkCharacterRigAssetReferences(project, out); // R13
  checkSceneLayerAssetReferences(project, out); // R7
  checkShotSceneReferences(project, out);      // R8
  checkShotActorReferences(project, out);      // R9 + R10
  checkCameraTargetActorReferences(project, out); // R11
  checkCameraFocusTargetActorReferences(project, out); // R12
  checkTimelineAudioAssetReferences(project, out); // R15 + R16
  checkDuplicateEntityIds(project, out); // R18
  checkShotOverlaps(project, out); // T1
  checkGraphicStartBounds(project, out); // T4
  checkGraphicShotBounds(project, out); // T2
  checkShotProjectDurationBounds(project, out); // T3
  checkTimelineTrackProjectDurationBounds(project, out); // T5
  checkTransitionDurationSemantics(project, out); // T6 + T7
  checkConsecutiveCameraShotTypeVariety(project, out); // C1
  return { errors: out };
}