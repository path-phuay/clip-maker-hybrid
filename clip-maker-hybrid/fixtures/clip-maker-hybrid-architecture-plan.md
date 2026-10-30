# Clip Maker → Hybrid AI SVG Animation Generator

## Technical Implementation Plan & AI Delegation Brief

-   **Project direction:** Hybrid (Character Animation + Motion
    Graphics)
-   **Migration strategy:** Build a new modular Engine while preserving
    existing features
-   **Priority:** Fix all four issues: visual quality, missing
    characters, incomplete scenes, limited camera angles
-   **Baseline:** User-provided `clip-maker.html`
-   **Document status:** Implementation blueprint; not a claim that the
    new Engine has already been implemented or tested

------------------------------------------------------------------------

# 1. Executive Decision

Transform Clip Maker from a single-page, AI-JSON-to-Canvas renderer into
a modular animation studio.

The new system will use:

1.  **AI Director** to plan a project, storyboard, cast, scenes, shots
    and animation.
2.  **Project Schema v2** as the canonical data contract.
3.  **Character Engine** for reusable character identity, views, rigs
    and actions.
4.  **Scene Engine** for layered, reusable environments.
5.  **Camera Engine** for shot types, angles, movement and composition.
6.  **Animation + Motion Graphics Engines** for character movement and
    graphic elements.
7.  **SVG Scene Graph** as the editable visual representation.
8.  **Canvas Export Bridge** to preserve the current video-export
    approach.
9.  **Legacy Adapter** to import old project JSON and retain old
    rendering as a fallback during migration.

## Non-negotiable principles

-   Do not delete or rewrite the current renderer before the replacement
    passes regression tests.
-   Do not silently replace missing characters with generic blobs.
-   Do not silently omit missing scene assets.
-   Do not let the AI invent IDs that are not present in the project
    registry.
-   Do not generate a single enormous JSON response without staged
    planning and validation.
-   Do not couple AI calls to rendering code.
-   Every Engine must have a documented input/output contract.
-   Existing Preview, Play, Stop, Timeline/scene timing, subtitle, TTS
    and video recording behavior must be preserved or explicitly
    reported as a known limitation.
-   All generated project data must be deterministic enough to reproduce
    a preview/export using the same assets, seed and project settings.

------------------------------------------------------------------------

# 2. Baseline: What Exists in `clip-maker.html`

The uploaded file is a single HTML document containing UI, scene data
handling, drawing, playback and recording logic.

Observed baseline capabilities and constraints:

  ------------------------------------------------------------------------------
  Existing area           Observed implementation      Migration decision
  ----------------------- ---------------------------- -------------------------
  Rendering               Canvas 2D context; central   Keep as LegacyRenderer
                          `frame(time)` function       and export compatibility
                                                       path

  Backgrounds             Theme selection and custom   Preserve current themes
                          scene drawing; themes        as reusable Scene Presets
                          include road, room, city,    
                          nature, space and other      
                          aliases                      

  Actors                  Actor resolution using SVG,  Wrap current actor
                          parts, emoji, aliases and    drawing in
                          fallback types               LegacyCharacterAdapter;
                                                       replace silent fallback
                                                       with validation

  Animation               Actions such as              Map supported actions to
                          walk/run/float/fly and other Animation Engine presets
                          action-specific              
                          drawing/motion logic         

  Camera                  `cam.from`, `cam.to`, zoom,  Preserve and map into
                          focus position, follow,      Camera v2
                          shake, roll and              
                          depth-of-field-like blur     

  Graphics                Shapes, props, lights,       Split into scene layers
                          atmosphere, cinema effects,  and independent
                          graphics and subtitles are   graphics/effects tracks
                          drawn in the frame pipeline  

  Playback                `play()`, `stop()`, `loop()` Preserve user-facing
                          based on                     behavior; use a shared
                          `requestAnimationFrame`      project clock in v2

  Voice                   Browser Speech Synthesis     Preserve as preview TTS;
                                                       do not assume it is
                                                       embedded in exported
                                                       video

  Recording               `MediaRecorder` using        Keep through
                          `canvas.captureStream(30)`   CanvasExportBridge;
                                                       verify supported MIME
                                                       types at runtime
  ------------------------------------------------------------------------------

Important implementation observations:

-   `resolveActor()` can map unknown actor descriptions to a generic
    `blob`. This is useful as a fallback but is unsafe as the normal
    production behavior because it can hide missing character support.
-   `drawBG()` selects a theme and catches drawing errors, then attempts
    a custom fallback. The new validator should report the original
    error and the fallback used.
-   `frame(time)` owns many unrelated responsibilities: camera
    transforms, background, shapes, props, actors, lighting, atmosphere,
    graphics and subtitles. This is a major reason to split the renderer
    into modules.
-   Existing camera behavior is a useful foundation. The problem is not
    that there is no camera logic; the system lacks a robust
    shot-planning layer and a broad preset/composition model.
-   Existing export is real-time canvas recording. It should be
    preserved initially rather than replaced during the first refactor.

**Baseline rule:** preserve behavior first, then replace internals one
subsystem at a time.

------------------------------------------------------------------------

# 3. Target Architecture

