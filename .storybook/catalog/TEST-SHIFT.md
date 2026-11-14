<!-- Generated from test-shift.json by .storybook/catalog/catalog.mjs. Do not edit: edit test-shift.json and run yarn catalog:write. -->

# Test shift ledger

Baseline commit: 66c8c39f3f4223a1c099d739467a2704ef5be179

One row per `expect(`, `expect.soft(` or `expect.poll(` call inside a test callback of the six specs below, grouped by test title. A `kept` row stays in the e2e spec for the reason shown. A `deleted` row moved to the named story, whose export source holds the evidence.

## accessibility

### supports keyboard tab navigation through interactive elements

| n | verdict | code | story or reason | covers | evidence | note |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | deleted | expect(nonBodyFocused.length).toBeGreaterThan(0) | screens-app--empty | focus-order | userEvent.tab() | Story Tabs from a blurred start and asserts Choose files… gains focus, stronger than some non-body element; simulated Tab (D-03 residual) |
| 2 | deleted | expect(gearFocused).toBe(true) | screens-app--empty | focus-order | Open settings | Gear is the third Tab stop in the story; simulated Tab (D-03), real-Chromium backstop is the kept drawer focus-trap test |

### uses file, folder, then settings focus order

| n | verdict | code | story or reason | covers | evidence | note |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | deleted | expect(primary).toBeFocused() | screens-app--empty | focus-order | Choose files… | First stop after a blurred start; simulated Tab (D-03 residual), real-Chromium backstop is the kept drawer focus-trap test |
| 2 | deleted | expect(page.locator(".empty-state__button--secondary")).toBeFocused() | screens-app--empty | focus-order | Choose folder… | Second stop; simulated Tab (D-03 residual), real-Chromium backstop is the kept drawer focus-trap test |
| 3 | deleted | expect(page.locator(".gear-icon")).toBeFocused() | screens-app--empty | focus-order | Open settings | Third stop; simulated Tab (D-03 residual), real-Chromium backstop is the kept drawer focus-trap test |

### shows visible focus indicator on focused elements

| n | verdict | code | story or reason | covers | evidence | note |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | deleted | expect(hasFocusIndicator).toBe(true) | ui-emptystate--button-keyboard-focus | focus-indicator | outlineStyle | Story checks :focus-visible and a solid outline on Choose files after Tab, not the gear; the e2e also accepted box-shadow |

### has ARIA roles on interactive elements

| n | verdict | code | story or reason | covers | evidence | note |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | deleted | expect(buttonCount).toBeGreaterThan(0) | ui-emptystate--copy-mode-on | aria-name | getAllByRole("button") | Buttons are found by role; the play throws unless both render |
| 2 | deleted | expect(gearAccessibleName).not.toBeNull() | icons-gearicon--closed | aria-name | Open settings | Partial: story finds the button by name Open settings and asserts toBeInTheDocument; e2e read the aria-label (Pitfall 10) |
| 3 | deleted | expect(gearAccessibleName).toContain("settings") | icons-gearicon--closed | aria-name | Open settings | Partial: story finds the button by name Open settings; the e2e checked the aria-label contains settings (Pitfall 10) |
| 4 | deleted | expect(mainRole).toBeVisible() | screens-app--empty | aria-name | getByRole("main") | Main landmark asserted visible by the Empty play (added in 75-01) |
| 5 | deleted | expect(dropZoneLabel).not.toBeNull() | ui-dropzone--idle | aria-name | File drop zone | Region found by its accessible name File drop zone; the e2e read the aria-label attribute |

### traps focus within settings drawer when open

| n | verdict | code | story or reason | covers | evidence | note |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | kept | expect(drawer).toBeVisible() | real-electron |  |  |  |
| 2 | kept | expect(focusableCount).toBeGreaterThan(0) | real-electron |  |  |  |
| 3 | kept | expect(outsideCount).toBe(0) | real-electron |  |  |  |
| 4 | kept | expect(drawer).toHaveCount(0) | real-electron |  |  |  |

