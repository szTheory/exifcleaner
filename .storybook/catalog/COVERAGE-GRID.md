<!-- Generated from scenarios.json, subjects.json and waivers.json by .storybook/catalog/catalog.mjs. Do not edit: edit those files and run yarn catalog:write. -->

# Coverage grid

21 subjects x 12 state classes = 252 cells: 66 covered, 126 waived, 60 gaps.

A cell is covered by a scenario in scenarios.json, waived with a reason in waivers.json, or a gap. A gap is computed, never typed. Cells show the scenario count, `waived` or `gap`. A gap is owed by the phase in the Due column: primitive and pattern rows by Phase 72, area and screen rows by Phase 73.

| Subject | Tier | Due | happy | empty | one | many | boundary | loading | error | denied | stale | long | intl | huge |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ChevronIcon | primitive | Phase 72 | 2 | waived | waived | waived | waived | waived | waived | waived | waived | waived | 1 | waived |
| GearIcon | primitive | Phase 72 | 4 | waived | waived | waived | waived | waived | waived | waived | waived | waived | waived | waived |
| SegmentedControl | primitive | Phase 72 | 4 | waived | waived | waived | 1 | waived | waived | waived | waived | 1 | 1 | waived |
| StatusIcon | primitive | Phase 72 | 2 | waived | waived | waived | waived | 2 | 2 | waived | waived | waived | waived | waived |
| ToggleSwitch | primitive | Phase 72 | 3 | waived | waived | waived | waived | waived | waived | waived | waived | 1 | 1 | waived |
| TypePill | primitive | Phase 72 | 7 | waived | waived | waived | waived | waived | waived | waived | waived | waived | waived | waived |
| ErrorBoundary | pattern | Phase 72 | 1 | waived | waived | waived | waived | waived | 4 | waived | waived | 1 | waived | waived |
| ErrorExpansion | pattern | Phase 72 | waived | waived | waived | waived | waived | waived | 5 | 1 | 1 | 1 | waived | waived |
| FolderRow | pattern | Phase 72 | 4 | 2 | 1 | waived | waived | 1 | waived | waived | waived | 1 | 1 | waived |
| LanguageDropdown | pattern | Phase 72 | 7 | waived | waived | waived | 1 | waived | waived | waived | 1 | waived | 1 | waived |
| MetadataExpansion | pattern | Phase 72 | 5 | 1 | 1 | 1 | 1 | waived | waived | waived | waived | waived | 1 | waived |
| MetadataField | pattern | Phase 72 | 2 | waived | waived | waived | 2 | waived | waived | waived | waived | waived | 1 | waived |
| MetadataGroup | pattern | Phase 72 | waived | waived | 1 | 1 | 1 | waived | waived | waived | waived | waived | waived | waived |
| StatusBar | pattern | Phase 72 | 3 | 1 | 1 | waived | 1 | 1 | waived | waived | waived | waived | 1 | waived |
| Toast | pattern | Phase 72 | 1 | 1 | 1 | 1 | 1 | waived | waived | waived | 1 | 1 | 1 | waived |
| DropZone | area | Phase 73 | gap | gap | gap | gap | gap | gap | gap | gap | gap | gap | gap | gap |
| EmptyState | area | Phase 73 | gap | gap | gap | gap | gap | gap | gap | gap | gap | gap | gap | gap |
| FileRow | area | Phase 73 | 8 | waived | waived | waived | 3 | 3 | 7 | 1 | 1 | 3 | 5 | 2 |
| FileTable | area | Phase 73 | gap | gap | gap | gap | gap | gap | gap | gap | gap | gap | gap | gap |
| SettingsDrawer | area | Phase 73 | gap | gap | gap | gap | gap | gap | gap | gap | gap | gap | gap | gap |
| App | screen | Phase 73 | gap | gap | gap | gap | gap | gap | gap | gap | gap | gap | gap | gap |

## Waivers

