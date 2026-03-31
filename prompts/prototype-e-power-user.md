# Prompt E: "Power User" — ExifCleaner UI Prototype

> Copy-paste this entire file into Claude (artifacts) or v0 to generate an interactive mockup.

---

## System Context

You are a senior UI designer building an interactive React prototype of **ExifCleaner**, a cross-platform Electron desktop app that strips EXIF/metadata from images, videos, and PDFs.

**Design variant**: Maximum information density. The table has **more columns** (file type, file size), and clicking a row **expands an inline metadata diff** below it showing exactly what was removed. Settings live in a **collapsible left sidebar**. This is the "show me everything" version for users who want transparency into what's happening.

**Tradeoff explored**: Most capable and informative variant. Shows the actual metadata diff (before/after with strikethrough). But also the most visually complex — more columns, expandable rows, sidebar. Best for power users who batch-process hundreds of files and want to verify what happened.

**Output**: One self-contained React component (with Tailwind CSS). No external dependencies beyond React and Tailwind. Everything in one artifact.

---

## Visual Design System

### Colors

**Light Mode:**
```
Background:        #F5F6F8
Surface:           #FFFFFF
Borders:           #DADEE4
Body text:         #3B4351
Heading text:      #1E2028
Muted text:        #9BA3B0
Secondary text:    #66758C
Window chrome:     #FAFAFA
Sidebar bg:        #FFFFFF  (same as surface)

Brand burgundy:    #521737
Brand gold:        #F8D057
Brand orange:      #E97043

Success:           #2D8659
Success bg:        #E8F5EE
Error:             #C44536
Error bg:          #FCEAE8
Info:              #3B7FC4

Strikethrough:     #C44536  (deleted tags shown in red strikethrough)
Kept tag:          #2D8659  (preserved tags shown in green)
```

**Dark Mode:**
```
Background:        #141416
Surface:           #1C1C1F
Elevated:          #252528
Borders:           #48484D
Body text:         #C5C5CB
Heading text:      #EEEEF0
Muted text:        #818188
Window chrome:     #0E0E10
Sidebar bg:        #1C1C1F

Brand burgundy:    #C4467A
Brand gold:        #F8D057
Brand orange:      #E97043

Success:           #2D8659
Success bg:        #1A3D2B
Error:             #C44536
Error bg:          #3D1A16

Strikethrough:     #E97043  (brighter on dark for visibility)
Kept tag:          #2D8659
```

### Typography

```
Font family:    system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif
Mono:           ui-monospace, "SF Mono", Menlo, Consolas, monospace
Body:           14px (note: smaller base for density)
Small:          12px
Micro:          11px
Table header:   12px, weight 600, uppercase, letter-spacing 0.05em
Expanded meta:  12px mono (metadata key-value pairs)
Sidebar:        14px
```

**Important**: This variant uses 14px as the base body size (not 16px) because information density is the priority. Table content is smaller to fit more.

### Spacing (tighter for density)

```
2px   — micro gaps
4px   — tight gaps, table cell padding (horizontal)
6px   — table cell padding (vertical)
8px   — sidebar padding, section gaps
12px  — compact card padding
16px  — expanded panel padding
```

---

## App Layout

### Window Structure

```
┌─────────────────────────────────────────────────────────────────────┐
│ ● ● ●                         ExifCleaner                    ☀/☽  │
├──────────┬──────────────────────────────────────────────────────────┤
│          │                                                          │
│ Settings │   Filename       Type  Size    Before  After   Status   │
│          │   ──────────────────────────────────────────────────     │
│ ☑ Orient │   vacation_p…   JPG   2.4MB    23      0       ✓       │
│ ☐ Keep   │   selfie_pa…   HEIC  5.1MB    45      0       ✓       │
│ ☑ Dates  │ ▶ portrait.…   PNG   1.2MB     8      0       ✓       │
│          │   ├─ Camera:    Canon EOS R5     →   (removed)         │
│ ──────── │   ├─ GPS Lat:   37.7749° N      →   (removed)         │
│ Batch    │   ├─ GPS Long:  -122.4194° W    →   (removed)         │
│ 5 of 6 ✓ │   └─ ... 5 more tags                                   │
│ 1 error  │   corrupt_f…   PDF   340KB     —    Can't read  ✗     │
│          │   scan_rece…   PDF   890KB    12      0       ✓       │
│ [Clear]  │   IMG_2847.…   MOV  48.2MB    67      0       ✓       │
│          │                                                          │
├──────────┴──────────────────────────────────────────────────────────┤
│ ◀ Hide                                                              │
└─────────────────────────────────────────────────────────────────────┘
```

