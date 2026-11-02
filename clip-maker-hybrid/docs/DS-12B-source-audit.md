# DS-12B — Legacy Renderer Source Audit

Status: **Source located, preserved, and inspected. Mapping implementation remains gated.**

## 1. Source provenance and integrity

- Source: `clip-maker.html` recovered from Personal Library.
- Repository destination: `legacy/clip-maker.v1.html` (immutable baseline).
- Format: single-file HTML with inline CSS and JavaScript.
- Size: 89,085 bytes; 802 lines.
- Inline JavaScript: 82,562 bytes; 713 lines.
- SHA-256: `f9d5bed16dad4d1c031f8f45a4b01d3681ac375211d5b2701064919a96a42072`.

The baseline copy is byte-for-byte. All integration work must use a separate copy.

## 2. Verified input contract

`build()` (line 253) accepts either a top-level JSON array (treated as scenes) or an object containing a non-empty `scenes` array. It also reads:
- `cast`: reusable actor defaults merged by actor `who`.
- `assets`: object of inline SVG strings; values containing `<svg` are loaded as data URLs.
- `style`: renderer style selection.

The parser first uses `JSON.parse`, then attempts a permissive repair for leading decimals and trailing commas. This behavior is legacy-specific and must not be silently adopted by Hybrid's canonical import pipeline.

Scene fields evidenced in runtime include:
- timing/text: `w`, `d`, `text`, `tx`, `highlight`, `hl`, `ts`, `gat`;
- environment: `theme`, `sky`, `ground`, `hz`, `decor`, `geo`, `seed`;
- visual layers: `shapes`, `actors`, `props`, `crowd`, `lt`, `am`, `cine`, `gx`;
- camera: `cam.from`, `cam.to`, `cam.follow`, `cam.shake`, `cam.roll`, `cam.dof`;
- transition: `tr`.

The embedded `SAMPLE` is an actual renderer-owned example, but one example does not prove every accepted variant.

## 3. Timing semantics

Verified in `build()` and `frame()`:
- Scene `d` is used when present.
- Otherwise estimated duration is `max(1.5, (text || tx || '').length * 0.09)`.
- Scene `w` is used as a relative weight when the global duration option is non-zero.
- With global duration `D`, each duration is `w[i] / sum(w) * D`; otherwise the per-scene `d`/estimate is used.
- Scene start positions are generated cumulatively in source order.
- `frame(time)` computes normalized progress `k = clamp((time - scene.s) / scene.d)`.
- `loop()` uses seconds from `performance.now() / 1000`.
- Recording captures `cv.captureStream(30)`.

Important: `w` is a weight under global duration override, not a literal duration. Do not map v2 `shots[].start`/`duration` without a separately approved policy. Do not assume source `s` is a canonical input start; `build()` generates cumulative starts.

## 4. Coordinate and camera semantics

- Canvas backing size is 720×1280.
- `frame()` applies transforms in this order: translate to canvas center, scale zoom, rotate roll, then translate by camera focus and shake.
- `cam.from`/`cam.to` interpolate with `ez(k)`.
- `cam.follow` resolves through actor positions (`POSG`) and applies a vertical offset of `0.12`.
- `cam.roll` is degrees converted to radians.
- `cam.dof` is a Canvas blur filter in pixels, capped at 12.
- `cam.shake` applies time-varying x/y translation using `sin(time*47)` and `cos(time*53)`.

These are verified semantics for this source version only, not an approved v2 mapping.

## 5. Verified frame draw order (`frame()`, line 729)

1. Camera transform setup and optional DOF blur.
2. Background/theme (`drawBG`).
3. Back shapes (`drawShapes(..., false)`).
4. Back props (`props(..., true)`).
5. Actors plus generated crowd (`actors`).
6. Held items (`held`).
7. Front props (`props(..., false)`).
8. Front shapes (`drawShapes(..., true)`).
9. Lights (`lights`).
10. Restore camera transform.
11. Atmosphere (`atmos`).
12. Cinema treatment (`cinema`) unless `cine === false`.
13. Motion graphics (`gfx`).
14. Subtitle (`subtitle`) if enabled.
15. Transition overlay and final fade-out.

