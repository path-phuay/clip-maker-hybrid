# DS-12C — Legacy Compatibility Profile

Status: Evidence inventory; not an executable compatibility implementation.

## 1. Purpose and boundary

Record what is currently known about the former v1 project format and its relationship to ClipProject v2. This profile is intended to prevent undocumented assumptions from becoming converter or renderer behavior.

The original Legacy Renderer source is not present in the inspected workspace or repository history, and the project owner has confirmed that no separate copy is available. Consequently, runtime semantics cannot be verified from executable v1 code.

This document does not implement a converter, enable legacy rendering, change the DS-12A adapter contract, or claim visual/playback parity.

## 2. Evidence classifications

| Classification | Meaning |
|---|---|
| **Verified — repository artifact** | Directly visible in a committed schema, fixture, test, or current application source. This verifies only the artifact's contents, not undocumented runtime behavior. |
| **Documented only** | Described in the Hybrid Architecture Plan or DS-12B mapping inventory, but not verified against the original executable renderer. |
| **Unknown** | Available evidence does not establish the field shape, semantics, defaults, units, ordering, or runtime behavior. |
| **Unsupported in current shell** | The DS-11 shell does not implement the capability. This does not mean the original v1 application lacked it. |

A classification applies only to the claim as worded. A field appearing in a fixture does not verify how a renderer interprets it.

## 3. Verified repository artifacts

| Item | Evidence-backed statement | Classification |
|---|---|---|
| Current application entry | The DS-11 shell loads `src/app.js`. | Verified — repository artifact |
| Current project I/O | `ProjectManager` opens/parses JSON and exports the loaded project JSON. | Verified — repository artifact |
| Current shell rendering | The DS-11 shell contains a preview placeholder; it does not load or invoke the original Legacy Renderer. | Verified — repository artifact |
| Legacy adapter | DS-12A `inspectLegacyCompatibility(project)` performs a read-only inventory of selected v2 collections and reports `conversionAvailable: false` and `rendererInvocationAllowed: false`. | Verified — repository artifact |
| Legacy-imported fixture | `fixtures/valid/legacy-imported.json` is a ClipProject v2.0.1-shaped project with `project`, `assets`, `scenes`, `shots`, `timeline`, and `legacyData`. | Verified — repository artifact |
| Fixture legacy payload | The fixture's `legacyData` includes `sourceVersion: "v1"` and an `originalScene` object with `theme`, `sky`, and `ground`. | Verified — repository artifact |
| Legacy source availability | The inspected repository/workspace file inventory and Git history contain no complete original Legacy Renderer source; the owner has confirmed no separate copy is available. | Verified — inspection result / owner confirmation |

The fixture demonstrates one preserved legacy payload example. It is not a raw v1 input fixture and does not establish the original v1 schema.

## 4. Documented v1-to-v2 concepts

The following relationships are recorded in the Hybrid Architecture Plan §8.2 and elaborated as an unverified inventory in DS-12B. They are conceptual correspondences, not executable conversion rules.

| v1 concept / fields | Documented v2 destination | Classification |
|---|---|---|
| `scenes[]` | `scenes[]` plus `shots[]` | Documented only |
| `theme` | Scene preset / environment | Documented only |
| `sky`, `ground`, `decor` | Scene environment and layers | Documented only |
| `shapes` | Scene objects or graphics | Documented only |
| `actors[]` | Shot actor instances | Documented only |
| `c`, `emoji`, `parts`, `svg` | Character definition / asset references | Documented only |
| `act` | Animation action | Documented only |
| `x`, `y`, `to`, `dir` | Actor transform and motion | Documented only |
| `cam.from`, `cam.to` | Camera transform keyframes | Documented only |
| `cam.follow` | Camera target/follow behavior | Documented only |
| `cam.shake`, `cam.roll`, `cam.dof` | Camera effects | Documented only |
| `tx`, `hl`, `ts` | Subtitle track | Documented only |
| `gx`, `lt`, `am` | Graphics, lighting, and atmosphere tracks | Documented only |
| `s`, `d`, `tr` | Shot start, duration, and transition | Documented only |