## app-launch

### shows the main window on launch

| n | verdict | code | story or reason | covers | evidence | note |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | kept | expect(isVisible).toBe(true) | window-chrome |  |  |  |

### displays ExifCleaner as the window title

| n | verdict | code | story or reason | covers | evidence | note |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | kept | expect(title).toBe("ExifCleaner") | window-chrome |  |  |  |

### shows the empty drop zone state

| n | verdict | code | story or reason | covers | evidence | note |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | deleted | expect(emptyState).toBeVisible() | ui-emptystate--copy-mode-on | layout | toBeVisible | h1 toBeVisible also checks the section.empty-state ancestor, not only the heading; the e2e asserted the section itself |
| 2 | deleted | expect(emptyState.locator("h1")).toHaveText("Add files to clean") | screens-app--empty | text | Add files to clean | Heading found by its accessible name; the e2e matched the h1 text |
| 3 | deleted | expect(emptyState.locator('.empty-state__instruction[aria-hidden="false"]')).toHaveText("Drop images, videos, or PDFs here, or choose an option.") | ui-emptystate--copy-mode-on | text | SUBTITLE | SUBTITLE is a file-level constant reached through expectScreen, which compares the idle line's textContent to it |
| 4 | deleted | expect(emptyState.locator(".empty-state__button--primary")).toHaveText("Choose files…") | screens-app--empty | text | Choose files… |  |
| 5 | deleted | expect(emptyState.locator(".empty-state__button--secondary")).toHaveText("Choose folder…") | screens-app--empty | text | Choose folder… |  |
| 6 | deleted | expect(outputMode).toHaveText(/Cleaned copies will be created — originals stay untouched\.\|Files will be cleaned in place\./) | ui-emptystate--copy-mode-on | text | COPY_ON | Stricter than the e2e regex, which also accepted the in-place sentence; that one is COPY_OFF in ui-emptystate--copy-mode-off. |
| 7 | deleted | expect(metrics.buttonHeights.every((height) => height >= 40)).toBe(true) | ui-emptystate--copy-mode-on | layout | getBoundingClientRect | Both buttons at least 40 high, measured in real Chromium (added to the story in 75-01, D-02) |
| 8 | deleted | expect(metrics.gap).toBeGreaterThanOrEqual(8) | ui-emptystate--copy-mode-on | layout | gap | Actions row computed gap at least 8 (added to the story in 75-01, D-02) |
| 9 | deleted | expect(metrics.buttonBackgrounds[0]).not.toBe(metrics.buttonBackgrounds[1]) | ui-emptystate--copy-mode-on | layout | backgroundColor | Primary and secondary backgroundColor differ (added to the story in 75-01, D-02) |

### keeps first-run content usable at 200% zoom

| n | verdict | code | story or reason | covers | evidence | note |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | kept | expect(window.locator(".empty-state__button--primary")).toBeVisible() | real-electron |  |  |  |
| 2 | kept | expect(layout).not.toBeNull() | real-electron |  |  |  |
| 3 | kept | expect(layout?.canScroll).toBe(true) | real-electron |  |  |  |
| 4 | kept | expect(layout?.statusTop).toBeGreaterThanOrEqual(layout?.contentBottom ?? 0) | real-electron |  |  |  |

### has DevTools closed on launch

| n | verdict | code | story or reason | covers | evidence | note |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | kept | expect(isDevToolsOpened).toBe(false) | window-chrome |  |  |  |

## dark-mode

### activates dark mode via nativeTheme

| n | verdict | code | story or reason | covers | evidence | note |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | kept | expect(dataTheme).toBe("dark") | native-theme |  |  |  |
| 2 | kept | expect(shouldUseDark).toBe(true) | native-theme |  |  |  |

### renders all components correctly in dark mode

