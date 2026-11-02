# DS-12F — Browser ClipProject v2 Validation Integration

Status: Discovery complete; implementation plan draft. No application code changed by this document.

## 1. Goal

Integrate the existing ClipProject v2 validation pipeline into Hybrid Studio so an imported JSON document receives an explicit schema-and-semantic validation result before any future runtime handoff. Preserve the DS-12E original-text import/export guarantees.

DS-12F does not implement legacy conversion, asset loading, rendering, playback, or export.

## 2. Verified repository baseline

The following facts were inspected on the default branch:

- `schema/project.schema.json` defines ClipProject v2 using JSON Schema Draft 2020-12.
- `package.json` already declares `ajv` and `ajv-formats`.
- `validators/SchemaValidator.js` compiles the schema with Ajv 2020, `allErrors: true`, `strict: true`, and `strictRequired: false`.
- `validators/ProjectValidator.js` exposes synchronous `validateProject(input)` and runs an input guard, schema validation, then reference validation only when the schema layer passes.
- The result contract includes `valid`, `errors`, `warnings`, `all`, and `meta`. Issue paths use RFC 6901 JSON Pointers.
- `validators/ReferenceValidator.js` is the existing semantic/reference validation layer used by `ProjectValidator`.
- Node tests already cover valid fixtures, schema-invalid fixtures, reference-invalid fixtures, and many semantic rules.
- The current browser entry point is `clip-maker.html` with a native `type="module"` script. No browser bundler/build script is declared in `package.json`.
- `SchemaValidator.js` imports Node built-ins (`node:fs`, `node:path`, `node:url`) and reads the schema from disk at module load. It cannot be imported directly by the browser as written.
- DS-12E `SafeImport` retains exact original source text. The UI currently reports JSON imported but not validated; export downloads the retained source text.

## 3. Proposed validation flow

1. User selects a JSON file.
2. DS-12E SafeImport parses the text and retains the exact original source string.
3. The browser validation adapter receives the parsed JSON object. It does not re-parse or normalize the source text.
4. Layer A validates the object against the canonical Draft 2020-12 schema.
5. If Layer A passes, Layer B runs the existing approved reference/semantic checks.
6. Hybrid Studio displays a distinct validation state and structured issues.
7. Original JSON export continues to use the retained source text, regardless of validation outcome.

Validation status must never be inferred from successful JSON parsing. A parseable JSON document may still be invalid ClipProject v2.

## 4. Browser integration boundary

The current Node validator must remain usable by the existing Node test suite. Do not replace its Node file-loading behavior with browser-only globals.

The browser path needs a browser-compatible way to:
- load the exact schema file from the same application origin;
- provide Ajv 2020 and ajv-formats to browser code;
- reuse the approved semantic/reference validation logic without importing Node-only modules;
- compile the schema once and reuse the compiled validator;
- surface schema-load or validator-initialization failures as infrastructure errors, not as project validation failures.

A bundling strategy is required because the current page has no bundler and bare npm package imports are not resolved by a plain browser page. Select and document the build strategy before implementation. Do not silently depend on a public CDN or network access at runtime.

## 5. UI behavior requirements

Display JSON import and project validation as separate states.

Recommended states:
- `not_validated`: JSON was parsed but validation has not completed.
- `valid`: both schema and semantic/reference layers passed.
- `invalid`: one or more project validation errors were returned.
- `validation_unavailable`: schema could not load or validator initialization failed.

For invalid projects:
- show total error count;
- show each issue code, message, and JSON Pointer path;
- keep long issue lists readable on mobile;
- do not discard or rewrite the imported project;
- keep Original JSON export available.

For valid projects:
- show that ClipProject v2 validation passed;
- do not imply rendering or runtime readiness beyond the validation contract.

Do not label the project valid if only the schema layer ran. The intended success state requires both layers.

## 6. Data and safety invariants

- Never mutate the parsed project during validation.
- Never reserialize the original source for Original JSON export.
- Never convert legacy fields or read `legacyData` for rendering.
- Do not add defaults, normalize values, or repair invalid documents automatically.
- Do not invoke any renderer or runtime module.
- Do not alter the canonical schema or approved validation rules as part of UI integration.
- Schema-load/build failures must not be misreported as user data errors.
- A failed validation must not prevent the user from exporting their exact original source.

## 7. Implementation sequence

### DS-12F-A — Browser build and adapter design
- Choose a local, reproducible browser bundling approach.
- Keep the Node validator API and tests intact.
- Define browser adapter initialization and schema-loading failure behavior.
- Verify the browser bundle does not require Node built-ins at runtime.

### DS-12F-B — Validation service
- Implement browser-compatible Layer A and Layer B orchestration.
- Reuse existing issue codes and JSON Pointer paths.
- Compile/cache the schema validator once.
- Add unit tests for valid, schema-invalid, reference-invalid, non-object, and initialization-failure cases.

### DS-12F-C — Hybrid Studio UI
- Integrate validation after successful JSON parsing.
- Display validation state and structured issues.
- Preserve Original JSON export behavior.
- Keep import, validation, and rendering states distinct.

### DS-12F-D — Verification
- Run the full existing Node test suite.
- Add and run browser-adapter tests.
- Verify valid, schema-invalid, and reference-invalid fixtures in the browser.
- Verify validation failure does not disable exact original export.
- Verify schema-load failure is reported as infrastructure failure.
- Verify mobile layout and no renderer invocation.

## 8. Acceptance criteria

- Existing Node validator behavior and tests remain unchanged.
- Browser validation uses the canonical schema and approved reference rules.
- Valid fixtures pass both validation layers.
- Schema-invalid fixtures fail at Layer A and skip Layer B.
- Reference-invalid fixtures pass Layer A and fail at Layer B.
- Issue paths and codes are displayed without lossy rewriting.
- JSON parsing success is never presented as schema validation success.
- Exact Original JSON export remains available and byte-preserving after both valid and invalid validation results.
- No conversion, rendering, playback, or video export is introduced.

## 9. Open implementation decision

The repository currently has Ajv dependencies but no browser bundler. A local build strategy must be selected and verified before adding browser imports. This plan intentionally does not prescribe a CDN or assume browser support for Node-only imports.