- ChevronIcon|empty: unreachable (src/renderer/components/icons/ChevronIcon.tsx#ChevronIcon): The chevron is a fixed 12 pixel glyph that always draws its one polyline, so a blank or zero-item chevron is not a state it has.
- ChevronIcon|one: unreachable (src/renderer/components/icons/ChevronIcon.tsx#expanded): The glyph carries a direction and no count, so there is no singular or plural form to test; its two directions are the collapsed and expanded scenarios.
- ChevronIcon|many: unreachable (src/renderer/components/icons/ChevronIcon.tsx#className): Each row draws its own chevron, so several of them side by side is the file table or folder row story and adds nothing to this glyph.
- ChevronIcon|boundary: unreachable (src/renderer/components/icons/ChevronIcon.tsx#expanded): expanded is a boolean with exactly two values, and ChevronIcon.tsx has no limit or threshold between them at which the glyph changes.
- ChevronIcon|loading: unreachable (src/renderer/components/icons/ChevronIcon.tsx#ChevronIcon): The glyph has no pending look; a row that is still being read has no chevron to turn, because only finished rows can expand.
- ChevronIcon|error: unreachable (src/renderer/components/icons/ChevronIcon.tsx#ChevronIcon): The chevron has no error prop and no error class, so a failed appearance is not something it can draw; the failed row shows a status icon instead.
- ChevronIcon|denied: unreachable (src/renderer/components/icons/ChevronIcon.tsx#ChevronIcon): The glyph is drawn with aria-hidden and no disabled or read-only form, so a refused chevron is not a state it can show.
- ChevronIcon|stale: unreachable (src/renderer/components/icons/ChevronIcon.tsx#ChevronIcon): The chevron references no file, so nothing it shows can outlive a source; it only reflects whether its row is open.
- ChevronIcon|long: unreachable (src/renderer/components/icons/ChevronIcon.tsx#ChevronIcon): The glyph is a fixed 12 by 12 pixel svg with no text, so length cannot stress its layout; only the row it sits in can be long.
- ChevronIcon|huge: unreachable (src/renderer/components/icons/ChevronIcon.tsx#ChevronIcon): With no list, count or text, a large quantity cannot be fed into a single glyph, so the quantity stress belongs to the table that repeats it.
- GearIcon|empty: unreachable (src/renderer/components/icons/GearIcon.tsx#GearIcon): The gear button always draws its one svg and always has an accessible label, so a blank or zero-item button is not a state it has.
- GearIcon|one: unreachable (src/renderer/components/icons/GearIcon.tsx#isOpen): The button has no count; its only variation is the open or closed label, so there is no singular wording or one-item layout to test.
- GearIcon|many: unreachable (src/renderer/components/icons/GearIcon.tsx#onClick): The status bar renders a single gear button and there is nowhere in the app that lays several of them out together.
- GearIcon|boundary: unreachable (src/renderer/components/icons/GearIcon.tsx#isOpen): isOpen is a boolean with two values and GearIcon.tsx has no limit at which the button changes, so there is no edge to sit on.
- GearIcon|loading: unreachable (src/renderer/components/icons/GearIcon.tsx#GearIcon): The gear button has no pending look and is rendered with the status bar, so there is no waiting appearance of the button to show.
- GearIcon|error: unreachable (src/renderer/components/icons/GearIcon.tsx#onClick): The button takes only isOpen and onClick and draws no error style, so a failed press has nothing on the gear to display.
- GearIcon|denied: unreachable (src/renderer/components/icons/GearIcon.tsx#onClick): The button element takes no disabled attribute and the status bar always lets it be pressed, so a refused gear is not rendered.
- GearIcon|stale: unreachable (src/renderer/components/icons/GearIcon.tsx#isOpen): The button holds no file or source and only mirrors whether the drawer is open, so nothing in it can outlive what it refers to.
- GearIcon|long: unreachable (src/renderer/components/icons/GearIcon.tsx#GearIcon): The button is a fixed 28 pixel square with an icon and an aria-label that is not drawn, so text length cannot stress its layout.
- GearIcon|intl: unreachable (src/renderer/components/icons/GearIcon.tsx#GearIcon): The aria-label is hardcoded English in the component and drawn nowhere, and the glyph is symmetric, so the locale changes nothing it renders.
- GearIcon|huge: unreachable (src/renderer/components/icons/GearIcon.tsx#GearIcon): With no list, count or text input, a large quantity cannot be fed to the gear, so the quantity stress belongs to the table elsewhere.
- SegmentedControl|empty: unreachable (src/renderer/components/settings/SegmentedControl.tsx#options): SettingsDrawer always passes exactly three options, and the control computes its indicator from them, so a control with no segments is not a state it has.
- SegmentedControl|one: unreachable (src/renderer/components/settings/SegmentedControl.tsx#activeIndex): The control has three segments with one chosen at a time; there is no singular or plural wording, only a chosen index, so no one-item form exists.
- SegmentedControl|many: unreachable (src/renderer/components/settings/SegmentedControl.tsx#options): The segment count is fixed at three by the caller and the indicator width is a third of the track, so a larger set is not a state the control supports.
- SegmentedControl|loading: unreachable (src/renderer/components/settings/SegmentedControl.tsx#value): The control takes a settled value and shows no pending style; the theme is applied by the provider around it, so no waiting appearance exists to show.
- SegmentedControl|error: unreachable (src/renderer/components/settings/SegmentedControl.tsx#onChange): onChange only reports the chosen value and the control has no error prop or error style, so a failed choice cannot be drawn on the segments.
- SegmentedControl|denied: unreachable (src/renderer/components/settings/SegmentedControl.tsx#SegmentedControl): None of the segment buttons takes a disabled attribute and no call site passes one, so a refused or locked choice is not rendered anywhere.
- SegmentedControl|stale: unreachable (src/renderer/components/settings/SegmentedControl.tsx#label): The control holds no file or source, only the current theme value, so nothing in it can outlive the thing it refers to.
- SegmentedControl|huge: duplicate (segmented-control.long-labels): The control has a fixed three segments and its widest input is the longest translated labels, which the long-labels scenario already shows.
- StatusIcon|empty: unreachable (src/renderer/components/ui/StatusIcon.tsx#status): The icon is always drawn for one of six statuses from a switch that ends in assertNever, so a blank or zero-item icon is not a state it has.
- StatusIcon|one: unreachable (src/renderer/components/ui/StatusIcon.tsx#StatusIcon): The icon shows one status for one row and has no count, so there is no singular or plural wording to test.
- StatusIcon|many: unreachable (src/renderer/components/ui/StatusIcon.tsx#shouldAnimate): Each row draws its own icon, so a column of mixed icons is the file table area story; the icon itself shows a single status.
- StatusIcon|boundary: unreachable (src/renderer/components/ui/StatusIcon.tsx#status): The status is a closed set of six values with no number or threshold between them, so there is no limit the icon can sit on.
- StatusIcon|denied: duplicate (status-icon.failed-labelled): A refused file shows the same red cross as any failure, with the refusal reason as its accessible label, which the failed-labelled scenario already shows.
- StatusIcon|stale: duplicate (status-icon.failed): A file whose final save failed shows the same cross as any other failure and the icon has no source of its own, so the failed scenario already covers it.
- StatusIcon|long: unreachable (src/renderer/components/ui/StatusIcon.tsx#accessibleLabel): The accessible label is read aloud and never drawn, and the glyph is a fixed 16 pixel svg, so text length cannot stress the icon layout.
- StatusIcon|intl: unreachable (src/renderer/components/ui/StatusIcon.tsx#status): The aria-label strings are hardcoded English and the glyphs are symmetric, so a locale or text direction changes nothing the icon renders.
- StatusIcon|huge: unreachable (src/renderer/components/ui/StatusIcon.tsx#StatusIcon): With no list, count or text input, a large quantity cannot be fed into one icon, so the quantity stress belongs to the table that repeats it.
- ToggleSwitch|empty: unreachable (src/renderer/components/settings/ToggleSwitch.tsx#label): The switch always renders a label and a description handed in by its parent, so a blank or zero-item toggle is not a state it has.
- ToggleSwitch|one: unreachable (src/renderer/components/settings/ToggleSwitch.tsx#checked): A switch shows one boolean for one setting and carries no count, so there is no singular wording or one-item layout to test.
- ToggleSwitch|many: unreachable (src/renderer/components/settings/ToggleSwitch.tsx#id): Each switch is independent with its own id and renders alone; the six switches stacked in a drawer belong to the settings drawer area story.
- ToggleSwitch|boundary: unreachable (src/renderer/components/settings/ToggleSwitch.tsx#onChange): A switch has only on and off, and ToggleSwitch.tsx has no limit, cap or threshold at which its behaviour changes.
- ToggleSwitch|loading: unreachable (src/renderer/components/settings/ToggleSwitch.tsx#ToggleSwitch): ToggleSwitch takes a plain checked boolean and renders no spinner or pending style, so any wait for settings belongs to the drawer around it.
- ToggleSwitch|error: unreachable (src/renderer/components/settings/ToggleSwitch.tsx#description): The primitive has no error prop and no error class, so there is no failed appearance of a switch to show; a message would be the description text.
- ToggleSwitch|denied: unreachable (src/renderer/components/settings/ToggleSwitch.tsx#input): The input takes no disabled or read-only prop and no call site in src/renderer passes one, so a refused toggle is not a state it can render.
- ToggleSwitch|stale: unreachable (src/renderer/components/settings/ToggleSwitch.tsx#checked): The switch holds no file or source of its own and only mirrors its checked prop, so nothing in it can outlive what it refers to.
- ToggleSwitch|huge: duplicate (toggle-switch.long-labels): The text is two short strings from the locale files, and the longest translation of them is already the long-labels scenario, so no larger input exists.
- TypePill|empty: unreachable (src/renderer/components/ui/TypePill.tsx#extension): A pill is drawn only for a supported file, which always has an extension from its name, so a blank badge is not a state it can show.
- TypePill|one: unreachable (src/renderer/components/ui/TypePill.tsx#TypePill): A pill shows one extension for one row and has no count, so there is no singular or plural wording to test; the single-member families already show one pill.
- TypePill|many: unreachable (src/renderer/components/ui/TypePill.tsx#modifier): Each file row draws its own pill, so a column of different pills is the file table area story; each family story already shows its members together.
- TypePill|boundary: unreachable (src/renderer/components/ui/TypePill.tsx#pillClass): pillClass is a plain lookup with no limit or threshold, so the only edge is an extension that is in no family, which the neutral story shows.
- TypePill|loading: unreachable (src/renderer/components/ui/TypePill.tsx#extension): The extension is known from the file name before any reading starts, so the pill never waits on a result and has no pending look.
- TypePill|error: unreachable (src/renderer/components/ui/TypePill.tsx#TypePill): The pill is drawn from the file name alone and has no error prop or error colour, so a failed file keeps the same badge as any other.
- TypePill|denied: unreachable (src/renderer/components/ui/TypePill.tsx#TypePill): The pill takes no disabled or read-only form, and a refused RAF file still shows its normal RAW badge, so there is no refused look to draw.
- TypePill|stale: unreachable (src/renderer/components/ui/TypePill.tsx#extension): The pill holds only the text of an extension and no file reference, so nothing in it can outlive a source that changed.
- TypePill|long: unreachable (src/renderer/components/ui/TypePill.tsx#extension): Only the supported extensions are rendered and the longest is four letters, so no long text can reach the pill; a long file name sits in another column.
- TypePill|intl: unreachable (src/renderer/components/ui/TypePill.tsx#extension): Extensions are ASCII letters and digits in every language and the pill text carries no translated string, so the locale changes nothing it renders.
- TypePill|huge: unreachable (src/renderer/components/ui/TypePill.tsx#pillClass): The pill takes one short extension, so a large quantity has nothing to feed on; the quantity stress belongs to the table that repeats it.
- ErrorBoundary|empty: unreachable (src/renderer/components/ui/ErrorBoundary.tsx#children): With no child the guard renders nothing and has nothing to fail, so there is no empty form of it, and a child that draws nothing is the healthy story.
- ErrorBoundary|one: unreachable (src/renderer/components/ui/ErrorBoundary.tsx#ErrorBoundaryState): The guard holds one error and shows one message with no count, so there is no singular or plural wording to look at.
- ErrorBoundary|many: unreachable (src/renderer/components/ui/ErrorBoundary.tsx#hasError): A second failure while the fallback is up cannot happen because the failed child is no longer rendered, so only one error is ever shown at a time.
- ErrorBoundary|boundary: unreachable (src/renderer/components/ui/ErrorBoundary.tsx#getDerivedStateFromError): The guard has two states, healthy and failed, and no limit or threshold at which its behaviour changes, so there is no edge to sit on.
- ErrorBoundary|loading: unreachable (src/renderer/components/ui/ErrorBoundary.tsx#handleReset): Try again re-renders the child in the same turn and the guard has no pending style or spinner, so there is no in-between frame to show.
- ErrorBoundary|denied: unreachable (src/renderer/components/ui/ErrorBoundary.tsx#render): The guard has no permission or refused form and its button is never disabled, so a blocked version of the message does not exist.
- ErrorBoundary|stale: unreachable (src/renderer/components/ui/ErrorBoundary.tsx#ErrorBoundaryProps): The fallback keeps the caught error until Try again is pressed and rereads nothing, so no revalidation or out-of-date form exists apart from the recovery story.
- ErrorBoundary|intl: unreachable (src/renderer/components/ui/ErrorBoundary.tsx#Try again): The message, the cause and the button are hardcoded English in the component and no locale string reaches them, so a locale story would draw the same English text.
- ErrorBoundary|huge: duplicate (error-boundary.fallback-long-message): The guard shows one error, so the largest input is its longest message, which the long message story already draws wrapping inside the box.
- ErrorExpansion|happy: unreachable (src/renderer/components/file-list/ErrorExpansion.tsx#ErrorExpansion): FileRow mounts ErrorExpansion only for an expanded row in the Error status, so no cleaned or unchanged row ever renders it.
- ErrorExpansion|empty: unreachable (src/renderer/components/file-list/ErrorExpansion.tsx#error): FileRow renders the pattern only when the error text is not null, and every failure path supplies one, so an empty pattern never appears.
- ErrorExpansion|one: unreachable (src/renderer/components/file-list/ErrorExpansion.tsx#error): The pattern shows one error string for one row and has no count, so there is no singular or plural wording to test.
- ErrorExpansion|many: unreachable (src/renderer/components/file-list/ErrorExpansion.tsx#onCopy): Only one row is expanded at a time (expandedRowId), so the pattern never renders twice; a mixed batch is the file table's area story.
- ErrorExpansion|boundary: duplicate (error-expansion.long-detail): ErrorExpansion codes no length cap or size limit, and the longest string it ever wraps is the long-detail scenario, so a boundary row would repeat it.
- ErrorExpansion|loading: unreachable (src/renderer/components/file-list/ErrorExpansion.tsx#handleCopy): A row in flight is Pending, Reading or Processing and cannot expand; the pattern appears only after a verdict, and its copy write settles at once.
- ErrorExpansion|intl: unreachable (src/renderer/components/file-list/ErrorExpansion.tsx#Click to copy): The pattern renders engine English text and the hardcoded English hint Click to copy, so no locale string reaches it and a locale adds no state of its own.
- ErrorExpansion|huge: duplicate (error-expansion.long-detail): One error string is the largest input the pattern takes; thousands of files stress the file table and the status bar, and long-detail already covers the string size.
- FolderRow|many: duplicate (folder-row.complete-expanded): A row shows one count string whatever its size, and the expanded row with twelve files already draws that wording, so a larger number adds no second look.
- FolderRow|boundary: duplicate (folder-row.long-path): The only threshold in the row is the forty character cut of middleTruncatePath, and the long path story already draws both sides of that cut.
- FolderRow|error: unreachable (src/renderer/components/file-list/FolderRow.tsx#renderCount): The discovery status has scanning, discovering, complete and empty and no error member, so a folder that cannot be read arrives as empty and is the recorded zero supported files finding.
- FolderRow|denied: unreachable (src/renderer/components/file-list/FolderRow.tsx#onToggle): The fold button is always enabled and takes no disabled prop, and a folder the app may not read is dispatched as empty, so no refused row exists to draw.
- FolderRow|stale: unreachable (src/renderer/components/file-list/FolderRow.tsx#fileCount): The row only mirrors the folder, count and status it is handed by the reducer and never rereads the folder, so it holds no state that can outlive its source.
- FolderRow|huge: unreachable (src/renderer/components/file-list/FolderRow.tsx#renderCount): Thousands of files only lengthen one number in one string; the stress of many folder rows and file rows belongs to the table that repeats this row.
- LanguageDropdown|empty: unreachable (src/renderer/components/settings/LanguageDropdown.tsx#LANGUAGE_NAMES): The list is built from a fixed constant of languages plus the System item, so it is never empty; a null current language is the System default the first story draws.
- LanguageDropdown|one: unreachable (src/renderer/components/settings/LanguageDropdown.tsx#TOTAL_ITEMS): The list always holds System and the same fixed set of languages, with no count shown, so there is no one-item list and no singular wording.
- LanguageDropdown|many: duplicate (language-dropdown.keyboard-end): The list always shows all 27 options at once, so many is the only size it has, and the End key story already opens that full list and scrolls it to the last item.
- LanguageDropdown|loading: unreachable (src/renderer/components/settings/LanguageDropdown.tsx#useI18n): The only loading frame is the one before the dictionary arrives, when the label function returns raw keys for a single frame; no pending style or spinner exists to draw.
- LanguageDropdown|error: unreachable (src/renderer/components/settings/LanguageDropdown.tsx#onLanguageChange): Choosing a language calls onLanguageChange and closes the list with no failure path of its own; saving the setting and any failure of it live outside the component.
- LanguageDropdown|denied: unreachable (src/renderer/components/settings/LanguageDropdown.tsx#handleSelect): Every option can always be chosen and no item takes a disabled or refused form, so a blocked version of the list does not exist.
- LanguageDropdown|long: unreachable (src/renderer/components/settings/LanguageDropdown.tsx#triggerLabel): The trigger label is fixed data, the longest being Portuguese (Brazil) with its English name, and it is cut with an ellipsis; how the trigger fits in a narrow drawer is an area question for Phase 73.
- LanguageDropdown|huge: duplicate (language-dropdown.keyboard-end): The list is a fixed 27 options inside a 280px scroller, so the largest input is the scrolled list that the End key story already draws.
- MetadataExpansion|loading: unreachable (src/renderer/components/file-list/MetadataExpansion.tsx#beforeMetadata): FileRow mounts the panel only for a Complete row that holds both maps, and a Pending, Reading or Processing row has no maps yet, so the panel is never drawn while a file is in flight.
- MetadataExpansion|error: unreachable (src/renderer/components/file-list/MetadataExpansion.tsx#MetadataExpansion): A failed row shows ErrorExpansion in place of the panel, and the panel takes two maps with no failure input, so a failure never reaches it.
- MetadataExpansion|denied: unreachable (src/renderer/components/file-list/MetadataExpansion.tsx#handleCopyAll): A refused file ends in the error state and shows its refusal text in ErrorExpansion, and the panel has no input that could carry a refusal.
- MetadataExpansion|stale: unreachable (src/renderer/components/file-list/MetadataExpansion.tsx#afterMetadata): The panel draws the two maps it was handed and never rereads the file, so it holds no stale state of its own; a source changed by another app ends the row in a commit failure that ErrorExpansion shows.
- MetadataExpansion|long: unreachable (src/renderer/components/file-list/MetadataExpansion.tsx#removedGroups): Each value is cut to 80 characters with the full text in a title before it reaches the panel layout, so no value longer than the cut can stress the panel; the cut itself is the field boundary story.
- MetadataExpansion|huge: duplicate (metadata-expansion.scrolls-at-max-height): Any number of fields lands in the same 300 pixel scrolling surface, so thousands of fields look like the scroll story; the large batch stress belongs to the file table.
- MetadataField|empty: unreachable (src/renderer/components/file-list/MetadataField.tsx#formatFieldValue): A field row is one name and one value, so it holds no collection that could be empty; a null value only leaves its value cell blank.
- MetadataField|one: unreachable (src/renderer/components/file-list/MetadataField.tsx#MetadataField): A field row carries no count, so it has no singular or plural wording to test; the counts belong to the group and the panel.
- MetadataField|many: unreachable (src/renderer/components/file-list/MetadataField.tsx#field): A field row never repeats itself, so a mix of rows exists only inside a group; metadata-group.many-fields shows it.
- MetadataField|loading: unreachable (src/renderer/components/file-list/MetadataField.tsx#displayValue): A field row is drawn from a finished read and has no in-flight form, so no value is ever shown as still arriving.
- MetadataField|error: unreachable (src/renderer/components/file-list/MetadataField.tsx#i18nLookup): A row shows one value from a finished read and has no failure input; a file that failed shows ErrorExpansion instead of any field.
- MetadataField|denied: unreachable (src/renderer/components/file-list/MetadataField.tsx#removed): No rule blocks a field from showing, and a refused file never reaches a field row because it ends in the error state.
- MetadataField|stale: unreachable (src/renderer/components/file-list/MetadataField.tsx#valueStr): A row shows the value it was handed and never rereads the file, so it holds no revalidation state of its own.
- MetadataField|long: duplicate (metadata-field.cut-at-limit): The row cuts every value at 80 characters, so a longer value renders exactly like the cut-at-limit row and adds no layout of its own.
- MetadataField|huge: duplicate (metadata-field.cut-at-limit): One value is the largest input a row takes and the 80 character cut bounds it, so the cut-at-limit row is the largest row a field can draw.
- MetadataGroup|happy: duplicate (metadata-group.many-fields): A group with its header and its field rows is the success path, and the many-fields row draws exactly that.
- MetadataGroup|empty: unreachable (src/renderer/components/file-list/MetadataGroup.tsx#MetadataGroup): MetadataExpansion filters out every group that has no fields before it renders one, so an empty group is never mounted.
- MetadataGroup|loading: unreachable (src/renderer/components/file-list/MetadataGroup.tsx#group): A group is built from a finished read through computeMetadataDiff, so there is no in-flight form of it.
- MetadataGroup|error: unreachable (src/renderer/components/file-list/MetadataGroup.tsx#fields): A group lists fields from a finished read and has no failure input; a failed file shows ErrorExpansion in place of any group.
- MetadataGroup|denied: unreachable (src/renderer/components/file-list/MetadataGroup.tsx#friendlyName): No rule blocks a group from showing, and a refused file ends in the error state before any group is built.
- MetadataGroup|stale: unreachable (src/renderer/components/file-list/MetadataGroup.tsx#i18nLookup): A group shows the fields it was handed and never rereads the file, so it holds no revalidation state of its own.
- MetadataGroup|long: unreachable (src/renderer/components/file-list/MetadataGroup.tsx#rawGroupName): The header is a translated group label or one of ExifTool's short group names, so it never outgrows its line; long text belongs to the values, which the field row cuts.
- MetadataGroup|intl: duplicate (metadata-expansion.arabic-plural): The Arabic panel story draws the translated group headers and the field rows in a right-to-left layout, which is every locale difference a group has.
- MetadataGroup|huge: duplicate (metadata-expansion.scrolls-at-max-height): A group never limits its own height; any number of fields scrolls inside the panel, which the scroll story already draws at thirty fields.
- StatusBar|many: duplicate (status-bar.all-cleaned): More files only change the digits in the same three segments, and the all-cleaned story already draws the finished form of a run.
- StatusBar|error: duplicate (status-bar.nothing-removed): The bar has no failed count, so a batch where every file failed reads zero of N cleaned with zero tags, the same markup the nothing-removed story already draws.
- StatusBar|denied: unreachable (src/renderer/components/ui/StatusBar.tsx#onCleanMore): The Clear button is always enabled whenever it is shown and takes no disabled prop, so no refused form of the bar exists to draw.
- StatusBar|stale: unreachable (src/renderer/components/ui/StatusBar.tsx#elapsedSeconds): The bar prints the numbers App hands it and never rereads a file, so it holds no figure that can outlive its source.
- StatusBar|long: unreachable (src/renderer/components/ui/StatusBar.tsx#interpolate): The three segments are short sentences filled with numbers; how the longest translations wrap across the whole bar is an area question that belongs to Phase 73.
- StatusBar|huge: unreachable (src/renderer/components/ui/StatusBar.tsx#totalTagsRemoved): A huge batch only makes the numbers longer inside the same segments; the stress of thousands of rows belongs to the file table, not to this bar.
- Toast|loading: unreachable (src/renderer/components/ui/Toast.tsx#message): The notice appears only after the copy or the skip has happened and never announces work in progress, so it has no pending form.
- Toast|error: unreachable (src/renderer/components/ui/Toast.tsx#visible): Toast has no error variant or style; a failed reveal is shown as ordinary notice text, which is the reveal-failed scenario, so a separate error cell adds nothing.
- Toast|denied: unreachable (src/renderer/components/ui/Toast.tsx#Toast): The notice takes no disabled or refused form and the file:reveal handler's only failure is a missing file (the reveal-failed scenario), so no deterministic refusal is left to display.
- Toast|huge: duplicate (toast.long-message): The notice holds one short sentence with a count, so the largest input is its longest translation, which the long-message scenario already shows.
- FileRow|empty: unreachable (src/renderer/components/file-list/FileRow.tsx#FileRow): A row always stands for exactly one file, so a row with nothing in it is not a state; a table with no files is the FileTable empty case and the empty screen is EmptyState.
- FileRow|one: duplicate (metadata-expansion.one-removed): A row has no singular wording of its own; the one-field count shown when a row is opened belongs to MetadataExpansion, whose one-removed scenario already draws it.
- FileRow|many: unreachable (src/renderer/components/file-list/FileRow.tsx#file): FileRow takes a single file prop and draws one row, so there is no plural state inside it; rows side by side are drawn by the FileTable stories.

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