## 5. Unknown semantics — do not infer

Without the original executable source or authoritative raw v1 fixtures, the following remain unknown:

- Exact raw v1 input schema, required fields, optional fields, and accepted value variants.
- Scene-to-shot splitting, ownership, lifetime, and ordering rules.
- Coordinate origin, axis direction, units, normalization, scaling, and transform composition.
- Time units, frame/time conversion, interval boundaries, interpolation, and duration defaults.
- Camera coordinate space, zoom convention, follow resolution, smoothing, and effect ordering.
- Actor identity, action names, action parameters, and animation evaluation.
- Precedence among `c`, `emoji`, `parts`, and `svg` when more than one is supplied.
- Theme aliases, fallback behavior, and drawing order for backgrounds, shapes, decor, lighting, atmosphere, and graphics.
- Subtitle text/highlight semantics, layout, timing, and ordering.
- Transition semantics and boundary behavior.
- Preview, playback, stop, TTS, recording, and MediaRecorder lifecycle/error behavior.
- Whether any undocumented legacy field is consumed by the old renderer.

No default, unit, alias, interpolation method, fallback, or rendering order may be invented to fill these gaps.

## 6. Current Hybrid shell capability boundary

These statements describe the current DS-11 shell only:

| Capability | Current status |
|---|---|
| Open a local JSON file | Supported by the shell's JSON file workflow |
| Parse JSON and show basic project metadata | Supported; this is not full schema or semantic validation |
| Export the loaded JSON | Supported |
| Full legacy v1 import/conversion | Not implemented |
| Invoke original Legacy Renderer | Not available; source is absent |
| Hybrid timeline, playback, frame rendering, and video recording | Not implemented by the DS-11 shell |
| Verify visual parity with the old renderer | Not possible with current evidence |

## 7. Safe handling rules

Until new authoritative evidence is supplied:

1. Treat legacy mappings as documentation, not executable conversion rules.
2. Preserve the complete original input unchanged whenever a future import workflow accepts it.
3. Keep `legacyData` opaque and preservation-only; do not read it as renderer instructions.
4. Do not claim a v2 project is render-equivalent to v1 merely because it passes v2 validation.
5. Report unknown and unsupported fields explicitly; do not silently discard them.
6. Do not fabricate defaults, IDs derived from unverified identity rules, coordinate conversions, time conversions, or fallback assets.
7. Keep conversion and renderer invocation disabled until the relevant evidence and tests exist.
8. If new v1 source or authoritative examples become available, record their provenance and update this profile before implementing affected mappings.

## 8. Evidence needed to upgrade this profile

To move a specific item from Documented only / Unknown to implementation-ready, obtain one or more authoritative sources appropriate to the claim:

- Complete original v1 HTML/JavaScript source for runtime behavior.
- Genuine raw v1 project files for input shapes and real-world field combinations.
- Original application documentation or owner-confirmed specifications for intended semantics.
- Reproducible reference outputs (frames, playback, or recordings) for behavioral comparisons.

For each upgraded mapping, record the source file and function/line evidence where available, representative fixtures, explicit conversion rules, and tests. A single example must not be generalized beyond what it demonstrates.

## 9. Exit criteria

DS-12C is complete as an evidence profile when:

- verified repository artifacts are separated from conceptual documentation;
- all known mapping concepts are listed without presenting them as proven runtime behavior;
- unresolved semantics are explicitly enumerated;
- current shell capabilities are distinguished from historical v1 capabilities;
- safe handling rules and evidence required for future upgrades are documented.

DS-12C completion does not unblock executable v1-to-v2 conversion. DS-12D must remain preservation-first and must not claim legacy semantic conversion unless new authoritative evidence is provided.
