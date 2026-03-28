# Prompt D: "Focused Flow" — ExifCleaner UI Prototype

> Copy-paste this entire file into Claude (artifacts) or v0 to generate an interactive mockup.

---

## System Context

You are a senior UI designer building an interactive React prototype of **ExifCleaner**, a cross-platform Electron desktop app that strips EXIF/metadata from images, videos, and PDFs.

**Design variant**: Ultra-minimal. **No table, no grid.** The app shows **one file at a time** with a large, focused display of its processing status. Completed files become dots in a progress row. Think of it like a slideshow of file processing — or a focused card view where each file gets its moment.

**Tradeoff explored**: Beautiful and dramatic for 1-5 files. Clean progress visualization. But potentially unclear for 50+ files — the dots row would get very long. This variant prioritizes **emotional satisfaction** and **clarity of what's happening** over data density.

**Output**: One self-contained React component (with Tailwind CSS). No external dependencies beyond React and Tailwind. Everything in one artifact.

---

## Visual Design System

### Colors

**Light Mode:**
```
Background:        #F5F6F8
Card surface:      #FFFFFF
Borders:           #DADEE4
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
```

**Dark Mode:**
```
Background:        #141416
Card surface:      #1C1C1F
Borders:           #48484D
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
Body:           16px
Small:          14px
Micro:          12px
Large display:  32px, weight 500 (file tag count, big number)
Filename:       20px, weight 500
Counter:        14px, weight 600 (e.g., "3 of 6")
```

### Motion (Critical for this variant)

This variant relies heavily on smooth transitions:
```
Slide transition:   400ms ease-in-out (file card sliding left/right)
Number morph:       300ms ease-out (tag count animating from high to 0)
Dot fill:           200ms ease-out (progress dot filling in)
Checkmark pop:      300ms cubic-bezier(0.34, 1.56, 0.64, 1.0) (spring)
Card entrance:      300ms ease-out (scale 0.95→1.0 + opacity)
```

---

## App Layout

### Window Structure

```
┌─────────────────────────────────────────────────────────┐
│ ● ● ●                    ExifCleaner         ⚙   ☀/☽  │  ← 38px title bar
├─────────────────────────────────────────────────────────┤
│                                                         │
│                                                         │
│                   [Focused File Card]                   │  ← center stage
│                                                         │
│                                                         │
│                   ● ● ● ○ ○ ○                           │  ← progress dots
│                                                         │
│                   3 of 6 files                          │  ← counter text
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**Total viewport**: 580px wide × 400px tall.

The layout is radically simple:
1. **Title bar** (38px) — same as other variants
2. **Center stage** (~260px) — one file card, centered, large
3. **Progress dots** (~40px) — horizontal row of dots representing all files
4. **Counter text** (~24px) — "3 of 6 files" or "All clean"

---

## Center Stage: Focused File Card

The focused card is the hero element. It shows one file at a time, centered in the window.

### Card Layout

```
┌───────────────────────────────────────────────┐
│                                               │
│              vacation_photo.jpg                │  ← filename (20px, 500)
│              .jpg                              │  ← extension badge (micro, pill)
│                                               │
│         ┌─────────┐    ┌─────────┐            │
│         │ BEFORE  │    │  AFTER  │            │
│         │         │    │         │            │
│         │   23    │    │    0    │            │  ← large numbers (32px, 500)
│         │  tags   │    │  tags   │            │     "tags" label (micro, muted)
│         └─────────┘    └─────────┘            │
│                                               │
│              ✓ Metadata removed                │  ← status line (14px)
│                                               │
└───────────────────────────────────────────────┘
```

- Card width: 400px (centered), 8px radius, shadow-md
- Card padding: 32px
- Filename: centered, heading text color
- Extension badge: small pill below filename (same as Prompt C)
- Before/After: two columns, large numbers, with "tags" label below each
- Status line: centered below the columns, with status icon

### Card States

**Processing**:
- Before number: displayed (e.g., "23")
- After number: gold spinner + "..." pulsing text
- Status line: "Cleaning..." in gold, with small spinner
- Card border: 2px solid gold
- Background: card surface with subtle gold glow

**Complete (success)**:
- Before number: displayed (e.g., "23")
- After number: "0" — animates in with a satisfying count-down effect or just pops
- Status line: "✓ Metadata removed" in success green
- Card border: 2px solid success green (transition from gold, 300ms)
- Checkmark pops with spring animation

**Complete (error)**:
- Before number: "—"
- After number: "—"
- Status line: "✗ Can't read file" in error red
- Card border: 2px solid error red

**Card transition between files**:
When the current file completes and the next one starts:
1. Current card slides left and fades out (300ms)
2. Brief 100ms pause
3. New card slides in from right and fades in (300ms)
4. This creates a "slideshow" feeling

---

## Progress Dots

A horizontal row of dots below the card, one per file:

```
  ● ● ● ◐ ○ ○
  ^       ^
  done    processing
