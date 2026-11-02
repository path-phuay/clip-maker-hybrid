import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createProjectValidationService } from "../src/browser/ProjectValidationService.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const schema = JSON.parse(readFileSync(join(root, "schema/project.schema.json"), "utf8"));
const fixture = name => JSON.parse(readFileSync(join(root, "fixtures", name), "utf8"));
const fetchSchema = async () => ({ ok: true, status: 200, json: async () => schema });

test("browser service validates a valid fixture through both layers", async () => {
  const service = await createProjectValidationService({ fetchImpl: fetchSchema });
  const result = service.validateProject(fixture("valid/minimal-project.json"));
  assert.equal(result.valid, true);
  assert.deepEqual(result.meta.layers, ["schema", "reference"]);
});

test("schema errors are reported and reference validation is skipped", async () => {
  const service = await createProjectValidationService({ fetchImpl: fetchSchema });
  const result = service.validateProject(fixture("invalid/missing-required-field.json"));
  assert.equal(result.valid, false);
  assert.deepEqual(result.meta.layers, ["schema"]);
  assert.equal(result.meta.referenceSkipped, true);
  assert.ok(result.errors.length > 0);
  assert.ok(result.errors.every(issue => typeof issue.path === "string"));
});

test("reference errors are reported after schema succeeds", async () => {
  const service = await createProjectValidationService({ fetchImpl: fetchSchema });
  const project = fixture("valid/minimal-project.json");
  project.shots[0].sceneId = "scene_missing";
  const result = service.validateProject(project);
  assert.equal(result.valid, false);
  assert.deepEqual(result.meta.layers, ["schema", "reference"]);
  assert.ok(result.errors.some(issue => issue.code === "REF_SHOT_SCENE_MISSING"));
});

test("non-object roots return a structured input issue", async () => {
  const service = await createProjectValidationService({ fetchImpl: fetchSchema });
  assert.equal(service.validateProject([]).errors[0].code, "INPUT_INVALID");
});

test("schema fetch failure is reported as initialization failure", async () => {
  await assert.rejects(createProjectValidationService({ fetchImpl: async () => ({ ok: false, status: 503 }) }), /HTTP 503/);
});

test("schema compilation failure is reported as initialization failure", async () => {
  await assert.rejects(createProjectValidationService({ fetchImpl: async () => ({ ok: true, json: async () => ({ type: "unknown-keyword" }) }) }), /Unable to initialize/);
});
