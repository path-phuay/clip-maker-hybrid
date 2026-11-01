# DS-12B — Legacy v1 to ClipProject v2 Mapping Specification

Status: Draft specification. No executable conversion is approved by this document.

## 1. Purpose

Turn the initial mapping table in the Hybrid Architecture Plan §8.2 into a reviewable mapping inventory for a future converter.

ClipProject v2 remains the canonical project format. DS-12A remains a read-only compatibility inventory. This document does not implement conversion, invoke a renderer, or claim parity with the original application.

## 2. Evidence levels

Each mapping has one of these statuses:

- **Concept documented** — the architecture names the v1 concept and a v2 destination, but exact source shape and conversion rules are not verified.
- **Target shape documented** — the v2 architecture/schema describes a target concept, but the v1-to-v2 transform is not verified.
- **Blocked on legacy source** — field shape, defaults, units, ordering, or runtime meaning must be read from the complete executable v1 source.
- **Preserve-only** — retain the original value without interpreting it until a mapping is verified.

No row in the initial mapping table is considered implementation-ready solely because it appears in that table.

## 3. Mapping inventory

| v1 concept / fields | Documented v2 destination | Evidence status | Required verification before conversion |
|---|---|---|---|
| `scenes[]` | `scenes[]` plus `shots[]` | Concept documented; blocked on legacy source | Scene/shot split rules, scene ordering, shot count, timing ownership, and treatment of scene-level fields |
| `theme` | Scene preset / environment | Concept documented; blocked on legacy source | Accepted theme values, aliases, fallback behavior, and custom-theme representation |
| `sky`, `ground`, `decor` | Scene environment and layers | Concept documented; target shape documented | Exact value types, drawing order, depth, asset-vs-inline data, and unknown-field handling |
| `shapes` | Scene objects or graphics | Concept documented; blocked on legacy source | Shape variants, coordinate system, style fields, timing, z-order, and whether each shape belongs to scene or shot |
| `actors[]` | Shot actor instances | Concept documented; target shape documented | Actor lifetime, scene-to-shot duplication rules, identity, ordering, and per-shot overrides |
| `c`, `emoji`, `parts`, `svg` | Character definition / asset references | Concept documented; blocked on legacy source | Precedence when multiple forms coexist, accepted types, embedded SVG safety, and asset identity |
| `act` | Animation action | Concept documented; blocked on legacy source | Supported action names, aliases, parameters, and time evaluation |
| `x`, `y`, `to`, `dir` | Actor transform and motion | Concept documented; target shape documented | Units, origin, normalized-vs-pixel coordinates, direction encoding, interpolation, and duration |
| `cam.from`, `cam.to` | Camera transform keyframes | Concept documented; target shape documented | Coordinate space, zoom convention, defaults, interpolation, and transform order |
| `cam.follow` | Camera target/follow behavior | Concept documented; blocked on legacy source | Target resolution, follow offset, smoothing, activation rules, and missing-target behavior |
| `cam.shake`, `cam.roll`, `cam.dof` | Camera effects | Concept documented; blocked on legacy source | Parameter shapes, units, evaluation timing, ordering, and whether DOF is visual blur or another effect |
| `tx`, `hl`, `ts` | Subtitle track | Concept documented; blocked on legacy source | Text model, highlight semantics, timing, layout, style, and track ordering |
| `gx`, `lt`, `am` | Graphics, lighting, and atmosphere tracks | Concept documented; blocked on legacy source | Exact field schemas, supported variants, time ranges, ordering, and destination ownership |
| `s`, `d`, `tr` | Shot start, duration, and transition | Concept documented; blocked on legacy source | Units, inclusive/exclusive boundaries, defaults, transition semantics, and total-duration rules |

## 4. Conversion invariants

A future converter must satisfy all of the following:

