# Prompt C: "Card Grid" — ExifCleaner UI Prototype

> Copy-paste this entire file into Claude (artifacts) or v0 to generate an interactive mockup.

---

## System Context

You are a senior UI designer building an interactive React prototype of **ExifCleaner**, a cross-platform Electron desktop app that strips EXIF/metadata from images, videos, and PDFs.

**Design variant**: Files are displayed as **cards in a responsive grid** instead of table rows. Each card shows the filename, file type badge, tag counts, and a status indicator. Clicking a card reveals a metadata detail panel. Settings live in a **slide-in panel** from the right edge.

**Tradeoff explored**: More visual and tactile than a table. Potentially better for small batches (1-10 files). Worse for large batches (50+ files) due to space consumption. Feels more "app-like" and less "spreadsheet-like."

**Output**: One self-contained React component (with Tailwind CSS). No external dependencies beyond React and Tailwind. Everything in one artifact.

---

## Visual Design System

### Colors

**Light Mode:**
```
Background:        #F5F6F8
Card surface:      #FFFFFF
Card border:       #DADEE4
Body text:         #3B4351
Heading text:      #1E2028
Muted text:        #9BA3B0
Secondary text:    #66758C
Window chrome:     #FAFAFA

Brand burgundy:    #521737
Brand gold:        #F8D057
Brand orange:      #E97043

Success:           #2D8659
Success bg:        #E8F5EE
Error:             #C44536
Error bg:          #FCEAE8
Info:              #3B7FC4
Info bg:           #E5F0FA
```

**Dark Mode:**
```
Background:        #141416
Card surface:      #1C1C1F
Card border:       #48484D
Body text:         #C5C5CB
Heading text:      #EEEEF0
Muted text:        #818188
Window chrome:     #0E0E10

Brand burgundy:    #C4467A
Brand gold:        #F8D057
Brand orange:      #E97043

Success:           #2D8659
Success bg:        #1A3D2B
Error:             #C44536
Error bg:          #3D1A16
```

### Typography

```
Font family:    system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif
Body:           16px / 400 / 1.5
Small:          14px / 400 / 1.5
Micro:          12px / 400 / 1.5
Card title:     14px / 600 / 1.25
Section:        20px / 500 / 1.25
```

### Card-Specific Design

```
Card size:          160px × 120px (compact), grows if needed
Card border radius: 8px
Card padding:       16px
Card shadow:        shadow-sm (default), shadow-md (hover)
Card gap:           12px (grid gap)
Grid columns:       auto-fill, minmax(160px, 1fr)
```

---

## App Layout

### Window Chrome

```
┌─────────────────────────────────────────────────────────┐
│ ● ● ●                    ExifCleaner         ⚙   ☀/☽  │  ← 38px title bar
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌──────┐ ┌──────┐ ┌──────┐                            │
│  │ card │ │ card │ │ card │                            │
│  └──────┘ └──────┘ └──────┘                            │  ← card grid
│  ┌──────┐ ┌──────┐ ┌──────┐                            │
│  │ card │ │ card │ │ card │                            │
│  └──────┘ └──────┘ └──────┘                            │
│                                                         │
│                                         Clear (⌘K)      │
└─────────────────────────────────────────────────────────┘
```

**Total viewport**: 580px wide × 400px tall.
**Content padding**: 16px on all sides.
**Grid**: CSS Grid with `auto-fill, minmax(160px, 1fr)` and 12px gap.

### Settings Panel (Slide-in from right)

When the gear icon (⚙) is clicked, a panel slides in from the right edge:

```
┌────────────────────────────────────────┬────────────────┐
│ ● ● ●              ExifCleaner   ⚙ ☀/☽│                │
├────────────────────────────────────────┤   Settings     │
│                                        │                │
│  ┌──────┐ ┌──────┐                     │  ☑ Preserve    │
│  │ card │ │ card │                     │    orientation │
│  └──────┘ └──────┘                     │                │
│  ┌──────┐ ┌──────┐                     │  ☐ Keep        │
│  │ card │ │ card │                     │    originals   │
│  └──────┘ └──────┘                     │                │
│                                        │  ☑ Preserve    │
│                                        │    file dates  │
│                                        │                │
└────────────────────────────────────────┴────────────────┘
```

- Panel width: 200px
- Slides in from right: 200ms ease-out
- Content area shrinks by 200px (cards reflow into fewer columns)
- Panel has border-left: 1px border color
- Panel background: card surface color
- Click gear again or click outside panel to close (panel slides out 200ms ease-in)

