# Prompt B: "Bottom Bar" — ExifCleaner UI Prototype

> Copy-paste this entire file into Claude (artifacts) or v0 to generate an interactive mockup.

---

## System Context

You are a senior UI designer building an interactive React prototype of **ExifCleaner**, a cross-platform Electron desktop app that strips EXIF/metadata from images, videos, and PDFs.

**Design variant**: In this version, **settings and actions live in a persistent bottom bar** instead of a modal. The bottom bar is always visible when files are present, showing toggles, file count, and the clear action. Nothing is hidden behind a gear icon.

**Tradeoff explored**: More visual weight at the bottom of the window, but **zero hidden state** — every option is always visible and accessible.

**Output**: One self-contained React component (with Tailwind CSS). No external dependencies beyond React and Tailwind. Everything in one artifact.

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
Bottom bar bg:     #FFFFFF  (white surface, separated by border-top)

Brand burgundy:    #521737
Brand gold:        #F8D057
Brand orange:      #E97043

Success:           #2D8659
Success bg:        #E8F5EE
Error:             #C44536
Error bg:          #FCEAE8
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
Bottom bar bg:     #1C1C1F  (surface color, separated by border-top)

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
Base size:      16px (body)
Small:          14px (captions, bottom bar labels)
Micro:          12px (counters, toggle labels)
Labels:         14px, weight 600
Headings:       20px, weight 500
Line height:    1.5 (body), 1.25 (headings)
```

### Spacing, Borders, Motion

Same as standard design system:
```
Spacing:        4px / 8px / 12px / 16px / 24px / 32px
Border radius:  2px / 4px / 8px
Shadow md:      0 4px 16px rgba(0,0,0,0.12)
Motion:         100ms (hover), 200ms (transitions), 300ms (completion), spring easing for checkmark
```

---

## App Layout

### Window Chrome (macOS simulation)

```
┌─────────────────────────────────────────────────────────┐
│ ● ● ●                    ExifCleaner              ☀/☽  │  ← 38px title bar
├─────────────────────────────────────────────────────────┤
│                                                         │
│                     Content area                        │  ← flexible height
│                                                         │
├─────────────────────────────────────────────────────────┤
│  [toggles]              3 of 6 cleaned        [Clear]   │  ← 48px bottom bar
└─────────────────────────────────────────────────────────┘
```

**Total viewport**: 580px wide × 400px tall.

- **Title bar**: 38px, traffic lights (red #FF5F57, yellow #FFBD2E, green #27C93F), centered "ExifCleaner", sun/moon toggle at right
- **Content area**: Flexible, holds either empty state or file table
- **Bottom bar**: 48px tall, white/surface bg, separated by 1px top border. Only visible when files are present OR always visible (see design choice below).

### Bottom Bar Design

The bottom bar is the **key differentiator** of this variant. It contains:

**Left section** — Settings toggles (compact inline switches):
```
[⟳ Orientation] [📄 Keep originals] [🕐 Timestamps]
```

Each toggle is a small pill-shaped switch with a label:
- Toggle on: burgundy background (`#521737` / `#C4467A` dark)
- Toggle off: muted background (`#DADEE4` / `#48484D` dark)
- Labels: 12px, muted text, positioned to the right of the toggle
- Toggles are 32px wide × 18px tall (standard iOS-style switch)
- Spacing between toggles: 16px

**Center section** — Status text:
- Processing: "Cleaning 3 of 6..." in secondary text
- Complete: "6 files cleaned" in success color
- Mixed: "5 cleaned, 1 error" with success + error colors

**Right section** — Clear button:
- Text: "Clear" in muted text
- Visible only when files are present
- Hover: text turns body color

**Bottom bar visibility rules**:
- State 1 (empty): Bottom bar is HIDDEN. Full space for drop zone.
- States 2-4 (files present): Bottom bar is VISIBLE.
- Transition: bar slides up from bottom (200ms ease-out) when files first appear.

---

## State Machine

### State 1: Empty (initial)

Same drop zone as standard design, but uses the FULL window height (no bottom bar):

