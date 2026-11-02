import { test } from "node:test";
import assert from "node:assert/strict";
import {
  getGalleryTemplates,
  getGalleryTemplate
} from "../src/gallery/GalleryCatalog.js";

test("gallery catalog contains only approved template entries", () => {
  const templates = getGalleryTemplates();

  assert.deepEqual(
    templates.map(item => item.id),
    ["cartoon-story", "minimal-project", "legacy-imported"]
  );
});

test("gallery template IDs are unique", () => {
  const templates = getGalleryTemplates();
  const ids = templates.map(item => item.id);

  assert.equal(new Set(ids).size, ids.length);
});

test("every gallery template has the required metadata", () => {
  for (const template of getGalleryTemplates()) {
    assert.ok(template.name);
    assert.ok(template.description);
    assert.ok(template.fixture.startsWith("./fixtures/valid/"));
    assert.ok(["featured", "starter", "legacy"].includes(template.category));
    assert.ok(Array.isArray(template.tags));
  }
});

test("gallery lookup returns a template by ID", () => {
  const template = getGalleryTemplate("cartoon-story");

  assert.equal(template.name, "Cartoon Story");
  assert.equal(template.category, "featured");
});

test("gallery lookup returns null for an unknown ID", () => {
  assert.equal(getGalleryTemplate("unknown-template"), null);
});

test("catalog results cannot mutate the internal catalog", () => {
  const first = getGalleryTemplates();
  first[0].name = "Changed";
  first[0].tags.push("Injected");

  const second = getGalleryTemplate("cartoon-story");

  assert.equal(second.name, "Cartoon Story");
  assert.equal(second.tags.includes("Injected"), false);
});