**Total viewport**: 700px wide × 450px tall (slightly wider than other variants to accommodate sidebar + wider table).

### Sidebar (Collapsible)

**Width**: 160px when open, collapses to 0px.
**Toggle**: Small "◀ Hide" / "▶ Show" button at the bottom of the sidebar or a toggle icon.

**Sidebar contents**:

1. **Settings section** (top):
   ```
   Settings
   ─────────
   ☑ Preserve orientation
   ☐ Keep original files
   ☑ Preserve file dates
   ```
   - Checkbox accent: burgundy
   - Labels: 13px, body text color
   - Section header: 12px, uppercase, muted, letter-spacing

2. **Batch info section** (middle):
   ```
   Batch
   ─────────
   6 files
   5 cleaned ✓
   1 error ✗
   155 tags removed
   ```
   - Live-updating counters
   - Success count in green, error count in red
   - Total tags: sum of all "Before" values for successful files

3. **Clear button** (bottom):
   ```
   [Clear list]
   ```
   - Full-width button in sidebar, muted style
   - Only enabled when all processing is complete

**Sidebar collapse animation**: 200ms ease-in-out, content area expands to fill.

---

## Table Design (Dense)

### Columns

| Column | Width | Align | Content |
|--------|-------|-------|---------|
| Filename | flex-1 (grow) | left | Truncated with ellipsis, full path in title tooltip |
| Type | 48px | center | Uppercase extension badge (JPG, HEIC, PNG, PDF, MOV) |
| Size | 64px | right | Human-readable (KB, MB) |
| Before | 56px | right | Tag count number, or "—" |
| After | 56px | right | Tag count, "—", or error message |
| Status | 32px | center | Icon: spinner / ✓ / ✗ |

### Table Features

