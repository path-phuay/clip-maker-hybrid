// validators/ProjectValidator.js
// Public API for ClipProject v2 validation.
//
// Pipeline:
//   1. Input guard (non-plain-object → INPUT_INVALID, no throw for the
//      documented input contract below)
//   2. Layer A — schema validation
//      • If fails → skip Layer B entirely (per Owner Q1=A)
//   3. Layer B — semantic validation: references, temporal integrity, and composition (R1,R5,R7-R20,T1-T7,C1)
//
// INPUT CONTRACT (narrowed per Architecture Owner DS-02 Round 2.3 review):
//
//   Guaranteed inputs:
//     • Plain object literals        ({ ... })
//     • JSON.parse() output
//     • Object.create(null)          (JSON-like null-prototype object)
//     • Documented invalid inputs:
//         null, undefined, arrays, strings, numbers, booleans,
//         Date instances, Map/Set instances, class instances
//       For all of these, validateProject() returns a structured result
//       with code INPUT_INVALID and does NOT throw.
//
//   NOT guaranteed (outside contract):
//     • Arbitrary Proxy objects
//     • Revoked Proxy objects
//     • Objects with throwing getters/accessors on any properties that
//       Ajv or the reference validator traverses, at any nesting level.
//     • Cross-realm objects (different Object.prototype reference)
//
//   For inputs outside the guaranteed contract, validateProject() may
//   throw if a Proxy trap or getter throws during Ajv or reference
//   validation. The caller is responsible for providing JSON-like data,
//   e.g. by round-tripping through JSON.parse(JSON.stringify(x)) before
//   validation.
//
// Contract (guaranteed inputs):
//   • Never mutates the input.
//   • Returns a structured result; caller inspects .valid / .errors.
//   • Error messages are English; paths are RFC 6901 JSON Pointers.

import { validateSchema } from "./SchemaValidator.js";
import { validateReferences } from "./ReferenceValidator.js";
import { ISSUE_CODES, makeIssue } from "./issues.js";

export { ISSUE_CODES };

/**
 * @typedef {Object} ValidationMeta
 * @property {string[]} layers
 * @property {boolean}  referenceSkipped
 *
 * @typedef {Object} ValidationResult
 * @property {boolean} valid
 * @property {import("./issues.js").Issue[]} errors
 * @property {import("./issues.js").Issue[]} warnings
 * @property {import("./issues.js").Issue[]} all
 * @property {ValidationMeta} meta
 */

/**
 * Inspect an object's array-ness and prototype in a narrow try/catch.
 *
 * This defends only against two operations that can throw for exotic
 * inputs (revoked Proxies, throwing getPrototypeOf traps):
 *   • Array.isArray(x)
 *   • Object.getPrototypeOf(x)
 *
 * The catch block is intentionally narrow. We do NOT wrap Ajv validation
 * or reference validation in try/catch, so genuine validator bugs are
 * never silently swallowed.
 *
 * @param {object} x - non-null object
 * @returns {{ isArray: boolean, proto: object | null } | undefined}
 *   undefined if inspection itself threw (uninspectable input)
 */
function safeInspectObject(x) {
  try {
    return {
      isArray: Array.isArray(x),
      proto: Object.getPrototypeOf(x),
    };
  } catch {
    return undefined;
  }
}

/**
 * Genuine plain-object check for the documented input contract.
 *
 * Accepts:
 *   • object literal / JSON.parse output    → Object.prototype
 *   • Object.create(null)                    → null prototype (JSON-like)
 *
 * Rejects (returns false, no throw):
 *   • null, undefined, primitives, functions
 *   • Array
 *   • Date, Map, Set, RegExp, class instances, Object.create({}) etc.
 *
 * If inspection throws (revoked Proxy etc.), returns false — the caller
 * will then produce an INPUT_INVALID result via describeType(). This
 * narrow defense applies ONLY to the object-inspection step (array-ness
 * and prototype lookup). It does NOT extend to subsequent property
 * access performed by Ajv or the reference validator at any nesting
 * level, which is outside the guaranteed input contract.
 *
 * Cross-realm objects have a different Object.prototype reference and
 * will be rejected. Clip Maker is a single-realm application, so this
 * trade-off is intentional.
 *
 * @param {unknown} x
 * @returns {boolean}
 */
function isPlainObject(x) {
  if (x === null || typeof x !== "object") return false;
  const info = safeInspectObject(x);
  if (info === undefined) return false;
  if (info.isArray) return false;
  return info.proto === Object.prototype || info.proto === null;
}

/**
 * Describe the rejected input kind for the INPUT_INVALID issue message.
 * For guaranteed inputs (null/undefined/array/string/Date/Map/class),
 * returns a deterministic English description. Never throws for those.
 *
 * For uninspectable inputs (revoked Proxy etc.), returns a descriptive
 * fallback string. The caller still gets a structured INPUT_INVALID
 * result in that case — but this is a best-effort path for an input
 * that is already outside the guaranteed contract.
 *
 * This helper performs no nested property access; it only inspects the
 * input's array-ness and prototype. It does not, and cannot, guarantee
 * safety for throwing accessors on nested properties traversed later by
 * Ajv or the reference validator.
 *
 * @param {unknown} x
 * @returns {string}
 */
function describeType(x) {
  if (x === null) return "null";
  if (typeof x !== "object") return typeof x;

  const info = safeInspectObject(x);
  if (info === undefined) {
    return "uninspectable object (proxy or inspection trap)";
  }
  if (info.isArray) return "array";
  if (info.proto === null) return "object with null prototype";
  if (info.proto === Object.prototype) return "plain object";

  try {
    // Read constructor from the PROTOTYPE, not the instance, to avoid
    // invoking instance-level `get constructor()` traps.
    const ctor = info.proto.constructor;
    const name = typeof ctor === "function" ? ctor.name : "";
    return name ? `instance of ${name}` : "non-plain object";
  } catch {
    return "non-plain object";
  }
}

/**
 * Validate a ClipProject v2 instance.
 *
 * Input contract: see file header. For guaranteed inputs, this function
 * does not throw. For inputs outside the contract — including arbitrary
 * Proxies, revoked Proxies, and objects with throwing getters/accessors
 * on any properties traversed by Ajv or the reference validator at any
 * nesting level — behavior is not guaranteed, and exceptions may
 * propagate.
 *
 * @param {unknown} input
 * @returns {ValidationResult}
 */
export function validateProject(input) {
  // 1. Input guard — structured result for guaranteed invalid inputs.
  if (!isPlainObject(input)) {
    const receivedType = describeType(input);
    const err = makeIssue({
      severity: "error",
      code: ISSUE_CODES.INPUT_INVALID,
      message:
        `validateProject expected a plain object (ClipProject v2) but received ` +
        `${receivedType}.`,
      path: "",
      context: { receivedType },
    });
    return {
      valid: false,
      errors: [err],
      warnings: [],
      all: [err],
      meta: { layers: [], referenceSkipped: false },
    };
  }

  // 2. Layer A
  const schemaResult = validateSchema(input);
  if (!schemaResult.valid) {
    return {
      valid: false,
      errors: schemaResult.errors,
      warnings: [],
      all: schemaResult.errors,
      meta: { layers: ["schema"], referenceSkipped: true },
    };
  }

  // 3. Layer B
  const refResult = validateReferences(input);
  const errors = refResult.errors;
  return {
    valid: errors.length === 0,
    errors,
    warnings: [],
    all: errors,
    meta: { layers: ["schema", "reference"], referenceSkipped: false },
  };
}