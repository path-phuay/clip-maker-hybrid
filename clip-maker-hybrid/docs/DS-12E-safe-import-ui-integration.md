# DS-12E — Safe Import UI Integration

Status: Implemented in the application shell; browser verification pending.

## Purpose
Connect the DS-12D preservation-first importer to Hybrid Studio without enabling legacy conversion, schema validation, or rendering.

## Changes
- ProjectManager imports through importProjectText and retains the DS-12D import record.
- Export Original downloads the exact source text through exportOriginalText without re-serialization.
- The UI displays the informational classification, legacy-like top-level key hints, and safety warnings.
- Files larger than 10 MiB are rejected before reading.
- Preview remains explicitly disconnected.

## Workflow
1. Open a JSON file.
2. Parse it as a top-level JSON object and retain its exact source text.
3. Display project summary and key-name inspection.
4. Export the retained original text.

## Safety boundaries
- No ClipProject v2 schema or semantic validation.
- No v1-to-v2 conversion or normalization.
- No defaults, units, timing semantics, or renderer behavior are inferred.
- Legacy-like key names are informational only.
- The 10 MiB guard is a UI limit, not a complete hostile-file sandbox.

## Browser verification
- Open valid JSON and inspect summary and import information.
- Test a legacy-indicator fixture.
- Export and compare the downloaded file byte-for-byte with the source.
- Test malformed JSON and non-object roots.
- Confirm files over 10 MiB are rejected.
- Confirm Preview remains disconnected and mobile layout is usable.

Node tests cover the DS-12D module. File picker, download, size guard, and layout require manual browser verification.
