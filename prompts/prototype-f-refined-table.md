# Prompt F: "Refined Table" — ExifCleaner UI Prototype

> Copy-paste this entire file into Claude (artifacts) or v0 to generate an interactive mockup.

---

## System Context

You are a senior UI designer building an interactive React prototype of **ExifCleaner**, a cross-platform Electron desktop app that strips EXIF/metadata from images, videos, and PDFs.

**Design variant**: The definitive synthesis. Table-based layout with **five data columns** (Name, Type, Size, Before, After), a **metadata detail modal** triggered by clicking completed rows, a **bottom status bar** with progress, **nested folder tree** with collapsible groups, and a **settings modal** accessible from the title bar at all times.

**What this design gets right**: Dense and scannable like a spreadsheet for large batches (50+ files), but with rich interactions for inspection (metadata modal, reveal in Finder). Folders nest elegantly. Progress and batch stats live in one place — no redundancy. Settings are always accessible, not hidden behind state transitions.

**Output**: One self-contained React component (with Tailwind CSS). No external dependencies beyond React and Tailwind. Everything in one artifact.

---

## Visual Design System

### Colors (use these exact hex values)

**Light Mode:**
```
Background:        #F5F6F8
Surface/cards:     #FFFFFF
Alternate row:     #F7F8F9
Hover row:         #EEF0F3
Borders:           #DADEE4
Body text:         #3B4351
Heading text:      #1E2028
Muted text:        #9BA3B0
Secondary text:    #66758C
Window chrome:     #FAFAFA
Folder row bg:     #EEF0F3

Brand burgundy:    #521737  (focus rings, accents, links)
Brand gold:        #F8D057  (progress, active states, drag-over)
Brand orange:      #E97043  (hover accents)

Success:           #2D8659  (completion checkmark)
Success bg:        #E8F5EE  (subtle row flash on complete, preserved badge)
Error:             #C44536  (failed processing)
Error bg:          #FCEAE8  (error row tint, removed badge)
```

**Dark Mode:**
```
Background:        #141416
Surface/cards:     #1C1C1F
Alternate row:     #1C1C1F
Hover row:         #252528
Borders:           #48484D
Body text:         #C5C5CB
Heading text:      #EEEEF0
Muted text:        #818188
Window chrome:     #0E0E10
Folder row bg:     #252528

Brand burgundy:    #C4467A  (lightened for dark bg)
Brand gold:        #F8D057  (unchanged — naturally luminous)
Brand orange:      #E97043  (unchanged)

Success:           #2D8659
Success bg:        #1A3D2B
Error:             #C44536
Error bg:          #3D1A16
```

### Typography

```
Font family:    system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif
Font mono:      ui-monospace, "SF Mono", "Cascadia Code", Menlo, Consolas, monospace

Base size:      16px (body text, filenames)
Small:          14px (captions, secondary info, status bar text, table header)
Micro:          12px (type badges, timestamps, tag summary line)
H4/labels:      16px, weight 600
H3/titles:      20px, weight 500 (modal headings)

Line height:    1.5 (body), 1.25 (headings)
```

### Spacing

```
4px   — tight gaps (icon-to-text, badge padding vertical)
8px   — default gap, table cell horizontal padding
12px  — table cell vertical padding, compact padding, status bar padding
16px  — standard padding (modal body, buttons)
20px  — folder indent per nesting level
24px  — section gaps
32px  — modal padding, large gaps
```

### Borders & Shadows

```
Border radius:  2px (small/badges), 4px (medium/buttons), 8px (large/cards/modals)
Border width:   1px default, 2px for left-border status indicator

Shadow sm:      0 1px 3px rgba(0,0,0,0.08)
Shadow md:      0 4px 16px rgba(0,0,0,0.12)
Shadow lg:      0 8px 32px rgba(0,0,0,0.16)

Dark shadow lg: 0 8px 32px rgba(0,0,0,0.5)
```

### Motion

```
Micro:   100ms ease-out     (hover, focus rings, chevron rotate)
Fast:    200ms ease-out     (row entrance, popover, status bar slide, modal)
Medium:  300ms ease-in-out  (progress bar fill, completion flash, folder collapse)
Spring:  300ms cubic-bezier(0.34, 1.56, 0.64, 1.0)  (checkmark pop)

IMPORTANT: Wrap all animations in prefers-reduced-motion check.
```

