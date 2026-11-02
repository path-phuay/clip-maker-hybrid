# DS-12F-E — Import & Validation State Lifecycle Hardening

Status: Implemented; pending local automated and browser verification.

## 1. Goal

Make the browser import/validation lifecycle deterministic when users open multiple files, select an oversized file, encounter a parse error, or open a file while validator initialization is still in progress.

This stage is limited to UI and state coordination. It does not change schema rules, reference rules, SafeImport semantics, JSON Pointer behavior, or renderer boundaries.

## 2. Verified current behavior and risks

Inspection of the current `src/app.js` and `src/core/ProjectManager.js` shows:

- A file larger than 10 MiB is rejected before `ProjectManager.loadFile`, but the previously loaded project, summary, inspection, validation issues, and Export button are not cleared. The UI can therefore continue showing an older project after the user attempts to open a different file.
- If JSON parsing fails, the error message and project status change, but the previously loaded project and export state remain. This can make the visible status refer to the failed file while the summary/export still refer to the prior file.
- File reading is asynchronous. Rapidly selecting files can allow an earlier `file.text()` operation to finish after a later selection and overwrite the newer selection.
- Validator initialization and file loading are asynchronous independently. The code revalidates `manager.project` when initialization completes, but there is no explicit request identity to protect against stale load completion.
- `ProjectManager.clear()` already exists and can clear the current in-memory import record without changing any source file.

These are UI lifecycle consistency risks, not schema-validation defects.

## 3. Proposed behavior

### 3.1 New file selection is a new import attempt

As soon as a new file selection is accepted for processing:

- Clear the previous in-memory project and import record.
- Disable Original JSON export until the new file has been parsed successfully.
- Reset summary, import inspection, validation issue list, selected issue context, and status to a clear loading/pending state.
- Keep the original export guarantee for a successfully imported file: export must still return the exact source text.

### 3.2 Oversized file

For files larger than 10 MiB:

- Reject before reading file contents.
- Keep no previous project active for the rejected selection.
- Disable export and show the existing 10 MiB limit explanation.
- Do not invoke validation.

### 3.3 Parse/read failure

For read or JSON parse failures:

- Show a clear load failure state.
- Keep no previous project or export record active.
- Clear stale summary and validation results.
- Do not invoke validation.

### 3.4 Rapid selection protection

- Assign a monotonically increasing request token to each accepted file-selection attempt.
- Only the latest request may update the UI or become the active project.
- A stale asynchronous completion must be ignored.
- Do not add timers, background workers, or external dependencies.

### 3.5 Validator initialization coordination

- Preserve the existing `Initializing`, `Ready`, and `Unavailable` distinction.
- If a project is loaded before validator initialization completes, validate that current project once the service becomes ready.
- If initialization fails, preserve the successfully imported source and keep Original JSON export available; report validation unavailable as infrastructure status.
- Never classify validator infrastructure failure as invalid project data.

## 4. Invariants

- Original source text remains byte-preserved by SafeImport/export.
- Validation is read-only.
- No automatic repair, normalization, defaults, migration, or conversion.
- No renderer invocation, playback, asset loading, or video export.
- Existing Node validator behavior and schema/reference rules remain unchanged.
- A failed new import must not leave a stale prior project appearing to be the newly selected file.

## 5. Implementation files expected

- `src/app.js`: centralize reset/loading/error states and guard asynchronous completion with request identity.
- `src/core/ProjectManager.js`: use existing `clear()`; change only if a verified race or lifecycle requirement cannot be handled in the UI.
- `tests`: add focused tests for request ordering/state coordination where testable without a browser, and preserve existing SafeImport/ProjectManager contracts.
- `docs/DS-12F-E-import-validation-state-lifecycle.md`: record behavior, tests, and limitations.

No schema, validator, validation bundle, or CSS changes were made.

## 6. Verification plan

1. Run full `npm test`.
2. Open a valid file, then select an oversized file: prior project summary and export must be cleared; validation must not run for the oversized file.
3. Open a valid file, then select malformed JSON: prior project and export must be cleared; parse failure must be visible.
4. Open two files in quick succession: only the most recently selected file may become active.
5. Test file selection while validator initialization is still pending, where reproducible.
6. Verify Original JSON export SHA256 still matches the exact imported source for a successfully loaded file.
7. Confirm validator initialization failure still permits exact export after successful JSON import.
8. Recheck Desktop and Mobile layouts.

## 7. Acceptance criteria

- No stale project, validation result, or export record survives a failed new import attempt.
- Only the latest file-selection request can update the active project/UI.
- Validator readiness and project import state remain independent and correctly coordinated.
- Exact Original JSON export remains available for successfully parsed files even when validation is unavailable.
- Full test suite passes and the browser scenarios above are verified.
- No renderer or conversion behavior is introduced.

## 8. Approval boundary

The user approved this scope. Implementation is recorded below; acceptance remains pending local verification.

## 9. Implementation record

- Added `src/core/ImportRequestGuard.js` to issue monotonically increasing request tokens.
- Updated `ProjectManager.loadFile(file, { isCurrent })` so a completed stale read cannot replace the active project/import record.
- Updated `src/app.js` to clear the prior project, summary, import inspection, validation issues/context, and export availability as soon as a new import attempt begins.
- Oversized files are rejected after clearing the previous active project and before file reading or validation.
- Read/parse failures clear active project state and disable export.
- Only the latest request may update visible state.
- Validator readiness remains independent: a project loaded during initialization is validated when initialization resolves; validator failure leaves a successfully imported original available for export.
- Added a ProjectManager race test proving a slower earlier read cannot replace a later file.

Local verification is still required. Do not mark this stage accepted until the full test suite and browser scenarios in section 6 pass.
