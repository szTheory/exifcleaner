<!-- Generated from .storybook/catalog/journeys/*.json by .storybook/catalog/catalog.mjs. Do not edit: edit those files and run yarn catalog:write. -->

# Journeys

Each job has one journey of ordered steps. Proof `story` means some story of the step's scenario shows the control present, named, enabled and keyboard reachable; it does not claim the control works. Proof `e2e` names a test that exists and is not skipped; it does not claim the test exercises the step. `unproven` steps say why in their note.

## J-01: Share a file without what it says about me

Exempt: Sharing a cleaned file is an outcome the person judges away from the app, so there is no control in the window to operate.

## J-02: Keep orientation, colour and resolution when cleaning

| Step | Scenario | Action | Proof | e2e | Note |
| --- | --- | --- | --- | --- | --- |
| J-02.1 | app.empty | button "Open settings" | story+e2e | tests/e2e/settings.spec.ts › opens and closes the settings drawer |  |
| J-02.2 | settings-drawer.all-toggles-on | switch "Preserve orientation" | story+e2e | tests/e2e/settings.spec.ts › toggles preserve orientation switch |  |
| J-02.3 | settings-drawer.all-toggles-on | switch "Preserve color profile" | story |  |  |
| J-02.4 | settings-drawer.all-toggles-on | switch "Preserve resolution" | story+e2e | tests/e2e/settings.spec.ts › toggles preserve resolution switch as the third row (FID-01, D-39) |  |
| J-02.5 | settings-drawer.all-toggles-on | button "Close settings" | story+e2e | tests/e2e/settings.spec.ts › opens and closes the settings drawer |  |

## J-03: See what was removed and what remains

| Step | Scenario | Action | Proof | e2e | Note |
| --- | --- | --- | --- | --- | --- |
| J-03.1 | file-row.cleaned | row "test.jpg. Metadata removed" | story+e2e | tests/e2e/metadata-inspection.spec.ts › shows metadata groups with before/after diff |  |
| J-03.2 | file-row.cleaned-expanded | gesture: read the groups of metadata that were found | e2e | tests/e2e/metadata-inspection.spec.ts › shows metadata groups with before/after diff |  |
| J-03.3 | file-row.cleaned-expanded | gesture: read which fields were removed | e2e | tests/e2e/metadata-inspection.spec.ts › shows removed indicators for stripped metadata tags |  |
| J-03.4 | file-row.cleaned-expanded | button "Copy all" | story |  |  |
| J-03.5 | file-row.cleaned-expanded | row "test.jpg. Metadata removed" | story |  | The same row collapses the list again; no e2e collapses it. |

## J-04: Be told which file failed and what state it is in

| Step | Scenario | Action | Proof | e2e | Note |
| --- | --- | --- | --- | --- | --- |
| J-04.1 | app.all-error | row "alpha.jpg. Couldn’t verify cleaned output. The incomplete copy was removed; your original is unchanged." | story |  |  |
| J-04.2 | file-row.verification | row "test.jpg. Couldn’t verify cleaned output. The incomplete copy was removed; your original is unchanged." | story |  | The failed row opens to its error detail; no e2e expands a failed row. |
| J-04.3 | error-expansion.verification | gesture: click the error text to copy it | unproven |  | The error text is a pre with a click handler and no role or tab stop, so a keyboard user cannot copy it; register entry dead-end\|file-list-errorexpansion--verification\|click-to-copy-not-keyboard-reachable. |
| J-04.4 | app.all-error | gesture: retry the failed file | unproven |  | No retry control exists for a failed file: the error row offers only expand and the only Try again resets a render crash on another screen; register entry dead-end\|screens-app--all-error\|no-retry-for-failed-file. |
| J-04.5 | app.all-error | button "Clear" | story |  |  |

## J-05: Keep the original while trying a cleaning

| Step | Scenario | Action | Proof | e2e | Note |
| --- | --- | --- | --- | --- | --- |
| J-05.1 | app.empty | button "Open settings" | story+e2e | tests/e2e/settings.spec.ts › opens and closes the settings drawer |  |
| J-05.2 | settings-drawer.all-toggles-off | switch "Save as copy" | story+e2e | tests/e2e/settings.spec.ts › toggles save-as-copy switch and verifies _cleaned setting propagation | The e2e test sets the value through the settings IPC and reads the switch state; it does not click the switch. |
| J-05.3 | file-row.copy-mode-disclosure | row "test.jpg. Metadata removed. Written to a copy." | story |  |  |
| J-05.4 | app.all-done | button "Reveal cleaned copy in file manager" | story |  | Reveal is shown present and named; no e2e or story opens the file manager. |
| J-05.5 | settings-drawer.all-toggles-off | button "Close settings" | story+e2e | tests/e2e/settings.spec.ts › opens and closes the settings drawer |  |

## J-06: Clean a whole folder in one go

| Step | Scenario | Action | Proof | e2e | Note |
| --- | --- | --- | --- | --- | --- |
| J-06.1 | empty-state.copy-mode-on | button "Choose folder…" | story |  | The native folder dialog is never opened by a story or an e2e test. |
| J-06.2 | drop-zone.drag-over | gesture: drop a folder on the window | unproven |  | No story or e2e test performs a real drop; e2e sends the file-open-add-files IPC instead. |
| J-06.3 | file-table.folder-complete | gesture: the supported files of the folder arrive as rows under one folder row | e2e | tests/e2e/folder-recursion.spec.ts › reports one skipped unsupported file and processes supported files from a nested folder |  |
| J-06.4 | folder-row.complete-collapsed | button "Expand Trip 2026/" | story |  | Shown present and named; no e2e expands or collapses a folder row. |
| J-06.5 | folder-row.complete-expanded | button "Collapse Trip 2026/" | story |  |  |
| J-06.6 | app.all-done | button "Clear" | story |  |  |

## J-07: See which files are cleaned, failed or need a look

| Step | Scenario | Action | Proof | e2e | Note |
| --- | --- | --- | --- | --- | --- |
| J-07.1 | app.all-done | button "Name" | story |  | Sorting has no e2e test; the story shows the header control only. |
| J-07.2 | file-table.sort-by-name-ascending | button "Name. Sorted ascending" | story |  |  |
| J-07.3 | file-table.mixed-statuses | row "err.jpg. ExifTool crashed unexpectedly. Restart the app to retry." | story |  |  |
| J-07.4 | app.all-done | button "Reveal cleaned copy in file manager" | story |  | Shown present and named; no e2e or story opens the file manager. |
| J-07.5 | app.all-done | button "Reveal original in file manager" | story |  |  |

## J-08: Know my files stay on my computer

Exempt: Staying on the computer is a claim the app keeps by sending nothing out, so there is no control to operate in any state.

## J-09: First run: choose files and see them cleaned

| Step | Scenario | Action | Proof | e2e | Note |
| --- | --- | --- | --- | --- | --- |
| J-09.1 | empty-state.copy-mode-on | button "Choose files…" | story |  | The native file dialog is never opened by a story or an e2e test. |
| J-09.2 | drop-zone.drag-over | gesture: drop files on the window | unproven |  | No story or e2e test performs a real drop; e2e sends the file-open-add-files IPC instead. |
| J-09.3 | app.all-done | gesture: the files are read and cleaned and a row appears for each | e2e | tests/e2e/file-processing.spec.ts › strips EXIF metadata from a single JPEG file | e2e sends the file-open-add-files IPC and never opens the native dialog. |
| J-09.4 | status-bar.all-cleaned | gesture: read the cleaned count in the status bar | e2e | tests/e2e/file-processing.spec.ts › updates the status bar with file count |  |
| J-09.5 | app.all-done | button "Clear" | story+e2e | tests/e2e/file-processing.spec.ts › supports Clean more cycle |  |
