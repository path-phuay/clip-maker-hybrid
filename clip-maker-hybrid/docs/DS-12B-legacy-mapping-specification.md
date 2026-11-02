# DS-12B — Legacy v1 Mapping Specification (Source-Verified Update)

Status: **Source inspection complete; conversion implementation not yet approved.**

This update supersedes the earlier “blocked on source” status. The executable Legacy Renderer was recovered from Personal Library and audited. Source-backed semantics are recorded in `DS-12B-source-audit.md`.

## Evidence levels

- **Source-verified**: field or behavior is directly read or implemented in the recovered executable source.
- **Partially source-verified**: field exists, but all variants, precedence, or cross-feature semantics are not fully inventoried.
- **Preserve-only**: retain source data without conversion.
- **Unsupported / blocking**: no safe v2 destination or complete rule is currently approved.

## Mapping inventory

| Legacy v1 field | Source evidence | v2 target concept | Status / decision |
|---|---|---|---|
| root array / `scenes[]` | `build()` line 253 | `scenes[]` + `shots[]` | Source shape verified; scene/shot split policy still required |
| `cast` | actor merge in `actors()` around line 476 | reusable characters | Partially verified; preserve-only pending identity/view rules |
| `assets` (inline SVG strings) | `build()` line 253; `svgActor()` | vector assets / character views | Source verified; sanitize and asset-ID policy required |
| `style` | `build()` line 253 | project style | Runtime input verified; enum mapping not approved |
| `w` | `build()` line 253 | shot allocation | Relative weight under global duration override; not a duration |
| `d` | `build()` line 253 | shot duration | Source value used as seconds; shot split policy required |
| `s` | cumulative start generated in `build()` | shot start | Preserve-only; do not trust as source start |
| `theme`, `sky`, `ground`, `decor`, `hz`, `seed` | theme/custom functions | scene environment/layers | Partially verified; alias/fallback and layer mapping require fixtures |
| `shapes[]` | `drawShapes` / `drawShape` | scene objects / graphics | Partially verified; coordinate variants and z-order need per-kind mapping |
| `actors[]` | `actors()` | shot actors / character instances | Source verified; cross-scene identity/lifetime not fully established |
| actor `who`, `c`, `emoji`, `parts`, `svg`, `view`, `act`, `x`, `y`, `to`, `dir`, `s`, `col`, `keys` | actor resolution, motion and render functions | characters, views, transforms, animation | Partially verified; generic fallback must not count as successful mapping |
| `props[]`, `hold` | `props`, `inferHold`, `held` | props / attachments | Concepts verified; attach offsets/order need tests |
| `cam.from`, `cam.to`, `follow`, `shake`, `roll`, `dof` | `frame()` line 729 | camera / effects | Source verified; semantics in source audit |
| `tr` | `frame()` line 729 | transition | `cut`, `fade`, `flash`, `wipe`, `zoom` observed; timing boundaries need tests |
| `lt`, `am`, `cine` | `lights`, `atmos`, `cinema`, `frame()` | lighting / atmosphere / effects | Partially verified; v2 destination/parameter mapping not approved |
| `gx` | `gfx()` | motion graphics | `card` and `title` paths observed; full schema and timeline mapping need fixtures |
| `text`, `tx`, `highlight`, `hl`, `ts` | `build`, `subtitle`, `loop` | subtitle track | Partially verified; speech/layout behavior needs regression tests |
| `crowd`, `geo` | `crowdOf`, `geoLayers` | scene/shot features | Preserve-only pending explicit v2 contract |

## Conversion invariants

1. Do not mutate input.
2. Preserve complete raw v1 JSON in the migration envelope.
3. Do not infer one legacy scene equals one v2 scene or one shot.
4. Treat `w` as relative weight when a global duration is selected.
5. Do not copy computed `s` as a canonical source start.
6. Do not invent IDs, assets, actors, coordinate transforms, timing defaults or camera fallbacks.
7. Emit structured warnings for unsupported, ambiguous or lossy fields.
8. Keep conversion separate from rendering and validation.
9. Keep renderer invocation disabled for v2 until conversion tests and parity checks pass.
10. Preserve original renderer file byte-for-byte.

## Exit criteria

The source audit is complete. DS-12B conversion remains incomplete until:
- a full raw-v1 fixture set exists;
- scene/shot splitting and mapping ownership are approved;
- unsupported fields have explicit preserve/block decisions;
- converter passes deterministic, no-mutation, preservation and validator tests;
- legacy rendering smoke tests and golden-frame comparisons pass.

## Conversion Report Contract

The following is the required conceptual result shape for a future
legacy conversion operation. It is not an implemented API.

```json
{
  "conversionAvailable": false,
  "mappingVersion": "DS-12B",
  "convertedProject": null,
  "issues": [
    {
      "severity": "blocking",
      "code": "LEGACY_MAPPING_UNRESOLVED",
      "path": "scenes[0]",
      "message": "A required mapping rule has not been approved."
    }
  ],
  "preservation": {
    "originalSourceRetained": true
  }
}
```

Do not expose `conversionAvailable: true` until all required mapping rules,
real-fixture tests, deterministic conversion tests, and validation checks pass.