| n | verdict | code | story or reason | covers | evidence | note |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | kept | expect(dropZone).toBeVisible() | real-electron |  |  | flips to deleted in 75-02 (D-01) |
| 2 | kept | expect(gearButton).toBeVisible() | real-electron |  |  | flips to deleted in 75-02 (D-01) |
| 3 | kept | expect(emptyState).toBeVisible() | real-electron |  |  | flips to deleted in 75-02 (D-01) |
| 4 | kept | expect(hasZeroOpacity).toBe(false) | real-electron |  |  | flips to deleted in 75-02 (D-01) |

### switches back to light mode

| n | verdict | code | story or reason | covers | evidence | note |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | kept | expect(dataTheme).toBe("light") | native-theme |  |  |  |

### respects system theme setting

| n | verdict | code | story or reason | covers | evidence | note |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | kept | expect(isVisible).toBe(true) | native-theme |  |  |  |
| 2 | kept | expect(main).toBeVisible() | native-theme |  |  |  |

## file-size-display

### shows the real byte size of a processed file

| n | verdict | code | story or reason | covers | evidence | note |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | kept | expect(sizeWhenAdded, "fixture must be non-empty for this test to mean anything").toBeGreaterThan(0) | filesystem |  |  |  |
| 2 | kept | expect(sizeWhenAdded).toBeLessThan(1024) | filesystem |  |  |  |
| 3 | kept | expect(sizeCell).toHaveText(new RegExp(`^${sizeWhenAdded} B → [1-9][0-9]* B$`)) | filesystem |  |  |  |

### shows 0 B only when the file is genuinely empty

| n | verdict | code | story or reason | covers | evidence | note |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | kept | expect(fs.statSync(emptyFile).size).toBe(0) | filesystem |  |  |  |
| 2 | kept | expect(sizeCell).toHaveText("0 B") | filesystem |  |  |  |

### gives each row its own size rather than repeating one value

| n | verdict | code | story or reason | covers | evidence | note |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | kept | expect(new Set(sizesWhenAdded).size, "fixtures must have distinct sizes for this test to detect mismapping").toBe(3) | filesystem |  |  |  |
| 2 | kept | expect(labels).toHaveLength(3) | filesystem |  |  |  |
| 3 | kept | expect(new Set(labels).size, "each row should show its own size").toBe(3) | filesystem |  |  |  |
| 4 | kept | expect(labels).not.toContain("0 B") | filesystem |  |  |  |

### status bar reports a real tag count, not a placeholder

| n | verdict | code | story or reason | covers | evidence | note |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | kept | expect(tagsRemoved).toBeVisible() | filesystem |  |  |  |
| 2 | kept | expect(Number(value), "sample.jpg carries metadata, so a zero here means the count is not wired").toBeGreaterThan(0) | filesystem |  |  |  |

## i18n

### displays UI text in default language (English)

| n | verdict | code | story or reason | covers | evidence | note |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | kept | expect(title).toBeVisible() | real-electron |  |  | flips to deleted in 75-02 (D-01) |
| 2 | kept | expect(titleText).toContain("Add files to clean") | real-electron |  |  | flips to deleted in 75-02 (D-01) |

### switches language via IPC and updates UI text

| n | verdict | code | story or reason | covers | evidence | note |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | kept | expect(title).toBeVisible() | ipc |  |  |  |
| 2 | kept | expect(englishText).toContain("Add files to clean") | ipc |  |  |  |
| 3 | kept | expect(frenchText).toContain("Ajoutez des fichiers") | ipc |  |  |  |
| 4 | kept | expect(frenchText).not.toBe(englishText) | ipc |  |  |  |

### switches to a non-Latin language

| n | verdict | code | story or reason | covers | evidence | note |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | kept | expect(title).toBeVisible() | not-renderable |  |  |  |
| 2 | kept | expect(japaneseText).toContain("ファイル") | not-renderable |  |  |  |
| 3 | kept | expect(japaneseText).not.toContain("Add files to clean") | not-renderable |  |  |  |

### switches to Romanian

