# DS-10 — Hybrid Runtime Architecture

Status: Approved architecture baseline  
Scope: Architecture and module contracts only. This document does not claim that runtime modules or a renderer have been implemented.

## 1. Goals

- Preserve the original v1 renderer and its user-facing Preview, Play, Stop, and Record behavior.
- Use ClipProject v2 as the canonical data contract for the Hybrid Runtime.
- Keep validation independent from browser rendering APIs.
- Separate runtime engines, rendering, preview, and export responsibilities.
- Support the seven approved Effect Types without inventing parameter defaults or units.

## 2. Runtime flow

```text
clip-maker.html
  -> ProjectManager
  -> Validation Pipeline
  -> Runtime Engines
  -> Render Pipeline
  -> Preview Renderer / Canvas Export Bridge
```

Detailed stages:

1. Load or receive a ClipProject v2 document.
2. Validate schema and semantic constraints. Do not mutate the input.
3. Resolve required assets through AssetLoader.
4. Evaluate the project clock and active shot.
5. Evaluate scene, character, camera, and animation state.
6. Evaluate lighting and motion graphics.
7. Execute supported effects in the agreed effect order.
8. Render subtitles and transitions.
9. Present the frame in preview or rasterize it for export.

The exact ordering of effect compositing, subtitles, and transitions must be confirmed against the legacy baseline and explicit runtime contracts before implementation.

## 3. Module boundaries

| Module | Responsibility | Must not do |
|---|---|---|
| ProjectManager | Load, save, and hand off canonical project data | Draw frames |
| ProjectValidator | Run schema and semantic validation | Access DOM, Canvas, or mutate project data |
| AssetLoader | Resolve and cache declared assets | Invent missing assets or silently substitute |
| CharacterEngine | Resolve character instances and views | Modify canonical character definitions |
| SceneEngine | Build scene/layer state | Plan story content |
| CameraEngine | Compute camera transforms and framing | Mutate project data |
| AnimationEngine | Evaluate time-dependent transforms | Render DOM/Canvas nodes |
| MotionGraphicsEngine | Evaluate graphic elements | Own project persistence |
| EffectRuntime | Execute approved effect contracts | Change effect parameters or invent defaults |
| RenderPipeline | Coordinate frame evaluation and rendering stages | Own project persistence |
| SVGRenderer | Render/update the SVG scene graph | Validate or rewrite project data |
| LegacyCanvasAdapter | Preserve/use the original Canvas renderer as a compatibility path | Become the canonical project format |
| CanvasExportBridge | Feed rendered frames to browser recording/export | Plan or modify shots |

## 4. Effect Runtime contract

The runtime must recognize these approved effect types:

- `color_adjustment`
- `blur`
- `drop_shadow`
- `glow`
- `vignette`
- `film_grain`
- `texture_overlay`

The existing effect parameter and asset validators remain the source of validation rules. This architecture does not define runtime defaults, units, visual algorithms, GPU requirements, or effect ordering. Those require a separate approved runtime contract and parity tests.

Unknown effect types remain forward-compatible at validation time. Runtime handling must be explicit and observable; it must not silently claim that an unknown effect was rendered.

## 5. Legacy compatibility

- Keep the original `clip-maker.html` unchanged.
- Preserve a separate Legacy Mode during migration.
- Treat the legacy source as a baseline/reference, not as the Hybrid Runtime.
- Use an adapter boundary for legacy data and rendering.
- Do not remove the legacy path until preview, playback, and recording regression tests pass.
- Do not assume the Library copy of the original file is already present in the local repository.

## 6. Proposed implementation sequence

1. DS-11: Create the new Hybrid application shell and entry point.
2. DS-12: Define and implement the Legacy Renderer adapter after the complete baseline source is available.
3. DS-13: Implement runtime foundations and asset loading.
4. DS-14: Implement the seven Effect Types against approved runtime contracts.
5. DS-15: Integrate preview and export.
6. DS-16: Run regression and acceptance tests.

## 7. DS-10 acceptance criteria

- [ ] Legacy renderer remains unchanged.
- [ ] ClipProject v2 remains canonical for Hybrid Mode.
- [ ] Validation runs before runtime execution.
- [ ] Effect Runtime is separate from the renderer.
- [ ] Preview and export share the same frame-evaluation pipeline.
- [ ] All seven approved effect types have an explicit runtime implementation plan.
- [ ] Unknown effect types do not crash the pipeline or falsely report success.
- [ ] Required asset failures are surfaced as actionable errors.
- [ ] No project data is silently mutated.

## 8. Non-goals

This DS-10 document does not implement a UI, renderer, AssetLoader, effect algorithms, migration converter, audio pipeline, or video export. Those are later tasks with independent contracts and tests.
