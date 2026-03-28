# Prompt A-3: "Clean Table with Metadata Modal" — ExifCleaner UI Prototype

> Copy-paste this entire file into Claude (artifacts) or v0 to generate an interactive mockup.
> This is a revision of Prompt A-2, replacing the inline metadata accordion with a centered metadata modal popup. Everything else stays the same.

---

## System Context

You are a senior UI designer building an interactive React prototype of **ExifCleaner**, a cross-platform Electron desktop app that strips EXIF/metadata from images, videos, and PDFs.

**Your job**: Build a single React component (with Tailwind CSS) that simulates the complete app experience. The prototype must be interactive — buttons work, states change, animations play. It runs in a browser but **looks and feels like a native macOS desktop app**.

**This prototype must demonstrate**:
1. A progress bar showing overall batch progress
2. Clickable rows that open a metadata detail modal
3. A "reveal in Finder" action on hover and in the modal footer
4. Scrolling behavior with **38 files** (not 6 — we need to stress-test the table)
5. Folder/subfolder grouping with collapsible group headers

**Output**: One self-contained React component. No external dependencies beyond React and Tailwind. No separate files. Everything in one artifact.

---

## Visual Design System

### Colors (use these exact hex values)

**Light Mode:**
```
Background:        #F5F6F8
Surface/cards:     #FFFFFF
Borders:           #DADEE4
Body text:         #3B4351
Heading text:      #1E2028
Muted text:        #9BA3B0
Secondary text:    #66758C
Window chrome:     #FAFAFA
Group header bg:   #EEF0F3  (slightly darker than surface, for folder group rows)

Brand burgundy:    #521737  (focus rings, accents, links)
Brand gold:        #F8D057  (progress bar, active states, drag-over)
Brand orange:      #E97043  (hover accents)

Success:           #2D8659  (completion checkmark, progress bar done state)
Success bg:        #E8F5EE  (subtle row flash on complete, preserved badge)
Error:             #C44536  (failed processing)
Error bg:          #FCEAE8  (subtle error row tint, removed badge)

Strikethrough:     #C44536  (removed metadata tags)
Preserved tag:     #2D8659  (kept metadata tags like Orientation)
```

**Dark Mode:**
```
Background:        #141416
Surface/cards:     #1C1C1F
Elevated surface:  #252528
Borders:           #48484D
Body text:         #C5C5CB
Heading text:      #EEEEF0
Muted text:        #818188
Window chrome:     #0E0E10
Group header bg:   #1C1C1F  (surface color for folder groups)

Brand burgundy:    #C4467A  (lightened for dark bg)
Brand gold:        #F8D057  (unchanged — naturally luminous)
Brand orange:      #E97043  (unchanged)

Success:           #2D8659
Success bg:        #1A3D2B
Error:             #C44536
Error bg:          #3D1A16

Strikethrough:     #E97043  (brighter on dark for visibility)
Preserved tag:     #2D8659
```

### Typography

```
Font family:    system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif
Font mono:      ui-monospace, "SF Mono", Menlo, Consolas, monospace

Base size:      16px (body text)
Small:          14px (captions, secondary info, counter text)
Micro:          12px (timestamps, metadata keys, tag counts)
H4/labels:      16px, weight 600
H3/titles:      20px, weight 500
H2:             24px, weight 500

Line height:    1.5 (body), 1.25 (headings), 1.4 (metadata panel)
```

### Spacing

```
4px   — tight gaps (icon-to-text)
8px   — default gap, table cell horizontal padding
12px  — table cell vertical padding, compact padding, folder indent
16px  — standard padding (cards, buttons, modal body)
24px  — section gaps
32px  — large gaps, modal padding
```

### Borders & Shadows

```
Border radius:  2px (small/badges), 4px (medium), 8px (large/cards/modals)
Border width:   1px default

Shadow sm:      0 1px 3px rgba(0,0,0,0.08)
Shadow md:      0 4px 16px rgba(0,0,0,0.12)
Shadow lg:      0 8px 32px rgba(0,0,0,0.16)

Dark shadow md: 0 4px 16px rgba(0,0,0,0.4)
Dark shadow lg: 0 8px 32px rgba(0,0,0,0.5)
```

### Motion