---

## Card Design

Each file is represented as a card with this layout:

```
┌────────────────────────────┐
│                            │
│  ⟳  vacation_photo.jpg     │  ← status icon + truncated filename (14px, 600)
│                            │
│  .jpg                      │  ← file extension badge (micro, muted bg pill)
│                            │
│  Before: 23  After: ...    │  ← tag counts (micro, muted text)
│                            │
└────────────────────────────┘
```

### Card States

**Pending** (waiting to process):
- Border: default border color
- Icon: small gray circle (●)
- Body: "Before: —  After: —" in muted text
- Background: card surface

**Processing** (currently being cleaned):
- Border: 2px solid gold (`#F8D057`)
- Icon: gold spinner (CSS animation, 14px)
- Body: "Before: 23  After: ..." (pulsing dots)
- Background: card surface
- Subtle gold glow: `box-shadow: 0 0 0 1px rgba(248, 208, 87, 0.3)`

**Complete** (success):
- Border: 2px solid success green
- Icon: green checkmark ✓ (pops in with spring animation)
- Body: "Before: 23  After: 0"
- Background: brief flash of success bg (200ms)
- After flash: returns to card surface

**Error** (failed):
- Border: 2px solid error red
- Icon: red X ✗
- Body: "Before: —  Error: Can't read file"
- Background: error bg (persistent, not just flash)

### Card Hover

- Shadow increases from sm to md
- Slight translateY(-2px) lift effect
- Cursor: pointer
- Transition: 150ms ease-out

### Card Click → Detail Overlay

Clicking a completed or error card shows a small overlay/tooltip positioned near the card showing metadata details:

```
┌──────────────────────────┐
│ vacation_photo.jpg       │
│ ─────────────────        │
│ GPS Latitude:    37.7°   │
│ GPS Longitude:   -122.4° │
│ Camera:          Canon   │
│ Orientation:     Normal  │
│ ... 19 more tags         │
│                          │
│ All 23 tags removed ✓    │
└──────────────────────────┘
```

- Positioned above or below the card (whichever has more room)
- Max-height: 200px with overflow scroll
- Shadow-md, 8px radius
- Click elsewhere to dismiss
- "X more tags" link to show all (expand the list)

---

## State Machine

### State 1: Empty (initial)

Full-area drop zone (no cards, no grid):

```
┌─────────────────────────────────────────────────────────┐
│ ● ● ●                    ExifCleaner         ⚙   ☀/☽  │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┐   │
│  │                                                  │   │
│  │                 [images icon]                     │   │
│  │         Drop files here to                       │   │
│  │           remove metadata                        │   │
│  │             [Add files]                          │   │
│  │                                                  │   │
│  └─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┘   │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### State 2: Drag Over

- Border: 2px dashed gold
- Background: gold at 5% opacity
- Text: "Release to clean" in gold, weight 600
- Transition: 150ms

### State 3: Processing

Cards appear in the grid, staggered entrance (scale 0.9→1.0 + opacity 0→1, 200ms each, 80ms stagger):

```
┌─────────────────────────────────────────────────────────┐
│ ● ● ●                    ExifCleaner         ⚙   ☀/☽  │
├─────────────────────────────────────────────────────────┤
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐    │
│  │ ⟳ vacation   │ │ ⟳ selfie    │ │ ● portrait   │    │
│  │ _photo.jpg   │ │ _park.heic  │ │ .png         │    │
│  │ .jpg         │ │ .heic       │ │ .png         │    │
│  │ 23 → ...     │ │ 45 → ...    │ │ — → —        │    │
│  └──────────────┘ └──────────────┘ └──────────────┘    │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐    │
│  │ ● corrupt    │ │ ● scan      │ │ ● IMG_2847   │    │
│  │ _file.pdf    │ │ _receipt    │ │ .mov         │    │
│  │ .pdf         │ │ .pdf        │ │ .mov         │    │
│  │ — → —        │ │ — → —       │ │ — → —        │    │
│  └──────────────┘ └──────────────┘ └──────────────┘    │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### State 4: Complete

Cards show final states. "Clear (⌘K)" appears bottom-right:

