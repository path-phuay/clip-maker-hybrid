import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SCHEMA_PATH = join(ROOT, "schema", "project.schema.json");
const VALID_DIR = join(ROOT, "fixtures", "valid");
const INVALID_DIR = join(ROOT, "fixtures", "invalid");

function loadJson(p) {
  return JSON.parse(readFileSync(p, "utf8"));
}

function buildAjv() {
  const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false });
  addFormats(ajv);
  return ajv;
}

test("schema file is valid Draft 2020-12", () => {
  const ajv = buildAjv();
  const schema = loadJson(SCHEMA_PATH);
  ajv.compile(schema); // throws if schema itself is invalid
});

test("all valid fixtures pass schema validation", () => {
  const ajv = buildAjv();
  const schema = loadJson(SCHEMA_PATH);
  const validate = ajv.compile(schema);

  const files = readdirSync(VALID_DIR).filter(f => f.endsWith(".json"));
  assert.ok(files.length >= 3, "expected at least 3 valid fixtures");

  for (const file of files) {
    const data = loadJson(join(VALID_DIR, file));
    const ok = validate(data);
    if (!ok) {
      assert.fail(`Fixture ${file} should be VALID but got errors: ${JSON.stringify(validate.errors, null, 2)}`);
    }
    assert.ok(ok, `${file} should pass`);
  }
});

test("all invalid fixtures fail schema validation", () => {
  const ajv = buildAjv();
  const schema = loadJson(SCHEMA_PATH);
  const validate = ajv.compile(schema);

  const files = readdirSync(INVALID_DIR).filter(f => f.endsWith(".json"));
  assert.ok(files.length >= 3, "expected at least 3 invalid fixtures");

  for (const file of files) {
    const data = loadJson(join(INVALID_DIR, file));
    const ok = validate(data);
    assert.equal(
      ok, false,
      `Fixture ${file} should be INVALID but it passed schema validation`
    );
  }
});

test("cut transition must have duration === 0 (if/then rule)", () => {
  const ajv = buildAjv();
  const validate = ajv.compile(loadJson(SCHEMA_PATH));

  const base = loadJson(join(VALID_DIR, "minimal-project.json"));

  const cutOk = structuredClone(base);
  cutOk.shots[0].transitionOut = { type: "cut", duration: 0 };
  assert.equal(validate(cutOk), true, "cut with duration 0 should pass");

  const cutBad = structuredClone(base);
  cutBad.shots[0].transitionOut = { type: "cut", duration: 0.4 };
  assert.equal(validate(cutBad), false, "cut with duration > 0 should fail");

  const fadeOk = structuredClone(base);
  fadeOk.shots[0].transitionOut = { type: "fade", duration: 0.4 };
  assert.equal(validate(fadeOk), true, "fade with duration > 0 should pass");
});

test("normalized coordinates reject values outside [0, 1]", () => {
  const ajv = buildAjv();
  const validate = ajv.compile(loadJson(SCHEMA_PATH));
  const base = loadJson(join(VALID_DIR, "cartoon-story.json"));

  const bad = structuredClone(base);
  bad.shots[0].actors[0].position.x = 1.5;
  assert.equal(validate(bad), false);

  const good = structuredClone(base);
  good.shots[0].actors[0].position.x = 0.99;
  assert.equal(validate(good), true);
});

test("schemaVersion pattern enforces major == 2", () => {
  const ajv = buildAjv();
  const validate = ajv.compile(loadJson(SCHEMA_PATH));
  const base = loadJson(join(VALID_DIR, "minimal-project.json"));

  for (const ver of ["2.0.0", "2.1.0", "2.10.42"]) {
    const p = structuredClone(base);
    p.schemaVersion = ver;
    assert.equal(validate(p), true, `version ${ver} should pass`);
  }

  for (const ver of ["1.0.0", "3.0.0", "2.0", "v2.0.0"]) {
    const p = structuredClone(base);
    p.schemaVersion = ver;
    assert.equal(validate(p), false, `version ${ver} should fail`);
  }
});