```
┌─────────────────────────────────────────────────────────┐
│ ● ● ●                    ExifCleaner              ☀/☽  │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┐   │
│  │                                                  │   │
│  │                 [images icon]                     │   │
│  │                                                  │   │
│  │         Drop files here to                       │   │
│  │           remove metadata                        │   │
│  │                                                  │   │
│  │           [Add files]                            │   │
│  │                                                  │   │
│  └─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┘   │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

- Dashed border: 2px dashed, secondary text color, 8px radius
- Centered vertically and horizontally in full content area
- "Add files" button: text-style button, muted color, triggers simulation

### State 2: Drag Over

- Border: 2px dashed gold
- Background: gold at 5% opacity
- Text: "Release to clean" in gold, weight 600
- Transition: 150ms ease-out

### State 3: Processing

Table + bottom bar visible:

```
┌─────────────────────────────────────────────────────────┐
│ ● ● ●                    ExifCleaner              ☀/☽  │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Filename              Before        After              │
│  ──────────────────────────────────────────────────     │
│  ⟳ vacation_photo.jpg    23           ...               │
│  ⟳ selfie_park.heic      45           ...               │
│  ● portrait.png           —            —                │
│  ● corrupt_file.pdf       —            —                │
│  ● scan_receipt.pdf        —            —               │
│  ● IMG_2847.mov            —            —               │
│                                                         │
├─────────────────────────────────────────────────────────┤
│ [⟳ On] [📄 Off] [🕐 On]    Cleaning 1 of 6...  Clear  │
└─────────────────────────────────────────────────────────┘
```

- Bottom bar slides up (200ms) when first file appears
- Status text updates in real-time: "Cleaning 2 of 6...", "Cleaning 3 of 6..."
- Toggle switches are interactive even during processing

### State 4: Complete

```
┌─────────────────────────────────────────────────────────┐
│ ● ● ●                    ExifCleaner              ☀/☽  │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Filename              Before        After              │
│  ──────────────────────────────────────────────────     │
│  ✓ vacation_photo.jpg    23            0                │
│  ✓ selfie_park.heic      45            0                │
│  ✓ portrait.png           8            0                │
│  ✗ corrupt_file.pdf       —        Can't read           │
│  ✓ scan_receipt.pdf       12            0               │
│  ✓ IMG_2847.mov           67            0               │
│                                                         │
├─────────────────────────────────────────────────────────┤
│ [⟳ On] [📄 Off] [🕐 On]   5 cleaned, 1 error   Clear  │
└─────────────────────────────────────────────────────────┘
```

- Status text: "5 cleaned, 1 error" — "5 cleaned" in success green, "1 error" in error red
- Click "Clear" → bottom bar slides down (200ms), table fades out, return to State 1

---

## Simulated Interaction Flow

1. **State 1 (Empty)**: User sees full-height drop zone. Click "Add files".
2. **Brief drag-over flash** (400ms) → State 3.
3. **Bottom bar slides up**. Files appear staggered (100ms apart). Processing begins.
4. **Each file completes** with checkmark pop. Bottom bar status updates live.
5. **State 4 (Complete)**: All done. "5 cleaned, 1 error" in bottom bar.
6. **Click "Clear"**: Bottom bar slides down, return to State 1.

### Timing

```
t=0s      Bottom bar slides up. Files start appearing.
t=0.5s    First file starts processing
t=1.5s    vacation_photo.jpg → ✓
t=2.0s    selfie_park.heic → ✓
t=2.5s    portrait.png → ✓
t=3.0s    corrupt_file.pdf → ✗ "Can't read file"
t=3.5s    scan_receipt.pdf → ✓
t=4.0s    IMG_2847.mov → ✓
t=4.5s    Status: "5 cleaned, 1 error"
```

---

## Toggle Switches (Bottom Bar)

Design compact pill-shaped toggle switches:

```
┌──────────────────┐   ┌──────────────────┐   ┌──────────────────┐
│ [●──] Orientation│   │ [──●] Originals  │   │ [●──] Timestamps │
└──────────────────┘   └──────────────────┘   └──────────────────┘
  ON (burgundy bg)       OFF (muted bg)         ON (burgundy bg)
```

- Switch track: 32px × 18px, 9px border-radius (fully rounded)
- Switch thumb: 14px circle, white, 2px inset
- ON state: Track = burgundy, thumb slides right
- OFF state: Track = muted (#DADEE4 light / #48484D dark), thumb slides left
- Label: 12px, muted text, 4px gap after switch
- Transition: thumb slides 200ms ease-out, track color fades 100ms

Toggle states:
- **Orientation**: Default ON (preserves image rotation)
- **Originals**: Default OFF (overwrites files)
- **Timestamps**: Default ON (preserves file dates)

Clicking a toggle should visually toggle it. State persists until page reload.

---

## Fake Data

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

- No modal settings dialog (settings are in the bottom bar)
- No gear icon in title bar (not needed — settings are visible)
- No sidebar or navigation
- No multi-page routing or tabs
- No user accounts or login
- No notifications or toasts (status is always visible in bottom bar)
- No file type icons
- No thumbnail previews
- No drag reordering
- No column sorting or filtering
- No search input
- No right-click context menus

---

## Quality Bar

This variant's **key selling point** is that everything is always visible. The user never wonders "where are the settings?" or "how many files are left?" — it's right there in the bottom bar.

The challenge is keeping the bottom bar compact enough that it doesn't feel heavy. Specifically:

- Bottom bar should feel like a macOS status bar / toolbar — light, unobtrusive
- Toggle switches must be small and clean (not chunky material-design toggles)
- Status text should be understated — it's information, not a headline
- The transition between no-bottom-bar (empty state) and with-bottom-bar should feel smooth
- Toggle labels should be the minimum text needed: "Orientation", "Originals", "Timestamps"
- In dark mode, the bottom bar should barely separate from the content area — just a subtle border

**Build this prototype now.** Generate one React component with all states, transitions, toggle switches, and the persistent bottom bar.