```
Micro:       100ms ease-out     (hover, focus rings, reveal icon appear)
Fast:        200ms ease-out     (row entrance, modal content fade-in)
Medium:      300ms ease-in-out  (completion checkmark, progress bar fill)
Spring:      300ms cubic-bezier(0.34, 1.56, 0.64, 1.0)  (checkmark pop)
Bar fill:    300ms ease-out     (progress bar per-file increment)
Modal:       200ms ease-out     (modal scale-in / fade-out)

IMPORTANT: Wrap all animations in prefers-reduced-motion check.
```

---

## App Layout

### Window Chrome

Simulate a macOS window with:
- **Title bar**: 38px tall, background matches window chrome color
- **Traffic lights**: Three circles (12px diameter) — red `#FF5F57`, yellow `#FFBD2E`, green `#27C93F` — positioned 12px from left, vertically centered
- **Title text**: "ExifCleaner" centered in title bar, muted text color, 13px font size
- **Gear icon** (⚙): In title bar, left of dark mode toggle. Opens settings modal.
- **Dark mode toggle**: Sun/moon icon, right side of title bar.

### Progress Bar

A thin bar directly below the title bar:

```
┌─────────────────────────────────────────────────────────┐
│ ● ● ●                    ExifCleaner         ⚙   ☀/☽  │  ← 38px title bar
├█████████████████████════════════════════════════════════─┤  ← 3px progress bar
│                                            14 of 38     │  ← counter (right-aligned, 12px, muted)
│                                                         │
│  table / drop zone...                                   │
│                                                         │
├─────────────────────────────────────────────────────────┤
│                                              Clear ⌘K   │  ← fixed footer (32px)
└─────────────────────────────────────────────────────────┘
```

**Progress bar behavior**:
- **Hidden** in empty state (State 1) — no bar visible
- **Appears** when processing starts (State 3), starting at 0%
- **Fill color**: Gold `#F8D057` on a transparent/border-color track
- **Width**: Percentage of completed files (completed / total × 100%)
- **Animation**: Each increment animates smoothly (300ms ease-out)
- **Counter text**: "14 of 38" right-aligned just below the bar, 12px, muted text. Updates as each file completes.
- **On completion**: Bar fills to 100%, briefly flashes success green (`#2D8659`, 500ms), then fades to transparent (200ms). Counter changes to "38 of 38 — All clean" in success color.
- **Dark mode**: Gold bar on transparent track. Same behavior.

### Fixed Footer

A thin footer bar pinned to the bottom of the window:
- Height: 32px
- Background: Same as window chrome (subtle separation)
- Border-top: 1px border color
- Contains "Clear (⌘K)" button, right-aligned, muted text
- **Only visible** when files are present (States 3 and 4)
- Click clears everything and returns to State 1

### Content Area Layout

Between the progress bar and the footer:
- **Scrollable area**: `overflow-y: auto` with custom thin scrollbar
- **Sticky table header**: The column headers (`Filename`, `Before`, `After`) stick to the top of the scroll area
- **Table body scrolls** underneath the sticky header

**Total viewport**: 580px wide × 460px tall (slightly taller than Prompt A to accommodate more rows comfortably).

---

## State Machine

### State 1: Empty (initial)

The drop zone. Centered content, dashed border, inviting. No progress bar, no footer.

```
┌─────────────────────────────────────────────────────────┐
│ ● ● ●                    ExifCleaner         ⚙   ☀/☽  │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┐   │
│  │                                                  │   │
│  │                 [images icon]                     │   │  ← 48px, muted color
│  │                                                  │   │
│  │         Drop files here to                       │   │  ← secondary text, 16px
│  │           remove metadata                        │   │
│  │                                                  │   │
│  │     [Add files]        [Add folder]              │   │  ← two text buttons
│  │                                                  │   │
│  └─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┘   │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

- Dashed border: 2px dashed, secondary text color, 8px border-radius
- Content: vertically and horizontally centered
- Icon: Simple SVG (two overlapping rectangles representing images)
- **"Add files"** button: Text-style, muted color, underline on hover. Simulates dropping 8 individual files (flat list).
- **"Add folder"** button: Text-style, muted color, underline on hover. Simulates dropping a folder tree producing 38 files with group headers.

### State 2: Drag Over

- Border: 2px dashed gold (`#F8D057`)
- Background: gold at 5% opacity
- Text: "Release to clean" in gold, weight 600
- Icon turns gold
- Transition: 150ms ease-out

