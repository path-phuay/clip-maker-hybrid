# Clip Maker Hybrid

ClipProject v2 validation foundation and the staged Hybrid application shell.

## Current capabilities

- ClipProject v2 JSON Schema and fixtures.
- Node.js validation and test suite (see `npm test`).
- DS-11 browser shell at `clip-maker.html`.
- Browser-side JSON project import, summary display, and JSON export.

## DS-11 limitations

The application shell currently parses JSON but does not yet run the complete ClipProject validator in the browser. It does not include a Hybrid renderer, preview playback, effects execution, timeline editing, or video export. The original Legacy Renderer remains separate and unchanged.

See:
- `docs/DS-10-hybrid-runtime-architecture.md`
- `docs/DS-11-application-shell.md`

## Development

Requires Node.js with ES Modules support.

```bash
npm install
npm test
```

Serve the repository directory through a local HTTP server to use `clip-maker.html`; ES module imports should not be tested by opening the file directly with a `file://` URL.
