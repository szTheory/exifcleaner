# ExifCleaner Prototype — Session Feedback Log

## Round 1: Initial Build

**Prompt**: Build the full ExifCleaner UI/UX prototype from the synthesis spec (6 prior rounds of iteration baked into one detailed prompt).

**Output**: Single self-contained React component with all 4 states (empty → drag-over → processing → complete), dark mode, settings panel, metadata expansion, auto-play demo sequence, 16 demo files with folder hierarchy, and inline JS styles per spec.

---

## Round 2: Broken Link + Icon Centering

**Feedback**:
- The "Add files" link in the empty state was broken (no-op `onClick`)
- The file icon on the initial drop screen wasn't centered

**Changes**:
- **Icon centering**: Replaced `textAlign: "center"` (unreliable for SVG) with `display: "flex", justifyContent: "center"` on the parent div
- **Add files button**: Wired up to load all demo files in completed state so users can explore the UI immediately (since we can't open a native file picker in the sandbox)

---

## Round 3: Systematic Glitch Fixes

**Feedback**:
- Graphic glitches as items came in and processed
- Every row hover caused a visual pulse/glitch
- Rows contracted and expanded when one was hovered while expanded
- "Add files" after "Clean more" didn't restart the flow properly
- The demo auto-started instead of waiting for user interaction

**Root causes identified**:
1. **All sub-components (`FileRow`, `TitleBar`, `StatusIcon`, etc.) were defined as arrow functions inside the render body.** Every state change (including `setHoveredRow`) created new function references → React unmounted/remounted components → entrance animations replayed on every hover
2. **The `↗` reveal icon was conditionally rendered** (`{isHovered && ...}`), adding/removing a flex child → layout shift on hover
3. **Checkmark animation** had `animate={file.status === "complete"}` always true, replaying on every remount
4. **Auto-play `useEffect`** fired unconditionally on mount

**Changes**:
- **Flattened all inner components to inline JSX** in the render return. Render helpers (`renderStatusIcon`, `renderExpansion`) are plain functions, not React component declarations
- **↗ icon always in DOM**, toggled via `opacity: 0/1` and `pointerEvents: none/auto` instead of conditional rendering
- **Checkmark animation tracked via `animatedChecks` ref** — flag consumed on first render so animation plays exactly once
- **Removed auto-play entirely**. "Add files" calls `startDemo()` which runs the full animated processing sequence
- **`handleCleanMore` properly resets** all state including clearing timers, so "Add files" works cleanly after reset

---

## Round 4: Design Refinements

**Feedback**:
- Error message auto-showing in a row below was bad UX; "Can't read file" text was squished in the After column
- Folder icon was indented when it should be flush left
- Left border stripe on each row was unnecessary
- REMOVED/KEPT pills in the expansion didn't add much — strikethrough + red would be simpler
- Before/After tag count columns could be simplified (move to expansion view, keep just SIZE in table)

**Changes**:
- **Error UX reworked**: Error rows show a circle-X SVG icon in the status position. Hovering surfaces a tooltip above the row with the error message + "click for details" hint. Clicking expands for full selectable error text
- **Folder icons flush left**: Removed `paddingLeft: 30` from folder header rows
- **Left border stripe removed**: No more `borderLeft` on file rows
- **Tags simplified**: Removed REMOVED/KEPT pill badges. Removed tags show as `strikethrough + red text at 70% opacity`. Preserved tags in normal body text color
- **Before/After columns removed**: Table simplified to NAME | TYPE | SIZE. Tag counts moved to expansion panel header

---

## Round 5: Restoring Columns + Green Tags

**Feedback**:
- Before/After tag count columns are important for scannability — that's the whole point of the app
- Auto-expanding rows after processing was annoying
- Preserved tags should show in green in the expansion (not just body text)

**Changes**:
- **Before/After columns restored** in table header and file rows
- **Auto-expand timers removed** (the two `setExpandedRowIndex` calls that fired after completion)
- **Preserved tags rendered in success green** (`th.success`) instead of body text color in the expansion panel

---

## Round 6: Polish & Interaction Refinements

**Feedback**:
- Folders should be collapsible/expandable (expanded by default, click to toggle)
- Column header labels (TYPE, SIZE, BEFORE, AFTER) should be left-aligned — right-alignment caused visual clutter
- Type pills should be color-coded per file extension for scannability
- Error expansion should auto-copy to clipboard on click (with `cursor: copy` and toast), not show "Click to select" helper text
- Status bar should show how long the batch took to process

**Changes**:
- **Collapsible folders**: Added `collapsedFolders` state (Set). Folder rows show a `▾`/`▸` chevron with 150ms rotate animation. Click toggles. Hierarchical collapse: collapsing "Camera Roll/" hides all sub-folders and their files via prefix matching in `isFileHidden`
- **Left-aligned column headers**: Changed `textAlign` from `"right"`/`"center"` to `"left"` for TYPE, SIZE, BEFORE, AFTER headers and their corresponding data cells
- **Color-coded type pills**: Added `typePillColors` map with light/dark mode pairs — blue (JPG), purple (HEIC), green (PNG), red (PDF), amber (MOV/MP4), orange (DNG)
- **Error click-to-copy**: Error expansion text has `cursor: "copy"`, highlights with `errorBg` on hover, copies full error message via `navigator.clipboard.writeText()` on click, shows "Copied to clipboard" toast
- **Processing duration**: `processingStartRef` captures start time. On completion, elapsed time computed and displayed in status bar as `· {duration}s` in muted text after tag count