### State 3: Processing

Progress bar appears. Table populates. Files process sequentially.

```
┌─────────────────────────────────────────────────────────┐
│ ● ● ●                    ExifCleaner         ⚙   ☀/☽  │
├████████████════════════════════════════════════════════──┤
│                                             8 of 38     │
│  Filename              Before        After              │  ← STICKY HEADER
│  ──────────────────────────────────────────────────     │
│  📁 Photos/ (18 files)                                  │  ← folder group header
│    ✓ IMG_0001.jpg        23            0                │
│    ✓ IMG_0002.jpg        31            0                │
│    ⟳ IMG_0003.jpg        18           ...               │  ← currently processing
│    ● IMG_0004.jpg         —             —               │
│    ● IMG_0005.jpg         —             —               │
│    ...                                                  │
│  📁 Photos/vacation/ (6 files)                          │
│    ● beach_sunset.jpg     —             —               │
│    ...                                                  │  ← scrollable
├─────────────────────────────────────────────────────────┤
│                                              Clear ⌘K   │  ← fixed footer
└─────────────────────────────────────────────────────────┘
```

- Table headers: weight 600, secondary text color, sticky at top of scroll area
- Progress bar fills as files complete
- File rows animate in staggered (fast: 50ms apart for 38 files)
- Processing spinner: small gold CSS spinner (12px) left of filename
- Auto-scroll: as processing advances, the scroll position follows the currently-processing file (keeps it visible)

### State 4: Complete

All files processed. Progress bar turns green briefly, then fades. Mix of success and error. Clicking a completed row opens the metadata modal.

```
┌─────────────────────────────────────────────────────────┐
│ ● ● ●                    ExifCleaner         ⚙   ☀/☽  │
├─────────────────────────────────────────────────────────┤  ← progress bar faded
│                                   36 of 38 — All clean  │
│  Filename              Before        After              │
│  ──────────────────────────────────────────────────     │
│  📁 Photos/ (18 files)                           [▼]    │
│    ✓ IMG_0001.jpg        23            0          ↗     │  ← reveal icon on hover
│    ✓ IMG_0002.jpg        31            0                │
│    ✓ IMG_0003.jpg        18            0                │
│    ✓ IMG_0004.jpg        27            0                │  ← click → metadata modal
│    ✓ IMG_0005.jpg        14            0                │
│    ...                                                  │
│  📁 Documents/ (3 files)                                │
│    ✗ locked_file.pdf      —        Can't read           │  ← click → error modal
│    ...                                                  │
├─────────────────────────────────────────────────────────┤
│                                              Clear ⌘K   │
└─────────────────────────────────────────────────────────┘
```

---

## Metadata Modal

Clicking any **completed** file row (success or error) opens a centered metadata detail modal.

### Modal Layout (Success)

```
┌───────────────────────────────────────────────┐
│                                               │
│  IMG_0004.jpg                            [X]  │  ← 20px, weight 500
│                                               │
├───────────────────────────────────────────────┤
│  27 tags examined · 25 removed · 2 preserved  │  ← summary bar
├───────────────────────────────────────────────┤
│                                               │
│  Camera Make        Canon              REMOVED│  ← strikethrough, red badge
│  Camera Model       EOS R5             REMOVED│
│  Lens Model         RF 24-70mm f/2.8   REMOVED│
│  F Number           f/2.8              REMOVED│
│  ISO                400                REMOVED│
│  GPS Latitude       37.7749° N         REMOVED│
│  GPS Longitude      -122.4194° W       REMOVED│
│  Date/Time Original 2025-08-14 16:32   REMOVED│
│                                               │
│  ... 17 more removed tags                     │  ← expandable
│                                               │
│  ────────────────────────────────────         │
│  Color Space        sRGB           PRESERVED  │  ← green badge
│  Orientation        Horizontal     PRESERVED  │
│                                               │
├───────────────────────────────────────────────┤
│                     [Reveal in Finder]  [Done]│  ← footer buttons
└───────────────────────────────────────────────┘
```

### Modal Specs

- **Width**: 440px
- **Max height**: 70vh (scrollable tag list if needed)
- **Border radius**: 8px
- **Shadow**: shadow-lg
- **Background**: surface color
- **Backdrop**: heading text color at 30% opacity

### Modal Header

