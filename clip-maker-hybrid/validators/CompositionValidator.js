// validators/CompositionValidator.js
// Layer B: composition integrity validation.
// Implements only approved composition rules; currently C1.
// Subject viewport bounds and Safe Area remain deferred because the
// repository does not define the required geometry or policy.
// Does not mutate input. Reads only. Returns { errors: Issue[] }.

import { ISSUE_CODES, makeIssue, escapeJsonPointerToken } from "./issues.js";

function pointer(segments) {
  return "/" + segments.map(escapeJsonPointerToken).join("/");
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
 * Run approved composition rules against a schema-valid project.
 * @param {Object} project
 * @returns {{ errors: import("./issues.js").Issue[] }}
 */
export function validateComposition(project) {
  const errors = [];
  checkConsecutiveCameraShotTypeVariety(project, errors);
  return { errors };
}