``` text
USER
  |
  v
PROJECT INPUT / EDITOR UI
  |
  v
AI DIRECTOR
  |-- Story Planner
  |-- Character Planner
  |-- Visual Style Planner
  |-- Scene Planner
  |-- Shot & Camera Planner
  |-- Animation Planner
  |
  v
PROJECT DATA (ClipProject v2)
  |
  +--> Schema Validator
  +--> Reference Validator
  +--> Asset Validator
  +--> Composition Validator
  +--> Auto Repair / Error Report
  |
  v
RUNTIME ENGINES
  |-- Character Engine + Rig
  |-- Scene Engine + Layer Graph
  |-- Camera Engine
  |-- Animation Engine
  |-- Motion Graphics Engine
  |-- Lighting / Effects Engine
  |
  v
SVG SCENE GRAPH
  |-- Editable SVG nodes
  |-- Transform updates
  |-- Asset cache
  |-- Preview scheduler
  |
  v
CANVAS EXPORT BRIDGE
  |
  +--> MediaRecorder
  +--> Video file
  +--> Audio / subtitle synchronization
```

## 3.1 Runtime data flow

1.  User submits an idea and output preferences.
2.  AI Director creates a structured production plan.
3.  Planner stages produce cast, scenes, shots and animation
    instructions.
4.  IDs are reconciled against registries; missing assets are generated,
    substituted only with user-approved alternatives, or marked as
    blocking errors.
5.  Schema and semantic validators run.
6.  The Scene Engine builds a reusable scene graph.
7.  Character Engine instantiates characters from the registry.
8.  Camera Engine computes the view transform for the current shot.
9.  Animation Engine evaluates the project time and updates transforms.
10. Motion Graphics and Effects Engines update their nodes.
11. SVG Renderer displays the current frame.
12. Canvas Export Bridge rasterizes frames for recording/export.

## 3.2 Module boundaries

  -----------------------------------------------------------------------
  Module                  Responsibility          Must not do
  ----------------------- ----------------------- -----------------------
  ProjectManager          Load, save, migrate and Draw frames
                          version projects        

  EventBus                Publish/subscribe       Own project data
                          editor and engine       
                          events                  

  StateManager            Manage project/editor   Call the AI provider
                          state                   directly

  AIDirector              Orchestrate staged AI   Draw SVG or Canvas
                          planning                

  StoryPlanner            Produce story beats and Create renderer nodes
                          scene outline           

  CharacterPlanner        Identify cast and       Silently invent asset
                          character requirements  availability

  ScenePlanner            Plan locations,         Control camera
                          environment and layers  transforms

  CameraPlanner           Assign shot types and   Modify character design
                          camera paths            

  ProjectValidator        Validate schema and     Silently mutate invalid
                          project references      data

  AutoRepair              Apply explicit, logged  Hide blocking errors
                          safe repairs            

  CharacterEngine         Instantiate registered  Own the project
                          characters              timeline

  CharacterRig            Map joints/parts and    Load AI prompts
                          poses                   

  SceneEngine             Build environment       Decide story beats
                          layers and props        

  CameraEngine            Compute viewport,       Mutate canonical asset
                          framing and movement    definitions

  AnimationEngine         Evaluate keyframes and  Create new assets
                          action presets          

  MotionGraphicsEngine    Render animated text,   Modify character
                          icons and vector        registry
                          graphics                

  LightingEngine          Apply lighting and      Own scene structure
                          atmosphere parameters   

  SVGSceneGraph           Own SVG node hierarchy  Call LLM APIs
                          and transforms          

  SVGRenderer             Render/update the SVG   Manage project
                          graph                   persistence

  CanvasExportBridge      Rasterize frames and    Plan shots
                          feed MediaRecorder      

  LegacyAdapter           Convert old data and    Become the new
                          provide fallback        canonical schema
  -----------------------------------------------------------------------

------------------------------------------------------------------------

# 4. Proposed Repository Structure

Start with plain JavaScript ES Modules. Do not introduce a framework
migration at the same time as the rendering rewrite.

``` text
clip-maker/
├── index.html
├── styles/
│   ├── app.css
│   ├── editor.css
│   └── timeline.css
├── src/
│   ├── app.js
│   ├── core/
│   │   ├── ProjectManager.js
│   │   ├── EventBus.js
│   │   ├── StateManager.js
│   │   ├── ProjectClock.js
│   │   └── LegacyAdapter.js
│   ├── ai/
│   │   ├── AIDirector.js
│   │   ├── StoryPlanner.js
│   │   ├── CharacterPlanner.js
│   │   ├── VisualStylePlanner.js
│   │   ├── ScenePlanner.js
│   │   ├── CameraPlanner.js
│   │   └── PromptBuilder.js
│   ├── schema/
│   │   ├── project.schema.json
│   │   ├── character.schema.json
│   │   ├── scene.schema.json
│   │   └── shot.schema.json
│   ├── validation/
│   │   ├── ProjectValidator.js
│   │   ├── ReferenceValidator.js
│   │   ├── AssetValidator.js
│   │   ├── CompositionValidator.js
│   │   └── AutoRepair.js
│   ├── engines/
│   │   ├── CharacterEngine.js
│   │   ├── CharacterRig.js
│   │   ├── SceneEngine.js
│   │   ├── CameraEngine.js
│   │   ├── AnimationEngine.js
│   │   ├── MotionGraphicsEngine.js
│   │   ├── LightingEngine.js
│   │   └── EffectsEngine.js
│   ├── renderer/
│   │   ├── SVGSceneGraph.js
│   │   ├── SVGRenderer.js
│   │   ├── AssetLoader.js
│   │   ├── RenderScheduler.js
│   │   └── CanvasExportBridge.js
│   ├── editor/
│   │   ├── Preview.js
│   │   ├── Storyboard.js
│   │   ├── CharacterStudio.js
│   │   ├── SceneStudio.js
│   │   ├── CameraStudio.js
│   │   └── TimelineEditor.js
│   ├── export/
│   │   ├── VideoExporter.js
│   │   ├── AudioManager.js
│   │   └── SubtitleManager.js
│   └── legacy/
│       ├── LegacyRenderer.js
│       └── LegacySceneConverter.js
├── assets/
│   ├── characters/
│   ├── backgrounds/
│   ├── props/
│   ├── graphics/
│   └── fonts/
└── tests/
    ├── fixtures/
    ├── schema/
    ├── migration/
    ├── engines/
    └── export/
```

