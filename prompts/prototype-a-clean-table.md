# Prompt A: "Clean Table" — ExifCleaner UI Prototype

> Copy-paste this entire file into Claude (artifacts) or v0 to generate an interactive mockup.

---

## System Context

You are a senior UI designer building an interactive React prototype of **ExifCleaner**, a cross-platform Electron desktop app that strips EXIF/metadata from images, videos, and PDFs.

**Your job**: Build a single React component (with Tailwind CSS) that simulates the complete app experience. The prototype must be interactive — buttons work, states change, animations play. It runs in a browser but **looks and feels like a native macOS desktop app**.

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

Brand burgundy:    #521737  (focus rings, accents, links)
Brand gold:        #F8D057  (progress, active states, drag-over)
Brand orange:      #E97043  (hover accents)

Success:           #2D8659  (completion checkmark)
Success bg:        #E8F5EE  (subtle row flash on complete)
Error:             #C44536  (failed processing)
Error bg:          #FCEAE8  (subtle error row tint)
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
Font mono:      ui-monospace, "SF Mono", Menlo, Consolas, monospace

Base size:      16px (body text)
Small:          14px (captions, secondary info)
Micro:          12px (timestamps, counters)
H4/labels:      16px, weight 600
H3/titles:      20px, weight 500
H2:             24px, weight 500

Line height:    1.5 (body), 1.25 (headings)
```

### Spacing

```
4px   — tight gaps (icon-to-text)
8px   — default gap, table cell horizontal padding
12px  — table cell vertical padding, compact padding
16px  — standard padding (cards, buttons)
24px  — section gaps
32px  — large gaps
```

### Borders & Shadows

```
Border radius:  2px (small), 4px (medium), 8px (large/cards)
Border width:   1px default

Shadow sm:      0 1px 3px rgba(0,0,0,0.08)
Shadow md:      0 4px 16px rgba(0,0,0,0.12)
Shadow lg:      0 8px 32px rgba(0,0,0,0.16)

Dark shadow md: 0 4px 16px rgba(0,0,0,0.4)
```

### Motion

```
Micro:   100ms ease-out     (hover, focus rings)
Fast:    200ms ease-out     (row entrance, popover)
Medium:  300ms ease-in-out  (completion checkmark, progress)
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
- **Content area**: Below title bar, full width, background color

```
┌─────────────────────────────────────────────────────────┐
│ ● ● ●                    ExifCleaner                    │  ← 38px title bar
├─────────────────────────────────────────────────────────┤
│                                                         │
│                     Content area                        │  ← 580 x ~362px
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**Total viewport**: 580px wide × 400px tall (including title bar).

### Dark Mode Toggle

Add a small sun/moon icon button in the top-right of the title bar (before the edge). Clicking it toggles between light and dark mode. This is for prototype convenience — the real app uses OS preference.

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
│            or use File > Open                    │  ← muted text, 14px
│                                                  │
└─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┘
```

