import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = resolve(root, "legacy/clip-maker.v1.html");
const EXPECTED_SHA256 = "f9d5bed16dad4d1c031f8f45a4b01d3681ac375211d5b2701064919a96a42072";

test("preserved Legacy Renderer baseline matches recovered source SHA-256", async () => {
  const bytes = await readFile(sourcePath);
  const actual = createHash("sha256").update(bytes).digest("hex");
  assert.equal(actual, EXPECTED_SHA256);
});

test("baseline still contains the legacy frame, playback and recording entry points", async () => {
  const html = await readFile(sourcePath, "utf8");
  assert.match(html, /function build\(\)/);
  assert.match(html, /function frame\(time\)/);
  assert.match(html, /function play\(\)/);
  assert.match(html, /function stop\(done\)/);
  assert.match(html, /function record\(\)/);
  assert.match(html, /captureStream\(30\)/);
});