This is the target structure, not a requirement to create every file in
the first commit. Create modules incrementally as their contracts are
implemented.

------------------------------------------------------------------------

# 5. Canonical Project Format: ClipProject v2

## 5.1 Design rules

-   `project` contains global settings.
-   `assets` contains reusable definitions and asset references.
-   `scenes` define locations and environment composition.
-   `shots` define camera coverage and what is visible at a specific
    time.
-   `timeline` defines ordering and synchronized tracks.
-   `legacyData` is optional and stores original v1 data during
    migration.
-   Use stable IDs, not array indexes, for cross-references.
-   Use normalized coordinates (0--1) for positions where practical.
-   Use seconds for durations and timeline times.
-   Use explicit units in fields whose units may be ambiguous.
-   Do not store large SVG strings repeatedly in every shot; store
    assets once and reference them.
-   Keep generated assets separate from semantic descriptions.

## 5.2 Example project

``` json
{
  "schemaVersion": "2.0.0",
  "project": {
    "id": "project_001",
    "title": "Night City Story",
    "fps": 30,
    "resolution": {
      "width": 720,
      "height": 1280
    },
    "aspectRatio": "9:16",
    "duration": 12,
    "style": {
      "preset": "cinematic_cartoon",
      "characterStyle": "chibi",
      "environmentStyle": "stylized",
      "palette": ["#17243D", "#E8A15A", "#D8322F"],
      "lighting": "cinematic",
      "consistency": "high"
    }
  },
  "assets": {
    "characters": {
      "char_hero": {
        "id": "char_hero",
        "name": "Hero",
        "type": "humanoid",
        "design": {
          "description": "Chibi hero with black hair and red jacket",
          "seed": 1234,
          "colors": {
            "skin": "#E0AC7C",
            "hair": "#1B1410",
            "outfit": "#D8322F"
          }
        },
        "views": {
          "front": "asset_hero_front",
          "threeQuarter": "asset_hero_3q",
          "side": "asset_hero_side",
          "back": "asset_hero_back"
        },
        "rig": {
          "type": "humanoid",
          "assetId": "rig_humanoid_basic"
        },
        "supportedActions": [
          "idle",
          "walk",
          "run",
          "jump",
          "wave",
          "punch"
        ]
      }
    },
    "vector": {
      "asset_hero_front": {
        "id": "asset_hero_front",
        "kind": "svg",
        "uri": "assets/characters/hero/front.svg",
        "width": 512,
        "height": 512
      }
    },
    "props": {},
    "graphics": {}
  },
  "scenes": [
    {
      "id": "scene_001",
      "title": "Night Street",
      "location": "urban_street",
      "environment": {
        "timeOfDay": "night",
        "weather": "rain"
      },
      "layers": [
        {
          "id": "sky",
          "type": "background",
          "depth": 0,
          "assetIds": ["sky_night"]
        },
        {
          "id": "buildings",
          "type": "environment",
          "depth": 10,
          "assetIds": ["city_buildings"]
        },
        {
          "id": "street",
          "type": "ground",
          "depth": 20,
          "assetIds": ["wet_road"]
        },
        {
          "id": "foreground",
          "type": "foreground",
          "depth": 30,
          "assetIds": ["rain_foreground"]
        }
      ],
      "lighting": {
        "preset": "neon_night",
        "ambient": 0.5
      }
    }
  ],
  "shots": [
    {
      "id": "shot_001",
      "sceneId": "scene_001",
      "start": 0,
      "duration": 3.5,
      "camera": {
        "shotType": "wide",
        "angle": "eye_level",
        "targetId": "char_hero",
        "movement": {
          "type": "dolly_in",
          "from": {
            "x": 0.5,
            "y": 0.5,
            "zoom": 1
          },
          "to": {
            "x": 0.5,
            "y": 0.55,
            "zoom": 1.4
          },
          "easing": "ease_in_out"
        }
      },
      "actors": [
        {
          "characterId": "char_hero",
          "view": "threeQuarter",
          "position": {
            "x": 0.5,
            "y": 0.8,
            "z": 0.6
          },
          "facing": "right",
          "action": "walk",
          "expression": "alert"
        }
      ],
      "graphics": [
        {
          "id": "title_001",
          "type": "text",
          "text": "เมืองที่ไม่มีวันหลับ",
          "start": 0.4,
          "duration": 1.2,
          "animation": "fade_up"
        }
      ],
      "effects": [],
      "transitionOut": {
        "type": "cut",
        "duration": 0
      }
    }
  ],
  "timeline": {
    "audioTracks": [],
    "subtitleTracks": [],
    "musicTracks": []
  },
  "legacyData": {
    "sourceVersion": "v1"
  }
}
```

## 5.3 Schema design cautions

The sample above is illustrative. Before implementing the full schema:

-   Decide whether `shots[].start` is required or whether shot order
    determines start time. Prefer explicit `start` after validation.
-   Decide how asset IDs resolve to files, Blob URLs or IndexedDB
    records.
-   Define allowed enumerations for `shotType`, `angle`, `movement`,
    `easing`, `action`, `view` and transition types.
-   Define whether an actor's position is world-space or normalized
    scene-space.
-   Define camera coordinate conventions and zoom behavior once; do not
    mix pixels, normalized coordinates and degrees without unit names.
