// validators/issues.js
// Issue factory + canonical code catalog for ClipProject v2 validation.
// Source of truth: Architecture doc §7.1 + Architecture Owner DS-02 decisions.

/**
 * @typedef {"error"|"warning"} Severity
 *
 * @typedef {Object} Issue
 * @property {Severity} severity
 * @property {string}   code       - one of ISSUE_CODES values
 * @property {string}   message    - English, human-readable
 * @property {string}   path       - RFC 6901 JSON Pointer ("" for root)
 * @property {string}   [entityId] - optional, stable identifier (e.g. characterId)
 * @property {Object}   [context]  - optional, primitive-only details
 */

/**
 * Canonical issue codes.
 */
export const ISSUE_CODES = Object.freeze({
  // Input guards (not AJV, not schema)
  INPUT_INVALID: "INPUT_INVALID",

  // Layer A — Ajv keyword-mapped
  SCHEMA_REQUIRED: "SCHEMA_REQUIRED",
  SCHEMA_TYPE: "SCHEMA_TYPE",
  SCHEMA_ENUM: "SCHEMA_ENUM",
  SCHEMA_PATTERN: "SCHEMA_PATTERN",
  SCHEMA_MINIMUM: "SCHEMA_MINIMUM",
  SCHEMA_MAXIMUM: "SCHEMA_MAXIMUM",
  SCHEMA_EXCLUSIVE_MINIMUM: "SCHEMA_EXCLUSIVE_MINIMUM",
  SCHEMA_EXCLUSIVE_MAXIMUM: "SCHEMA_EXCLUSIVE_MAXIMUM",
  SCHEMA_MIN_ITEMS: "SCHEMA_MIN_ITEMS",
  SCHEMA_MAX_ITEMS: "SCHEMA_MAX_ITEMS",
  SCHEMA_MIN_LENGTH: "SCHEMA_MIN_LENGTH",
  SCHEMA_MAX_LENGTH: "SCHEMA_MAX_LENGTH",
  SCHEMA_UNIQUE_ITEMS: "SCHEMA_UNIQUE_ITEMS",
  SCHEMA_ADDITIONAL_PROPERTIES: "SCHEMA_ADDITIONAL_PROPERTIES",
  SCHEMA_PROPERTY_NAMES: "SCHEMA_PROPERTY_NAMES",
  SCHEMA_CONST: "SCHEMA_CONST",
  SCHEMA_OTHER: "SCHEMA_OTHER",

  // Layer B — Approved reference rules only (R1, R5, R8, R9, R10)
  REF_CHARACTER_KEY_MISMATCH: "REF_CHARACTER_KEY_MISMATCH",
  REF_CHARACTER_VIEW_ASSET_MISSING: "REF_CHARACTER_VIEW_ASSET_MISSING",
  REF_SHOT_SCENE_MISSING: "REF_SHOT_SCENE_MISSING",
  REF_SHOT_CHARACTER_MISSING: "REF_SHOT_CHARACTER_MISSING",
  REF_ACTOR_VIEW_UNDECLARED: "REF_ACTOR_VIEW_UNDECLARED",
});

/**
 * Escape a single JSON Pointer token per RFC 6901 §3:
 *   "~" -> "~0"
 *   "/" -> "~1"
 *
 * Order matters: escape "~" first, otherwise "~1" would become "~01"
 * on a second pass.
 *
 * @param {string} token - a raw object key / property name
 * @returns {string} escaped token (without leading slash)
 */
export function escapeJsonPointerToken(token) {
  return String(token).replace(/~/g, "~0").replace(/\//g, "~1");
}

/**
 * Map an Ajv keyword to a canonical SCHEMA_* code.
 * @param {string} keyword
 * @returns {string}
 */
export function mapAjvKeywordToCode(keyword) {
  switch (keyword) {
    case "required":              return ISSUE_CODES.SCHEMA_REQUIRED;
    case "type":                  return ISSUE_CODES.SCHEMA_TYPE;
    case "enum":                  return ISSUE_CODES.SCHEMA_ENUM;
    case "pattern":               return ISSUE_CODES.SCHEMA_PATTERN;
    case "minimum":               return ISSUE_CODES.SCHEMA_MINIMUM;
    case "maximum":               return ISSUE_CODES.SCHEMA_MAXIMUM;
    case "exclusiveMinimum":      return ISSUE_CODES.SCHEMA_EXCLUSIVE_MINIMUM;
    case "exclusiveMaximum":      return ISSUE_CODES.SCHEMA_EXCLUSIVE_MAXIMUM;
    case "minItems":              return ISSUE_CODES.SCHEMA_MIN_ITEMS;
    case "maxItems":              return ISSUE_CODES.SCHEMA_MAX_ITEMS;
    case "minLength":             return ISSUE_CODES.SCHEMA_MIN_LENGTH;
    case "maxLength":             return ISSUE_CODES.SCHEMA_MAX_LENGTH;
    case "uniqueItems":           return ISSUE_CODES.SCHEMA_UNIQUE_ITEMS;
    case "additionalProperties":  return ISSUE_CODES.SCHEMA_ADDITIONAL_PROPERTIES;
    case "propertyNames":         return ISSUE_CODES.SCHEMA_PROPERTY_NAMES;
    case "const":                 return ISSUE_CODES.SCHEMA_CONST;
    default:                      return ISSUE_CODES.SCHEMA_OTHER;
  }
}

/**
 * Build an Issue. All arguments are caller-supplied; no project data is
 * captured or mutated here.
 *
 * @param {Object}  params
 * @param {Severity} params.severity
 * @param {string}   params.code
 * @param {string}   params.message
 * @param {string}   params.path
 * @param {string}   [params.entityId]
 * @param {Object}   [params.context]
 * @returns {Issue}
 */
export function makeIssue({ severity, code, message, path, entityId, context }) {
  const issue = { severity, code, message, path: path ?? "" };
  if (entityId !== undefined) issue.entityId = entityId;
  if (context !== undefined) issue.context = context;
  return issue;
}