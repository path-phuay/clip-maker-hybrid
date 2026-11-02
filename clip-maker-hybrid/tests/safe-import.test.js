import test from "node:test";
import assert from "node:assert/strict";
import { importProjectText, exportOriginalText } from "../src/adapters/SafeImport.js";

test("imports a JSON object and retains the exact original text", () => {
  const source = '{\n  "schemaVersion": "2.0.1",\n  "project": { "title": "Safe Import" },\n  "legacyData": { "sourceVersion": "v1" }\n}\n';
  const record = importProjectText(source, { fileName: "sample.json" });
  assert.equal(record.importStage, "DS-12D");
  assert.equal(record.conversionAvailable, false);
  assert.equal(record.rendererInvocationAllowed, false);
  assert.equal(record.fileName, "sample.json");
  assert.equal(record.document.project.title, "Safe Import");
  assert.equal(exportOriginalText(record), source);
});

test("flags legacy-like key names without interpreting or converting them", () => {
  const record = importProjectText(JSON.stringify({ theme: "road", actors: [], custom: true }));
  assert.deepEqual(record.inspection.legacyHintKeys, ["theme", "actors"]);
  assert.equal(record.inspection.classification, "legacy_indicators_present_unverified");
  assert.deepEqual(record.document, { theme: "road", actors: [], custom: true });
  assert.equal(record.conversionAvailable, false);
});

test("does not mutate the parsed document", () => {
  const source = JSON.stringify({ project: { title: "Keep" }, extra: { value: 7 } });
  const record = importProjectText(source);
  const before = structuredClone(record.document);
  assert.equal(exportOriginalText(record), source);
  assert.deepEqual(record.document, before);
});

test("rejects malformed JSON", () => {
  assert.throws(() => importProjectText('{"broken":'), SyntaxError);
});

test("rejects non-object JSON roots", () => {
  for (const source of ['null', '[]', '"text"', '42', 'true']) {
    assert.throws(() => importProjectText(source), TypeError);
  }
});

test("rejects non-string input and invalid export records", () => {
  assert.throws(() => importProjectText({}), TypeError);
  assert.throws(() => exportOriginalText({}), TypeError);
});

test("does not mistake ordinary JSON without legacy indicators for verified v2", () => {
  const record = importProjectText('{"hello":"world"}');
  assert.equal(record.inspection.classification, "unclassified_json_object");
  assert.equal(record.conversionAvailable, false);
});
