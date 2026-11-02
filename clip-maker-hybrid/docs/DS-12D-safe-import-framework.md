# DS-12D — Safe Import Framework

Status: Implemented as a preservation-first JSON text import module. UI integration and full ClipProject validation are not included in this stage.

## 1. Purpose

Provide a safe foundation for opening project JSON while the original v1 renderer and its input contract remain unavailable.

DS-12D parses a JSON text document, requires a top-level object, retains the exact original source text, and reports a small set of legacy-like key-name indicators. It does not convert, normalize, validate, or render the document.

## 2. Added files

- `src/adapters/SafeImport.js`
- `tests/safe-import.test.js`

## 3. API

### `importProjectText(sourceText, options?)`

- Requires a string containing valid JSON.
- Requires the parsed root to be an object (not null or an array).
- Returns a DS-12D import record with the parsed document and exact original source text.
- Reports top-level key names matching the documented v1 concept inventory as unverified legacy indicators.
- Sets `conversionAvailable` and `rendererInvocationAllowed` to `false`.

### `exportOriginalText(importRecord)`

Returns the exact original source string. It deliberately does not call `JSON.stringify`, so whitespace, key order, and original formatting are retained.

## 4. Preservation and safety guarantees

- Parsing does not rewrite the source text.
- Export returns the retained source text verbatim.
- No conversion or renderer call occurs.
- Key-name indicators are informational only; they do not establish that a document is v1.
- Unknown fields remain present in the parsed object and in the retained original text.
- Malformed JSON and non-object roots are rejected with explicit errors.

## 5. Explicit non-goals / limitations

- No ClipProject v2 schema or semantic validation is performed.
- No raw v1 schema is claimed or inferred.
- No v1-to-v2 mapping is executed.
- No defaults, units, timing rules, IDs, or renderer behavior are inferred.
- The module is not yet wired into the DS-11 browser UI.
- This stage does not provide a security sandbox for hostile resource consumption; callers should apply file-size limits at the UI boundary before accepting untrusted large files.

## 6. Test coverage

The tests cover exact source preservation, legacy-indicator reporting without conversion, non-mutation, malformed JSON, non-object roots, invalid API inputs, and the distinction between unclassified JSON and verified ClipProject v2.

## 7. Exit criteria

DS-12D module implementation is complete when the module and tests are committed and the local test suite passes. Browser UI integration, size limits, and schema validation require separate scoped work.