-   Define schema migration behavior for future versions.
-   Keep unknown fields when possible so newer files are not
    destructively downgraded.

------------------------------------------------------------------------

# 6. Engine Specifications

## 6.1 Character Engine

### Responsibilities

-   Character Registry lookup.
-   Character instance creation.
-   Stable design identity across shots.
-   View selection.
-   Rig/part hierarchy.
-   Supported action lookup.
-   Character bounds for framing and collision/overlap checks.
-   Missing-view and missing-action reporting.

### Required character asset contract

``` json
{
  "id": "char_hero",
  "type": "humanoid",
  "views": {
    "front": "asset_hero_front",
    "side": "asset_hero_side"
  },
  "rig": {
    "type": "humanoid",
    "assetId": "rig_humanoid_basic"
  },
  "supportedActions": ["idle", "walk", "run"]
}
```

### Character rules

-   A character ID represents one canonical design.
-   Shots reference that ID; they do not redefine the design.
-   A requested view must resolve to a real asset or a supported
    procedural transform.
-   Do not assume a front-facing SVG can be mirrored to produce a
    correct back view.
-   Do not silently map unsupported species/types to a generic blob.
-   If no valid view exists, show a clear placeholder and a
    blocking/warning issue according to export policy.
-   Use a stable seed for procedural variations.
-   Character design changes must be explicit project edits, not
    accidental AI drift.

### Initial supported rig scope

Start with: 1. Humanoid basic rig. 2. Quadruped simplified rig. 3.
Static SVG character (no articulated rig). 4. Emoji/primitive fallback
for legacy compatibility only.

Do not attempt a universal rig for every animal in the first release.

## 6.2 Scene Engine

### Scene graph layer order

Recommended default order:

1.  Sky / distant background
2.  Far environment
3.  Midground environment
4.  Ground
5.  Characters and interactive props
6.  Foreground objects
7.  Atmosphere
8.  Motion graphics / titles
9.  Subtitles / UI overlays

Allow per-scene overrides, but validate depth ordering.

### Scene module features

-   Layered backgrounds.
-   Reusable props.
-   Environment presets.
-   Procedural primitives for simple objects.
-   Asset registry and caching.
-   Parallax depth.
-   Lighting and atmosphere parameters.
-   Scene bounds and safe area.
-   Asset loading status and failure report.

Existing themes should become presets, not be discarded.

## 6.3 Camera Engine

### Shot presets

-   extreme_wide
-   wide
-   full
-   medium
-   close_up
-   extreme_close_up
-   over_shoulder
-   low_angle
-   high_angle
-   top_down

### Movement presets

-   static
-   pan
-   tilt
-   dolly_in
-   dolly_out
-   truck
-   zoom
-   follow
-   orbit
-   shake

### Camera contract

Each shot must define:

-   `shotType`
-   `angle`
-   `targetId` or explicit target coordinates
-   initial and final camera transforms
-   movement type
-   easing
-   optional focus/depth-of-field settings
-   framing constraints

### Composition validation

At minimum:

-   target exists.
-   target is inside the scene.
-   subject is not unintentionally outside the viewport.
-   close-up does not crop required face/body features.
-   title/subtitle safe areas do not obscure essential subjects.
-   consecutive shots do not all use the same shot type unless
    intentionally requested.
-   camera movement has valid start/end values and finite numbers.

### Variety policy

Do not enforce a rigid minimum number of shot types for every short
clip. Use a configurable diversity score and allow intentional
repetition. For a typical 20-shot test, aim for at least six distinct
shot types unless the storyboard calls for a deliberate visual pattern.

## 6.4 Animation Engine

-   Shared project clock.
-   Deterministic time evaluation: `evaluate(node, time)`.
-   Keyframe interpolation.
-   Easing library.
-   Action presets mapped to rig capabilities.
-   Animation blending for idle + walk, walk + wave, etc., only when
    supported.
-   No dependence on frame rate for position calculations.
-   Export must render at fixed timestamps.

Suggested keyframe format:

``` json
{
  "targetId": "char_hero",
  "property": "transform.x",
  "keyframes": [
    {"time": 0, "value": 0.2, "ease": "linear"},
    {"time": 2, "value": 0.8, "ease": "ease_in_out"}
  ]
}
```

## 6.5 Motion Graphics Engine

Support:

-   Text and kinetic typography.
-   Icons and SVG symbols.
-   Shapes, lines, arrows and callouts.
-   Lower thirds and title cards.
-   Counters and simple charts.
-   Highlight/spotlight overlays.
-   Transitions and graphic wipes.

Each graphic must have an ID, type, start time, duration, layer/depth,
transform and animation definition.

## 6.6 SVG Renderer and Canvas Export Bridge

### SVG Renderer

-   Create SVG DOM once per scene/shot graph.
-   Update attributes/transforms rather than rebuilding all nodes every
    frame.
-   Keep node IDs stable.
-   Support clipping, masks, groups and reusable symbols where feasible.
-   Cache loaded assets.
-   Expose a render/update interface independent of the AI layer.

### Canvas Export Bridge

-   Rasterize SVG at exact output dimensions.
-   Render frames at fixed project timestamps.
-   Preserve current 30 FPS default and allow project FPS.
-   Verify SVG external resource/CORS behavior.
-   Handle font readiness before recording.
-   Report unsupported media MIME types.
-   Keep MediaRecorder as the first export implementation.
-   Do not promise MP4 on all browsers; select a supported MIME type and
    name the file based on the actual output.

### Export regression rules

-   No blank first frame.
-   No missing SVG assets.
-   No font substitution after export begins.
-   No timing drift caused by real-time playback speed.
-   Recording must stop and release object URLs/tracks cleanly.
-   Export errors must be visible to the user.

