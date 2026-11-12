<!-- Generated from scenarios.json, subjects.json and waivers.json by .storybook/catalog/catalog.mjs. Do not edit: edit those files and run yarn catalog:write. -->

# Coverage grid

21 subjects x 12 state classes = 252 cells: 9 covered, 17 waived, 226 gaps.

A cell is covered by a scenario in scenarios.json, waived with a reason in waivers.json, or a gap. A gap is computed, never typed. Cells show the scenario count, `waived` or `gap`. A gap is owed by the phase in the Due column: primitive and pattern rows by Phase 72, area and screen rows by Phase 73.

| Subject | Tier | Due | happy | empty | one | many | boundary | loading | error | denied | stale | long | intl | huge |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ChevronIcon | primitive | Phase 72 | gap | gap | gap | gap | gap | gap | gap | gap | gap | gap | gap | gap |
| GearIcon | primitive | Phase 72 | gap | gap | gap | gap | gap | gap | gap | gap | gap | gap | gap | gap |
| SegmentedControl | primitive | Phase 72 | gap | gap | gap | gap | gap | gap | gap | gap | gap | gap | gap | gap |
| StatusIcon | primitive | Phase 72 | gap | gap | gap | gap | gap | gap | gap | gap | gap | gap | gap | gap |
| ToggleSwitch | primitive | Phase 72 | 3 | waived | waived | waived | waived | waived | waived | waived | waived | 1 | 1 | waived |
| TypePill | primitive | Phase 72 | gap | gap | gap | gap | gap | gap | gap | gap | gap | gap | gap | gap |
| ErrorBoundary | pattern | Phase 72 | gap | gap | gap | gap | gap | gap | gap | gap | gap | gap | gap | gap |
| ErrorExpansion | pattern | Phase 72 | waived | waived | waived | waived | waived | waived | 5 | 1 | 1 | 1 | waived | waived |
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

- ToggleSwitch|empty: unreachable (src/renderer/components/settings/ToggleSwitch.tsx#label): The switch always renders a label and a description handed in by its parent, so a blank or zero-item toggle is not a state it has.
- ToggleSwitch|one: unreachable (src/renderer/components/settings/ToggleSwitch.tsx#checked): A switch shows one boolean for one setting and carries no count, so there is no singular wording or one-item layout to test.
- ToggleSwitch|many: unreachable (src/renderer/components/settings/ToggleSwitch.tsx#id): Each switch is independent with its own id and renders alone; the six switches stacked in a drawer belong to the settings drawer area story.
- ToggleSwitch|boundary: unreachable (src/renderer/components/settings/ToggleSwitch.tsx#onChange): A switch has only on and off, and ToggleSwitch.tsx has no limit, cap or threshold at which its behaviour changes.
- ToggleSwitch|loading: unreachable (src/renderer/components/settings/ToggleSwitch.tsx#ToggleSwitch): ToggleSwitch takes a plain checked boolean and renders no spinner or pending style, so any wait for settings belongs to the drawer around it.
- ToggleSwitch|error: unreachable (src/renderer/components/settings/ToggleSwitch.tsx#description): The primitive has no error prop and no error class, so there is no failed appearance of a switch to show; a message would be the description text.
- ToggleSwitch|denied: unreachable (src/renderer/components/settings/ToggleSwitch.tsx#input): The input takes no disabled or read-only prop and no call site in src/renderer passes one, so a refused toggle is not a state it can render.
- ToggleSwitch|stale: unreachable (src/renderer/components/settings/ToggleSwitch.tsx#checked): The switch holds no file or source of its own and only mirrors its checked prop, so nothing in it can outlive what it refers to.
- ToggleSwitch|huge: duplicate (toggle-switch.long-labels): The text is two short strings from the locale files, and the longest translation of them is already the long-labels scenario, so no larger input exists.
- ErrorExpansion|happy: unreachable (src/renderer/components/file-list/ErrorExpansion.tsx#ErrorExpansion): FileRow mounts ErrorExpansion only for an expanded row in the Error status, so no cleaned or unchanged row ever renders it.
- ErrorExpansion|empty: unreachable (src/renderer/components/file-list/ErrorExpansion.tsx#error): FileRow renders the pattern only when the error text is not null, and every failure path supplies one, so an empty pattern never appears.
- ErrorExpansion|one: unreachable (src/renderer/components/file-list/ErrorExpansion.tsx#error): The pattern shows one error string for one row and has no count, so there is no singular or plural wording to test.
- ErrorExpansion|many: unreachable (src/renderer/components/file-list/ErrorExpansion.tsx#onCopy): Only one row is expanded at a time (expandedRowId), so the pattern never renders twice; a mixed batch is the file table's area story.
- ErrorExpansion|boundary: duplicate (error-expansion.long-detail): ErrorExpansion codes no length cap or size limit, and the longest string it ever wraps is the long-detail scenario, so a boundary row would repeat it.
- ErrorExpansion|loading: unreachable (src/renderer/components/file-list/ErrorExpansion.tsx#handleCopy): A row in flight is Pending, Reading or Processing and cannot expand; the pattern appears only after a verdict, and its copy write settles at once.
- ErrorExpansion|intl: unreachable (src/renderer/components/file-list/ErrorExpansion.tsx#Click to copy): The pattern renders engine English text and the hardcoded English hint Click to copy, so no locale string reaches it and a locale adds no state of its own.
- ErrorExpansion|huge: duplicate (error-expansion.long-detail): One error string is the largest input the pattern takes; thousands of files stress the file table and the status bar, and long-detail already covers the string size.

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
