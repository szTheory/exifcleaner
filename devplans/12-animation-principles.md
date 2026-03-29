# Animation Principles Reference

Source: Emil Kowalski's UI animation articles (emilkowal.ski/ui)
Compiled for ExifCleaner v4.0 design system.

---

## Core Philosophy

> "The goal is not to animate for animation's sake, it's to build great user interfaces."

Animation serves UX, not ego. Before adding any animation, ask: **"What purpose does this serve?"** If the answer is unclear, don't animate.

## Universal Rules

### 1. Easing is Everything

Easing is the most important property of any animation. It can make a bad animation feel great and a great animation feel bad.

- **`ease-out` is the default** for elements entering/appearing (starts fast, decelerates — feels responsive)
- **`ease-in-out`** for moving existing on-screen elements (mimics natural acceleration/deceleration)
- **Never use `ease-in`** for UI — starts slow, feels sluggish
- **Built-in CSS easings are too weak** — always use custom `cubic-bezier()` curves for more energetic motion
- Resource: [easings.co](https://easings.co), [easing.dev](https://easing.dev)

### 2. Speed Budget

- **UI animations must stay under 300ms** — faster = more responsive feeling
- Exception: drawer/sheet transitions at ~500ms (matches iOS native feel)
- 180ms is the sweet spot for dropdowns, selects, tooltips
- Faster spinners make apps *feel* like they load faster (perceived performance)

### 3. Frequency Determines Animation

How often users see an animation determines whether it should exist at all.

| Frequency | Decision | Example |
|-----------|----------|---------|
| Hundreds/day | **No animation** | Keyboard navigation, Raycast-style launchers |
| Dozens/day | **Minimal/fast** | Hover effects, tooltips |
| Few times/session | **Animate** | File drop entrance, drawer open |
| Once/rarely | **Delight ok** | First-run, success celebration |

**Absolute rule: Never animate keyboard-initiated actions.** They may repeat hundreds of times daily — animation makes them feel slow and disconnected.

### 4. Performance: Transform + Opacity Only

Only animate `transform` and `opacity`. These trigger only the composite step in the rendering pipeline.

**Never animate:** `padding`, `margin`, `width`, `height`, `top`, `left` — these trigger layout recalculation, paint, AND composite. Expensive.

CSS/WAAPI animations are hardware-accelerated and stay smooth even when the main thread is busy. `requestAnimationFrame` is NOT hardware-accelerated.

### 5. Accessibility: prefers-reduced-motion

Always wrap animations in `@media (prefers-reduced-motion: no-preference)`.

For reduced-motion users, prefer:
- Instant opacity changes (fade, not slide)
- No transform animations
- Immediate state changes

```css
.element {
  animation: bounce 0.2s;
}

@media (prefers-reduced-motion: reduce) {
  .element {
    animation: fade 0.2s;
  }
}
```

### 6. Animations Must Be Interruptible

Users should be able to change state mid-animation. A closing drawer that can't be reopened until the close animation finishes feels broken. CSS transitions are naturally interruptible.

---

## Specific Patterns

### Scale

- **Button press:** `scale(0.97)` on `:active` — makes interface feel alive and responsive
- **Never animate from `scale(0)`** — feels unnatural, like the element appears from nowhere
- Start from `scale(0.5)` or higher, combined with opacity fade
- Remember: scale affects children (fonts, icons, content shrink proportionally)

### Transform Origin

- Default `transform-origin` is `center` — wrong for most UI animations
- Popovers/dropdowns should scale from their trigger point
- Set `transform-origin` to match where the user clicked/triggered

### Translation

- **Use percentage values over pixels** — `translateY(100%)` is relative to the element's own size, resilient to varying dimensions
- Translation does not affect document flow (element's original space is preserved)

### Blur as Fallback

When easing and duration adjustments can't smooth a transition, apply `filter: blur(2px)` to mask imperfections. Tricks the eye into seeing smooth motion by blending states.

---

## Drawer Component Patterns

From Emil's Vaul drawer (built on Radix Dialog primitive):

### Easing & Duration

```css
.drawer {
  transition: transform 0.5s cubic-bezier(0.32, 0.72, 0, 1);
}
```

- **500ms duration** mimics iOS Sheet animation
- **`cubic-bezier(0.32, 0.72, 0, 1)`** — derived from Ionic Framework, closely matches iOS native motion

### Performance: No CSS Variables During Drag

CSS variables are inheritable. Updating a CSS variable on a parent triggers style recalculation across ALL children — cost scales with child count.

```js
// BAD: Laggy with many children
element.style.setProperty("--swipe-amount", `${distance}px`);

// GOOD: Direct transform, no inheritance cascade
element.style.transform = `translateY(${distance}px)`;
```

### Drag Damping

When dragging beyond bounds, resistance increases proportionally. "The more you drag, the less the drawer moves" — mimics real-world physics.

### Momentum-Based Close

Users can "flick" to close without dragging to a threshold. Velocity-based calculation allows skipping snap points for a natural gesture feel.

### Background Scaling

The `scaleBackground` pattern creates the illusion of the page becoming another sheet layer behind the drawer. Apply dynamic `transform: scale()` and `border-radius` to the page wrapper based on drag progress.

---

## Toast Patterns

### Stacked Toasts with Index

```css
.toast {
  transform: translateY(100%);
  opacity: 0;
  transition: opacity 400ms, transform 400ms;
}

.toast[data-mounted="true"] {
  transform: translateY(calc(var(--index) * (100% + var(--gap)) * -1));
  opacity: 1;
}
```

- Use inverted index for correct stacking order
- Percentage-based transforms adapt to varying toast heights
- 400ms with ease for enter/exit (toasts are low-frequency)

---

## Tooltip Patterns

### Subsequent Tooltip Rule

First tooltip: show with a delay to prevent accidental activation.
Once ANY tooltip is open: subsequent tooltips display **immediately** — no delay, no animation.

```css
.tooltip[data-instant] {
  transition-duration: 0ms;
}
```

---

## Key Numbers Reference

| Value | Use |
|-------|-----|
| `scale(0.97)` | Button press feedback |
| `scale(0.5+)` | Minimum starting scale (never from 0) |
| `< 300ms` | Maximum UI animation duration |
| `180ms` | Responsive dropdown/select |
| `400ms` | Toast transitions |
| `500ms` | Drawer/sheet (iOS-like) |
| `cubic-bezier(0.32, 0.72, 0, 1)` | iOS sheet easing |
| `cubic-bezier(0.16, 1, 0.3, 1)` | Standard ease-out (ExifCleaner `--ec-ease-out`) |
| `2px` | Blur value to mask imperfections |
| `100ms` | Anti-accidental scroll timeout |

---

## ExifCleaner Application

### What to animate (low-frequency, purposeful)
- Drawer slide-in/out (user opens settings occasionally)
- File row entrance (staggered, on drop — happens per batch)
- Checkmark completion (one-shot per file)
- Drag-over state transition

### What NOT to animate (high-frequency or keyboard-driven)
- Keyboard navigation between rows
- Toggle switch state changes (keep them instant — happens every time user changes a setting)
- Repeated "Clean more" cycles — keep transition minimal

### Drawer-specific decisions
- Use `cubic-bezier(0.32, 0.72, 0, 1)` at 300-400ms (faster than iOS 500ms since desktop users expect snappier interactions)
- Apply transform directly during drag, not CSS variables
- Backdrop opacity 0 → 0.4 synchronized with drawer slide
- Under reduced-motion: instant show/hide, no slide

---

*Compiled: 2026-03-29*
*Sources: emilkowal.ski/ui — 7 Practical Tips, You Don't Need Animations, Good vs Great, Great Animations, CSS Transforms, Building a Drawer*