------------------------------------------------------------------------

# 7. Validation and Auto Repair

Validation must be deterministic and separated into stages.

  -----------------------------------------------------------------------
  Stage                   Checks                  Failure behavior
  ----------------------- ----------------------- -----------------------
  JSON syntax             Parse succeeds          Blocking

  Schema                  Required fields and     Blocking
                          types                   

  References              sceneId, characterId,   Blocking
                          assetId, targetId exist 

  Assets                  Files load, SVG parses, Blocking or warning
                          dimensions valid        based on asset
                                                  importance

  Animation               Supported action,       Blocking or warning
                          finite values, valid    
                          keyframes               

  Composition             Subject in frame, layer Warning or blocking
                          order, safe areas       

  Render smoke test       Every expected node     Blocking for essential
                          produces a renderable   content
                          result                  
  -----------------------------------------------------------------------

## 7.1 Issue format

``` json
{
  "severity": "error",
  "code": "CHARACTER_VIEW_MISSING",
  "message": "Character char_hero has no side view asset.",
  "path": "assets.characters.char_hero.views.side",
  "entityId": "char_hero",
  "repair": {
    "available": true,
    "strategy": "generate_or_select_view"
  }
}
```

## 7.2 Auto-repair policy

Safe automatic repairs:

-   Fill optional fields with documented defaults.
-   Clamp values only when the schema explicitly defines allowed ranges.
-   Replace an invalid easing name with a documented default and log it.
-   Recalculate duration totals when the timeline contract explicitly
    permits it.

Repairs requiring user/AI confirmation:

-   Replacing a character with another character.
-   Changing a character's design.
-   Removing a scene object.
-   Changing a shot's intended camera angle.
-   Substituting a missing scene with a different location.

Never silently discard data.

------------------------------------------------------------------------

# 8. Legacy Compatibility and Migration

## 8.1 Migration strategy

1.  Preserve the uploaded HTML as the v1 baseline.
2.  Extract the existing renderer into `LegacyRenderer` without changing
    behavior.
3.  Create `LegacySceneConverter` to map v1 scene objects into v2.
4.  Preserve original data under `legacyData` during early migration.
5.  Create golden test projects from real v1 examples.
6.  Compare old and new preview/export results.
7.  Route supported v2 projects to the new renderer.
8.  Keep v1 projects on LegacyRenderer until conversion is proven.
9.  Remove legacy code only after a separate release decision.

## 8.2 Initial mapping table

  -----------------------------------------------------------------------
  v1 concept                          v2 target
  ----------------------------------- -----------------------------------
  `scenes[]`                          `scenes[]` plus `shots[]`

  `theme`                             Scene preset / environment

  `sky`, `ground`, `decor`            Scene environment and layers

  `shapes`                            Scene objects or graphics

  `actors[]`                          Shot actor instances

  `c`, `emoji`, `parts`, `svg`        Character definition / asset
                                      references

  `act`                               Animation action

  `x`, `y`, `to`, `dir`               Actor transform and motion

  `cam.from`, `cam.to`                Camera transform keyframes

  `cam.follow`                        Camera target/follow behavior

  `cam.shake`, `cam.roll`, `cam.dof`  Camera effects

  `tx`, `hl`, `ts`                    Subtitle track

  `gx`, `lt`, `am`                    Graphics, lighting and atmosphere
                                      tracks

  `s`, `d`, `tr`                      Shot start, duration and transition
  -----------------------------------------------------------------------

Mapping is not always one-to-one. The converter must document lossy
conversions and preserve unconverted fields in `legacyData`.

## 8.3 Required legacy tests

-   Load a v1 project.
-   Convert it to v2.
-   Validate the converted project.
-   Render the converted project.
-   Compare key frames with the v1 renderer.
-   Play and stop.
-   Record a short clip.
-   Verify subtitle behavior.
-   Verify voice preview behavior and disclose that browser TTS is not
    automatically embedded in the current canvas recording path.

------------------------------------------------------------------------

# 9. AI Director Workflow

Do not ask the LLM to produce the complete final project in one
response.

Use staged generation:

## Stage A --- Brief analysis

Output: - premise - audience/tone - duration target - visual style -
cast candidates - location candidates

## Stage B --- Cast lock

Output: - complete character list - stable character IDs - visual
descriptions - required views - rig type - required actions

Do not proceed until every recurring character has a canonical
definition.

## Stage C --- Storyboard

Output: - scene list - story beats - ordered shots - shot duration -
purpose of each shot

## Stage D --- Scene plans

Output: - scene environment - layer list - required assets -
lighting/weather/time of day

## Stage E --- Shot plans

Output: - camera type and angle - camera target - movement - actors in
frame - action and expression - graphics/effects

## Stage F --- Compile and validate

-   Resolve all IDs.
-   Check every referenced asset.
-   Check all required characters appear in planned shots.
-   Check shot durations sum to project duration within tolerance.
-   Check camera variety and composition.
-   Produce a machine-readable issue report.
-   Only then compile the final project JSON.

## AI reliability rule

The LLM proposes; deterministic code validates. The LLM must never be
the sole authority on whether a project is renderable.

------------------------------------------------------------------------

# 10. Development Phases and Acceptance Criteria

## Phase 0 --- Foundation and compatibility

Deliverables: - Repository/module skeleton. - `ProjectManager`. -
`project.schema.json` initial version. - `LegacySceneConverter`. -
`LegacyAdapter`. - `ProjectValidator` basic syntax/schema/reference
checks. - Golden v1 fixtures. - Build/load/save smoke tests.