---

## App Layout

### Window Chrome

Simulate a macOS window with:
- **Title bar**: 38px tall, background matches window chrome color
- **Traffic lights**: Three circles (12px diameter) — red `#FF5F57`, yellow `#FFBD2E`, green `#27C93F` — positioned 12px from left, vertically centered
- **Title text**: "ExifCleaner" centered in title bar, muted text color, 13px font size
- **Gear icon**: Settings cog (⚙), 16px, muted text color, positioned right of center area. Clickable in ALL states.
- **Dark mode toggle**: Sun/moon icon, 16px, muted text, right-most in title bar.
- **Bottom border**: 1px border color

### Content Layout

```
┌─────────────────────────────────────────────────────────────────────┐
│ ● ● ●                    ExifCleaner                     ⚙   ☀/☽  │  ← 38px title bar
├─────────────────────────────────────────────────────────────────────┤
│  Name                    Type    Size     Before  After             │  ← 36px table header (sticky)
├─────────────────────────────────────────────────────────────────────┤
│  ▼ 📁 Vacation 2025/                               8 files        │
│      ✓ IMG_4521.jpg      JPG    3.8 MB     45      0              │
│      ✓ IMG_4522.jpg      JPG    4.1 MB     45      0              │  ← scrollable table body
│    ▼ 📁 Day 2/                                     3 files        │
│        ⟳ restaurant.jpg  JPG    2.2 MB     19     ...             │
│        ● hotel_room.heic HEIC   1.9 MB      —       —            │
│  ...                                                               │
├═══════════════════════════════════╸                                 │  ← 3px progress bar
│  14 of 22 files                                    Clear (⌘K)     │  ← 33px status bar content
└─────────────────────────────────────────────────────────────────────┘
```

**Total viewport**: 680px wide × 480px tall.

---

## Table Design

### Columns

| Column | Header | Width | Align | Content |
|--------|--------|-------|-------|---------|
| Name | `Name` | flex (fills remaining) | left | Status icon + filename. Indented for nested folders. Reveal icon on hover. |
| Type | `Type` | 56px | center | Uppercase extension badge in pill shape |
| Size | `Size` | 64px | right | Human-readable file size |
| Before | `Before` | 56px | right | Tag count number or `—` |
| After | `After` | 56px | right | Tag count, `...` (pulsing), or `Error` |

### Table Header

- Background: background color
- Text: secondary text color, 14px, weight 600
- Bottom border: 2px border color
- **Sticky**: stays visible when scrolling
- Height: 36px
- Padding: 12px vertical, 8px horizontal

### File Rows

