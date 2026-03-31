# Ultimate Prototype — ExifCleaner UI Synthesis

> Copy-paste this entire file into Claude (artifacts) or v0 to generate an interactive mockup.
> This prompt synthesizes feedback from 6 prototype rounds (A, A-2, B, C, D, E) into one definitive design.

---

## System Context

You are a senior UI designer building an interactive React prototype of **ExifCleaner**, a cross-platform Electron desktop app that strips EXIF/metadata from images, videos, and PDFs.

**Design philosophy**: This is a focused utility app. People use it to get things done and move on with their day. Every design decision serves the core workflow: **drop files → see results → done**. Speed is sacred — the app processes hundreds of files in seconds. The UI must feel just as fast.

**Brand personality**: PRECISE, PRIVATE, SWIFT, HONEST, CALM. Quiet confidence. No celebration confetti. No cinematic flows. A clean checkmark says enough.

**Output**: One self-contained React component (with inline styles via JS objects — no Tailwind, no CSS modules). No external dependencies beyond React. Everything in one artifact.

---

## Visual Design System

### Colors (use these exact hex values)

**Light Mode:**
```
Background:        #F5F6F8
Surface/white:     #FFFFFF
Alternate row:     #F7F8F9
Hover row:         #EEF0F3
Borders:           #DADEE4
Body text:         #3B4351
Heading text:      #1E2028
Muted text:        #9BA3B0
Secondary text:    #66758C
Window chrome:     #FAFAFA

Brand burgundy:    #521737  (focus rings, accents)
Brand gold:        #F8D057  (progress bar, active/processing states, drag-over)
Brand orange:      #E97043  (hover accents, warm touches)

Success:           #2D8659  (checkmark, preserved tags)
Success bg:        #E8F5EE  (preserved tag badge background)
Error:             #C44536  (error icon, removed tags)
Error bg:          #FCEAE8  (removed tag badge background, error row tint)
```

**Dark Mode:**
```
Background:        #141416
Surface:           #1C1C1F
Alternate row:     #1A1A1D
Hover row:         #252528
Borders:           #48484D
Body text:         #C5C5CB
Heading text:      #EEEEF0
Muted text:        #818188
Secondary text:    #9B9BA3
Window chrome:     #0E0E10

Brand burgundy:    #C4467A  (lightened for dark bg — NOT pink, stays warm)
Brand gold:        #F8D057  (unchanged — naturally luminous)
Brand orange:      #E97043  (unchanged)

Success:           #4CA87A  (slightly lightened for dark bg legibility)
Success bg:        #1A3D2B
Error:             #D4675A  (slightly lightened for dark bg legibility)
Error bg:          #3D1A16
```

**IMPORTANT dark mode note**: Dark mode must look intentionally designed, not just inverted. Brand colors should feel like luminous accents against deep backgrounds — refined, not loud. Avoid high-saturation borders or backgrounds that feel overwhelming. Err on the side of subtlety.

### Typography

```
Font family:    system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif
Font mono:      ui-monospace, "SF Mono", "Cascadia Code", Menlo, Consolas, monospace

Filename:       16px, weight 400, body text color
Table header:   14px, weight 600, secondary text color, uppercase tracking 0.5px
Tag count:      14px, weight 500, body text color (numbers in Before/After columns)
Type badge:     11px, weight 600, uppercase
Status bar:     13px, weight 400
Metadata tags:  13px, monospace
Modal heading:  18px, weight 500
Setting label:  14px, weight 500
Setting desc:   12px, weight 400, muted text color

Line height:    1.5 (body), 1.25 (headings)
```

### Spacing

```
4px   — tight gaps (icon-to-text, badge padding vertical)
8px   — default gap, table cell horizontal padding, content area side padding
12px  — table cell vertical padding, compact padding
16px  — standard padding (modal body, settings panel)
20px  — folder path indent
24px  — section gaps
32px  — modal outer padding
```

### Borders & Shadows