Acceptance: - Existing v1 sample loads. - Converted v2 passes schema
validation. - No source v1 data is silently discarded. - Legacy
preview/play/stop/record still works. - Migration errors are reported
with paths.

## Phase 1 --- Character reliability

Deliverables: - Character Registry. - Asset Loader. - Character
Engine. - Basic humanoid rig. - Static SVG character support. - View
availability checks. - Supported action registry. - Character error
panel.

Acceptance: - Five registered characters can be referenced across
multiple shots. - Missing character IDs are blocking errors. - Missing
views are reported before export. - No silent blob fallback for required
production characters. - Same character ID retains design and color
consistency across shots.

## Phase 2 --- Scene quality and completeness

Deliverables: - Scene Graph. - Layer Engine. - Reusable background/prop
registry. - Scene presets converted from existing themes. - Parallax
depth. - Lighting and atmosphere settings. - Scene asset validation.

Acceptance: - At least five materially different scene compositions
render. - Missing required scene assets are reported. - Layer order is
deterministic. - Scene elements can be reused without duplicating asset
data.

## Phase 3 --- Camera and storyboard

Deliverables: - Scene/Shot separation. - Camera presets. - Camera
movement interpolation. - Target tracking. - Composition validator. -
Storyboard view.

Acceptance: - One scene can be used by multiple shots with different
camera settings. - At least six shot types work in the test project. -
Camera target references are validated. - Subjects remain in frame
unless intentional off-screen framing is specified. - Camera movement is
deterministic at fixed timestamps.

## Phase 4 --- SVG and Hybrid animation

Deliverables: - SVG Scene Graph. - SVG Renderer. - Animation Engine. -
Motion Graphics Engine. - Canvas Export Bridge. - Export regression
suite.

Acceptance: - Character, environment and graphics nodes are
independently addressable. - SVG graph is not rebuilt from scratch on
every frame. - Preview and export show equivalent compositions at
matching timestamps. - Existing recording workflow remains available. -
Export reports the actual format selected by the browser.

## Phase 5 --- AI Director and editor integration

Deliverables: - Staged AI planning pipeline. - JSON compiler. - Auto
Repair. - Character Studio. - Scene Studio. - Camera Studio. -
Storyboard/Shot Manager. - Timeline integration. - Advanced JSON editor.

Acceptance: - User idea can be converted into a validated project. - All
generated IDs resolve. - AI-generated project passes deterministic
validators before rendering. - User can edit a character, scene, camera
or graphic independently. - Existing project import/export remains
available.

------------------------------------------------------------------------

# 11. Test Matrix for the Four Main Problems

  -----------------------------------------------------------------------
  Problem                 Test                    Proposed pass condition
  ----------------------- ----------------------- -----------------------
  Visual quality          Generate the same brief Style remains
                          in three style presets  consistent within each
                                                  project; no accidental
                                                  overlap/clipping

  Missing characters      Five characters across  Every required actor
                          ten shots               instance resolves to a
                                                  registered character
                                                  and valid view

  Incomplete scenes       Ten different scene     Every required
                          briefs                  layer/asset resolves or
                                                  produces a visible
                                                  validation issue

  Single camera angle     Twenty-shot storyboard  At least six distinct
                                                  shot types in the test,
                                                  unless intentionally
                                                  overridden

  Character animation     Idle, walk, run, jump,  Stable transforms and
                          wave                    no unintended position
                                                  jumps

  Export                  720×1280 at 30 FPS      No blank first frame,
                                                  missing assets or
                                                  timing drift

  Compatibility           Existing v1 fixture     Loads and plays through
                                                  legacy or converted
                                                  path without data loss
  -----------------------------------------------------------------------

These are proposed engineering acceptance criteria, not test results.

## Required test projects

1.  **Cartoon Story:** 3--5 characters, multiple locations, recurring
    cast.
2.  **Explainer:** text, icons, diagrams and animated callouts.
3.  **Cinematic:** multiple camera types and camera movement.
4.  **Hybrid:** character animation combined with motion graphics.
5.  **Complex Scene:** multiple layers, foreground objects, atmosphere
    and several actors.

------------------------------------------------------------------------

# 12. Work Allocation: ChatGPT vs DeepSeek

Use one owner for architecture and integration. Delegate bounded
implementation tasks, not the entire application.

## ChatGPT --- Architecture owner and integration lead

Responsibilities: - Maintain this architecture and resolve design
conflicts. - Inspect the current baseline and define migration
contracts. - Review DeepSeek output for compatibility and correctness. -
Integrate modules into the actual project. - Run cross-module tests and
resolve integration issues. - Own final acceptance decisions. - Ensure
the original user-facing features remain available.

Do not ask multiple AIs to independently redesign the same contract.

## DeepSeek --- Implementation contributor

Delegate independent, testable tasks:

  ----------------------------------------------------------------------------------
  Task ID           DeepSeek assignment    Inputs            Expected output
  ----------------- ---------------------- ----------------- -----------------------
  DS-01             Draft JSON Schema v2   Section 5 and     `project.schema.json`
                                           baseline mapping  plus schema tests

  DS-02             Implement              Schema contract   Validator module and
                    ProjectValidator       and issue format  unit tests

  DS-03             Implement              v1-to-v2 mapping  Converter and fixture
                    LegacySceneConverter   table             tests

  DS-04             Implement AssetLoader  Asset contract    SVG/image loader with
                                                             cache and errors

  DS-05             Implement Camera math  Camera contract   Pure functions and
                    utilities                                tests

  DS-06             Implement Animation    Keyframe contract Deterministic
                    interpolation                            interpolation functions
                    utilities                                and tests

  DS-07             Review renderer        Current `frame()` Refactor proposal; do
                    separation             pipeline          not modify baseline
                                                             without approval
  ----------------------------------------------------------------------------------

