# DS-01 — ClipProject v2 JSON Schema

Deliverable for **Task DS-01** of the Clip Maker Hybrid AI SVG Animation Generator.

## Scope

This package contains **only** the JSON Schema and its tests. It does **not**
contain a validator, renderer, or migration code — those are DS-02 / DS-03.

## Install

```bash
npm install
```

Requires Node.js >= 20 (uses built-in `node:test` and ES Modules).

## Run tests

```bash
npm test
```

Expected output (approx):

```
ok 1 - schema file is valid Draft 2020-12
ok 2 - all valid fixtures pass schema validation
ok 3 - all invalid fixtures fail schema validation
ok 4 - cut transition must have duration === 0 (if/then rule)
ok 5 - normalized coordinates reject values outside [0, 1]
ok 6 - schemaVersion pattern enforces major == 2
# tests 6
# pass 6
# fail 0
```

## Layout

```
schema/project.schema.json     — the schema
fixtures/valid/*.json          — 4 fixtures that MUST pass
fixtures/invalid/*.json        — 12 fixtures that MUST fail
tests/schema.test.mjs          — node:test suite
```

## What the schema does NOT enforce

The following are **deliberately left to ProjectValidator (DS-02)** because
JSON Schema cannot express them portably:

1. **Referential integrity** — that `shot.sceneId` resolves to an existing
   scene, `shot.actors[].characterId` resolves to an existing character,
   `layer.assetIds[]` resolve to existing vector assets, `camera.targetId`
   resolves to an actor in the shot.
2. **Uniqueness across arrays** — that scene IDs, shot IDs, etc. are unique
   globally (JSON Schema's `uniqueItems` only checks whole-object equality).
3. **Temporal integrity** — that shots do not overlap, that shot durations
   sum within tolerance of `project.duration`, that `graphic.start + duration`
   does not exceed `shot.start + shot.duration`.
4. **Composition rules** — subject inside viewport, safe-area, camera variety.

## Known limitations

- `assets.characters.<key>` and `assets.vector.<key>` use `additionalProperties`
  for the id-to-object map, which means a fixture where the key ≠ object's `id`
  is rejected at the "duplicate-character-id" fixture **only because the object
  `id` field itself exists** — actual cross-key consistency is a DS-02 concern.
  (I mention this so the reviewer knows the limit of schema-only validation.)
- The schema does not enforce that a `character` referenced in `shots[].actors[]`
  declares a `view` matching `actorInstance.view`. That will be checked by
  `ReferenceValidator` in DS-02.
- `legacyData` is intentionally `additionalProperties: true` with no shape
  lock. It must never be read by renderers — only preserved.

## Ambiguities resolved (see parent delivery report §2 for full table)

| Item | Decision |
|---|---|
| `shot.start` | required, `>= 0` |
| Actor position | normalized `[0,1]` on x/y; z optional `[0,1]` |
| Shot duration sum vs project duration | left to DS-02 (tolerance-based) |
| `views.front` required | yes (others optional) |
| `easing` enum | 5 values covering Animation Engine §6.4 |
| `cut` transition | forces `duration === 0` via `if/then` |
| `schemaVersion` | `^2\.\d+\.\d+$` |

## Assumptions

1. `assets.characters` and `assets.vector` are maps keyed by ID (not arrays).
   This matches the example in Architecture §5.2.
2. Asset `uri` may be relative or absolute. Resolution is DS-04's job.
3. Timeline tracks start as minimal `{id, assetId, start, ...}` objects and
   are intentionally extensible via `additionalProperties: false` only at the
   object level — future fields must be added explicitly in a new schema
   revision (2.1.0 etc.).
4. `effect` objects are `additionalProperties: true` because Architecture
   §6.6 does not enumerate effect kinds yet.
5. The schema rejects unknown top-level fields (`additionalProperties: false`
   at root) to prevent silent data drift. If the Architecture Owner wants
   forward-compat "keep unknown fields", this must be decided *before* DS-03,
   because LegacySceneConverter will otherwise need to hoist unknowns into
   `legacyData`.

## Contracts consumed

- Architecture doc §5.1 (design rules), §5.2 (example), §5.3 (cautions),
  §6.1 (character asset contract), §6.3 (camera presets/movements),
  §6.4 (easing), §7.1 (issue format — informs what fields must exist to
  report errors on), §8.2 (mapping table — informs which v1 concepts map
  to which v2 fields).

## Handoff to DS-02

`ProjectValidator` receives:
- `project.schema.json` (this deliverable)
- Reference-validator contract: for each cross-reference listed in "What
  the schema does NOT enforce", emit a structured issue using the format
  in Architecture §7.1.
- A separate pass to detect `key ≠ object.id` in `assets.characters` /
  `assets.vector`.