```
Border radius:  2px (badges), 4px (buttons), 8px (modals, panels)
Border:         1px solid border-color (default), 2px for status left-borders
Shadow sm:      0 1px 3px rgba(0,0,0,0.08)
Shadow md:      0 4px 16px rgba(0,0,0,0.12)
Shadow lg:      0 8px 32px rgba(0,0,0,0.16)   (light mode)
                0 8px 32px rgba(0,0,0,0.5)     (dark mode)
```

### Motion

```
Micro:   100ms ease-out          (hover states, focus rings)
Fast:    200ms ease-out          (row entrance, panel slide, tooltips)
Medium:  300ms ease-in-out       (progress bar fill, completion flash)
Spring:  300ms cubic-bezier(0.34, 1.56, 0.64, 1.0)   (checkmark pop, number pulse)

Row entrance stagger: 30ms between rows (so rows cascade in, not all at once)

CRITICAL: Wrap ALL animations in @media (prefers-reduced-motion: no-preference).
When reduced motion is active, all state changes happen instantly (0ms).
```

---

## App Layout

### Window Chrome

Simulate a macOS window:

- **Title bar**: 38px tall, window chrome background color
- **Traffic lights**: Three circles (12px diameter) — red `#FF5F57`, yellow `#FFBD2E`, green `#27C93F` — positioned 12px from left, vertically centered. Decorative only.
- **Title text**: "ExifCleaner" centered in title bar, muted text color, 13px
- **Settings gear icon** (⚙): 16px, muted text color, right side of title bar area. Clickable in ALL app states. On hover: secondary text color.
- **Dark mode toggle**: Sun ☀ / Moon ☽ icon, 16px, muted text color, rightmost in title bar. On hover: secondary text color.
- **Bottom border**: 1px border color

### Content Area

```
┌─────────────────────────────────────────────────────────────────────┐
│ ● ● ●                    ExifCleaner                        ⚙  ☀/☽ │  ← 38px title bar
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│                    [EMPTY STATE / TABLE]                             │  ← fills remaining space
│                                                                     │
├═════════════════════════════════════════╸                            │  ← 3px progress bar (processing only)
│  Status text                                          Clean more    │  ← 36px status bar
└─────────────────────────────────────────────────────────────────────┘
```

**Total viewport**: 700px wide × 500px tall.

---

## State Machine (4 States)

### State 1: Empty (initial)

The drop zone. Centered vertically and horizontally in the content area.

```
┌─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┐
│                                               │
│               [  file icon 48px  ]            │  ← Neutral 400 color
│                                               │
│     Drop images, videos, or PDFs              │  ← Body text, 16px
│          to remove metadata                   │  ← Muted text, 14px
│                                               │
│            [ Add files ]                      │  ← Text button, burgundy color
│                                               │
└─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┘
     ↑ dashed border, 2px, Neutral 400 (light) / Neutral 600 (dark)
       8px border-radius
```

- "Add files" is a simple text link/button (burgundy color, underline on hover). Single CTA — handles both files and folders (the native dialog lets users pick either).
- Status bar is HIDDEN in this state.
- Settings gear in title bar still works.

### State 2: Drag Over

When files are dragged over the window:

```
┌─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┐
│                                               │
│           background: Gold at 5%              │  ← dashed border: Gold
│                                               │
│            Release to clean                   │  ← Gold color, 16px, weight 500
│                                               │
└─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┘
```

- Entire drop zone background shifts to subtle gold tint
- Dashed border changes from neutral to gold
- Text changes to "Release to clean" in gold
- Transition: 150ms ease-out

### State 3: Processing

Files are being processed. Table is visible. Status bar slides up.

- Table header row appears immediately
- File rows cascade in with staggered entrance animation (opacity 0→1, translateY(4px)→0, 200ms ease-out, 30ms stagger between rows)
- Each file processes sequentially: read metadata → remove metadata → read after
- Processing indicator: gold left border + gold CSS spinner (12px) in status column
- Status bar shows progress: "3 of 12 files"
- Progress bar (3px, gold fill) animates smoothly across the top of the status bar

### State 4: Complete

All files processed. Results visible.

