<!-- Generated from scenarios.json, subjects.json and waivers.json by .storybook/catalog/catalog.mjs. Do not edit: edit those files and run yarn catalog:write. -->

# Coverage grid

21 subjects x 12 state classes = 252 cells: 2 covered, 0 waived, 250 gaps.

A cell is covered by a scenario in scenarios.json, waived with a reason in waivers.json, or a gap. A gap is computed, never typed. Cells show the scenario count, `waived` or `gap`. A gap is owed by the phase in the Due column: primitive and pattern rows by Phase 72, area and screen rows by Phase 73.

| Subject | Tier | Due | happy | empty | one | many | boundary | loading | error | denied | stale | long | intl | huge |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ChevronIcon | primitive | Phase 72 | gap | gap | gap | gap | gap | gap | gap | gap | gap | gap | gap | gap |
| GearIcon | primitive | Phase 72 | gap | gap | gap | gap | gap | gap | gap | gap | gap | gap | gap | gap |
| SegmentedControl | primitive | Phase 72 | gap | gap | gap | gap | gap | gap | gap | gap | gap | gap | gap | gap |
| StatusIcon | primitive | Phase 72 | gap | gap | gap | gap | gap | gap | gap | gap | gap | gap | gap | gap |
| ToggleSwitch | primitive | Phase 72 | gap | gap | gap | gap | gap | gap | gap | gap | gap | gap | gap | gap |
| TypePill | primitive | Phase 72 | gap | gap | gap | gap | gap | gap | gap | gap | gap | gap | gap | gap |
| ErrorBoundary | pattern | Phase 72 | gap | gap | gap | gap | gap | gap | gap | gap | gap | gap | gap | gap |
| ErrorExpansion | pattern | Phase 72 | gap | gap | gap | gap | gap | gap | gap | gap | gap | gap | gap | gap |
| FolderRow | pattern | Phase 72 | gap | gap | gap | gap | gap | gap | gap | gap | gap | gap | gap | gap |
| LanguageDropdown | pattern | Phase 72 | 1 | gap | gap | gap | gap | gap | gap | gap | gap | gap | 1 | gap |
| MetadataExpansion | pattern | Phase 72 | gap | gap | gap | gap | gap | gap | gap | gap | gap | gap | gap | gap |
| MetadataField | pattern | Phase 72 | gap | gap | gap | gap | gap | gap | gap | gap | gap | gap | gap | gap |
| MetadataGroup | pattern | Phase 72 | gap | gap | gap | gap | gap | gap | gap | gap | gap | gap | gap | gap |
| StatusBar | pattern | Phase 72 | gap | gap | gap | gap | gap | gap | gap | gap | gap | gap | gap | gap |
| Toast | pattern | Phase 72 | gap | gap | gap | gap | gap | gap | gap | gap | gap | gap | gap | gap |
| DropZone | area | Phase 73 | gap | gap | gap | gap | gap | gap | gap | gap | gap | gap | gap | gap |
| EmptyState | area | Phase 73 | gap | gap | gap | gap | gap | gap | gap | gap | gap | gap | gap | gap |
| FileRow | area | Phase 73 | gap | gap | gap | gap | gap | gap | gap | gap | gap | gap | gap | gap |
| FileTable | area | Phase 73 | gap | gap | gap | gap | gap | gap | gap | gap | gap | gap | gap | gap |
| SettingsDrawer | area | Phase 73 | gap | gap | gap | gap | gap | gap | gap | gap | gap | gap | gap | gap |
| App | screen | Phase 73 | gap | gap | gap | gap | gap | gap | gap | gap | gap | gap | gap | gap |

## Waivers

none

## State classes

- **happy**: A designed success path that ends in a verdict: cleaned, unchanged, already clean, the copy-mode disclosure rows, the settled empty screen, the default settings drawer.
- **empty**: Zero items where items are expected: the empty screen, a folder with no supported files, a table with no rows, a group with no fields.
- **one**: Exactly one item, where the singular plural form is what is tested: one row, one field removed.
- **many**: Several items with mixed outcomes, the plural form, fitting without scrolling: a mid-batch table.
- **boundary**: A value at the edge of a defined limit, or zero input: a zero-byte file, the 80-character metadata cut, a size cap, an A to B size.
- **loading**: In flight with no verdict yet: pending, reading, processing, a folder still scanning, a provider that is not ready.
- **error**: Attempted and failed, or corrupt input: a write, verification, cleanup or macOS attribute failure, and a read failure, with and without a leftover path.
- **denied**: Policy blocks the action and retrying inside the app will not help: the refused outcome (an unsafe RAF write). An unreadable folder is an unrendered state, so a finding.
- **stale**: On-screen information outlives its source: the commit identity change (another app changed the file) and the reveal of a vanished file. The renderer has no revalidation, so expect waivers or findings.
- **long**: Text longer than its container, ellipsis or wrap: long file names, long German or Hungarian labels, long error detail.
- **intl**: Script, direction, plural or locale differences regardless of length: right-to-left locales, bidirectional file names, CJK.
- **huge**: Magnitude that stresses layout or performance: thousands of files, gigabyte sizes, the large-batch screen.