### Parallelization rules

-   DS-01 should be completed and reviewed before DS-02.
-   DS-03 may start from the mapping table but must be checked against
    the final schema.
-   DS-04 can be developed independently after the asset reference
    contract is agreed.
-   DS-05 and DS-06 can be parallel tasks because they should expose
    pure functions.
-   DS-07 is analysis-only until the integration owner approves the
    refactor plan.
-   Do not let DeepSeek edit `index.html` or the original
    `clip-maker.html` while implementing isolated modules.
-   Every task must include tests, assumptions and known limitations.
-   Return complete files, not partial snippets, unless explicitly asked
    for a patch.

------------------------------------------------------------------------

# 13. Ready-to-use DeepSeek Prompts

## Prompt DS-01 --- JSON Schema v2

You are a senior JavaScript architect. Implement the initial JSON Schema
for the Clip Maker Hybrid Animation Generator.

Context: - The application is migrating from a single-file Canvas
renderer to modular engines. - The canonical format is ClipProject v2. -
Read the supplied architecture document, especially Sections 5, 7 and
8. - The project contains project settings, reusable assets, scenes,
shots and timeline tracks. - IDs must be stable and cross-references
must be explicit.

Tasks: 1. Create `project.schema.json`. 2. Define required fields,
types, enums and sensible bounds. 3. Define reusable `$defs` for
characters, assets, scenes, layers, shots, actors, cameras, graphics and
timeline tracks. 4. Support optional `legacyData`. 5. Do not invent
renderer-specific fields not supported by the architecture. 6. Provide
at least three valid fixtures and five invalid fixtures. 7. Explain
schema decisions and unresolved questions.

Constraints: - Use JSON Schema Draft 2020-12. - Do not use comments in
JSON. - Do not silently loosen required fields to make invalid examples
pass. - Do not implement the renderer.

Return: - Complete `project.schema.json`. - Fixture JSON files. - A
short README with validation instructions. - A list of assumptions and
risks.

## Prompt DS-02 --- Project Validator

Implement a deterministic JavaScript ProjectValidator for ClipProject
v2.

Requirements: 1. Validate JSON structure against the supplied schema. 2.
Validate unique IDs. 3. Validate all scene, character, asset and camera
target references. 4. Validate shot timing and finite numeric values. 5.
Return structured issues with severity, code, message, path, entityId
and optional repair suggestion. 6. Never silently mutate project data.
7. Provide unit tests for valid projects and malformed projects. 8. Keep
the validator independent from DOM, Canvas, SVG and AI APIs.

Use ES Modules. If Ajv is selected, document the dependency and version
assumptions. Return complete files and tests.

## Prompt DS-03 --- Legacy Scene Converter

Implement a migration adapter from the supplied Clip Maker v1 data to
ClipProject v2.

Important baseline details: - v1 uses `scenes[]`. - Scene fields include
theme/environment fields, actors, props, shapes, camera data,
subtitle/graphics/effects fields and scene timing. - Actor fields may
include `c`, `emoji`, `parts`, `svg`, `act`, `x`, `y`, `to` and `dir`. -
Camera may contain `from`, `to`, `follow`, `shake`, `roll` and `dof`. -
Existing v1 renderer must remain untouched.

Tasks: 1. Implement a pure conversion function. 2. Preserve unconverted
source data in `legacyData`. 3. Generate stable IDs where possible; do
not use random IDs on every conversion. 4. Split scenes into scenes and
shots without losing timing/order. 5. Map camera and actor data
according to the migration table. 6. Produce conversion warnings for
lossy or ambiguous mappings. 7. Add fixtures based on real v1 examples
and round-trip/consistency tests where feasible.

Do not modify the original HTML or renderer. Return complete module,
tests and a migration report.

## Prompt DS-04 --- Asset Loader

Implement an AssetLoader for browser-based ES Modules.

Requirements: - Load SVG and raster assets from project asset
references. - Cache loaded assets. - Expose loading state and structured
failures. - Validate that SVG documents parse. - Avoid injecting
untrusted SVG markup directly into the DOM without sanitization. -
Provide preload and release methods. - Support deterministic asset
lookup by ID. - Do not create Character or Scene logic. - Do not use a
server or external network unless explicitly configured.

Return complete module, tests or testable mocks, API documentation and
security notes.

## Prompt DS-05 --- Camera Math Utilities

Implement pure camera math utilities for the Clip Maker v2 Camera
Engine.

Requirements: - Support normalized viewport coordinates. - Support zoom,
pan, roll, follow target and interpolation between camera keyframes. -
Support shot types and angle metadata without hardcoding the UI. -
Validate finite values and prevent invalid zoom. - Use deterministic
time-based calculations. - Document coordinate conventions and transform
order. - Include unit tests for center framing, edge clamping, zoom,
pan, interpolation and follow target.

Do not access DOM or Canvas. Return complete source and tests.

## Prompt DS-06 --- Animation Interpolation Utilities

Implement deterministic keyframe interpolation utilities.

Requirements: - Support linear, ease-in, ease-out and ease-in-out. -
Evaluate a property at arbitrary project time. - Handle
before-first-keyframe and after-last-keyframe behavior explicitly. -
Validate duplicate timestamps and non-finite values. - Do not depend on
requestAnimationFrame. - Do not manipulate SVG or Canvas directly. -
Include unit tests for boundary times, midpoints, easing and invalid
keyframes.

Return complete source, tests and a short API document.

## Prompt DS-07 --- Renderer Refactor Review (analysis only)

Review the supplied `clip-maker.html` renderer architecture.