Do not reorder these stages during extraction without golden-frame regression coverage.

## 6. Subsystem inventory

| Area | Functions / locations | Notes |
|---|---|---|
| Scene build | `build()` line 253 | Parses JSON, derives durations and cumulative starts |
| Actor system | `resolveActor`, `motion`, `emojiActor`, `partsActor`, `actors`, `fig`, `cat4`, `critter`, `kang`, `svgActor` | Procedural, parts, emoji and SVG paths |
| Backgrounds | `pickTheme`, `drawBG`, `custom`, `road`, `room`, `city`, `nature`, `space`, `shophouse`, `yamo`, `ring`, `geoLayers` | Theme aliases and custom environment |
| Props / geometry | `drawShape`, `drawShapes`, `decor`, `decorX`, `props`, `held`, `inferHold` | Back/front ordering matters |
| Lighting / atmosphere | `lights`, `atmos`, `glow`, `shadowAt` | Canvas compositing and filters |
| Camera | `frame`, `kf`, `wpt` | Transform math embedded in frame pipeline |
| Motion graphics | `gfx` | `card` and `title` variants observed |
| Subtitles | `subtitle` | Thai word segmentation when available |
| Playback / TTS | `play`, `loop`, `stop`, `speak`, `voices` | Browser Speech Synthesis |
| Recording | `record` | Real-time Canvas capture via MediaRecorder |

## 7. Risks and constraints

- Renderer is tightly coupled to DOM IDs, Canvas globals, UI controls and browser APIs.
- `build()` mutates global runtime state; it is not a pure converter.
- SVG assets are loaded asynchronously from inline strings.
- `fail()` logs draw errors and continues, potentially hiding partial render failures.
- Unknown actor types may fall back to a generic blob; Hybrid must validate before invocation rather than silently accept this.
- Speech Synthesis is separate from the Canvas stream. The UI warns exported video has no narration audio.
- Recording is real-time at 30 FPS; MIME selection depends on browser support.
- Google Fonts are loaded externally and may fall back offline.
- Fixed DOM IDs/styles make direct DOM co-location with Hybrid unsafe.

## 8. Integration boundary

Recommended: retain the baseline unchanged and run a separate Legacy Mode document in an isolated iframe, communicating through a narrow `postMessage` protocol. Do not merge its CSS/DOM into the Hybrid document.

The current DS-11 shell accepts ClipProject v2, while this renderer accepts raw v1 scene JSON/scene arrays. The current `legacyData.originalScene` fixture is partial, not a complete raw v1 payload. Therefore safe v2→v1 conversion is not yet available. A bridge must not be invoked with a v2 project or partial `legacyData`.

A first bridge may support explicit raw-v1 import only. Canonical v2 conversion remains gated until mapping policy and fixtures are approved.

## 9. Next implementation sequence

1. Add this exact source as `legacy/clip-maker.v1.html` (immutable baseline).
2. Update DS-12C to reflect that executable source is now available in Library and source-dependent facts have been verified.
3. Keep `LegacyAdapterContract.js` read-only until converter contract approval.
4. Build a separate integration copy / iframe host for raw-v1 only.
5. Add genuine raw-v1 fixtures based on embedded `SAMPLE` and additional field families.
6. Define v2→v1 mappings only for verified fields; unsupported features must block or remain preserve-only.
7. Run browser smoke tests and golden-frame comparisons before enabling renderer invocation.

## 10. Verification performed

- Byte count and SHA-256 calculated from recovered source.
- Inline script extracted and checked using `node --check`: **passed**.
- Browser execution, preview playback, TTS and video recording were **not** executed in this audit.
