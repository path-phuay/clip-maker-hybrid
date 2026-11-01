# DS-11 — New Application Shell

Status: Implemented in the repository; browser verification pending.

## Added files

- `clip-maker.html`: New Hybrid application entry point. It is separate from the legacy source.
- `src/app.js`: Wires the UI to ProjectManager and displays basic project metadata.
- `src/core/ProjectManager.js`: Browser JSON file loading, in-memory project state, and JSON serialization.
- `styles/app.css`: Responsive application shell styling.

## Supported in this stage

- Open a local JSON file.
- Parse JSON and require a top-level object.
- Display title, schema version, duration, resolution, scene count, and shot count when present.
- Export the currently loaded JSON document.

## Explicit limitations

- JSON parsing is not ClipProject v2 schema or semantic validation.
- The Node/AJV validator is not yet bundled or adapted for browser use.
- No renderer, preview playback, timeline, audio, effects, or video export is connected.
- The Legacy Renderer is neither imported nor modified.
- This stage does not convert legacy project data.

## Verification required

Open `clip-maker.html` in a browser served from a local HTTP server and verify:
1. The shell and stylesheet load.
2. A valid JSON object can be opened and its summary is displayed.
3. Malformed JSON and non-object JSON show an error.
4. Export JSON produces the same project data.
5. Mobile layout remains usable.

Do not mark DS-11 fully accepted until these browser checks are run.