Focus on the existing `frame(time)` responsibilities: - camera
transform - background/theme - shapes - props - actors - held items -
foreground shapes - lights - atmosphere - cinema effects - graphics -
subtitles - transitions

Produce: 1. A dependency map. 2. A safe extraction order. 3. Which
functions can move unchanged into LegacyRenderer. 4. Which functions
require new interfaces. 5. Risks to playback and MediaRecorder. 6. A
regression test plan.

Do not edit files. Do not propose deleting the existing renderer before
parity tests pass.

------------------------------------------------------------------------

# 14. Integration Protocol for AI-generated Code

Every DeepSeek delivery must include:

1.  Task ID.
2.  Files created/changed.
3.  Complete source code.
4.  Tests and exact commands to run them.
5.  Expected test output.
6.  Dependencies and version assumptions.
7.  Known limitations.
8.  Decisions that affect other modules.

Integration owner checklist:

-   [ ] Does it follow the agreed schema?
-   [ ] Does it use stable IDs?
-   [ ] Does it avoid global mutable state?
-   [ ] Does it avoid hidden network calls?
-   [ ] Does it avoid changing legacy behavior?
-   [ ] Are errors structured and actionable?
-   [ ] Are tests included?
-   [ ] Does it work in the target browser environment?
-   [ ] Are security implications documented?
-   [ ] Are all new contracts reflected in this document?

If a module changes a shared contract, stop integration and update the
architecture/schema first.

------------------------------------------------------------------------

# 15. Immediate Sprint: First Deliverable

Do not start all six phases at once. The first sprint should produce a
safe foundation.

## Sprint 1 tasks

1.  Create a backup copy of the original `clip-maker.html`.
2.  Create the repository skeleton.
3.  Extract or preserve the current implementation as `LegacyRenderer`
    without behavior changes.
4.  Draft and review `project.schema.json`.
5.  Implement `ProjectManager`.
6.  Implement `LegacySceneConverter`.
7.  Implement basic `ProjectValidator`.
8.  Create at least two v1 fixture projects.
9.  Add a simple test page that loads a v2 project and displays
    validation results.
10. Confirm the original Preview, Play, Stop and Record workflow still
    works.

## Sprint 1 definition of done

-   Original file is preserved.
-   New modules load through ES Modules.
-   A v1 fixture converts to v2.
-   Converted data passes schema/reference validation or reports
    specific errors.
-   No unknown field is silently discarded.
-   Legacy playback and recording remain available.
-   A README explains how to run the project locally.

Do not begin a complete UI redesign in Sprint 1.

------------------------------------------------------------------------

# 16. Risks and Technical Decisions to Resolve

  -----------------------------------------------------------------------
  Risk / decision         Why it matters          Recommended handling
  ----------------------- ----------------------- -----------------------
  SVG security            SVG can contain unsafe  Sanitize and restrict
                          markup or external      asset sources
                          references              

  SVG-to-Canvas export    Fonts, external images  Build a dedicated
                          and CORS may break      export smoke test early
                          rasterization           

  Browser recording       MP4 support differs by  Detect supported MIME
  format                  browser                 types at runtime

  Browser TTS             Existing speech preview Keep preview TTS;
                          is not automatically    design audio export
                          part of canvas          separately
                          recording               

  Character back/side     A single SVG cannot     Require explicit view
  views                   guarantee correct views assets or a supported
                                                  rig

  AI hallucinated IDs     Can cause missing       Validate references
                          actors/assets           deterministically

  Project size            Embedded SVG and        Use asset registry and
                          duplicate assets        external/IndexedDB
                          inflate JSON            asset storage

  Performance             Rebuilding SVG nodes    Build once; update
                          every frame is          transforms
                          expensive               

  Schema evolution        Future project versions Version schema and
                          may break old clients   provide explicit
                                                  migrations

  DeepSeek integration    Parallel AI changes can Assign bounded tasks
                          conflict                and use one integration
                                                  owner
  -----------------------------------------------------------------------

------------------------------------------------------------------------

# 17. Final Implementation Order

The recommended order is:

1.  Project Schema + ProjectManager
2.  Legacy Adapter + migration fixtures
3.  Project/Reference Validator
4.  Asset Loader
5.  Character Registry + Character Engine
6.  Character Rig + view/action validation
7.  Scene Graph + Layer Engine
8.  Scene asset validation
9.  Camera Engine + shot presets
10. Animation Engine
11. SVG Scene Graph + SVG Renderer
12. Canvas Export Bridge
13. Motion Graphics Engine
14. AI Director staged planning
15. Studio UI and timeline integration

This order addresses data integrity first, then visual reliability, then
camera and rendering, and only then automates the whole workflow with
AI.

------------------------------------------------------------------------

# 18. Definition of Product Success

The project is ready for a broader release when:

-   Existing v1 projects can still be opened or migrated with clear
    reports.
-   Every required character in a shot resolves to a valid character and
    view.
-   Every required scene layer and asset resolves or produces a visible
    error.
-   A single scene can be reused across different camera shots.
-   Camera framing and movement are deterministic.
-   Character animation and motion graphics can coexist.
-   Preview and export are visually consistent at matching timestamps.
-   The AI Director produces validated project data rather than
    unverified JSON.
-   The user can inspect and edit characters, scenes, shots, camera and
    graphics independently.
-   No critical failure is hidden by a generic fallback.

**Architecture decision summary:** ClipProject v2 is the data contract;
SVG Scene Graph is the editable visual structure; Character, Scene,
Camera, Animation and Motion Graphics are independent engines; AI
Director orchestrates planning; Canvas remains the initial export
bridge; LegacyAdapter protects existing projects and functionality.