```
┌─────────────────────────────────────────────────────────┐
│ ● ● ●                    ExifCleaner         ⚙   ☀/☽  │
├─────────────────────────────────────────────────────────┤
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐    │
│  │ ✓ vacation   │ │ ✓ selfie    │ │ ✓ portrait   │    │
│  │ _photo.jpg   │ │ _park.heic  │ │ .png         │    │
│  │ .jpg         │ │ .heic       │ │ .png         │    │
│  │ 23 → 0       │ │ 45 → 0      │ │ 8 → 0        │    │
│  └──────────────┘ └──────────────┘ └──────────────┘    │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐    │
│  │ ✗ corrupt    │ │ ✓ scan      │ │ ✓ IMG_2847   │    │
│  │ _file.pdf    │ │ _receipt    │ │ .mov         │    │
│  │ .pdf         │ │ .pdf        │ │ .mov         │    │
│  │ Can't read   │ │ 12 → 0      │ │ 67 → 0       │    │
│  └──────────────┘ └──────────────┘ └──────────────┘    │
│                                          Clear (⌘K)     │
└─────────────────────────────────────────────────────────┘
```

---

## Simulated Interaction Flow

1. **State 1**: Drop zone visible. Click "Add files".
2. **Brief drag-over** (400ms) → cards start appearing in grid (staggered scale-in).
3. **Processing**: Cards animate through states sequentially. Gold border pulses on active card.
4. **Completion**: Checkmark pops into each card. Error card turns red.
5. **Click a completed card**: Metadata detail overlay appears.
6. **Click "Clear"**: Cards scale out (reverse of entrance), return to State 1.

### Timing

```
t=0s      Cards start appearing (staggered, 80ms apart, scale-in animation)
t=0.5s    First file starts processing (gold border on first card)
t=1.5s    vacation_photo.jpg → ✓ (green border, checkmark pop)
t=2.0s    selfie_park.heic → ✓
t=2.5s    portrait.png → ✓
t=3.0s    corrupt_file.pdf → ✗ (red border, error state)
t=3.5s    scan_receipt.pdf → ✓
t=4.0s    IMG_2847.mov → ✓
t=4.5s    "Clear (⌘K)" appears
```

---

## File Extension Badge

Each card shows a small badge for the file extension:

```
┌───────┐
│ .jpg  │  ← 10px font, uppercase, pill shape, muted bg
└───────┘
```

- Pill shape: 2px vertical padding, 6px horizontal padding, fully rounded (9999px radius)
- Background: neutral 200 (light) / neutral 300 (dark)
- Text: muted color, 10px, uppercase, weight 600
- Positioned below the filename in the card

---

## Fake Data

| Filename | Extension | Before Tags | After Tags | Status | Delay |
|----------|-----------|------------|------------|--------|-------|
| vacation_photo.jpg | .jpg | 23 | 0 | success | 1.5s |
| selfie_park.heic | .heic | 45 | 0 | success | 2.0s |
| portrait.png | .png | 8 | 0 | success | 2.5s |
| corrupt_file.pdf | .pdf | — | Can't read file | error | 3.0s |
| scan_receipt.pdf | .pdf | 12 | 0 | success | 3.5s |
| IMG_2847.mov | .mov | 67 | 0 | success | 4.0s |

### Card Click Detail Data (for vacation_photo.jpg)

```
Tags removed (23):
  GPS Latitude        37.7749° N
  GPS Longitude       -122.4194° W
  Camera Make         Canon
  Camera Model        EOS R5
  Lens                RF 24-70mm
  Focal Length        35mm
  ISO                 400
  Shutter Speed       1/250
  Aperture            f/2.8
  Date/Time Original  2025-08-14 16:32:10
  Software            Adobe Lightroom
  ... 12 more
```

---

## What NOT to Include

- No table layout (this variant uses cards exclusively)
- No bottom bar (settings are in the slide-in panel)
- No sidebar or left navigation
- No multi-page routing
- No user accounts
- No thumbnail previews (no actual image data)
- No drag reordering
- No column sorting
- No search
- No file size display

---

## Quality Bar

This variant should feel like a **modern utility app** — think Apple's Files app or a clean photo manager. The cards should be:

- Compact but readable — no wasted space inside cards
- Visually distinct per state — you should instantly see which are done (green), processing (gold), failed (red), pending (gray)
- The grid should reflow naturally if the settings panel is open (fewer columns)
- Card hover lift effect should feel physical — like picking up a card slightly
- The scale-in entrance animation should feel playful but fast (80ms stagger keeps it snappy)
- The settings panel slide should feel like a native macOS inspector panel
- In dark mode, cards should have subtle borders — they float slightly above the dark background

**Build this prototype now.** Generate one React component with the card grid layout, slide-in settings panel, card click details, and all state transitions.