```

| Dot State | Visual |
|-----------|--------|
| **Pending** | Hollow circle, border color (#DADEE4 / #48484D) |
| **Processing** | Half-filled circle, gold fill animation |
| **Complete (success)** | Filled circle, success green (#2D8659) |
| **Complete (error)** | Filled circle, error red (#C44536) |

- Dot size: 10px diameter
- Gap between dots: 8px
- The processing dot has a subtle pulsing animation (opacity 0.6→1.0)
- When a dot fills (processing → complete), it fills with a quick radial wipe (200ms)
- Clicking a completed dot could optionally jump back to that file's card (nice-to-have)

---

## State Machine

### State 1: Empty (initial)

Centered drop zone, same style as other variants but even more minimal (no dashed border — just centered text and icon):

```
┌─────────────────────────────────────────────────────────┐
│ ● ● ●                    ExifCleaner         ⚙   ☀/☽  │
├─────────────────────────────────────────────────────────┤
│                                                         │
│                                                         │
│                     [images icon]                        │
│                                                         │
│              Drop files here to                         │
│                remove metadata                          │
│                                                         │
│                   [Add files]                           │
│                                                         │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

- No dashed border (the whole window is the drop zone)
- Centered vertically in the full content area
- Clean, breathing room, calm

### State 2: Drag Over

- Entire content area: gold at 5% opacity background
- Text changes to "Release to clean" in gold, weight 600
- Icon turns gold
- Transition: 150ms

### State 3: Processing

The focused file card appears (entrance: scale 0.95→1.0 + opacity 0→1, 300ms). Progress dots appear below. Counter text shows "1 of 6 files".

The app shows the currently processing file:
1. First file card slides in from right
2. Processing state (gold border, spinner)
3. File completes → card shows success state briefly (800ms hold)
4. Card slides left, next file slides in from right
5. Progress dots fill one by one
6. Counter updates: "2 of 6 files", "3 of 6 files"...

### State 4: Complete (All Done)

The last file's completion card slides away. Replaced by a **summary card**:

```
┌───────────────────────────────────────────────┐
│                                               │
│                     ✓                         │  ← large checkmark (48px, green, spring pop)
│                                               │
│                All files clean                │  ← heading (20px, 500)
│                                               │
│            5 cleaned  ·  1 error              │  ← stats (14px, green + red)
│          155 metadata tags removed            │  ← total (14px, muted)
│                                               │
│                                               │
│                 [Clean more]                  │  ← text button → State 1
│                                               │
└───────────────────────────────────────────────┘

               ● ● ● ● ● ●                       ← all dots filled (green + red)
                 All done
```

- Summary card replaces the file card (same position, same size)
- Large checkmark icon: 48px, success green, pops in with spring
- Stats in green and red (5 success, 1 error)
- Total tags removed: sum of all Before values that succeeded = 23+45+8+12+67 = 155
- "Clean more" button resets to State 1
- Progress dots: all filled, counter says "All done"