- **Filename**: heading text color, 20px, weight 500
- **Close button**: X icon (16px), muted text, top-right corner, hover → secondary text
- **Padding**: 24px top, 24px horizontal, 16px bottom

### Summary Bar

- **Background**: group header bg (`#EEF0F3` light / `#1C1C1F` dark)
- **Text**: 14px, centered
- **Format**: "X tags examined · Y removed · Z preserved"
  - "Y removed" in error color
  - "Z preserved" in success color
  - Dot separators in muted text
- **Padding**: 12px vertical, 24px horizontal

### Tag List

- **Font**: monospace, 12px (micro)
- **Two-column layout per row**: Tag name (left, ~180px) + Tag value (right, fills remaining)
- **Row height**: 28px
- **Removed tags**:
  - Tag name + value in strikethrough, muted text color
  - "REMOVED" badge at right: error bg, error text, micro font, 2px vertical padding, 6px horizontal padding, 2px radius
- **Preserved tags**:
  - Tag name + value in body text color (no strikethrough)
  - "PRESERVED" badge at right: success bg, success text, same sizing as REMOVED badge
- **Divider line**: 1px border color between removed and preserved sections
- **Show first 8 tags by default**. If more exist, show "... N more removed tags" link in burgundy/brand color. Click to expand all.
- **Scrollable**: if tag list exceeds modal max-height, the tag list area scrolls (header and footer stay fixed)
- **Padding**: 24px horizontal, 16px vertical

### Modal Footer

