import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { validateReferences } from "../../validators/ReferenceValidator.js";
import { ISSUE_CODES, makeIssue, mapAjvKeywordToCode } from "../../validators/issues.js";

function toSchemaIssue(error) {
  const path = error.instancePath || "";
  const issue = {
    severity: "error",
    code: mapAjvKeywordToCode(error.keyword),
    message: `${path || "<root>"}: ${error.message}`,
    path,
    context: error.params && Object.keys(error.params).length
      ? { keyword: error.keyword, params: error.params }
      : { keyword: error.keyword }
  };
  if (error.keyword === "required" && error.params?.missingProperty) {
    issue.entityId = error.params.missingProperty;
  }
  return issue;
}

/**
 * Create a browser-safe ClipProject v2 validator.
 * The caller supplies a schema URL; no Node filesystem APIs or CDN are used.
 * The canonical ReferenceValidator is reused unchanged for Layer B.
 */
export async function createProjectValidationService({
  schemaUrl = "./schema/project.schema.json",
  fetchImpl = globalThis.fetch
} = {}) {
  if (typeof fetchImpl !== "function") {
    throw new TypeError("A Fetch-compatible function is required to load the project schema.");
  }

  let response;
  try {
    response = await fetchImpl(schemaUrl, { headers: { Accept: "application/schema+json, application/json" } });
  } catch (error) {
    throw new Error(`Unable to load ClipProject v2 schema: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!response?.ok) {
    throw new Error(`Unable to load ClipProject v2 schema (HTTP ${response?.status ?? "unknown"}).`);
  }

  let schema;
  try {
    schema = await response.json();
  } catch {
    throw new Error("Unable to parse the ClipProject v2 schema response as JSON.");
  }

  const ajv = new Ajv2020({
    allErrors: true,
    strict: true,
    strictRequired: false
  });
  addFormats(ajv);

  let validateSchema;
  try {
    validateSchema = ajv.compile(schema);
  } catch (error) {
    throw new Error(`Unable to initialize ClipProject v2 schema validator: ${error instanceof Error ? error.message : String(error)}`);
  }

  return Object.freeze({
    validateProject(input) {
      if (input === null || typeof input !== "object" || Array.isArray(input) ||
          (Object.getPrototypeOf(input) !== Object.prototype && Object.getPrototypeOf(input) !== null)) {
        const receivedType = input === null ? "null" : Array.isArray(input) ? "array" : typeof input;
        const issue = makeIssue({
          severity: "error",
          code: ISSUE_CODES.INPUT_INVALID,
          message: `validateProject expected a plain object (ClipProject v2) but received ${receivedType}.`,
          path: "",
          context: { receivedType }
        });
        return { valid: false, errors: [issue], warnings: [], all: [issue], meta: { layers: [], referenceSkipped: false } };
      }

      if (!validateSchema(input)) {
        const errors = (validateSchema.errors ?? []).map(toSchemaIssue);
        return { valid: false, errors, warnings: [], all: errors, meta: { layers: ["schema"], referenceSkipped: true } };
      }

      const referenceResult = validateReferences(input);
      const errors = referenceResult.errors;
      return {
        valid: errors.length === 0,
        errors,
        warnings: [],
        all: errors,
        meta: { layers: ["schema", "reference"], referenceSkipped: false }
      };
    }
  });
}