---

## Settings Modal

Same settings as Prompt A — gear icon opens a centered modal overlay:

- 320px wide card, shadow-md
- "Settings" heading
- Three checkboxes:
  - ☑ Preserve image orientation (default ON)
  - ☐ Keep original files (default OFF, sub-label: "Saves cleaned copies as filename_cleaned.ext")
  - ☑ Preserve file timestamps (default ON)
- "Done" button (gold bg) or Escape to close

---

## Simulated Interaction Flow

1. **State 1**: Calm empty state. Click "Add files".
2. **Drag-over flash** (400ms) → first file card slides in from right.
3. **File 1** processes (1s) → completes with checkmark → holds 800ms → slides left.
4. **File 2** slides in → processes → completes → slides left.
5. Continue for all 6 files. File 4 (corrupt) shows error state.
6. **Summary card** appears after last file slides away.
7. Click "Clean more" → return to State 1.

### Timing

```
t=0.0s    First file card enters (slide in from right)
t=0.5s    vacation_photo.jpg: processing...
t=1.5s    vacation_photo.jpg: ✓ complete → hold 800ms
t=2.3s    Slide left. selfie_park.heic slides in.
t=2.8s    selfie_park.heic: processing...
t=3.8s    selfie_park.heic: ✓ → hold → slide
t=4.6s    portrait.png slides in → process → ✓ → slide
t=5.4s    corrupt_file.pdf slides in → process → ✗ error → hold → slide
t=6.2s    scan_receipt.pdf slides in → process → ✓ → slide
t=7.0s    IMG_2847.mov slides in → process → ✓ → hold
t=7.8s    Slide away. Summary card appears.
```

**Total sequence**: ~8 seconds. Adjust timings to feel good — the key is that each file gets its "moment" and the dots fill up progressively.

---

## Fake Data

| Filename | Before Tags | After Tags | Status | Processing Time |
|----------|------------|------------|--------|-----------------|
| vacation_photo.jpg | 23 | 0 | success | 1.0s |
| selfie_park.heic | 45 | 0 | success | 1.0s |
| portrait.png | 8 | 0 | success | 0.8s |
| corrupt_file.pdf | — | — | error | 0.8s |
| scan_receipt.pdf | 12 | 0 | success | 0.8s |
| IMG_2847.mov | 67 | 0 | success | 0.8s |

**Summary stats**: 5 cleaned, 1 error, 155 tags removed.

---

## What NOT to Include

- No table or list view (this variant is focused-card only)
- No grid layout
- No sidebar
- No bottom bar
- No multi-page routing
- No user accounts
- No thumbnail previews
- No drag reordering
- No file size display
- No metadata detail (the card IS the detail — before/after numbers are prominent)

---

## Quality Bar

This is the **most emotionally engaging** variant. It should feel like each file gets a moment of attention — like a trusted assistant carefully handling each item. The key moments:

- **Card slide transition**: Must feel smooth and purposeful. Not janky or choppy. The slide left → pause → slide in from right rhythm should feel like turning pages.
- **Progress dots filling**: Should feel satisfying — like completing a checklist. Each dot filling = a tiny dopamine hit.
- **Large numbers**: The before/after tag counts should be visually prominent. The "23 → 0" transformation should feel like watching dirt being cleaned away.
- **Summary card**: The big checkmark and "All files clean" should feel like a quiet celebration. Not confetti — just a confident checkmark and clear stats.
- **Error handling**: When corrupt_file.pdf fails, the card should turn red and the error dot should stand out in the progress row. It should be clear but not alarming.

**Dark mode** should feel especially dramatic — the gold processing border glows against the dark surface, and the green completion dots are luminous.

The limitation is obvious: for 100 files, this is too slow. But for the common case of 1-10 files, this is the most satisfying experience.

**Build this prototype now.** Generate one React component with the focused file card, slide transitions, progress dots, summary card, and all animations.
