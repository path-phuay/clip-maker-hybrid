# DS-12F-C — Hybrid Studio Validation UI Integration

Status: Implemented; pending local verification.

## Scope

- Initialize the browser validation service using the canonical local schema.
- Validate each successfully parsed JSON project against ClipProject v2 schema and existing reference rules.
- Display validator initialization availability, valid/invalid state, completed validation layers, and every returned error's code, message, and JSON Pointer.
- Keep exact original JSON export enabled after successful import regardless of validation outcome.

## Behavior

The UI keeps import status separate from validation status. A JSON parse success is never reported as ClipProject v2 validity. A valid state is shown only when both schema and reference validation pass. Schema failures report the schema layer; reference failures report schema then reference.

If the validator cannot initialize, the project may still be imported and exported, but validation is shown as unavailable. This is an infrastructure state, not a project-invalid result.

## Preserved boundaries

- No mutation, normalization, default insertion, or repair of the imported project.
- Original export continues to use SafeImport's retained source text.
- No reading of `legacyData` for runtime behavior.
- No legacy conversion, asset loading, renderer invocation, playback, or video export.
- Canonical schema and Node validation implementation are unchanged.

## Verification required

Run `npm test`, `npm run build:validation`, then verify in the browser:
1. Valid fixture displays Valid and both layers.
2. Schema-invalid fixture displays Invalid and schema layer.
3. Reference-invalid fixture displays Invalid and both layers.
4. Original JSON export remains available for valid and invalid imports and matches the original source.
5. Simulate schema fetch failure and confirm Unavailable does not disable export.
6. Confirm no renderer/runtime invocation and inspect mobile layout.