- **Header row**: Sticky, 12px uppercase, muted text, bottom border
- **Alternating rows**: Even rows get subtle background (Neutral 200 light / Elevated dark)
- **Row hover**: Highlight to Neutral 200 (light) / Elevated (dark)
- **Cursor**: pointer on completed rows (they're expandable)
- **Row height**: 32px (compact)

### Type Badge

Small pill badge for file type:
```
┌─────┐
│ JPG │  ← 10px, uppercase, weight 600, pill, muted bg
└─────┘
```
- Background: Neutral 200 (light) / Neutral 300 (dark)
- Different subtle tint per type (optional nice-to-have):
  - Image types (JPG, PNG, HEIC): slightly blue tint on bg
  - Video types (MOV): slightly purple tint
  - Document types (PDF): slightly orange tint

---

## Expandable Metadata Diff (Key Feature)

Clicking a completed row expands an inline panel below it showing the metadata diff.

### Expanded Row Design

```
┌──────────────────────────────────────────────────────────────┐
│  ✓ portrait.png           PNG   1.2MB     8      0    ✓     │  ← parent row (highlighted)
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  Tag                      Before              After          │
│  ─────────────────────────────────────────────────────       │
│  Camera Make              Canon EOS R5        (removed)      │  ← strikethrough on "Canon EOS R5"
│  Camera Model             EOS R5              (removed)      │
│  GPS Latitude             37.7749° N          (removed)      │
│  GPS Longitude            -122.4194° W        (removed)      │
│  Date/Time Original       2025-08-14 16:32    (removed)      │
│  Software                 Lightroom 7.2       (removed)      │
│  Color Space              sRGB                sRGB           │  ← kept (green), if orientation preserved
│  Orientation              Horizontal          Horizontal     │  ← kept (green), because setting is ON
│                                                              │
│  8 tags examined · 6 removed · 2 preserved                   │  ← summary line
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### Diff Styling

- **Panel background**: slightly different from row bg (card surface)
- **Panel padding**: 16px left (indented from parent row), 12px top/bottom
- **Font**: monospace for alignment
- **"Before" column**: If tag was removed, show value with `text-decoration: line-through` in strikethrough color
- **"After" column**:
  - Removed: "(removed)" in muted text
  - Preserved: Show the value in kept-tag green color
- **Summary line**: "X tags examined · Y removed · Z preserved" in micro text, muted
- **Animation**: Panel height expands from 0 (200ms ease-out). Content fades in (150ms, delayed 50ms)

### Expansion Rules

- Only one row can be expanded at a time
- Clicking an expanded row collapses it
- Clicking a different row collapses the current and expands the new one
- Only completed rows (success or error) are expandable
- Pending/processing rows are not clickable

### Error Row Expansion

```
┌──────────────────────────────────────────────────────────────┐
│  ✗ corrupt_file.pdf       PDF   340KB     —    Can't read ✗ │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  Error: Unable to read file                                  │
│  ExifTool reported: "File format not recognized"             │
│                                                              │
│  The file may be corrupted or in an unsupported format.      │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

- Error text in error color
- ExifTool message in mono, muted
- Helpful explanation in body text

---

## State Machine

### State 1: Empty (initial)

Sidebar is hidden. Full-width drop zone:

```
┌─────────────────────────────────────────────────────────────────────┐
│ ● ● ●                         ExifCleaner                    ☀/☽  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│                                                                     │
│                          [images icon]                               │
│                                                                     │
│                   Drop files here to                                │
│                     remove metadata                                 │
│                                                                     │
│                        [Add files]                                  │
│                                                                     │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

- No sidebar visible
- No table visible
- Dashed border drop zone, centered

### State 2: Drag Over

- Dashed border turns gold
- Background: gold at 5%
- "Release to clean" in gold

### State 3: Processing

Sidebar slides in from left (200ms). Table appears with files.

```
┌──────────┬──────────────────────────────────────────────────────────┐
│          │                                                          │
│ Settings │  Filename       Type  Size    Before  After   Status    │
│          │  ──────────────────────────────────────────────────      │
│ ☑ Orient │  ⟳ vacation…   JPG   2.4MB    23      ...      ⟳      │
│ ☐ Keep   │  ● selfie_…    HEIC  5.1MB     —       —       ●      │
│ ☑ Dates  │  ● portrait…   PNG   1.2MB     —       —       ●      │
│          │  ● corrupt_…   PDF   340KB     —       —       ●      │
│ ──────── │  ● scan_rec…   PDF   890KB     —       —       ●      │
│ Batch    │  ● IMG_2847…   MOV  48.2MB     —       —       ●      │
│ 0 of 6   │                                                          │
│          │                                                          │
│          │                                                          │
├──────────┴──────────────────────────────────────────────────────────┤
│ ◀ Hide                                                              │
└─────────────────────────────────────────────────────────────────────┘
```

- Files appear staggered in table (100ms apart)
- Sidebar shows live batch counter: "0 of 6", then "1 of 6", etc.

### State 4: Complete

All files processed. Sidebar shows final stats. Rows are expandable.

```
┌──────────┬──────────────────────────────────────────────────────────┐
│          │                                                          │
│ Settings │  Filename       Type  Size    Before  After   Status    │
│          │  ──────────────────────────────────────────────────      │
│ ☑ Orient │  ✓ vacation…   JPG   2.4MB    23      0       ✓       │
│ ☐ Keep   │  ✓ selfie_…    HEIC  5.1MB    45      0       ✓       │
│ ☑ Dates  │  ✓ portrait…   PNG   1.2MB     8      0       ✓       │
│          │  ✗ corrupt_…   PDF   340KB     —   Can't read  ✗       │
│ ──────── │  ✓ scan_rec…   PDF   890KB    12      0       ✓       │
│ Batch    │  ✓ IMG_2847…   MOV  48.2MB    67      0       ✓       │
│ 5 of 6 ✓ │                                                          │
│ 1 error  │                                                          │
│ 155 tags │                                                          │
│          │                                                          │
│ [Clear]  │                                                          │
├──────────┴──────────────────────────────────────────────────────────┤
│ ◀ Hide                                                              │
└─────────────────────────────────────────────────────────────────────┘
```

Click any completed row → inline metadata diff expands below it.

---

## Simulated Interaction Flow

1. **State 1**: Full-width drop zone. Click "Add files".
2. **Drag-over flash** (400ms).
3. **Sidebar slides in** from left (200ms). Table populates (staggered rows).
4. **Processing** happens sequentially. Sidebar counter updates.
5. **State 4**: All complete. Click "portrait.png" row → metadata diff expands.
6. Click "vacation_photo.jpg" → portrait collapses, vacation expands.
7. Click "◀ Hide" → sidebar collapses. Table fills full width.
8. Click "▶ Show" → sidebar reappears.
9. Click "Clear" → sidebar slides out, table fades, return to State 1.

### Timing

```
t=0s      Sidebar slides in. Files appear in table.
t=0.5s    vacation_photo.jpg processing...
t=1.5s    vacation_photo.jpg → ✓
t=2.0s    selfie_park.heic → ✓
t=2.5s    portrait.png → ✓
t=3.0s    corrupt_file.pdf → ✗
t=3.5s    scan_receipt.pdf → ✓
t=4.0s    IMG_2847.mov → ✓
t=4.5s    All done. portrait.png auto-expands to show metadata diff.
```

At t=4.5s, automatically expand one row (portrait.png) to demonstrate the metadata diff feature. This draws the user's attention to the expandable rows.

---

## Fake Data

| Filename | Type | Size | Before | After | Status |
|----------|------|------|--------|-------|--------|
| vacation_photo.jpg | JPG | 2.4 MB | 23 | 0 | success |
| selfie_park.heic | HEIC | 5.1 MB | 45 | 0 | success |
| portrait.png | PNG | 1.2 MB | 8 | 0 | success |
| corrupt_file.pdf | PDF | 340 KB | — | Can't read file | error |
| scan_receipt.pdf | PDF | 890 KB | 12 | 0 | success |
| IMG_2847.mov | MOV | 48.2 MB | 67 | 0 | success |

### Metadata Diff Data (for portrait.png)

```
Tag                    Before Value           After Value      Action
─────────────────────  ─────────────────────  ──────────────   ──────
Camera Make            Canon                  (removed)        removed
Camera Model           EOS R5                 (removed)        removed
GPS Latitude           37.7749° N             (removed)        removed
GPS Longitude          -122.4194° W           (removed)        removed
Date/Time Original     2025-08-14 16:32:10    (removed)        removed
Software               Adobe Lightroom 7.2    (removed)        removed
Color Space            sRGB                   sRGB             preserved
Orientation            Horizontal (normal)    Horizontal       preserved
```

- 8 tags examined, 6 removed, 2 preserved
- Color Space and Orientation are preserved because their respective settings are ON

### Metadata Diff Data (for vacation_photo.jpg — if user clicks it)

```
Tag                    Before Value           After Value      Action
─────────────────────  ─────────────────────  ──────────────   ──────
Camera Make            Canon                  (removed)        removed
Camera Model           EOS R5                 (removed)        removed
Lens Model             RF 24-70mm f/2.8       (removed)        removed
Focal Length           35.0 mm                (removed)        removed
F Number               f/2.8                  (removed)        removed
Exposure Time          1/250                  (removed)        removed
ISO                    400                    (removed)        removed
GPS Latitude           37.7749° N             (removed)        removed
GPS Longitude          -122.4194° W           (removed)        removed
GPS Altitude           15.2 m                 (removed)        removed
Date/Time Original     2025-07-20 09:15:33    (removed)        removed
Create Date            2025-07-20 09:15:33    (removed)        removed
Modify Date            2025-07-21 11:42:00    (removed)        removed
Software               Adobe Lightroom 7.2    (removed)        removed
Creator Tool           Lightroom              (removed)        removed
Image Description      Summer vacation 2025   (removed)        removed
Copyright              Jon Smith              (removed)        removed
Artist                 Jon Smith              (removed)        removed
Flash                  No Flash               (removed)        removed
White Balance          Auto                   (removed)        removed
Metering Mode          Multi-segment          (removed)        removed
Color Space            sRGB                   sRGB             preserved
Orientation            Horizontal (normal)    Horizontal       preserved
```

- 23 tags examined, 21 removed, 2 preserved

---

## What NOT to Include

- No card/grid layout (this variant uses a dense table exclusively)
- No modal settings (settings are in the sidebar)
- No progress dots or focused-card view
- No multi-page routing
- No user accounts
- No thumbnail previews
- No drag reordering
- No search/filter input (keep it simple even for power users)
- No column resizing (fixed column widths)
- No column sorting (files shown in drop order)

---

## Quality Bar

This is the **most transparent** variant. The user sees exactly what happened to every file. The metadata diff is the star feature — it builds trust by showing "here's what we removed, here's what we kept, and why."

Key quality targets:

- **Table density**: Should feel like a well-designed IDE or database browser — tight rows, efficient use of space, but still readable
- **Metadata diff**: The monospace font, aligned columns, red strikethrough for removed and green for preserved should feel like a clean git diff
- **Sidebar**: Should feel like a macOS inspector panel — unobtrusive, collapsible, informative
- **Expand/collapse**: Should be smooth (height animation), not jumpy. Content should fade in slightly after the height expands.
- **Type badges**: Small, colorful pills that help visually scan file types at a glance
- **File sizes**: Right-aligned, human-readable. Gives users context on what they're processing.
- **Dark mode**: The strikethrough should use orange (#E97043) instead of red for better contrast on dark backgrounds. The kept-tag green should pop.

This variant is for users who process hundreds of files and want to verify the results. It's the "trust but verify" design.

**Build this prototype now.** Generate one React component with the dense table, collapsible sidebar, expandable metadata diff rows, and all state transitions.