| n | verdict | code | story or reason | covers | evidence | note |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | kept | expect(title).toHaveText("Adaugă fișiere pentru curățare") | not-renderable |  |  |  |
| 2 | kept | expect(window.getByRole("button", {name: "Alege fișiere…"})).toBeVisible() | not-renderable |  |  |  |

### uses RTL direction, visual action order, and a localized count in Arabic

| n | verdict | code | story or reason | covers | evidence | note |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | kept | expect(window.locator("html")).toHaveAttribute("dir", "rtl") | real-electron |  |  | flips to deleted in 75-02 (D-01) |
| 2 | kept | expect(filesBox).not.toBeNull() | real-electron |  |  | flips to deleted in 75-02 (D-01) |
| 3 | kept | expect(folderBox).not.toBeNull() | real-electron |  |  | flips to deleted in 75-02 (D-01) |
| 4 | kept | expect(filesBox?.x).toBeGreaterThan(folderBox?.x ?? Number.POSITIVE_INFINITY) | real-electron |  |  | flips to deleted in 75-02 (D-01) |
| 5 | kept | expect(window.locator(".toast")).toContainText("ملفات غير مدعومة تم تخطيها: 1") | ipc |  |  |  |

## metadata-inspection

### expands a processed file to show metadata details

| n | verdict | code | story or reason | covers | evidence | note |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | kept | expect(fileRow).toBeVisible() | real-electron |  |  | flips to deleted in 75-02 (D-01) |
| 2 | kept | expect(expansion).toBeVisible() | real-electron |  |  | flips to deleted in 75-02 (D-01) |

### shows metadata groups with before/after diff

| n | verdict | code | story or reason | covers | evidence | note |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | kept | expect(expansion).toBeVisible() | real-electron |  |  |  |
| 2 | kept | expect(groupCount).toBeGreaterThan(0) | real-electron |  |  | flips to deleted in 75-02 (D-01) |
| 3 | kept | expect(fieldCount).toBeGreaterThan(0) | filesystem |  |  |  |
| 4 | kept | expect(hasKnownTag, `Expected at least one of ${knownTags.join(", ")} in metadata fields. Found: ${allNames.join(", ")}`).toBe(true) | filesystem |  |  |  |

### shows removed indicators for stripped metadata tags

| n | verdict | code | story or reason | covers | evidence | note |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | kept | expect(expansion).toBeVisible() | real-electron |  |  |  |
| 2 | kept | expect(removedCount).toBeGreaterThan(0) | filesystem |  |  |  |
| 3 | kept | expect(iconText).toBe("\u2212") | real-electron |  |  | flips to deleted in 75-02 (D-01) |
| 4 | kept | expect(preservedCount).toBeGreaterThan(0) | filesystem |  |  |  |
| 5 | kept | expect(preservedIconText).toBe("\u2713") | real-electron |  |  | flips to deleted in 75-02 (D-01) |

## Known limits

- The count is lexical: one item per `expect(`, `expect.soft(` or `expect.poll(` call in a test callback. A loop body counts once however many times it runs.
- Assertions inside helper functions are invisible to the count. The six specs call two such helpers, `assertDirEffect` (throws on an unexpected directory change) and `waitForProcessing` (throws on a timeout).
- Two `afterEach` console-error guards, one in app-launch and one in metadata-inspection, sit outside any test. They stay and guard every kept test.
- A story's simulated Tab is not a trusted browser Tab. The accessibility test "traps focus within settings drawer when open" stays as the real-Chromium backstop for focus handling.
- A `deleted` item's evidence literal is matched by presence in the story's export source plus the same-file helpers it calls. That does not prove the literal belongs to the statement making the claim.
- The dark-mode test "renders all components correctly in dark mode" scans the whole document for zero-opacity elements. The story side covers only the `screens-app--empty` level-1 heading's `toBeVisible`, which checks that element and its ancestor chain, plus the play's `data-theme` assertion. This is a named reduction, not equivalence.
