<!-- Generated from docs/evidence/known-findings.json and .storybook/catalog/copy-findings.json by .storybook/catalog/catalog.mjs. Do not edit: edit those files and run yarn catalog:write. -->

# Findings register

A finding is a defect or gap the catalog exposed and the product does not yet fix. The fingerprint (`kind|story|rule`) is the finding id. Severity is by whose trust or access is affected: critical, the person is told something false, or nothing, about a result or failure; major, the job completes but a group is impaired; minor, cosmetic, latent or hygiene. A finding leaves this list only when it is fixed or when the maintainer's decision is recorded as a verdict.

## Register

| Fingerprint | Story | Severity | Disposition | Reason |
| --- | --- | --- | --- | --- |
| access-gap\|file-list-filerow--cleaned-expanded\|rowgroup-holds-non-row-children | file-list-filerow--cleaned-expanded | major | fix-v5.2 | The metadata expansion (a button, a details element and a labelled div) sits in the role=rowgroup at FileTable.tsx:124 beside the row, so axe aria-required-children fails on the table and the rowgroup and the table structure is invalid for assistive tech. |
| access-gap\|file-list-filerow--cleaned\|row-aria-expanded-unsupported-in-table | file-list-filerow--cleaned | major | fix-v5.2 | FileRow.tsx:146 puts aria-expanded on the role=row element inside the role=table section (FileTable.tsx:115), where axe aria-conditional-attr reports the attribute as unsupported, so assistive tech may not announce the expanded state of any complete or error row. |
| access-gap\|file-list-filerow--long-unbroken-name\|name-text-has-no-title | file-list-filerow--long-unbroken-name | minor | fix-v5.2 | The name text carries no title attribute: a 180-code-unit name has scrollWidth 1526 in a 180 px bdi, so a pointer user cannot read its tail; the full name is reachable through the row's aria-label and Reveal, so the harm is limited. |
| access-gap\|file-list-filerow--processing\|progress-row-announced-as-pending | file-list-filerow--processing | major | fix-v5.2 | The Processing row is announced as 'test.jpg. Pending': with no outcomeKind or failureKind FileRow.tsx:61-68 leaves outcomeSummary undefined and the aria-label falls back to the pending status key at FileRow.tsx:144, while StatusIcon.tsx:32-40 labels the same row Processing, so an assistive-tech user hears a pending file while it is being read or written; this is the row name contradicting its own icon, not seed 7's icon wording. |
| access-gap\|file-list-filetable--mixed-statuses\|status-column-header-empty | file-list-filetable--mixed-statuses | major | fix-v5.2 | FileTable.tsx:117 renders an empty role=columnheader for the status column, so axe empty-table-header reports a column header with no text visible to screen readers and the status column has no name. |
| access-gap\|file-list-filetable--mixed-statuses\|table-section-role-not-allowed | file-list-filetable--mixed-statuses | minor | fix-v5.2 | FileTable.tsx:115 renders the table as a section element with role=table, which axe aria-allowed-role reports as a role the element does not allow; a div or a native table would carry the role. |
| access-gap\|file-list-filetable--mixed-statuses\|toast-live-region-inside-table | file-list-filetable--mixed-statuses | minor | fix-v5.2 | FileTable.tsx:189 renders the Toast live region (role=status, Toast.tsx:13) inside the role=table section, so axe aria-required-children reports a child that is not a row or rowgroup. |
| access-gap\|file-list-metadataexpansion--mixed\|removed-count-announced-twice | file-list-metadataexpansion--mixed | minor | accept | The expanded row prints the removed and present counts in MetadataExpansion.tsx:90-92 and the details summary at :115 prints the present count again ('1 field still present' appears twice in the Mixed play), so a screen reader reads that count twice; the repeat is brief and the details summary is a control, so it is accepted. |
| access-gap\|screens-app--mid-batch\|row-aria-expanded-unsupported-in-table | screens-app--mid-batch | major | fix-v5.2 | In the real App every complete or error row puts aria-expanded on a role=row (FileRow.tsx:146) inside the role=table, which axe aria-conditional-attr reports as unsupported. |
| access-gap\|screens-app--mid-batch\|status-column-header-empty | screens-app--mid-batch | major | fix-v5.2 | In the real App the status column header (FileTable.tsx:117) has no visible text, so axe empty-table-header reports it and a screen reader finds an unnamed column. |
| access-gap\|screens-app--mid-batch\|table-section-role-not-allowed | screens-app--mid-batch | minor | fix-v5.2 | The real App shows the same section role=table (FileTable.tsx:115) that axe aria-allowed-role reports on the FileTable story, here inside the full screen with the status bar. |
| access-gap\|screens-app--mid-batch\|toast-live-region-inside-table | screens-app--mid-batch | minor | fix-v5.2 | In the real App the Toast live region (role=status) still sits inside the table section (FileTable.tsx:189), which axe aria-required-children reports. |
| access-gap\|settings-languagedropdown--keyboard-end\|no-aria-activedescendant | settings-languagedropdown--keyboard-end | major | fix-v5.2 | LanguageDropdown.tsx:204 is a role listbox of role option divs (:214, :239) that never take focus and no aria-activedescendant is set anywhere in the file, so a screen reader hears no moving selection while the arrow keys change the highlight; axe also reports scrollable-region-focusable here, which this entry subsumes. |
| access-gap\|ui-errorboundary--fallback\|reduced-motion-transition-unguarded | ui-errorboundary--fallback | minor | fix-v5.2 | error_boundary.css:35 sets transition: background-color 0.15s ease on .error-boundary__button and the file has no prefers-reduced-motion block (the grep of error_boundary.css finds none), so the button hover transition ignores a reduce preference; the effect is a 150 ms colour change. |
| access-gap\|ui-statusicon--processing\|reading-and-no-metadata-share-labels | ui-statusicon--processing | major | fix-v5.2 | StatusIcon.tsx:32-40 gives the Reading and Processing statuses the same role img with the label Processing and NoMetadataFound shares Complete (outerHTML equality plays in the 72-02 stories), so assistive tech cannot tell a file being read from one being written or a clean file from a cleaned one. |
| dead-end\|file-list-errorexpansion--verification\|click-to-copy-not-keyboard-reachable | file-list-errorexpansion--verification | major | fix-v5.2 | ErrorExpansion.tsx:18-24 renders the error text as a pre with onClick and no role or tabIndex (the story shows no interactive element at all), so a keyboard user cannot copy the error and the Click to copy hint at :25-30 points at a gesture they cannot make. |
| dead-end\|screens-app--all-done\|no-per-row-remove | screens-app--all-done | minor | fix-v5.2 | No row offers a remove control (FileRow.tsx renders only the expand toggle at :147 and :160 and, on complete rows, Reveal at :199-223), so the only way to drop one file is Clear at App.tsx:94-96, which empties the whole list. |
| dead-end\|screens-app--all-error\|no-retry-for-failed-file | screens-app--all-error | minor | fix-v5.2 | A failed row offers only expand (FileRow.tsx:41-42, :147) and no control re-runs a failed file; the only Try again resets a render crash (ErrorBoundary.tsx:42-48), so Clear and choosing the file again is the workaround. |
| i18n-gap\|file-list-filerow--huge-size\|file-size-english-units-ungrouped-counts | file-list-filerow--huge-size | minor | fix-v5.2 | formatFileSize reads 1 TiB (1,099,511,627,776 bytes) as '1024 GB' and 1,048,575 bytes as '1024 KB' with English units only, and tag counts print as raw integers ('654321', '123456') with no digit grouping, in every locale. |
| i18n-gap\|file-list-filerow--rlo-name\|rtl-override-reorders-name | file-list-filerow--rlo-name | major | fix-v5.1 | By measured glyph positions the name 'holiday' U+202E 'gnp.jpg' draws as 'holiday' then 'gpj.png', so a JPG file reads as a PNG while the type pill says JPG; the bdi dir=auto isolate does not contain the override's reordering, which lets a crafted name misstate the file type. |
| i18n-gap\|file-list-filetable--persian-batch\|header-text-align-left-under-rtl | file-list-filetable--persian-batch | minor | fix-v5.1 | Under dir rtl (ar and fa) all six header cells keep a computed text-align of left because file_table.css:24 and :30 hard-code it, so labels sit at the left edge of each cell in a mirrored table; the fa header row is 30 px like en, so the wrap guess was not confirmed. |
| i18n-gap\|file-list-folderrow--single-file\|folder-count-no-singular | file-list-folderrow--single-file | minor | fix-v5.2 | FolderRow.tsx:74-75 fills the folder.files template ('{count} files') with the count, so one file reads '1 files'; the SingleFile story deliberately does not assert the wording. |
| i18n-gap\|file-list-metadataexpansion--arabic-plural\|ar-lacks-dual-category | file-list-metadataexpansion--arabic-plural | minor | fix-v5.2 | ar.json carries only metadata.removed.one and metadata.removed.other (no two category) although Arabic distinguishes the count 2, so two removed fields read through the general wording; the code supports a dedicated category and the fix is translator content that needs the maintainer's approval. |
| i18n-gap\|icons-chevronicon--arabic\|chevron-not-mirrored | icons-chevronicon--arabic | minor | fix-v5.1 | The chevron always points right and the expanded rule is rotate(90deg) at metadata_expansion.css:167; no stylesheet under src/renderer/styles has an rtl or :dir() rule, so the glyph is not mirrored in a right-to-left layout (read from source). |
| i18n-gap\|settings-segmentedcontrol--arabic\|indicator-ignores-rtl | settings-segmentedcontrol--arabic | major | fix-v5.1 | segmented_control.css:50-54 places the indicator at left: 2px at a third of the width and moves it by index, and no stylesheet under src/renderer/styles has an rtl or :dir() rule, while the flex row of segments reverses in a right-to-left layout, so as read from the source the highlight sits on the wrong segment for every choice but the middle one; not measured in a story. |
| i18n-gap\|ui-statusbar--single-file\|tags-count-no-singular | ui-statusbar--single-file | minor | fix-v5.1 | StatusBar.tsx:57-61 fills the statusBar.tagsRemoved template ('{count} tags removed') with the count, so one tag reads '1 tags removed'; copy-findings already records statusBar.tagsRemoved as fix-v5.1, so the disposition matches it. |
| i18n-gap\|ui-toast--skipped-one\|skipped-count-no-singular | ui-toast--skipped-one | minor | fix-v5.2 | The template intake.unsupportedSkipped ('{count} unsupported files skipped') is filled with 1 as '1 unsupported files skipped', and two e2e specs pin that exact text (error-handling.spec.ts:168, folder-recursion.spec.ts:95), so fixing the wording also changes those specs. |
| layout-gap\|file-list-filerow--cleaned\|size-cell-clips-size-change | file-list-filerow--cleaned | minor | fix-v5.1 | The size cell for a cleaned row reads '1.0 KB to 512 B' at scrollWidth 124 in an 80 px cell (clientWidth 80), so ordinary data clips under overflow hidden at the default 580 px window and the after size is cut off. |
| layout-gap\|file-list-filerow--commit\|secondary-summary-clips-in-name-column | file-list-filerow--commit | major | fix-v5.1 | The secondary summary clips in the 196 px name column (unchanged scrollWidth 278, already clean 414, write failed 454, commit failed 1076), so the sentence that says the original is unchanged is cut off exactly where a person looks for it; the row also grows to 53 px for a summary and 60 px with the copy disclosure against 44 px otherwise. |
| layout-gap\|file-list-filerow--huge-tag-counts\|after-count-clips-six-digits | file-list-filerow--huge-tag-counts | minor | fix-v5.1 | A six-digit AFTER tag count '123456' measures scrollWidth 120 in an 88 px cell, so it clips (73-02 measurement on the huge-tag-counts story). |
| layout-gap\|screens-app--large-batch\|row-stagger-lacks-backwards-fill | screens-app--large-batch | minor | fix-v5.2 | Read from file_table.css:182 (animation-delay: var(--ec-stagger-delay)) and :198-199 (animation ... forwards with no backwards fill) with the delay set to index times 30 ms at FileRow.tsx:119, so row 100 stays fully drawn for about 2970 ms and then flashes to transparent and fades in; hidden by reduced motion in the harness and not measured. |
| layout-gap\|settings-settingsdrawer--german-drawer\|drawer-content-grows-past-window | settings-settingsdrawer--german-drawer | minor | fix-v5.1 | The drawer content height is 983 px in de (scrollHeight 983, clientHeight 312 in the story frame; 854 px in en), so the drawer scrolls and the last switches sit below the fold; they stay reachable by scrolling, so the harm is latent. |
| layout-gap\|settings-settingsdrawer--hungarian-drawer\|drawer-content-grows-past-window | settings-settingsdrawer--hungarian-drawer | minor | fix-v5.1 | The drawer content height is 965 px in hu (scrollHeight 965, clientHeight 312 in the story frame; 854 px in en), so the drawer scrolls like the German one and the last switches sit below the fold, reachable by scrolling. |
| layout-gap\|ui-emptystate--malayalam-empty\|empty-state-overflows-minimum-height | ui-emptystate--malayalam-empty | minor | fix-v5.1 | The ml EmptyState frame measures 327 px against its 312 px minimum, 15 px over (section 327 px, inner 263 px), while de measures 312 (section 298 px) and fa 312 (section 278 px). |
| silent-failure\|file-list-filerow--verification\|failure-summary-no-exhaustiveness | file-list-filerow--verification | minor | fix-v5.2 | FileRow.tsx:47-60 maps failureKind to its summary with an if-chain that ends in undefined and has no assertNever, so a failureKind added to the union later renders a row with no failure summary; the union is also declared inline in AppContext.tsx FileEntry, the UPDATE_FILE_ERROR action and ipc_channels.ts. |
| silent-failure\|file-list-folderrow--empty-expanded\|unreadable-folder-reads-as-empty | file-list-folderrow--empty-expanded | critical | fix-v5.2 | DropZone.tsx:91-99 answers a folder.expand error with UPDATE_FOLDER_STATE status empty and fileCount 0, the same state as a folder with no supported file (DropZone.tsx:116), and FolderRow.tsx:76-77 draws both as 0 supported files; the en.json string intake.foldersUnreadable is used by no source file, so a refused or unreadable folder tells the person nothing about the failure. |
| silent-failure\|screens-app--all-error\|status-bar-omits-failures | screens-app--all-error | major | fix-v5.2 | With three failed rows the status bar reads '0 of 3 cleaned' and '0 tags removed' and shows no failure count: App.tsx:38-41 counts only outcomeKind cleaned and StatusBar.tsx:49-67 has no failure segment (en.json has no statusBar failure key); each row names its own failure, so the person is not told nothing, but the summary does not report the failures. |
| silent-failure\|screens-app--mid-batch\|clear-during-processing-keeps-writing | screens-app--mid-batch | critical | fix-v5.2 | Clear is enabled while row 3 shows Processing (App.tsx:94-96); as read from the call sites and not reproduced in a story, CLEAR_FILES empties the list (AppContext.tsx:99-106) while processFileEntries keeps iterating the entries it captured with no cancellation check (use_process_files.ts:20-147), so the remaining files are still written while no row reports them and the person is told nothing about those results. |
| silent-failure\|settings-languagedropdown--item-hover\|hover-moves-keyboard-selection | settings-languagedropdown--item-hover | major | fix-v5.2 | LanguageDropdown.tsx:217 and :242 set focusedIndex from onMouseEnter, the same state the arrow keys move, so the pointer resting over the list moves the keyboard highlight and, as read from the source, Enter then picks the item under the pointer instead of the one the keyboard chose; the ItemHover story asserts the shared --focused class. |
| silent-failure\|settings-settingsdrawer--all-toggles-on\|toggle-write-result-ignored | settings-settingsdrawer--all-toggles-on | minor | fix-v5.2 | SettingsDrawer.tsx:94 handleToggle calls window.api.settings.set(...) and never reads the Promise<{ success: boolean; error: string \| null }> it returns (api_types.ts:53-55); the switches are drawn from settings state that only the onChanged callback updates (SettingsDrawer.tsx:87, :238-275), so a write that fails leaves the switch where it was and the person is told nothing (read from source, not reproduced in a story; settings_handlers.ts:35 answers success true today). |
| silent-failure\|ui-toast--skipped-many\|toasts-share-one-position | ui-toast--skipped-many | minor | fix-v5.2 | toast.css:4-5 fixes every .toast at bottom calc(44px + var(--ec-space-4)); DropZone.tsx:281 and FileTable.tsx:189 each render their own Toast and App.tsx:82-84 mounts FileTable inside DropZone, so a skipped-files notice and a copy notice shown together draw at the same spot (read from source, not reproduced in a story). |
| token-gap\|settings-languagedropdown--item-hover\|hover-token-undefined | settings-languagedropdown--item-hover | minor | fix-v5.1 | language_dropdown.css:82 reads var(--ec-color-hover, rgba(0, 0, 0, 0.04)) and --ec-color-hover is defined in no stylesheet, so the hover and focused item fall back to the literal rgba in both themes (measured #dfe3e6 over the light surface and #1b1b1e over the dark one). |
| token-gap\|ui-errorboundary--fallback\|spacing-tokens-undefined | ui-errorboundary--fallback | major | fix-v5.1 | error_boundary.css:7-28 and file_list.css:2-14 use var(--spacing-xs) to var(--spacing-xl) (7 uses) and no stylesheet or token file under src defines any --spacing-* property, so those paddings, margins and gaps resolve to nothing and the crash screen and the file list lose their spacing. |
| unrendered-outcome\|file-list-folderrow--scanning\|discovering-status-never-dispatched | file-list-folderrow--scanning | minor | fix-v5.2 | FolderRow.tsx:72-73 renders a found-count for status discovering with the folder.found string, but the status appears only in the AppContext.tsx:8 type and that case: DropZone.tsx dispatches scanning (:87), empty (:95, :116) and complete (:127), so the branch never shows and no story can show it. |
| unrendered-outcome\|screens-app--all-done\|engine-evidence-not-shown | screens-app--all-done | minor | fix-v5.2 | RemoveMetadataResult.evidence {engine, outputMode, leakCheck} reaches the renderer (ipc_channels.ts:59-73) but use_process_files.ts:102-125 dispatches UPDATE_FILE_METADATA without it (AppContext.tsx:60-70 has no evidence field), so no row says which engine wrote the file or whether the leak check ran; the output mode itself stays visible through the copy disclosure. |

## Rejected (verdict log)

| Fingerprint | Story | Severity | Reason | Decided | By | Reply |
| --- | --- | --- | --- | --- | --- | --- |
| access-gap\|file-list-filetable--mixed-statuses\|reveal-transition-reduced-motion | file-list-filetable--mixed-statuses | minor | The reduced-motion concern is a catalog artefact, not a defect: the Complete row renders the .file-table__reveal span (FileRow.tsx:199-201) and its opacity transition is file_table.css:156 inside the rule at :143, but the prefers-reduced-motion: reduce block at file_table.css:170-174 sets transition: none for it, so a reduced-motion user gets no transition. | 2026-11-13 | maintainer | delegate-merge |

## Accessibility baseline (summary)

Axe findings from the stories, summarised by kind, rule and disposition; the entries are in docs/evidence/known-findings.json. Severity is derived: major (a WCAG failure impairs a group).

| Kind | Rule | Disposition | Severity | Count |
| --- | --- | --- | --- | --- |
| a11y-p72 | color-contrast | fix-v5.1 | major | 71 |
| a11y-p72 | scrollable-region-focusable | fix-v5.1 | major | 5 |
| a11y-p73 | aria-allowed-role | fix-v5.1 | major | 19 |
| a11y-p73 | aria-conditional-attr | fix-v5.1 | major | 50 |
| a11y-p73 | aria-required-children | fix-v5.1 | major | 20 |
| a11y-p73 | color-contrast | fix-v5.1 | major | 71 |
| a11y-p73 | empty-table-header | fix-v5.1 | major | 19 |
| a11y-p73 | scrollable-region-focusable | fix-v5.1 | major | 1 |

## Copy findings (cross-reference)

Copy findings (hardcoded strings, copy-lint hits) are a separate ratchet in .storybook/catalog/copy-findings.json. Their entries have no story id (they name a source reference), so they cannot satisfy the story-id rule and are listed here by fingerprint and disposition only.

| Fingerprint | Disposition |
| --- | --- |
| hardcoded\|src:src/renderer/components/file-list/ErrorExpansion.tsx\|Click to copy | fix-v5.1 |
| hardcoded\|src:src/renderer/components/icons/GearIcon.tsx\|Close settings | fix-v5.1 |
| hardcoded\|src:src/renderer/components/icons/GearIcon.tsx\|Open settings | fix-v5.1 |
| hardcoded\|src:src/renderer/components/settings/LanguageDropdown.tsx\|Language | accept |
| hardcoded\|src:src/renderer/components/settings/LanguageDropdown.tsx\|System | accept |
| hardcoded\|src:src/renderer/components/settings/SettingsDrawer.tsx\|Appearance | accept |
| hardcoded\|src:src/renderer/components/settings/SettingsDrawer.tsx\|Auto | accept |
| hardcoded\|src:src/renderer/components/settings/SettingsDrawer.tsx\|Close settings | accept |
| hardcoded\|src:src/renderer/components/settings/SettingsDrawer.tsx\|Dark | accept |
| hardcoded\|src:src/renderer/components/settings/SettingsDrawer.tsx\|Language | accept |
| hardcoded\|src:src/renderer/components/settings/SettingsDrawer.tsx\|Light | accept |
| hardcoded\|src:src/renderer/components/settings/SettingsDrawer.tsx\|Settings | accept |
| hardcoded\|src:src/renderer/components/ui/ErrorBoundary.tsx\|Something went wrong. | fix-v5.1 |
| hardcoded\|src:src/renderer/components/ui/ErrorBoundary.tsx\|Try again | fix-v5.1 |
| hardcoded\|src:src/renderer/components/ui/StatusIcon.tsx\|Complete | fix-v5.1 |
| hardcoded\|src:src/renderer/components/ui/StatusIcon.tsx\|Error | fix-v5.1 |
| hardcoded\|src:src/renderer/components/ui/StatusIcon.tsx\|Pending | fix-v5.1 |
| hardcoded\|src:src/renderer/components/ui/StatusIcon.tsx\|Processing | fix-v5.1 |
| main\|src:src/application/queries/verify_generated_output_query.ts\|metadata tag(s) outside the permitted set | accept |
| main\|src:src/application/queries/verify_generated_output_query.ts\|no permitted-tag set | accept |
| main\|src:src/domain/exif/exif_errors.ts\|Could not start ExifTool at | fix-v5.2 |
| main\|src:src/domain/exif/exif_errors.ts\|ExifTool crashed unexpectedly. Restart the app to retry. | fix-v5.2 |
| main\|src:src/domain/exif/exif_errors.ts\|ExifTool error: | fix-v5.2 |
| main\|src:src/domain/exif/exif_errors.ts\|ExifTool is not running. Restart the app to retry. | fix-v5.2 |
| main\|src:src/domain/exif/exif_errors.ts\|ExifTool returned unreadable output. Try processing the file again. | fix-v5.2 |
| main\|src:src/domain/exif/exif_errors.ts\|ExifTool took too long to respond. Try processing the file again. | fix-v5.2 |
| main\|src:src/domain/exif/exif_errors.ts\|Metadata engine error: | fix-v5.2 |
| main\|src:src/domain/exif/exif_errors.ts\|Metadata engine error: native processing failed. | fix-v5.2 |
| main\|src:src/domain/exif/exif_errors.ts\|Metadata engine is not running. Restart the app to retry. | fix-v5.2 |
| main\|src:src/main/exif_handlers.ts\|Embedded metadata was removed, but macOS extended attributes could not be cleared | accept |
| main\|src:src/main/exif_handlers.ts\|Generated output cleanup failed | accept |
| main\|src:src/main/exif_handlers.ts\|Generated output commit failed | accept |
| main\|src:src/main/exif_handlers.ts\|Generated output verification failed | accept |
| main\|src:src/main/exif_handlers.ts\|Generated output write failed | accept |
| main\|src:src/main/reveal_handlers.ts\|File no longer exists | fix-v5.2 |
| main\|src:src/main/reveal_handlers.ts\|Reveal Cleaned Copy | fix-v5.1 |
| main\|src:src/main/reveal_handlers.ts\|Reveal Original | fix-v5.1 |
| manual\|apostrophe-mix | fix-v5.2 |
| manual\|bare-error-label | fix-v5.2 |
| manual\|copy-all-markers | accept |
| manual\|exif-before-after-headers | fix-v5.2 |
| manual\|metadata-field-preserved | fix-v5.1 |
| vocab\|cleaned-copy\|output\|en:cleanupFailedSummary | fix-v5.1 |
| vocab\|cleaned-copy\|output\|en:verificationFailedSummary | fix-v5.1 |
| vocab\|cleaned-copy\|output\|en:writeFailedSummary | fix-v5.1 |
| vocab\|fields\|attributes\|en:xattrFailedSummary | fix-v5.1 |
| vocab\|fields\|tags\|en:statusBar.tagsRemoved | fix-v5.1 |
| vocab\|unchanged\|untouched\|en:intake.outputCopy | fix-v5.2 |
| vocab\|unchanged\|untouched\|en:settings.saveAsCopy.description | fix-v5.2 |