- Dashed border: 2px dashed, secondary text color, 8px border-radius
- Content: vertically and horizontally centered
- Icon: Use a simple SVG (two overlapping rectangles representing images)
- **"Add files" button**: Small text button below "or use File > Open" — clicking it triggers the simulated file drop (since we can't do real drag-and-drop in a web prototype). Style: muted text, underline on hover.

### State 2: Drag Over

When the user simulates dragging (or for visual demo purposes, show this briefly before files appear):

- Border changes to: 2px dashed gold (`#F8D057`)
- Background tints to gold at 5% opacity
- Text changes to "Release to clean" in gold, weight 600
- Icon color changes to gold
- Transition: 150ms ease-out

### State 3: Processing

The table appears. Files are being processed. Mix of states visible.

```
  Filename              Before        After
  ─────────────────────────────────────────────
  ⟳ vacation_photo.jpg    23           ...
  ⟳ selfie_park.heic      45           ...
  ● portrait.png           —            —
  ● scan_receipt.pdf        —            —
```

- Table headers: weight 600, uppercase not needed, secondary text color
- File rows animate in one by one (200ms each, staggered by 100ms)
- Row entrance: opacity 0→1 + translateY(4px)→0
- Processing spinner: small gold CSS spinner (12px) left of filename
- "..." in After column during processing: pulsing opacity animation
- Pending files (●): gray dot, waiting to process

### State 4: Complete

All files have been processed. Mix of success and error states.

```
  Filename              Before        After
  ─────────────────────────────────────────────
  ✓ vacation_photo.jpg    23            0
  ✓ selfie_park.heic      45            0
  ✓ portrait.png           8            0
  ✗ corrupt_file.pdf       —        Can't read
  ✓ scan_receipt.pdf       12            0
  ✓ IMG_2847.mov           67            0

                                  Clear (⌘K)
```

- Checkmark: green `#2D8659`, pops in with spring animation
- Error row: red X icon, "Can't read" in error color, subtle error bg tint
- Completion flash: row briefly flashes success bg (200ms) when completing
- "Clear (⌘K)" button: appears bottom-right when all done. Muted text. Clicking resets to State 1.

---

## Simulated Interaction Flow

Since this is a web prototype, simulate the drag-and-drop flow with buttons:

1. **State 1 (Empty)**: User sees drop zone. "Add files" button at bottom.
2. **Click "Add files"**: Brief flash of State 2 (drag-over, 400ms), then transition to State 3.
3. **State 3 (Processing)**: Files appear one by one (staggered entrance). Each file processes with a 1-2 second delay (simulated). As each completes, spinner → checkmark with spring animation. One file (corrupt_file.pdf) fails after a delay.
4. **State 4 (Complete)**: All done. Clear button visible.
5. **Click "Clear"**: Instant return to State 1.

### Timing for Simulation

```
t=0s      Files start appearing (staggered, 100ms apart)
t=0.5s    First file starts processing (spinner)
t=1.5s    vacation_photo.jpg completes → checkmark
t=2.0s    selfie_park.heic completes → checkmark
t=2.5s    portrait.png completes → checkmark
t=3.0s    corrupt_file.pdf fails → red X + error message
t=3.5s    scan_receipt.pdf completes → checkmark
t=4.0s    IMG_2847.mov completes → checkmark
t=4.5s    "Clear (⌘K)" button fades in
```

---

## Settings Modal

Add a gear icon (⚙) in the title bar, left of the dark mode toggle. Clicking it opens a centered modal overlay.

### Modal Design

- **Backdrop**: Background color at 30% opacity (dark overlay)
- **Card**: 320px wide, white surface, 8px border-radius, shadow-md
- **Header**: "Settings" in heading text, 20px weight 500
- **Content**: Three checkboxes with labels
- **Footer**: "Done" button (gold background, dark text, 4px radius, 600 weight)
- **Close**: Clicking backdrop, pressing Escape, or clicking Done all close the modal

### Checkboxes

```
☑ Preserve image orientation         (default: checked)
☐ Keep original files                (default: unchecked)
    Saves cleaned copies as filename_cleaned.ext
☑ Preserve file timestamps           (default: checked)
```

- Checkbox accent color: burgundy (`#521737` light, `#C4467A` dark)
- Sub-label under "Keep original files": muted text, 14px, explains the behavior
- Checkboxes should be functional (toggle on/off) — state persists until page reload

---

## Fake Data

Use these exact filenames and values:

| Filename | Before Tags | After Tags | Status | Delay |
|----------|------------|------------|--------|-------|
| vacation_photo.jpg | 23 | 0 | success | 1.5s |
| selfie_park.heic | 45 | 0 | success | 2.0s |
| portrait.png | 8 | 0 | success | 2.5s |
| corrupt_file.pdf | — | Can't read file | error | 3.0s |
| scan_receipt.pdf | 12 | 0 | success | 3.5s |
| IMG_2847.mov | 67 | 0 | success | 4.0s |

---

## What NOT to Include

- No sidebar or navigation bar
- No multi-page routing or tabs
- No user accounts, login, or auth
- No notifications or toasts
- No file type icons (all files use the same row treatment)
- No thumbnail previews
- No drag reordering of table rows
- No column sorting or filtering
- No search input
- No scroll bars (content fits in viewport for this prototype)
- No right-click context menus
- No "About" dialog
- No update notifications
- No loading skeleton screens
- No empty state illustration (just the simple SVG icon described)

---

## Quality Bar

The prototype should feel like a **real macOS app**, not a web page. Specifically:

- Window chrome must look native (not a browser window)
- Traffic lights must be pixel-perfect circles with correct colors
- Text rendering should use the system font stack (San Francisco on macOS)
- Table should feel like a native NSTableView — clean borders, precise alignment
- Animations should be subtle and fast — if you notice them, they're too slow
- Dark mode should feel intentionally designed, not "inverted light mode"
- The checkmark pop animation should feel satisfying — slight overshoot, then settle
- Hover states on table rows should be instantaneous (no transition delay on hover-in)
- The gold drag-over state should feel welcoming, not alarming
- Spacing should be tight and efficient — this is a utility app, not a marketing page

**Build this prototype now.** Generate one React component with all states, transitions, and interactions described above.