- Height: 40px (8px vertical padding, 8px horizontal)
- Alternating backgrounds: surface (white) / alternate row (#F7F8F9 light / #1C1C1F dark)
- Hover: hover row color, instantaneous (no transition delay on hover-in)
- Cursor: pointer on completed/error rows (opens metadata modal)
- Left border: 2px transparent by default
  - Processing: 2px gold
  - Complete (success): 2px success green
  - Error: 2px error red
  - Transition: 200ms ease-out

### Name Column Details

The Name column contains multiple elements:

```
[status icon 16px] [4px gap] [filename text] ........... [reveal icon 14px on hover]
```

- **Status icon** (16px, positioned left of filename):
  - Pending: gray circle `●` (#9BA3B0)
  - Processing: gold CSS spinner (12px), pulsing opacity 0.6→1.0
  - Complete: green checkmark `✓` (#2D8659) — pops in with spring animation
  - Error: red X `✗` (#C44536)
- **Filename text**: body text color, 16px, ellipsis overflow if too long
- **Reveal icon** (14px, right edge of Name cell): appears only on hover
  - Icon: small arrow-out-of-box (↗) or folder icon
  - Color: muted text, transitions to secondary text on hover
  - Click: shows "Revealed in Finder" toast
  - Does NOT appear on folder rows

### Type Column (Extension Badge)

Small pill showing the file extension:

```
┌───────┐
│  JPG  │
└───────┘
```

- Text: muted text color, 12px (micro), weight 600, uppercase
- Background: #EEF0F3 (light) / #252528 (dark)
- Padding: 2px vertical, 6px horizontal
- Border radius: 9999px (fully rounded pill)
- Empty for folder rows

### Size Column

- Text: secondary text color, 14px
- Values: human-readable (`2.4 MB`, `340 KB`, `14.5 MB`)
- Right-aligned
- Empty for folder rows

### Before / After Columns

- Text: body text color, 14px
- Before: shows tag count after reading (e.g., `23`, `45`, `8`), or `—` when pending
- After: shows `0` on success, `Error` in error color on failure, `...` with pulsing opacity during processing
- Right-aligned
- For folder rows: Before shows `N files` count in muted text. After is empty.

---

## Folder Tree Design

### Folder Rows

When files come from folders, they appear under collapsible folder group headers:

```
  ▼ 📁 Vacation 2025/                                    8 files
      ✓ IMG_4521.jpg          JPG    3.8 MB     45      0
      ✓ IMG_4522.jpg          JPG    4.1 MB     45      0
    ▼ 📁 Day 2/                                          3 files
        ✓ restaurant.jpg      JPG    2.2 MB     19      0
        ✓ hotel_room.heic     HEIC   1.9 MB     22      0
        ✗ damaged_photo.jpg   JPG    980 KB      —    Error
```

- **Indentation**: 20px per nesting level, applied as left padding
  - Level 0 folders: 0px indent (top-level dropped folders)
  - Level 0 folder's files: 20px indent
  - Level 1 subfolders: 20px indent
  - Level 1 subfolder's files: 40px indent
  - Level 2 sub-subfolders: 40px indent
  - Level 2 files: 60px indent
- **Max visual depth**: 3 indent levels (60px max indent). Deeper structures flatten — deeper folder path prepended to filename.

### Folder Row Styling

- **Chevron**: 10px disclosure triangle, before the folder icon. `▶` (collapsed) / `▼` (expanded). Rotates 90° on toggle (150ms ease-out).
- **Folder icon**: 📁 emoji or simple SVG folder icon, 14px.
  - Open (expanded): gold color (#F8D057)
  - Closed (collapsed): muted text color
- **Folder name**: body text color, weight 600 (semibold), 16px
- **Background**: folder row bg color (slightly darker than normal rows)
- **Before column**: shows "N files" count in muted text (14px)
- **Type/Size/After columns**: empty
- **Not clickable for metadata modal** — only the chevron/folder name toggles collapse
- **No left border indicator** — folder rows don't have status borders
- **No hover reveal icon** — folders don't have a "Reveal in Finder" action

### Collapse / Expand Behavior

- **Click chevron or folder name**: toggles collapse/expand for that folder
- **Collapsing**: hides ALL children recursively (files AND subfolders)
- **Animation**: children slide up/down with 200ms ease-in-out (using max-height or similar)
- **Default state**: all folders expanded when files first appear
- **One folder starts collapsed** in the demo (Camera Roll/) to show both states

### Flat Files (No Folders)

When individual files are dropped (not from a folder), they appear at indent level 0 with no folder grouping, no chevrons, no indentation. Just plain table rows like Prompt A.

---

## Metadata Modal

Clicking any **completed** file row (success or error) opens a centered metadata detail modal.

### Modal Layout

```
┌───────────────────────────────────────────────────────┐
│                                                       │
│  vacation_photo.jpg                              [X]  │  ← 20px, weight 500
│  JPG  ·  2.4 MB                                      │  ← 14px, muted
│                                                       │
├───────────────────────────────────────────────────────┤
│  23 tags examined  ·  21 removed  ·  2 preserved      │  ← summary bar
├───────────────────────────────────────────────────────┤
│                                                       │
│  GPS Latitude        37.7749° N              REMOVED  │  ← strikethrough, red badge
│  GPS Longitude       -122.4194° W            REMOVED  │
│  Camera Make         Canon EOS R5            REMOVED  │
│  Camera Model        EOS R5                  REMOVED  │
│  Date/Time Original  2025-06-15 14:32        REMOVED  │
│  Software            Lightroom 7.2           REMOVED  │
│  ISO Speed           400                     REMOVED  │
│  Focal Length         35 mm                  REMOVED  │
│                                                       │
│  ... 13 more removed tags                             │  ← expandable
│                                                       │
│  ────────────────────────────────────────────         │
│  Orientation         1 (Normal)            PRESERVED  │  ← green badge
│  Color Space         sRGB                  PRESERVED  │
│                                                       │
├───────────────────────────────────────────────────────┤
│                         [Reveal in Finder]    [Done]  │  ← footer buttons
└───────────────────────────────────────────────────────┘
```

### Modal Specs

- **Width**: 480px
- **Max height**: 70vh (scrollable tag list if needed)
- **Border radius**: 8px
- **Shadow**: shadow-lg
- **Background**: surface color
- **Backdrop**: heading text color at 30% opacity

### Modal Header

- **Filename**: heading text color, 20px, weight 500
- **Close button**: X icon (16px), muted text, top-right corner, hover → secondary text
- **Subtitle**: Type badge pill + `·` + file size. Muted text, 14px.
- **Padding**: 24px top, 24px horizontal, 16px bottom

### Summary Bar

- **Background**: alternate row color
- **Text**: 14px, centered
- **Format**: "X tags examined · Y removed · Z preserved"
  - "Y removed" in error color
  - "Z preserved" in success color
  - Dot separators in muted text
- **Padding**: 12px vertical, 24px horizontal

### Tag List

- **Font**: monospace, 12px (micro)
- **Two-column layout per row**: Tag name (left, ~200px) + Tag value (right, fills remaining)
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
  - "Reveal in Finder": secondary style — secondary text color, transparent bg, 1px border color, 4px radius, 14px text, 8px vertical padding, 16px horizontal padding. Hover: hover row bg.
  - "Done": primary style — gold bg (#F8D057), heading text color, 4px radius, 14px text, weight 600, 8px vertical padding, 16px horizontal padding. Hover: slightly darker gold.
- **Gap between buttons**: 8px

### Modal for Error Files

When clicking an error row, the modal shows a simplified error view:

```
┌───────────────────────────────────────────────────────┐
│  corrupted_file.pdf                              [X]  │
│  PDF  ·  0 KB                                         │
├───────────────────────────────────────────────────────┤
│                                                       │
│              [error icon — red X, 32px]               │
│                                                       │
│              Could not read file                      │  ← heading text, 16px, weight 500
│                                                       │
│     The file may be corrupted or in an                │  ← muted text, 14px, centered
│     unsupported format.                               │
│                                                       │
├───────────────────────────────────────────────────────┤
│                         [Reveal in Finder]    [Done]  │
└───────────────────────────────────────────────────────┘
```

### Modal Animation

- **Open**: opacity 0→1 + scale 0.97→1.0, 200ms ease-out. Backdrop fades in 200ms.
- **Close**: opacity 1→0 + scale 1.0→0.97, 150ms ease-in. Backdrop fades out 150ms.
- **Triggers to close**: Click backdrop, press Escape, click X, or click Done.

---

## Bottom Status Bar

The single location for all batch progress, stats, and the Clear action.

### Layout

```
┌═══════════════════════════════════╸                                 ┐  ← 3px progress bar
│  14 of 22 files                                    Clear (⌘K)      │  ← 33px content area
└─────────────────────────────────────────────────────────────────────┘
```

### Visibility

- **Empty state**: Status bar is **hidden**. The drop zone fills the full content area below the title bar.
- **Processing state**: Status bar slides up from bottom (200ms ease-out). Appears as soon as files are added.
- **Complete state**: Status bar stays visible with summary text.
- **After Clear**: Status bar slides down and hides (200ms ease-in).

### Progress Bar (3px)

- **Position**: top edge of the status bar, spanning full width
- **Track**: border color (#DADEE4 light / #48484D dark), 3px tall
- **Fill**: gold (#F8D057), fills left-to-right
- **Width**: `(completed files / total files) × 100%`
- **Animation**: 300ms ease-out per file completion
- **On batch complete**: fill reaches 100%, color transitions to success green (#2D8659) for 500ms, then fill fades to 0% (200ms fade-out)
- **Dark mode**: gold bar on dark border track — pops nicely

### Content Area (33px)

**Left side** — batch counter text:
- During processing: `"14 of 22 files"` — body text color, 14px
- On complete (all success): `"22 files cleaned · 543 tags removed"` — "543 tags removed" in success color
- On complete (with errors): `"20 cleaned · 2 errors · 497 tags removed"` — "2 errors" in error color, "497 tags removed" in success color
- Left padding: 12px

**Right side** — Clear button:
- Text: `"Clear (⌘K)"` in muted text, 14px
- **Disabled** (lower opacity, no pointer) while processing is active
- **Enabled** when all files complete
- Click: clears table, returns to empty state, status bar slides away
- Right padding: 12px

### Top border

- 1px border color, separating status bar from table area

---

## Settings Modal

Gear icon (⚙) in the title bar opens a centered settings modal. **Available in ALL states** — empty, processing, complete.

### Modal Design

- **Backdrop**: heading text at 30% opacity
- **Card**: 320px wide, surface bg, 8px border-radius, shadow-md
- **Header**: "Settings" in heading text, 20px weight 500. Padding: 24px top, 24px horizontal.
- **Content**: Three checkboxes with labels. Padding: 16px horizontal, 16px vertical.
- **Footer**: "Done" button (gold bg, heading text, 4px radius, 600 weight, 14px). Padding: 16px.
- **Close**: Clicking backdrop, pressing Escape, or clicking Done all close the modal.
- Changes take effect immediately — no save button needed.

### Checkboxes

```
☑ Preserve image orientation         (default: checked)
☐ Keep original files                (default: unchecked)
    Saves cleaned copies as filename_cleaned.ext
☑ Preserve file timestamps           (default: checked)
```

- Checkbox accent color: burgundy (#521737 light, #C4467A dark)
- Sub-label under "Keep original files": muted text, 14px, explains the behavior
- Checkboxes are functional — toggle on/off, state persists until page reload

---

## State Machine

The app has exactly **4 states**. Implement all of them with transitions between them.

### State 1: Empty (initial)

The drop zone. Centered content, dashed border, inviting.

```
┌─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┐
│                                                  │
│                  [images icon]                    │  ← 48px, muted color
│                                                  │
│          Drop files here to                      │  ← secondary text, 16px
│            remove metadata                       │
│                                                  │
│       [Add files]     [Add folder]               │  ← muted text, 14px, underline on hover
│                                                  │
└─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┘
```

- Dashed border: 2px dashed, secondary text color, 8px border-radius
- Content: vertically and horizontally centered in the full content area (no status bar visible)
- Icon: Simple SVG — two overlapping rectangles representing images, 48px, muted text color
- **Two buttons**:
  - "Add files" — simulates dropping 3 individual files (flat, no folders)
  - "Add folder" — simulates dropping folders with nested structure (full 22-file demo)
- Buttons: muted text color, 14px, underline on hover, 8px gap between them

### State 2: Drag Over

When dragging over the window:
- Border changes to: 2px dashed gold (#F8D057)
- Background tints to gold at 5% opacity
- Text changes to "Release to clean" in gold, weight 600
- Icon color changes to gold
- Transition: 150ms ease-out

### State 3: Processing

The table appears with the status bar. Files are being processed.

- Drop zone fades out (150ms), table fades in (200ms)
- Status bar slides up from bottom (200ms)
- File rows animate in staggered (opacity 0→1 + translateY(4px)→0, 200ms each, 50ms stagger)
- Folder group headers appear first, then their children
- Processing states visible: spinners, pulsing dots, completed checkmarks
- Progress bar fills as files complete
- Gear icon remains accessible in title bar

### State 4: Complete

All files have been processed. Mix of success and error states.

- All rows show final status (checkmarks or error X)
- Progress bar: 100% → flashes green (500ms) → fades out
- Status bar shows summary: "20 cleaned · 2 errors · 543 tags removed"
- Clear button is now enabled
- Clicking any completed row opens the metadata modal
- After a 500ms pause, auto-open the metadata modal for `profile_photo.jpg` to showcase the feature

---

## Reveal in Finder

### Hover Icon (primary access)

When hovering any **file** row (not folder rows):
- A small ↗ icon (14px) appears at the right edge of the Name cell
- Color: muted text, transitions to body text on icon hover
- Click: shows a brief toast notification "Revealed in Finder"
- The icon is only visible while hovering that specific row

### Reveal Toast

```
┌────────────────────────────┐
│  ↗  Revealed in Finder     │
└────────────────────────────┘
```

- Position: fixed, bottom-center of the content area, 48px above the status bar
- Background: surface color, 1px border, shadow-sm, 4px radius
- Text: secondary text, 12px
- Animation: fade in 100ms, hold 1.5s, fade out 200ms

### Modal Access (secondary)

The metadata modal footer also has a "Reveal in Finder" button (described in Metadata Modal section).

---

## Simulated Interaction Flow

Since this is a web prototype, simulate the drag-and-drop flow with buttons:

1. **State 1 (Empty)**: User sees drop zone with two buttons. Auto-starts "Add folder" flow after 1 second delay.
2. **Brief flash of State 2** (drag-over, 400ms), then transition to State 3.
3. **State 3 (Processing)**: Status bar slides up. Folder groups and file rows appear staggered. Files process one by one (~200ms each). Progress bar fills steadily.
4. **Errors**: `damaged_photo.jpg` and `corrupted_file.pdf` fail with red X and error state.
5. **State 4 (Complete)**: Progress bar flashes green. Status bar shows summary. After 500ms, metadata modal auto-opens for `profile_photo.jpg`.
6. **User can**: click other rows to see their metadata, hover for reveal icons, collapse/expand folders, open settings, toggle dark mode.
7. **Click "Clear"**: Status bar slides away, table fades out, return to State 1.

### Timing

```
t=0.0s    Auto-trigger "Add folder" flow
t=0.0s    Drag-over flash (gold border/bg, 400ms)
t=0.4s    Status bar slides up. Folder groups appear. File rows stagger in (50ms each).
t=1.5s    All 22 rows visible. First file starts processing.
t=1.7s    profile_photo.jpg completes → ✓ (progress: 1/22)
t=1.9s    resume.pdf completes → ✓ (progress: 2/22)
t=2.1s    screenshot.png → ✓ (3/22)
t=2.3s    IMG_4521.jpg → ✓ (4/22)
...       Each file ~200ms
t=3.5s    damaged_photo.jpg → ✗ error
...       Continue processing remaining files
t=5.0s    corrupted_file.pdf → ✗ error
...       Continue
t=5.8s    Last file (timelapse.mov in Camera Roll) → ✓
t=6.0s    Progress bar fills 100% → flashes green → fades
t=6.0s    Status bar: "20 cleaned · 2 errors · 543 tags removed"
t=6.5s    Auto-open metadata modal for profile_photo.jpg
```

---

## Fake Data

### Flat Files (3 individual files, no folder)

| # | Filename | Type | Size | Before | After | Status | Delay |
|---|----------|------|------|--------|-------|--------|-------|
| 1 | profile_photo.jpg | JPG | 2.4 MB | 34 | 0 | success | 1.7s |
| 2 | resume.pdf | PDF | 1.1 MB | 12 | 0 | success | 1.9s |
| 3 | screenshot.png | PNG | 890 KB | 3 | 0 | success | 2.1s |

### 📁 Vacation 2025/ (5 files + 1 subfolder)

| # | Filename | Type | Size | Before | After | Status | Delay |
|---|----------|------|------|--------|-------|--------|-------|
| 4 | IMG_4521.jpg | JPG | 3.8 MB | 45 | 0 | success | 2.3s |
| 5 | IMG_4522.jpg | JPG | 4.1 MB | 45 | 0 | success | 2.5s |
| 6 | IMG_4523.heic | HEIC | 2.9 MB | 38 | 0 | success | 2.7s |
| 7 | sunset_video.mp4 | MP4 | 14.5 MB | 22 | 0 | success | 2.9s |
| 8 | beach_panorama.jpg | JPG | 1.8 MB | 28 | 0 | success | 3.1s |

### 📁 Vacation 2025/Day 2/ (subfolder, 3 files)

| # | Filename | Type | Size | Before | After | Status | Delay |
|---|----------|------|------|--------|-------|--------|-------|
| 9 | restaurant.jpg | JPG | 2.2 MB | 19 | 0 | success | 3.3s |
| 10 | hotel_room.heic | HEIC | 1.9 MB | 22 | 0 | success | 3.5s |
| 11 | damaged_photo.jpg | JPG | 980 KB | — | Can't read file | error | 3.7s |

### 📁 Work Documents/ (5 files)

| # | Filename | Type | Size | Before | After | Status | Delay |
|---|----------|------|------|--------|-------|--------|-------|
| 12 | report_Q4.docx | DOCX | 2.8 MB | 18 | 0 | success | 3.9s |
| 13 | presentation.pptx | PPTX | 5.2 MB | 14 | 0 | success | 4.1s |
| 14 | scan_001.pdf | PDF | 890 KB | 8 | 0 | success | 4.3s |
| 15 | corrupted_file.pdf | PDF | 0 KB | — | Can't read file | error | 4.5s |
| 16 | budget.xlsx | XLSX | 1.4 MB | 9 | 0 | success | 4.7s |

### 📁 Camera Roll/ (4 files, **collapsed by default**)

| # | Filename | Type | Size | Before | After | Status | Delay |
|---|----------|------|------|--------|-------|--------|-------|
| 17 | DSC_0001.nef | NEF | 28.3 MB | 67 | 0 | success | 4.9s |
| 18 | DSC_0002.nef | NEF | 27.8 MB | 67 | 0 | success | 5.1s |
| 19 | family_portrait.jpg | JPG | 4.5 MB | 42 | 0 | success | 5.3s |
| 20 | timelapse.mov | MOV | 45.2 MB | 15 | 0 | success | 5.5s |

**Camera Roll/ note**: This folder starts **collapsed** in the demo. Its chevron shows ▶ and its files are hidden. The user can click to expand it. The files still process behind the scenes (progress bar counts them), but they're not visible until expanded.

### Totals

- **22 files** across 3 folders + 1 subfolder + 3 flat files
- **20 success**, **2 errors**
- **543 tags removed** (sum of all successful Before values: 34+12+3+45+45+38+22+28+19+22+18+14+8+9+67+67+42+15 = 543, with damaged_photo.jpg's and corrupted_file.pdf's Before values excluded since they failed)

### Metadata Detail for profile_photo.jpg (auto-opened modal)

```
Tags examined: 34
Tags removed: 32
Tags preserved: 2

Removed (showing first 8):
  GPS Latitude        37.7749° N
  GPS Longitude       -122.4194° W
  Camera Make         Canon
  Camera Model        EOS R5
  Lens Model          RF 24-70mm f/2.8L
  Focal Length        35 mm
  F Number            f/2.8
  ISO Speed           400
  ... 24 more removed tags

Preserved:
  Orientation         1 (Normal)
  Color Space         sRGB
```

### Metadata Detail for damaged_photo.jpg (error modal)

```
Error: Could not read file
The file may be corrupted or in an unsupported format.
```

---

## What NOT to Include

- No sidebar or left navigation
- No multi-page routing or tabs
- No user accounts, login, or auth
- No thumbnail previews of images
- No drag reordering of table rows
- No column sorting or filtering
- No search input
- No right-click context menus
- No "About" dialog
- No update notifications
- No loading skeleton screens
- No notifications or toasts (except the "Revealed in Finder" toast)
- No file type icons in the table (the Type badge pill is the type indicator)
- No inline accordion expansion (metadata is shown in a modal, not inline)
- No sidebar stats panel (batch stats are in the bottom status bar only)

---

## Quality Bar

The prototype should feel like a **real macOS app**, not a web page. Specifically:

- **Window chrome** must look native — pixel-perfect traffic light circles, system font title
- **Table** should feel like a native NSTableView — clean borders, precise column alignment, alternating row colors
- **Status bar** should feel like Finder's bottom bar — thin, informational, unobtrusive
- **Progress bar** should be barely visible (3px) but satisfying to watch fill — the gold against neutral background should pop
- **Folder tree** should feel like Finder's list view — familiar chevron/indent pattern, instant expand/collapse
- **Metadata modal** should feel deliberate — big enough to read comfortably, but dismissible instantly
- **Animations** should be subtle and fast — if you notice them, they're too slow
- **The checkmark pop** animation should feel satisfying — slight overshoot, then settle
- **Dark mode** should feel intentionally designed — the gold progress bar and green checkmarks should glow against the dark surface
- **Type badges** should be tiny and quiet — informational, not decorative
- **Hover states** on table rows should be instantaneous (no transition delay on hover-in)
- **Spacing** should be tight and efficient — this is a utility app, not a marketing page
- **The reveal icon** (↗) should feel discoverable but not intrusive — appears smoothly on hover, disappears when you move away

**Build this prototype now.** Generate one React component with the table, metadata modal, bottom status bar, folder tree, settings modal, reveal in Finder, and all state transitions described above.
