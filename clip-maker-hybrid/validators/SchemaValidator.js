// validators/SchemaValidator.js
// Layer A: JSON Schema validation via Ajv (Draft 2020-12, strict mode ON).
// Does NOT mutate input. Returns { valid, errors: Issue[] }.

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { makeIssue, mapAjvKeywordToCode } from "./issues.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = join(__dirname, "..", "schema", "project.schema.json");

/**
 * Compile the schema exactly once at module load.
 *
 * Ajv options mirror DS-01's `tests/schema.test.mjs` exactly:
 *     new Ajv2020({ allErrors: true, strict: true, strictRequired: false })
 *
 * Why `strictRequired: false` is required for the current schema
 * (schema/project.schema.json is NOT modifiable in DS-02):
 *
 *   1. `$defs/shot.properties.transitionOut` uses `allOf: [{ if, then }]`.
 *      The `if` clause declares `required: ["type"]` inside a subschema
 *      where `type` is not also declared as a top-level property of that
 *      same subschema in a way Ajv's strictRequired check recognizes.
 *
 *   2. `$defs/shot.properties.duration` composes `{ "$ref": "#/$defs/seconds",
 *      "exclusiveMinimum": 0 }`. When this property is listed in an ancestor
 *      `required` array, Ajv's strictRequired check inspects the local
 *      subschema (which has no inline `type`/`properties`) rather than the
 *      resolved $ref target, and reports a false-positive.
 *
 * Setting `strictRequired: true` would cause `ajv.compile(schemaJson)` to
 * throw at module load, breaking BOTH DS-01 and DS-02. `strict: true` still
 * enables every other strict check (strictTypes, strictTuples,
 * strictNumbers, strictSchema). We do not relax any additional Ajv
 * option — this matches DS-01 verbatim.
 */
const ajv = new Ajv2020({
  allErrors: true,
  strict: true,
  strictRequired: false,
});

addFormats(ajv);

const schemaJson = JSON.parse(readFileSync(SCHEMA_PATH, "utf8"));
const validateFn = ajv.compile(schemaJson);

/**
 * Translate a single Ajv error into our Issue shape.
 * Ajv provides instancePath (already RFC 6901 JSON Pointer) and
 * params/keyword/message. We never read or write project instance here.
 *
 * Note: Ajv's instancePath is already escaped correctly, so we do not
 * re-escape it. We only escape when WE construct paths (ReferenceValidator).
 *
 * @param {Object} ajvErr
 * @returns {import("./issues.js").Issue}
 */
function toIssue(ajvErr) {
  const code = mapAjvKeywordToCode(ajvErr.keyword);

  const location = ajvErr.instancePath || "";
  const where = location === "" ? "<root>" : location;
  const message = `${where}: ${ajvErr.message}`;

  let entityId;
  if (ajvErr.keyword === "required" && ajvErr.params?.missingProperty) {
    entityId = ajvErr.params.missingProperty;
  }

  return makeIssue({
    severity: "error",
    code,
    message,
    path: location,
    entityId,
    context: ajvErr.params && Object.keys(ajvErr.params).length > 0
      ? { keyword: ajvErr.keyword, params: ajvErr.params }
      : { keyword: ajvErr.keyword },
  });
}

/**
 * Validate a ClipProject v2 instance against the schema.
 * Never mutates input. Collects ALL schema errors (no fail-fast).
 *
 * @param {Object} project
 * @returns {{ valid: boolean, errors: import("./issues.js").Issue[] }}
 */
export function validateSchema(project) {
  const ok = validateFn(project);
  if (ok) {
    return { valid: true, errors: [] };
  }
  const errors = (validateFn.errors ?? []).map(toIssue);
  return { valid: false, errors };
}