- Progress bar does a brief green flash (300ms) then fades out (300ms)
- Status bar shows: "10 cleaned · 2 errors · 287 tags removed"
- "Clean more" button becomes active in status bar (right side)
- Completed rows are clickable (cursor: pointer) — opens metadata detail panel
- "Reveal in Finder" icon appears on hover for completed file rows

---

## Table Design

### Columns

| Column | Header | Width | Align | Content |
|--------|--------|-------|-------|---------|
| Name | `NAME` | flex (fills remaining) | left | Status icon + indent + filename + reveal icon on hover |
| Type | `TYPE` | 56px | center | Uppercase extension badge pill |
| Size | `SIZE` | 64px | right | Human-readable file size |
| Before | `BEFORE` | 56px | right | Tag count or `—` |
| After | `AFTER` | 56px | right | Tag count, pulsing `...`, or error text |

### Table Header

- Background: main background color
- Text: secondary text color, 14px, weight 600, uppercase, letter-spacing 0.5px
- Bottom border: 2px border color
- **Sticky**: stays fixed when table body scrolls
- Height: 36px
- Padding: 0 8px

### File Rows

- Height: 40px
- Alternating backgrounds: surface / alternate row
- Hover: hover row color (100ms transition)
- Cursor: `pointer` on completed/error rows, `default` on processing/pending
- **Left border**: 2px, transitions 200ms:
  - Pending: transparent
  - Processing: gold
  - Complete (success): success green
  - Error: error red
- Click on completed/error row: opens inline metadata expansion (see Metadata Detail section)

### Name Column Layout

```
[2px left border] [8px pad] [status icon 16px] [6px gap] [indent if nested] [filename] ... [reveal ↗ on hover]
```

- **Status icon** (16px):
  - Pending: gray circle `●` (muted text color)
  - Processing: gold CSS spinner (rotating, 12px stroke, 1s infinite)
  - Complete: green checkmark `✓` — pops in with spring animation (scale 0→1.1→1.0)
  - Error: red X `✗`
- **Filename**: body text color, 16px, text-overflow ellipsis
- **Reveal icon** (↗): 14px, appears only on hover of completed rows, muted→secondary on hover. Click shows brief toast "Revealed in Finder" (fades after 2s). Does NOT appear on folder header rows.

### Folder Display

When dropped files come from a folder, show the folder path as a header row. **This is NOT a tree — it's a flat list with path labels.**

For a dropped folder "Photos" containing:
```
Photos/
  IMG_001.jpg
  vacation/
    beach.jpg
    sunset.heic
  portraits/
    headshot.png
```

Render as:

```
Photos/                                                    3 folders, 4 files
  IMG_001.jpg               JPG     3.2 MB    23     0
Photos/vacation/                                           2 files
  beach.jpg                 JPG     4.1 MB    45     0
  sunset.heic               HEIC    2.8 MB    31     0
Photos/portraits/                                          1 file
  headshot.png              PNG     1.1 MB     8     0
```