1. **Pure conversion:** conversion must not mutate the supplied source object.
2. **Source preservation:** retain a complete, unchanged copy of the original input in the agreed migration envelope. Do not rely on a partial hand-picked subset as the only recovery path.
3. **No silent loss:** every source field must be classified as mapped, preserved-only, unsupported, or intentionally omitted under an explicitly approved rule.
4. **No invented defaults:** only use defaults verified from the legacy source or explicitly approved in a versioned mapping rule.
5. **Stable identity:** generated IDs must be deterministic for the same source and conversion version.
6. **Deterministic ordering:** preserve source order unless a verified rule requires a different order; document that rule.
7. **Explicit warnings:** lossy, ambiguous, unsupported, or fallback mappings must produce structured warnings with source paths.
8. **No renderer side effects:** conversion must not call the Legacy Renderer or the future Hybrid Renderer.
9. **Versioned mapping:** include a converter/mapping version in conversion metadata so results can be reproduced.
10. **Fail closed for unsafe ambiguity:** if a required field cannot be interpreted safely, report a blocking conversion issue instead of guessing.

## 5. Proposed conversion report contract

The following is a conceptual shape, not an implemented API:

```json
{
  "conversionAvailable": false,
  "mappingVersion": "DS-12B-draft",
  "convertedProject": null,
  "issues": [
    {
      "severity": "blocking",
      "code": "LEGACY_SOURCE_NOT_VERIFIED",
      "path": "scenes[0].actors[0].x",
      "message": "Coordinate semantics have not been verified against the legacy renderer."
    }
  ],
  "preservation": {
    "originalSourceRetained": true
  }
}
```

Do not expose `conversionAvailable: true` until the source-dependent rules and real-fixture tests have passed.

## 6. Required legacy-source inspection

Before implementation, inspect the complete original v1 HTML/JavaScript and record evidence for:

- input JSON examples and every field read by the renderer;
- scene and shot iteration order;
- `frame(time)` call path and time units;
- camera transform formulas and transform order;
- actor coordinate origin, scale, direction, and motion formulas;
- background/theme aliases and fallback behavior;
- shape, prop, lighting, atmosphere, cinema-effect, graphic, and subtitle draw order;
- transition behavior and boundary conditions;
- Preview, Play, Stop, TTS, and MediaRecorder lifecycle;
- error handling and any silent fallbacks.

Record source function names and relevant code locations in the implementation report. Do not infer behavior from the architecture plan alone.

## 7. Test plan after source verification

The converter implementation must include:

1. A real v1 fixture for each supported feature family.
2. A minimal valid v1 project fixture based on the actual renderer input.
3. A fixture containing unknown fields to verify preservation.
4. Tests for deterministic IDs and stable ordering.
5. Tests proving the source object is unchanged.
6. Tests for missing, malformed, and ambiguous fields.
7. Tests proving every unsupported field is reported and retained.
8. Tests validating the converted ClipProject v2 with the existing validators.
9. A legacy-source integrity check proving the original renderer file is unchanged.
10. Golden-frame comparisons and playback/recording smoke tests before routing converted projects to a renderer.

## 8. Current blockers and scope boundary

The repository state inspected for DS-12A contains the DS-11 application shell and hybrid modules, but no complete Legacy Renderer source file. The Architecture Plan describes the original baseline at a high level; it is not a substitute for executable source.

The existing `fixtures/valid/legacy-imported.json` is a ClipProject v2 fixture with `legacyData`. It is not, by itself, a verified raw v1 input fixture and must not be treated as proof of the legacy input contract.

Therefore:

- DS-12B mapping inventory is documented at the concept level.
- Executable v1-to-v2 conversion remains blocked.
- Legacy renderer invocation remains disabled.
- No legacy rendering behavior has been changed or tested by DS-12B.

## 9. Exit criteria for DS-12B

DS-12B can be marked implementation-ready only when:

- the complete legacy source is available and inspected;
- every mapping row has source evidence and an explicit conversion rule or preserve-only disposition;
- coordinate, timing, ordering, and camera semantics are documented;
- the owner approves unresolved lossy-conversion decisions;
- real v1 fixtures and the test plan are ready.

Until then, retain the DS-12A runtime contract unchanged.
