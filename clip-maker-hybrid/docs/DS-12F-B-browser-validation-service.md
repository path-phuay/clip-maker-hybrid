# DS-12F-B — Browser Validation Service

Status: Source added; build and Windows/browser verification pending.

## Scope

Adds a browser-compatible validation service without changing the existing Node validator or Hybrid Studio UI.

## Implementation

- `src/browser/ProjectValidationService.js` loads the canonical schema through Fetch, compiles it with Ajv 2020 using the same strict options as the Node validator, and reuses the existing `ReferenceValidator` and issue catalog.
- Schema fetch, JSON parsing, and Ajv compilation failures throw initialization errors. They are infrastructure failures, not project validation issues.
- The service exposes `validateProject(input)` with the existing result shape: `valid`, `errors`, `warnings`, `all`, and `meta`.
- Schema failures skip Layer B. Reference validation runs only after Layer A succeeds.
- `src/browser/validation-entry.js` is the browser bundler entry point.
- Tests cover valid projects, schema-invalid projects, reference-invalid projects, invalid roots, schema-fetch failure, and schema-compilation failure.

## Build

The browser entry must be bundled for `platform=browser` because the Hybrid Studio page is served as native ES modules and does not resolve bare npm package imports. The generated bundle is a build artifact and is not checked in by this change.

## Boundaries

- No application UI integration in this substep.
- No legacy conversion, rendering, playback, or asset loading.
- No schema mutation, project normalization, or automatic repair.
- The existing Node validator and its behavior remain unchanged.
- Browser build and runtime behavior are not yet verified on Windows.
