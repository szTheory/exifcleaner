# ExifCleaner Prototype — Remaining Feedback (Post Round 6)

These items were noted after the final round but intentionally deferred to avoid risking regressions in a prototype that is otherwise mostly good. Address these in the next iteration pass.

---

## Typography & Colors on Empty/Drop Screen

- The "Drop images, videos, or PDFs" text looks too dark or just visually "off" — it looked better in earlier prototypes (B, C)
- Revisit the empty state typography and color choices from a graphic design lens
- All typography and colors need to be internally consistent and coherent as a whole
- Keep system fonts approach — the issue is color/weight tuning, not font choice

## Icon Quality & Sizing

- **Folder expand/collapse icon** (chevron ▾/▸): Very small, looks bad. Needs to be larger and more refined
- **Settings gear icon** (⚙): Too small, not the best looking
- **Dark/light mode toggle icons** (☀/☽): Slightly too small, passable but could be better
- **Folder icon** (📁): Doesn't fit with the other icons — feels like a different family
- **ALL icons should feel like one family** — graphically coherent, matching the ExifCleaner brand
- Use SVG icons, NOT emoji characters
- Aim for "native-feeling" in a general/cross-platform sense — don't overly match any specific OS
- Icons should look good alongside system fonts and system-style UI elements

## Column Spacing

- BEFORE and AFTER column header labels are butting up against each other
- Need breathing room between them — add padding/gap so labels don't feel cramped

## Settings Panel Borders/Shadow

- The settings pop-out panel currently shows borders and shadow on all 4 sides (top, right, bottom, left)
- Only the **left edge** should have a shadow and border — since top, bottom, and right edges are flush against the window chrome
- The panel should extend **full height from title bar to bottom of window**, overlapping the status bar (not trying to avoid it)
- Should feel like a proper integrated drawer/panel, not a floating card

## "Reveal in Finder" Text

- The typography/colors of the "Reveal in Finder" link look bad in the expansion panel
- Needs visual refinement — may be a weight, color, or size issue
- Also: "Finder" is macOS-specific terminology. Need platform-aware language:
  - macOS: "Reveal in Finder"
  - Windows: "Show in Explorer"
  - Linux: "Show in File Manager"
- For the prototype, either use the generic "Show in file manager" or note this as a platform-specific concern

## "Clean more" Button

- The typography feels too stark or "ugly" somehow
- May need a different weight, color, or treatment
- Should feel like a calm, inviting action — not a harsh label

---

## General Principle

All of these are refinement-level issues, not structural. The layout, interactions, and overall flow are solid. The next pass should focus on **visual polish**: making every text element, icon, and panel feel like they belong to the same carefully designed system.
