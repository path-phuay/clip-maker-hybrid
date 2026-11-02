import test from "node:test";
import assert from "node:assert/strict";
import { parseJsonPointer, resolveJsonPointer, formatJsonPointer } from "../src/core/JsonPointer.js";

test("resolves root, nested objects, and array entries", () => {
  const doc = { shots: [{ actors: [{ characterId: "char_1" }] }] };
  assert.deepEqual(resolveJsonPointer(doc, "").value, doc);
  assert.equal(resolveJsonPointer(doc, "/shots/0/actors/0/characterId").value, "char_1");
  assert.equal(formatJsonPointer("/shots/0/actors/0/characterId"), "shots → [0] → actors → [0] → characterId");
});

test("decodes RFC 6901 escaped property names", () => {
  const doc = { "a/b": { "til~de": 3 } };
  assert.deepEqual(parseJsonPointer("/a~1b/til~0de"), ["a/b", "til~de"]);
  assert.equal(resolveJsonPointer(doc, "/a~1b/til~0de").value, 3);
});

test("returns a safe not-found result for absent paths and invalid array indexes", () => {
  const doc = { shots: [1] };
  assert.equal(resolveJsonPointer(doc, "/missing").found, false);
  assert.equal(resolveJsonPointer(doc, "/shots/01").found, false);
  assert.equal(resolveJsonPointer(doc, "/shots/2").found, false);
});

test("rejects malformed pointers without throwing from lookup", () => {
  assert.throws(() => parseJsonPointer("shots/0"), SyntaxError);
  assert.throws(() => parseJsonPointer("/bad~2escape"), SyntaxError);
  assert.equal(resolveJsonPointer({}, "/bad~2escape").found, false);
});

test("does not mutate the source document", () => {
  const doc = { nested: { value: 1 } };
  const before = structuredClone(doc);
  resolveJsonPointer(doc, "/nested/value");
  assert.deepEqual(doc, before);
});
