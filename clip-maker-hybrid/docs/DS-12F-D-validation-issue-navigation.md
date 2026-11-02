# DS-12F-D — Validation Issue Navigation & Context

Status: Implemented; pending local verification.

## Scope
- Resolve validation issue JSON Pointers using RFC 6901.
- Present readable paths and selectable issue entries.
- Show the exact resolved value in a read-only context panel.
- Report missing or malformed paths without throwing or guessing.
- Preserve the existing validation and original-text export boundaries.

## Implementation
- `src/core/JsonPointer.js` parses escaped pointer segments, resolves object properties and array indexes, and formats paths for display.
- The UI creates issue-selection buttons and displays the selected issue's code, message, pointer, readable path, and JSON value.
- Context is rendered with text-only DOM APIs and JSON serialization; imported project data is never inserted as HTML.
- Selecting an issue changes only the UI selection state. It does not mutate the project or source text.

## Boundaries
No editing, quick fixes, automatic repair, normalization, default insertion, migration, conversion, renderer invocation, playback, or video export.

## Verification
Run `npm test`, then verify:
1. Multiple issues can be selected and each shows the matching context.
2. Nested object and array paths resolve correctly.
3. Root-level and missing paths display safe explanatory states.
4. Original JSON export still matches the source exactly.
5. Desktop and narrow mobile layouts remain usable.