**Folder header rows**:
- Background: slightly differentiated (hover row color in light, #1E1E21 in dark)
- Text: secondary text color, 14px, weight 500
- Folder icon: 📁 emoji or folder SVG, 14px
- Right side: file count in muted text ("3 files", "2 folders, 4 files")
- No Type/Size/Before/After values
- **NOT collapsible** — all paths always visible
- Files under a folder are indented 20px from the folder header

**Path display rule**: Show relative path from the top-level dropped folder. Never show absolute filesystem paths. Each unique directory path gets its own header row, spelled out fully (e.g., "Photos/vacation/" not just "vacation/").

When individual files are dropped (not from a folder), they appear as plain rows with no folder header.

### Type Column (Extension Badge)

Small pill:
```
┌─────┐
│ JPG │
└─────┘
```

- Text: muted text color, 11px, weight 600, uppercase
- Background: #EEF0F3 (light) / #252528 (dark)
- Padding: 2px 6px
- Border radius: 9999px (pill)
- Empty for folder header rows

### Size Column

- Text: secondary text color, 14px
- Human-readable: `3.2 MB`, `340 KB`, `14.5 MB`
- Right-aligned
- Shows the original file size (before processing)
- Empty for folder header rows

### Before / After Columns

- Text: body text color, 14px, weight 500 (tabular-nums for alignment)
- **Before**: tag count after reading (e.g., `23`, `45`, `8`), or `—` while pending
- **After**: `0` on success (in success green), error message on failure (in error red, italic), `...` with pulsing opacity (0.4→1.0, 1.5s loop) during processing
- Right-aligned
- For folder header rows: empty

### Error Display in Table

When a file fails:
- Left border: 2px error red
- Status icon: red X
- After column: short error text in error red, italic (e.g., "Can't read file", "Permission denied")
- Row background: very subtle error tint (error bg at 30% opacity)

---

## Status Bar

### Layout

```
┌─────────────────────────────────────────────────────────────────┐
│ ▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔              │ ← 3px progress bar (gold, at top of status bar)
│  [status text]                              [Clean more]        │ ← 33px content area
└─────────────────────────────────────────────────────────────────┘
```

- Height: 36px total (3px progress bar + 33px content)
- Background: window chrome color
- Top border: 1px border color
- Padding: 0 12px
- **Hidden in State 1 (empty).** Slides up (200ms ease-out) when files are added.

### Progress Bar

- 3px tall, full width, at top edge of status bar
- Fill color: gold, animates width smoothly (300ms ease-out)
- On completion: brief green flash (#2D8659 at 100% opacity for 300ms), then fades out (opacity 0 over 300ms)
- Only visible during processing (State 3)

### Status Text (left side)

- During processing: "3 of 12 files" — updates as each file completes. Numbers use body text color, rest is secondary text.
- After completion: "10 cleaned · 2 errors · 287 tags removed" — cleaned count in success green, error count in error red (only if >0), tags removed in body text. Separator dot `·` in muted text.
- Font: 13px, weight 400

### "Clean more" Button (right side)

- Text: "Clean more", burgundy color, 13px, weight 500
- Style: text button (no background, no border)
- Hover: underline
- **Disabled** during processing (muted text color, no hover effect)
- **Enabled** after completion
- Click: resets to State 1 (empty), clears all files. Each session is independent — no "add more files" concept.

---

## Settings Panel (Popover from Right)

Triggered by clicking the gear icon ⚙ in the title bar. Available in ALL states.

### Panel Behavior

- **Slides in from the right edge** of the window (200ms ease-out)
- **Width**: 280px
- **Height**: full height of content area (below title bar, above status bar)
- **Background**: surface color (white/dark surface)
- **Left border**: 1px border color
- **Shadow**: shadow lg on the left side
- **CRITICAL**: This is a TRUE POPOVER — it renders ON TOP of the main content. The main content underneath is overlaid with a semi-transparent backdrop (black at 20% opacity in light mode, black at 40% in dark mode). Clicking the backdrop dismisses the panel. The main content does NOT reflow or resize.
- Escape key also dismisses the panel.

### Panel Content

```
┌──────────────────────────────┐
│  Settings                  ✕ │  ← 16px heading, close X button
│                              │
│  ┌──────────────────────────┐│
│  │ ☑ Preserve orientation   ││  ← Checkbox + label
│  │   Keep rotation metadata ││  ← Description subtext
│  │   so images display      ││
│  │   correctly               ││
│  └──────────────────────────┘│
│                              │
│  ┌──────────────────────────┐│
│  │ ☐ Keep original files    ││
│  │   Save cleaned copies    ││
│  │   as filename_clean.ext  ││
│  └──────────────────────────┘│
│                              │
│  ┌──────────────────────────┐│
│  │ ☐ Preserve file dates    ││
│  │   Keep original creation ││
│  │   and modification times ││
│  └──────────────────────────┘│
│                              │
└──────────────────────────────┘
```

### Setting Items

Each setting is a group:

- **Checkbox**: 16px, burgundy when checked (filled square with white checkmark), neutral border when unchecked
- **Label**: 14px, weight 500, body text color. Sits next to checkbox on same line.
- **Description**: 12px, weight 400, muted text color. Below the label, indented to align with label text (not the checkbox).
- **Spacing**: 16px between setting groups
- **Padding**: 16px inside the panel

**Settings**:

1. **Preserve orientation** (default: ON)
   - Description: "Keep rotation metadata so images display correctly"
2. **Keep original files** (default: OFF)
   - Description: "Save cleaned copies as filename_clean.ext"
3. **Preserve file dates** (default: OFF)
   - Description: "Keep original creation and modification times"

---

## Metadata Detail (Inline Expansion)

When a completed or errored row is clicked, an expansion panel opens directly below that row. Only one expansion can be open at a time — clicking another row closes the current one and opens the new one.

### Expansion Panel

- Background: surface color with subtle border (1px top + bottom, border color)
- Padding: 12px 16px
- Max height: 200px, scrollable if more tags
- Animation: height expands from 0 with 200ms ease-out. **Must be snappy — no sluggish accordion.**

### Panel Header (inside expansion)

```
[filename.jpg]   3.2 MB  ·  23 examined  ·  21 removed  ·  2 preserved      [Reveal in Finder →]
```

- Filename: 14px, weight 500, body text color
- Stats: 12px, muted text color, separated by `·`
- "Reveal in Finder →": 12px, burgundy, text button, right-aligned

### Tag List

Two-column layout for wider displays, single column if space is tight:

```
┌────────────────────────────┬────────────────────────────┐
│ ̶G̶P̶S̶L̶a̶t̶i̶t̶u̶d̶e̶:̶ ̶3̶7̶.̶7̶7̶4̶9̶  REMOVED  │ ̶G̶P̶S̶L̶o̶n̶g̶i̶t̶u̶d̶e̶:̶ ̶-̶1̶2̶2̶.̶4̶1̶9̶  REMOVED │
│ ̶M̶a̶k̶e̶:̶ ̶A̶p̶p̶l̶e̶             REMOVED  │ ̶M̶o̶d̶e̶l̶:̶ ̶i̶P̶h̶o̶n̶e̶ ̶1̶5̶ ̶P̶r̶o̶  REMOVED │
│ Orientation: Horizontal  KEPT     │ ColorSpace: sRGB        KEPT    │
│ ̶D̶a̶t̶e̶T̶i̶m̶e̶:̶ ̶2̶0̶2̶5̶:̶0̶1̶:̶1̶5̶  REMOVED  │ ̶S̶o̶f̶t̶w̶a̶r̶e̶:̶ ̶1̶7̶.̶2̶        REMOVED │
└────────────────────────────┴────────────────────────────┘
```

**Removed tags**:
- Tag name + value: strikethrough text, muted text color, monospace 13px
- Badge: "REMOVED" — 10px, weight 600, error red text, error bg background, 2px border-radius, 2px 5px padding

**Preserved tags** (when orientation/dates preservation is enabled):
- Tag name + value: normal text, body text color, monospace 13px
- Badge: "KEPT" — 10px, weight 600, success green text, success bg background, same badge style

**Error expansion** (for failed files):
- Show error message: "ExifTool could not read this file. It may be corrupted or in an unsupported format."
- Error text color, 13px
- No tag list

---

## Dark Mode Toggle

- Position: rightmost icon in title bar
- Light mode: shows sun icon ☀ (meaning "currently light, click for dark")
- Dark mode: shows moon icon ☽ (meaning "currently dark, click for light")
- Icon: 16px, muted text color, hover: secondary text color
- Transition: All colors transition 200ms ease-out when toggling

When toggled, ALL colors swap to the dark mode palette simultaneously. No element-by-element transition — it should feel like flipping a light switch.

---

## Demo Data & Auto-Play Sequence

### File Dataset (16 files)

The demo auto-plays to show all features. Files are a mix of individual drops and one folder.

**Individual files** (dropped directly, no folder header):
```
vacation_photo.jpg      JPG     3.8 MB    23 tags → 0     success
selfie_park.heic        HEIC    2.4 MB    45 tags → 0     success
portrait.png            PNG     1.1 MB     8 tags → 0     success
scan_receipt.pdf        PDF     340 KB    12 tags → 0     success
corrupt_file.pdf        PDF     28 KB      — → error      "Can't read file"
```

**Folder "Camera Roll/"** (11 files across subfolders):
```
Camera Roll/
  IMG_2847.mov           MOV     42 MB     67 tags → 0     success
  IMG_2850.jpg           JPG     4.2 MB    38 tags → 0     success

Camera Roll/Beach Day/
  ocean_sunset.jpg       JPG     5.1 MB    41 tags → 0     success
  sandy_feet.heic        HEIC    3.3 MB    29 tags → 0     success
  video_waves.mp4        MP4     18 MB     52 tags → 0     success

Camera Roll/City Walk/
  street_art.jpg         JPG     2.9 MB    35 tags → 0     success
  cafe_latte.heic        HEIC    1.8 MB    22 tags → 0     success
  night_lights.jpg       JPG     4.5 MB    44 tags → 0     success
  broken_raw.dng         DNG     22 MB      — → error      "Format not supported"

Camera Roll/Portraits/
  headshot_final.jpg     JPG     3.6 MB    31 tags → 0     success
```

**Totals**: 16 files, 14 cleaned, 2 errors, 447 tags removed

### Metadata Tags (for expansion detail)

For `vacation_photo.jpg` (23 tags):
- **Removed (21)**: GPSLatitude: 37.7749, GPSLongitude: -122.4194, Make: Apple, Model: iPhone 15 Pro, DateTime: 2025:01:15 14:23:07, Software: 17.2, ExposureTime: 1/120, FNumber: 1.78, ISO: 50, FocalLength: 6.86mm, ShutterSpeed: 1/120, Aperture: 1.78, BrightnessValue: 8.2, WhiteBalance: Auto, Flash: Off, LensModel: iPhone 15 Pro back camera, ImageWidth: 4032, ImageHeight: 3024, XResolution: 72, YResolution: 72, CreateDate: 2025:01:15
- **Preserved (2)**: Orientation: Horizontal (normal), ColorSpace: sRGB

For `corrupt_file.pdf` (error):
- Error message: "ExifTool could not read this file. The file may be corrupted or in an unsupported format."

### Auto-Play Timeline

The prototype auto-plays this sequence on load:

```
t=0.0s    State 1: Empty state shown
t=1.5s    Simulate drag-over (State 2): gold border + "Release to clean"
t=2.5s    Simulate drop (State 3):
          - Status bar slides up
          - Table header appears
          - All 16 rows cascade in with stagger animation (30ms apart = ~500ms total)
          - Folder headers appear inline with their files
t=3.2s    Processing begins:
          - File 1 starts: gold spinner, gold left border, "..." pulsing in After column
          - Progress bar begins filling
t=3.5s    File 1 complete: spinner → checkmark (spring pop), left border → green, After → "0"
t=3.7s    File 2 starts processing
t=4.0s    File 2 complete
t=4.1s    File 3 starts
t=4.3s    File 3 complete
t=4.4s    File 4 (portrait.png) starts
t=4.6s    File 4 complete
t=4.7s    File 5 (corrupt_file.pdf) starts processing
t=5.0s    File 5 ERROR: spinner → red X, left border → red, After → "Can't read file" (italic, red)
          Row gets subtle error bg tint
t=5.1s    File 6 (scan_receipt.pdf) starts
t=5.3s    File 6 complete
          ... continue through remaining files at ~0.2-0.3s each ...
t=8.5s    File 15 (broken_raw.dng) ERROR
t=8.8s    File 16 complete
          Progress bar → green flash → fade out
t=9.0s    State 4: Complete
          Status text: "14 cleaned · 2 errors · 447 tags removed"
          "Clean more" button activates
t=10.5s   Auto-click vacation_photo.jpg row → metadata expansion opens
          Shows all 23 tags with removed/preserved styling
t=14.0s   Auto-click corrupt_file.pdf → first expansion closes, error expansion opens
t=16.0s   Demo ends. User can interact freely.
```

**IMPORTANT timing notes**:
- Individual file processing should feel FAST (200-300ms each). This is a speed tool.
- The stagger between files starting is minimal — files process rapidly.
- Total processing time for 16 files: ~5-6 seconds in the demo (real app would be faster).
- Animations must be snappy. Micro-animations (spinner→checkmark) should feel satisfying but never slow.

---

## Interactive Features (after auto-play)

After the auto-play completes, the user can:

1. **Click any completed/error row** → opens inline metadata expansion (closes any currently open one)
2. **Hover any completed file row** → reveals "↗" Finder icon at right edge of Name cell
3. **Click ↗ icon** → shows toast "Revealed in Finder" (bottom center, fades after 2s)
4. **Click ⚙ gear** → settings panel slides in from right with backdrop
5. **Click backdrop or ✕ or press Escape** → settings panel closes
6. **Toggle settings checkboxes** → functional (visual only, no logic change needed)
7. **Click ☀/☽** → toggles between light and dark mode
8. **Click "Clean more"** → resets to State 1 (empty state)
9. **Scroll table** → header stays sticky, table body scrolls

---

## Implementation Notes

### React Component Structure

```
ExifCleanerPrototype (root)
├── TitleBar (traffic lights, title, gear icon, dark mode toggle)
├── ContentArea
│   ├── EmptyState (State 1) OR DragOverState (State 2)
│   └── FileTable (States 3-4)
│       ├── TableHeader (sticky)
│       └── TableBody
│           ├── FolderHeaderRow (for folder groups)
│           ├── FileRow (per file)
│           │   └── MetadataExpansion (when clicked)
│           └── ...
├── StatusBar (hidden in State 1, visible in States 3-4)
│   ├── ProgressBar
│   ├── StatusText
│   └── CleanMoreButton
├── SettingsPanel (overlay, conditionally shown)
│   └── Backdrop
└── Toast (positioned fixed, bottom center)
```

### State Management

Use React `useState` + `useEffect` for:
- `appState`: 'empty' | 'dragOver' | 'processing' | 'complete'
- `isDarkMode`: boolean
- `files`: array of file objects with processing status
- `currentProcessingIndex`: number
- `expandedRowIndex`: number | null
- `settingsOpen`: boolean
- `settings`: { preserveOrientation: boolean, keepOriginals: boolean, preserveDates: boolean }
- `toastMessage`: string | null

### Styling Approach

Use JavaScript style objects (inline styles). Create a `theme` object that switches between light and dark palettes based on `isDarkMode`. Example:

```jsx
const theme = isDarkMode ? darkTheme : lightTheme;
// Then: style={{ backgroundColor: theme.background, color: theme.bodyText }}
```

### Quality Bar

This prototype should feel like a **real app**, not a rough mockup:

- Pixel-perfect spacing (use the exact spacing scale)
- Smooth, snappy animations (never laggy)
- Dark mode that looks intentionally designed
- Typography that feels native to macOS
- Status icons that pop with satisfaction (the checkmark spring animation matters)
- Subtle details: alternating row colors, hover states, the progress bar green flash
- The settings panel backdrop should feel polished (smooth fade, correct z-indexing)
- Table should handle 16 rows without layout issues
- Scrolling should be smooth with sticky header

The prototype must communicate: "This is a tool that respects your time and does one thing exceptionally well."

---

## What NOT to Do

- ❌ No card grid layout
- ❌ No focused-flow / slideshow / one-file-at-a-time view
- ❌ No "Clear" or "Clear list" button — use "Clean more"
- ❌ No collapsible folder tree — flat list with path headers
- ❌ No "show more tags" links — show all tags in expansion
- ❌ No "drop more files" or multi-session adding
- ❌ No artificial slowdowns — processing should feel fast
- ❌ No keyboard shortcut labels on buttons
- ❌ No toggle switches for settings — use checkboxes with labels + descriptions
- ❌ No Tailwind — use inline JS styles
- ❌ No external dependencies — React only
- ❌ No confetti, no celebrations, no "All done!" hero cards
- ❌ No overly saturated borders in dark mode — keep it refined