- **Padding**: 16px vertical, 24px horizontal
- **Top border**: 1px border color
- **Buttons right-aligned**:
  - "Reveal in Finder": secondary style — secondary text color, transparent bg, 1px border color, 4px radius, 14px text, 8px vertical padding, 16px horizontal padding. Hover: group header bg.
  - "Done": primary style — gold bg (#F8D057), heading text color, 4px radius, 14px text, weight 600, 8px vertical padding, 16px horizontal padding. Hover: slightly darker gold.
- **Gap between buttons**: 8px

### Modal Animation

- **Open**: Backdrop fades in (200ms). Modal scales from 0.95 → 1.0 and fades in (200ms ease-out).
- **Close**: Modal fades out (150ms). Backdrop fades out (150ms).
- **Triggers to close**: Click backdrop, press Escape, click X button, click Done button.

### Modal for Error Files

When clicking an error row, the modal shows a simplified error view:

```
┌───────────────────────────────────────────────┐
│  locked_file.pdf                         [X]  │
├───────────────────────────────────────────────┤
│                                               │
│              [error icon — red X, 32px]       │
│                                               │
│              Permission denied                │  ← heading text, 16px, weight 500
│                                               │
│  ExifTool: "Error opening file —              │  ← mono, 12px, muted
│  permission denied"                           │
│                                               │
│  Check file permissions or try running        │  ← body text, 14px
│  ExifCleaner as administrator.                │
│                                               │
├───────────────────────────────────────────────┤
│                     [Reveal in Finder]  [Done]│
└───────────────────────────────────────────────┘
```

---

## Row Interactions

### Hover State

When the user hovers over any file row (not group headers):
- Row background highlights to `#EEF0F3` light / `#252528` dark
- A small **reveal icon** (↗ arrow or folder icon) fades in at the right edge of the row
- The reveal icon is 14px, muted color, only visible on hover
- Cursor: pointer (for completed rows); cursor: default (for processing/pending rows)

### Click Row → Open Metadata Modal

Clicking a **completed** row (success or error) opens the metadata modal (see "Metadata Modal" section above).

**Only completed rows are clickable**. Processing/pending rows are not interactive (cursor: default).

### Double-Click or Reveal Icon Click → Reveal in Finder

Double-clicking a row OR clicking the hover reveal icon (↗) simulates "Reveal in Finder":
- A small toast/tooltip appears near the row: "Revealed in Finder" with a folder icon
- Toast style: surface bg, shadow-sm, border, 12px text, rounded-md
- Toast fades in (100ms), holds 1.5 seconds, fades out (200ms)
- This is purely visual simulation — in the real app it would call `shell.showItemInFolder()`
- "Reveal in Finder" is also accessible via the button in the metadata modal footer

---

## Folder Group Headers

When the "Add folder" button is clicked, files appear organized by folder:

### Group Header Row Design

```
│  📁 Photos/ (18 files)                           [▼]   │
```

- Background: group header bg (`#EEF0F3` light / `#1C1C1F` dark)
- Text: 14px, weight 600, body text color
- Folder icon: 📁 emoji or simple folder SVG, 14px
- File count: "(18 files)" in muted text
- Collapse toggle: small [▼] / [▶] chevron at right edge
- Click header → collapse/expand its files (toggle visibility with 200ms slide animation)
- Group headers span the full table width (they're not data rows)
- Group headers are NOT counted in the progress counter

### Subfolder Nesting

```
│  📁 Photos/ (12 files)                           [▼]   │  ← top-level folder
│    ✓ IMG_0001.jpg        23            0                │  ← 12px indent
│    ✓ IMG_0002.jpg        31            0                │
│    ...                                                  │
│  📁 Photos/vacation/ (6 files)                   [▼]   │  ← subfolder (same indent level)
│    ✓ beach_sunset.jpg    14            0                │  ← 12px indent
│    ✓ hotel_room.heic     22            0                │
│    ...                                                  │
│  📁 Documents/ (5 files)                         [▼]   │  ← different top-level folder
│    ✓ tax_return_2024.pdf  8            0                │
│    ...                                                  │
```

- All file rows within a group are indented 12px from the left
- Subfolder headers use the full path: "Photos/vacation/" (not just "vacation/")
- Collapsing a parent folder hides all its files
- Collapse state is independent per group

### Flat List (No Folders)

When "Add files" is clicked (individual files, no folders):
- No group headers appear
- Files are listed flat in the table, same as Prompt A
- No indentation
- This is the simple case

---

## Scroll Behavior

The table must handle 38 files gracefully:

- **Sticky header**: `Filename | Before | After` row sticks to the top of the scroll area, with a subtle bottom shadow when scrolled (`box-shadow: 0 1px 3px rgba(0,0,0,0.08)`)
- **Native scrolling**: `overflow-y: auto` on the table container
- **Thin scrollbar**: Style with CSS (webkit-scrollbar: 6px wide, border-radius, thumb in muted color)
- **Auto-scroll during processing**: As each file starts processing, smoothly scroll to keep it visible. Don't jump — use `scrollIntoView({ behavior: 'smooth', block: 'nearest' })`.
- **Fixed footer**: The "Clear ⌘K" button stays pinned below the scroll area, always accessible
- **Scroll height**: The scrollable area is the full height between the progress counter and the footer. With 38 files + group headers, about 60% of the list should be visible at once (encouraging scrolling).

---

## Simulated Interaction Flow

### Flow A: "Add files" (flat list, 8 files)

1. **State 1**: Drop zone with two buttons.
2. **Click "Add files"**: Brief drag-over flash (400ms).
3. **8 files appear** in a flat table (no folder groups). Progress bar appears. Footer slides up.
4. **Processing**: Files process sequentially, 400ms each. Progress bar fills. Counter updates.
5. **One file fails** (damaged_photo.jpg at position 6).
6. **State 4**: All done. Progress bar flashes green. Counter: "7 of 8 — All clean".
7. **Click any completed row** → metadata modal opens.
8. **Click "Clear"** → return to State 1.

### Flow B: "Add folder" (folder tree, 38 files)

1. **State 1**: Drop zone.
2. **Click "Add folder"**: Brief drag-over flash (400ms).
3. **38 files appear** organized under folder group headers. Progress bar appears.
4. **Processing**: Files process quickly (200ms each). Progress bar fills steadily. Auto-scroll follows the processing file.
5. **Two files fail** (damaged_photo.jpg, locked_file.pdf).
6. **State 4**: All done. "36 of 38 — All clean".
7. **Click a group header** → collapse that folder's files.
8. **Click a completed row** → metadata modal opens.
9. **Hover a row** → reveal icon appears. Click it → "Revealed in Finder" toast.
10. **Click "Clear"** → return to State 1.

**DEFAULT: When the prototype loads, automatically run Flow B** (the folder version) after a 1-second delay. This immediately showcases the full feature set without requiring user interaction. Provide a "Reset" action to go back to the empty state.

### Timing for Flow B (38 files)

```
t=0.0s    Drag-over flash
t=0.4s    Folder group headers appear. Files start populating (50ms stagger).
t=2.3s    All 38 rows visible. First file starts processing.
t=2.5s    IMG_0001.jpg → ✓  (progress: 1/38)
t=2.7s    IMG_0002.jpg → ✓  (progress: 2/38)
...       Each file processes in ~200ms
t=5.5s    damaged_photo.jpg → ✗ error  (progress: ~16/38)
...       Processing continues
t=8.0s    locked_file.pdf → ✗ error  (progress: ~30/38)
...       Final files complete
t=10.0s   All done. Progress bar → green flash → fade.
t=10.5s   Auto-open metadata modal for IMG_0004.jpg to showcase the modal.
```

Total demo: ~10 seconds. Fast enough to watch, slow enough to see the progress bar fill.

---

## Settings Modal

Gear icon (⚙) in title bar opens centered modal overlay. Same as Prompt A:

- **Backdrop**: Neutral 900 at 30% opacity
- **Card**: 320px wide, white surface, 8px border-radius, shadow-md
- **Header**: "Settings" in heading text, 20px weight 500
- **Checkboxes**:
  ```
  ☑ Preserve image orientation         (default: checked)
  ☐ Keep original files                (default: unchecked)
      Saves cleaned copies as filename_cleaned.ext
  ☑ Preserve file timestamps           (default: checked)
  ```
- **Footer**: "Done" button (gold background, dark text, 4px radius, 600 weight)
- **Close**: Click backdrop, press Escape, or click Done
- Checkbox accent color: burgundy (`#521737` light / `#C4467A` dark)

---

## Fake Data

### Flat List (8 files — "Add files" flow)

| Filename | Before | After | Status |
|----------|--------|-------|--------|
| vacation_photo.jpg | 23 | 0 | success |
| selfie_park.heic | 45 | 0 | success |
| portrait.png | 8 | 0 | success |
| Screenshot_2025-01.png | 3 | 0 | success |
| tax_return_2024.pdf | 12 | 0 | success |
| damaged_photo.jpg | — | Can't read file | error |
| birthday_party.mov | 67 | 0 | success |
| cover_letter.docx | 9 | 0 | success |

### Folder Tree (38 files — "Add folder" flow)

**📁 Photos/ (12 files)**

| Filename | Before | After | Status |
|----------|--------|-------|--------|
| IMG_0001.jpg | 23 | 0 | success |
| IMG_0002.jpg | 31 | 0 | success |
| IMG_0003.jpg | 18 | 0 | success |
| IMG_0004.jpg | 27 | 0 | success |
| IMG_0005.jpg | 14 | 0 | success |
| IMG_0006.jpg | 22 | 0 | success |
| IMG_0007.jpg | 19 | 0 | success |
| IMG_0008.jpg | 35 | 0 | success |
| IMG_0009.jpg | 11 | 0 | success |
| IMG_0010.jpg | 28 | 0 | success |
| IMG_0011.jpg | 16 | 0 | success |
| IMG_0012.jpg | 20 | 0 | success |

**📁 Photos/vacation/ (6 files)**

| Filename | Before | After | Status |
|----------|--------|-------|--------|
| beach_sunset.jpg | 14 | 0 | success |
| hotel_room.heic | 22 | 0 | success |
| pool_photo.heic | 33 | 0 | success |
| restaurant.jpg | 17 | 0 | success |
| damaged_photo.jpg | — | Can't read file | error |
| city_walk.mov | 41 | 0 | success |

**📁 Photos/portraits/ (4 files)**

| Filename | Before | After | Status |
|----------|--------|-------|--------|
| IMG_4521.heic | 45 | 0 | success |
| IMG_4522.heic | 38 | 0 | success |
| IMG_4523.heic | 42 | 0 | success |
| headshot.png | 8 | 0 | success |

**📁 Screenshots/ (4 files)**

| Filename | Before | After | Status |
|----------|--------|-------|--------|
| Screenshot_2025-01-15.png | 3 | 0 | success |
| Screenshot_2025-02-01.png | 3 | 0 | success |
| Screenshot_2025-02-10.png | 4 | 0 | success |
| Screen Recording 2025.mov | 12 | 0 | success |

**📁 Documents/ (5 files)**

| Filename | Before | After | Status |
|----------|--------|-------|--------|
| tax_return_2024.pdf | 8 | 0 | success |
| lease_agreement.pdf | 6 | 0 | success |
| locked_file.pdf | — | Permission denied | error |
| cover_letter.docx | 9 | 0 | success |
| resume_2025.docx | 11 | 0 | success |

**📁 Videos/ (2 files)**

| Filename | Before | After | Status |
|----------|--------|-------|--------|
| birthday_party.mov | 67 | 0 | success |
| drone_footage.mov | 54 | 0 | success |

**── Individual files (5 files)** (dropped separately, not in a folder)

| Filename | Before | After | Status |
|----------|--------|-------|--------|
| random_selfie.jpg | 29 | 0 | success |
| meeting_notes.docx | 7 | 0 | success |
| medical_records.pdf | 15 | 0 | success |
| IMG_4524.heic | 36 | 0 | success |
| concert_video.mov | 48 | 0 | success |

**Totals**: 38 files, 36 success, 2 errors. Total tags removed: ~808.

### Metadata Detail Data (for modal)

**IMG_0004.jpg** (auto-opened in modal at end of demo):
```
Tag                    Before Value           Status
─────────────────────  ─────────────────────  ──────────
Camera Make            Canon                  REMOVED
Camera Model           EOS R5                 REMOVED
Lens Model             RF 24-70mm f/2.8       REMOVED
F Number               f/2.8                  REMOVED
ISO                    400                    REMOVED
GPS Latitude           37.7749° N             REMOVED
GPS Longitude          -122.4194° W           REMOVED
Date/Time Original     2025-08-14 16:32       REMOVED
... 17 more removed tags

Color Space            sRGB                   PRESERVED
Orientation            Horizontal             PRESERVED

27 tags examined · 25 removed · 2 preserved
```

**damaged_photo.jpg** (error modal):
```
Error: Unable to read file
ExifTool: "File format error — file is corrupted or truncated"

The file may be damaged. Try opening it in an image editor to verify.
```

**locked_file.pdf** (error modal):
```
Error: Permission denied
ExifTool: "Error opening file — permission denied"

Check file permissions or try running ExifCleaner as administrator.
```

---

## What NOT to Include

- No sidebar or navigation bar
- No multi-page routing or tabs
- No user accounts, login, or auth
- No file type icons or badges (keep it clean — just filename text)
- No thumbnail previews of images
- No drag reordering of table rows
- No column sorting (files stay in drop order / folder order)
- No search or filter input
- No right-click context menus
- No "About" dialog
- No update notifications
- No loading skeleton screens
- No column resizing
- No file size column (keep it to Filename, Before, After — simple)
- No inline accordion/expansion panels — metadata lives in a modal
- No Type column — this is the clean, simple variant

---

## Quality Bar

This prototype must demonstrate that the Clean Table design scales beyond 6 files. It should answer: **"Does this still feel elegant with 38 files across nested folders?"**

Specifically:

- **Scrolling must feel native** — like a real macOS NSTableView, not a janky div scroll. Thin scrollbar, momentum scrolling, sticky header with subtle shadow.
- **Progress bar must feel satisfying** — the gold bar filling up file by file should feel like watching a loading bar. The green flash at completion should feel like a quiet "done."
- **Folder groups must feel lightweight** — they organize the list without adding visual noise. The collapsible headers should be subtle (just a chevron), not big accordion headers.
- **The metadata modal must feel informative** — monospace alignment, clear REMOVED/PRESERVED badges, summary bar. It should build trust: "I can see exactly what was removed." The modal opens and closes smoothly.
- **The reveal icon must feel discoverable but not cluttered** — it only appears on hover, and it's small. Users who need it find it. Users who don't never notice it. The "Reveal in Finder" button in the modal footer provides a second access point.
- **Auto-scroll during processing should feel smooth** — the viewport gently follows the action, never jumpy.
- **38 files processing should feel fast** — the progress bar fills steadily, checkmarks pop in rapidly, the whole batch finishes in ~10 seconds. It should feel efficient.
- **Dark mode must look intentionally designed** — the gold progress bar glows against the dark background, the modal is a darker surface card, the green/red status colors pop.
- **Folder indentation must be minimal** — just 12px. Enough to see the hierarchy, not enough to waste horizontal space.

**Build this prototype now.** Generate one React component with all states, interactions, scroll behavior, folder groups, metadata modal, progress bar, and the 38-file dataset. Auto-start the folder flow on load.
