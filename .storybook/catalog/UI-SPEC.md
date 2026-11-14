<!-- Generated from ui-spec.json by .storybook/catalog/catalog.mjs. Do not edit: edit ui-spec.json and run yarn catalog:write. -->

# UI-SPEC

Brand pin: `7629b8fcd5794df708000e49abd9a2a9402d4c7b`

Sources: 85 values: tokens 1, brand 17, app 67 (brand-starting-point 10, wcag-derived 11, platform-default 5, maintainer-decision 41); 4 states cells n/a. Each value names exactly one source; an app value is an app decision, not brand text.

## type

| Id | Value | Source |
| --- | --- | --- |
| type.body.line-height | 24px | app (maintainer-decision): D-09: 16/24, a unitless --ec-line-height-* token in v5.1. 24 over 16 is the 1.5 the stylesheets already write as a literal at empty_state.css:47 and :112, metadata_expansion.css:113 and toggle_switch.css:20 and :27; v5.1 replaces those literals with the token. |
| type.body.size | 16px | app (maintainer-decision): D-09: 16/24 body, the existing --ec-font-size-body (tokens.css:58). The brand Text row is 17/27 for paragraphs and release notes and is not adopted in the app. |
| type.caption.line-height | 16px | app (maintainer-decision): D-09: caption 12/16. Line heights become unitless --ec-line-height-* tokens in v5.1, so this and the other three line heights are named values instead of the single undefined --ec-line-height-normal. |
| type.caption.size | 12px | app (maintainer-decision): D-09 scale, an app decision: caption 12/16. The brand Caption row is 14/20 for the website and print set (BRAND.md Type: the hierarchy); the app keeps its own sizes because BRAND.md In the product says exact specifications belong to the app. |
| type.data.column-unit | ch | app (maintainer-decision): D-08: columns of file names and counts are sized in ch of the data font, so a later font change moves the columns with the glyphs. Replaces the fixed 72px 80px 88px 88px tracks at file_table.css:64. |
| type.data.line-height | 20px | app (brand-starting-point): The brand Data row sets 23 px over 15 px (1.53); 13 px at that ratio is 19.9 px, rounded to the 20 px of the 14/20 default line. |
| type.data.numerals | tabular-nums | app (maintainer-decision): Counts and sizes align in columns without jitter as values change. The system monospace is already fixed-width; font-variant-numeric: tabular-nums keeps that guarantee if a count renders in a proportional fallback (D-09). |
| type.data.size | 13px | app (brand-starting-point): The brand Data row is Geist Mono 15/23 px beside Text 17/27 px, a mono-to-sans ratio of 0.88 (15/17). Applied to the 14 px default size that gives 12.4 px; the app sets 13 px, one whole pixel above, so mono digits stay legible in the 72, 80 and 88 px count columns (R-08a). |
| type.data.weight | 400 | brand Mono: 400 for metadata, file names and counts; 500 for emphasis. |
| type.data.weight-emphasis | 500 | brand Mono: 400 for metadata, file names and counts; 500 for emphasis. |
| type.family.mono | system monospace | brand In the app, license and fallback: File names and counts use Geist Mono or the system monospace. |
| type.family.mono-bundled | none | app (maintainer-decision): D-08: no font file is bundled (no Geist Mono, no Instrument Sans). Adding one later is cheap, removing one after it has shipped is not; font-src 'self' is already in the CSP (electron.vite.config.ts:33), and the stacks stay at tokens.css:53 and :55. Revisit only with a measured v5.1 need and a licence step. |
| type.family.sans | system font | brand In the app, license and fallback: Inside the app, the interface keeps the system font, so ExifCleaner feels native on macOS, Windows and Linux. |
| type.label.case | capitals | brand Type: the hierarchy: Label: Instrument Sans 600, 13/16 px, tracking +6%, capitals. Table headers, section labels. |
| type.label.lang-scope | :lang() scoped to cased scripts | app (wcag-derived): text-transform: uppercase and tracking apply only under :lang() for cased scripts. Measured in Playwright's bundled Chromium on copied rules, not Electron 44 (assumption A4): Turkish needs lang for the dotted capital I (lang=tr gives the dotted form), German sharp s expands under capitals and lengthens the label, and Arabic is uncased and gains nothing from capitals; tracking left Arabic letters joined in Chromium (1.4 px of 173 px), so scoping follows the cased-script rule, not a measured break. |
| type.label.letter-spacing | 0.06em | app (brand-starting-point): The unit conversion of type.label.tracking: BRAND.md publishes Label tracking as +6%, and CSS letter-spacing takes em, where 6% of the font size is 0.06em. The brand figure stays recorded verbatim in type.label.tracking. |
| type.label.line-height | 16px | app (brand-starting-point): The brand Label row sets a 16 px line height (13/16 px); the app keeps the 16 and changes only the size to 12 px (type.label.size). |
| type.label.size | 12px | app (maintainer-decision): D-09: 12 px so the capitals header labels fit the 72, 80 and 88 px count columns at the 580 px minimum window (file_table.css:64). The brand Label row is 13/16 px (BRAND.md Type: the hierarchy, R-08a); the 1 px reduction is an app decision. |
| type.label.tracking | +6% | brand Type: the hierarchy: Label: Instrument Sans 600, 13/16 px, tracking +6%, capitals. Table headers, section labels. |
| type.label.weight | 600 | brand Type: the hierarchy: Label: Instrument Sans 600, 13/16 px, tracking +6%, capitals. Table headers, section labels. Sample: “FIELDS REMOVED” |
| type.not-adopted | 17/27, 24/30, 44/48 | app (maintainer-decision): D-09: the brand hierarchy rows Text 17/27, Title 24/30 and Headline 44/48 are screen sizes for the website, covers and posts. BRAND.md In the product says exact specifications belong to the app, so the app does not adopt them. |
| type.small.line-height | 20px | app (maintainer-decision): D-09: 14/20. A unitless --ec-line-height-* token in v5.1; this fixes the undefined --ec-line-height-normal read at file_table.css:139. |
| type.small.size | 14px | app (maintainer-decision): D-09: 14/20 is the default UI size, the existing --ec-font-size-small (tokens.css:57); it equals the brand Caption size, which the book sets for figure notes. |
| type.title.line-height | 28px | app (maintainer-decision): D-09: 20/28, a unitless --ec-line-height-* token in v5.1. |
| type.title.size | 20px | app (maintainer-decision): D-09: 20/28 title. Today a 20 px size exists as --ec-font-size-label (tokens.css:59), a name that clashes with the 12 px Label role; v5.1 renames it, and --ec-font-size-heading (24 px, tokens.css:60, used nowhere) is retired unless v5.1 needs it. |
| type.weight.regular | 400 | app (platform-default): The regular weight of the system font (--ec-font-weight-regular, tokens.css:61); it is also the brand's 400 for text and metadata (BRAND.md Sans and Mono), so no bundled face is needed. |
| type.weight.semibold | 600 | app (platform-default): The semibold weight of the system font (--ec-font-weight-semibold, tokens.css:62); the brand uses 600 for titles, emphasis and the Label (BRAND.md Sans and Type: the hierarchy). |

## radii

| Id | Value | Source |
| --- | --- | --- |
| radii.badge | 6 px | brand ## In the product: Shape language: soft rectangles, 8 px radius for buttons and cards, 6 px for badges. |
| radii.button | 8 px | brand ## In the product: Shape language: soft rectangles, 8 px radius for buttons and cards, 6 px for badges. |
| radii.card | 8 px | brand ## In the product: Shape language: soft rectangles, 8 px radius for buttons and cards, 6 px for badges. |
| radii.icon-button | 6px | app (maintainer-decision): D-10: icon buttons take the 6 px badge radius. Today's icon buttons use 4 px (settings_drawer.css:12 and :84), one of the stray radii that collapse in v5.1. |
| radii.menu | 6px | app (maintainer-decision): D-10: menus keep the 6 px the language dropdown already uses (language_dropdown.css:13 for the trigger, :54 for the menu). |
| radii.segment | 6px | app (maintainer-decision): D-10: the segment already uses 6 px (segmented_control.css:27 and :57), inside the 8 px container. |
| radii.segmented-container | 8px | app (maintainer-decision): D-10: the segmented container already uses 8 px (segmented_control.css:5), the same as buttons and cards. |
| radii.stray | 2px, 3px and 4px collapse in v5.1 | app (maintainer-decision): D-10: radii of 2, 3 and 4 px collapse onto the 6 px and 8 px steps in v5.1: error_boundary.css:30, toast.css:11, type_pill.css:6, metadata_expansion.css:29 and :111, settings_drawer.css:12 and :84, file_table.css:52. |
| radii.table-row | 0 px | app (maintainer-decision): D-10: table rows are full-bleed and square (no radius on .file-table__row, file_table.css:62); the surface step that separates them from the ground is a colour step, not a card. |
| radii.toggle-thumb | 50% | app (maintainer-decision): D-10: the toggle thumb is a circle (toggle_switch.css:62). |
| radii.toggle-track | 9999px | app (maintainer-decision): D-10: the toggle track is a pill. Today's 12 px (toggle_switch.css:50) is half the 24 px track height, which is a pill at that height; 9999px keeps it a pill whatever the height becomes. |

## spacing

| Id | Value | Source |
| --- | --- | --- |
| spacing.base | 4px | app (maintainer-decision): D-11 keeps the existing 4 px-base --ec-space scale (tokens.css:44, --ec-space-1: 4px); the brand tokens set no spacing. |
| spacing.control-primary-min | 40px | app (maintainer-decision): D-11: primary controls are at least 40 px tall, comfortably above the 24 px floor in spacing.target-min. |
| spacing.legacy-names | --spacing-xs..xl map onto --ec-space-* | app (maintainer-decision): D-11: the five names --spacing-xs, -sm, -md, -lg and -xl are defined nowhere, so each declaration that reads them (file_list.css:2, :13, :14; error_boundary.css:7, :16, :22, :28) is invalid at computed-value time. v5.1 maps each use onto a --ec-space-* step. |
| spacing.row-min | 44px | app (maintainer-decision): D-11: rows are at least 44 px tall, as .file-table__row already is (min-height: 44px, file_table.css:65). |
| spacing.space-1 | 4px | app (maintainer-decision): D-11: the existing 4 px-base scale, --ec-space-1 at tokens.css:44. v5.1 fixes the "8px grid" comment at tokens.css:43; the brand sets no app spacing (BRAND.md Layout leaves a spacing scale to the platform and the website). |
| spacing.space-12 | 48px | app (maintainer-decision): D-11: the existing 4 px-base scale, --ec-space-12 at tokens.css:50. v5.1 fixes the "8px grid" comment at tokens.css:43; the brand sets no app spacing (BRAND.md Layout leaves a spacing scale to the platform and the website). |
| spacing.space-2 | 8px | app (maintainer-decision): D-11: the existing 4 px-base scale, --ec-space-2 at tokens.css:45. v5.1 fixes the "8px grid" comment at tokens.css:43; the brand sets no app spacing (BRAND.md Layout leaves a spacing scale to the platform and the website). |
| spacing.space-3 | 12px | app (maintainer-decision): D-11: the existing 4 px-base scale, --ec-space-3 at tokens.css:46. v5.1 fixes the "8px grid" comment at tokens.css:43; the brand sets no app spacing (BRAND.md Layout leaves a spacing scale to the platform and the website). |
| spacing.space-4 | 16px | app (maintainer-decision): D-11: the existing 4 px-base scale, --ec-space-4 at tokens.css:47. v5.1 fixes the "8px grid" comment at tokens.css:43; the brand sets no app spacing (BRAND.md Layout leaves a spacing scale to the platform and the website). |
| spacing.space-6 | 24px | app (maintainer-decision): D-11: the existing 4 px-base scale, --ec-space-6 at tokens.css:48. v5.1 fixes the "8px grid" comment at tokens.css:43; the brand sets no app spacing (BRAND.md Layout leaves a spacing scale to the platform and the website). |
| spacing.space-8 | 32px | app (maintainer-decision): D-11: the existing 4 px-base scale, --ec-space-8 at tokens.css:49. v5.1 fixes the "8px grid" comment at tokens.css:43; the brand sets no app spacing (BRAND.md Layout leaves a spacing scale to the platform and the website). |
| spacing.target-min | 24px x 24px | app (wcag-derived): WCAG 2.2 SC 2.5.8 Target Size (Minimum), level AA: pointer targets are at least 24 by 24 CSS px, or spaced so a 24 px circle on each does not intersect another target. |
| spacing.text-container | min-height, never a fixed height | app (wcag-derived): WCAG 2.2 SC 1.4.4 Resize Text and SC 1.4.12 Text Spacing: text containers grow with their content. Fixed heights clip tall scripts at segmented_control.css:17 (28px), status_bar.css:4 (36px), language_dropdown.css:10 (36px) and folder_row.css:4 (36px) (Phase 73 D-21 #9); v5.1 changes them to min-height. |

## focus

| Id | Value | Source |
| --- | --- | --- |
| focus.accent-boundary | fallback #007AFF only | app (platform-default): The accent is set at runtime from the OS (ACCENT_COLOR_FALLBACK at src/domain/accent_color.ts:4 is only the Linux fallback), so the contrast test covers the fallback accent only. User-chosen system accents such as yellow and graphite can fall below 3:1 against a ground and cannot be proven statically; no ratio is quoted for them because no accent hex is named to measure (D-07). |
| focus.dark-raised | #007AFF on Tide 2.86:1 | app (wcag-derived): The fallback accent ring directly on a raised Tide surface measures 2.86:1, below the 3:1 of WCAG 2.2 SC 1.4.11; on the Deep Teal ground it measures 3.63:1. v5.1 therefore offsets the dark ring 2 px onto the Deep Teal ground and never draws it directly on Tide; 74-04's proposed set checks the ground-adjacent pair. This is a spec value, not a sealed contrast-gap entry, because today's focus pairs all pass. |
| focus.reveal-button | ring on .file-table__reveal | app (wcag-derived): The reveal button has no ring rule of its own: its :focus-visible rule only raises opacity to 1 (file_table.css:161-164), unlike the other focusable controls in styles/, which draw the 2px accent outline. v5.1 adds the same ring so the reveal button's focus indicator is the specified one (SC 2.4.7 Focus Visible). |
| focus.ring.colour | --ec-color-accent | app (platform-default): The ring uses the platform accent token, set at runtime from systemPreferences.getAccentColor() (D-04); it is the same colour as ::selection and the toggle-on track. |
| focus.ring.never-box-shadow | outline, never box-shadow | app (wcag-derived): Forced-colors (Windows High Contrast) mode removes box-shadow, so a ring built from it disappears for the people who need it most; an outline is kept and recoloured. |
| focus.ring.offset-free | +2px | app (maintainer-decision): D-12: a free-standing control (button, toggle, segmented control, link) keeps its ring 2 px outside, as every focus-visible rule in styles/ does today (outline-offset: 2px). |
| focus.ring.offset-inset | -2px | app (wcag-derived): R-09: an outset ring on a full-width row inside .file-table__body (overflow-y: auto, file_table.css:57-59) is clipped on the left, right and first-row top; only the bottom edge draws. .file-table__row already declares outline-offset: -2px (file_table.css:70) and its :focus-visible rule overrides it to +2px at :83; menu items clip the same way. Measured in Playwright's bundled Chromium on copied rules (assumption A4), not Electron 44. |
| focus.ring.style | outline solid | app (wcag-derived): A solid CSS outline, never box-shadow or border: outlines are drawn on top of neighbours and kept by forced-colors mode, which drops box-shadow (D-12). |
| focus.ring.trigger | :focus-visible | app (wcag-derived): D-12: the ring shows on :focus-visible only, so a mouse click does not draw it while keyboard focus always does (WCAG 2.2 SC 2.4.7 Focus Visible). |
| focus.ring.width | 2px | app (wcag-derived): D-12: outline 2px solid on :focus-visible only, never box-shadow (forced-colors drops it); the ring must hold 3:1 against the adjacent colour (WCAG 2.2 SC 1.4.11), which Phase 74 checks for the fallback accent. |

## states

Components: primary-button

### light

| Component | hover | pressed | disabled | selected | error |
| --- | --- | --- | --- | --- | --- |
| primary-button | surface step | one step deeper | opacity 0.4 | n/a: A button has no selected state; selection belongs to the segmented control and the table rows (D-13). | n/a: A button reports no error of its own; the failed row or message carries it with an icon and text (D-13). |

### dark

| Component | hover | pressed | disabled | selected | error |
| --- | --- | --- | --- | --- | --- |
| primary-button | surface step | one step deeper | opacity 0.4 | n/a: A button has no selected state; selection belongs to the segmented control and the table rows (D-13). | n/a: A button reports no error of its own; the failed row or message carries it with an icon and text (D-13). |

### cell sources

| Component | State | Theme | Source |
| --- | --- | --- | --- |
| primary-button | disabled | dark | app (maintainer-decision): D-13: a [disabled] or aria-disabled control at opacity 0.4 with a default cursor; no disabled rule exists in the stylesheets today. |
| primary-button | disabled | light | app (maintainer-decision): D-13: a [disabled] or aria-disabled control at opacity 0.4 with a default cursor; no disabled rule exists in the stylesheets today. |
| primary-button | hover | dark | app (brand-starting-point): D-06: BRAND.md Layout leaves component states to the platform; hover is a surface step, Rinse in light and Tide in dark. |
| primary-button | hover | light | app (brand-starting-point): D-06: BRAND.md Layout leaves component states to the platform; hover is a surface step, Rinse in light and Tide in dark. |
| primary-button | pressed | dark | app (brand-starting-point): D-06: pressed is one surface step deeper than hover, with no transform. |
| primary-button | pressed | light | app (brand-starting-point): D-06: pressed is one surface step deeper than hover, with no transform. |

## darkRinse

| Id | Value | Source |
| --- | --- | --- |
| dark-rinse.surface | #12403C | tokens color.dark.tide |

## motion

| Id | Value | Source |
| --- | --- | --- |
| motion.counts | Never animate the numbers counting down. | brand ## In the product: Never animate the numbers counting down. |
| motion.drawer.duration | 300ms | app (maintainer-decision): D-14: 300 ms for the settings drawer only, the existing --ec-duration-slow (tokens.css:69). Today that token's one consumer is the check pop (status_icon.css:56) and the drawer slide is the literal 200ms at settings_drawer.css:51, so v5.1 points the drawer at the token. |
| motion.ease | ease-out | app (brand-starting-point): BRAND.md In the product asks for an ordinary ease-out; the CSS keyword ease-out replaces the cubic-bezier --ec-ease-out (tokens.css:65), which decelerates more sharply than the CSS ease-out keyword (D-14). |
| motion.ease-spring | retired | app (maintainer-decision): D-14: --ec-ease-spring (tokens.css:66) overshoots, and the brand says nothing bounces in the product. It is retired in v5.1 together with its two uses: the check pop through the token (status_icon.css:56) and the toggle thumb through the same curve written as a literal (toggle_switch.css:88). |
| motion.progress | Progress is shown as counts | brand Never: Progress is shown as counts, never as a cleaning animation. |
| motion.reduced-motion | @media (prefers-reduced-motion: no-preference) | app (wcag-derived): Every animation sits inside this query, so a person who asks the OS for less motion gets none (WCAG 2.2 SC 2.3.3 Animation from Interactions and technique C39). The theme crossfade (tokens.css:139), the toggle (toggle_switch.css:86) and the row entrance (file_table.css:196) already do; v5.1 checks every remaining transition and animation against it. |
| motion.reveal.bounce | Nothing bounces. | brand ### In the product: **Reveal.** Expanding a file’s before-and-after list opens in about 200 ms with an ordinary ease-out. Nothing bounces. |
| motion.reveal.duration | 200 ms | brand ### In the product: **Reveal.** Expanding a file’s before-and-after list opens in about 200 ms with an ordinary ease-out. Nothing bounces. |
| motion.reveal.ease | ease-out | brand ### In the product: **Reveal.** Expanding a file’s before-and-after list opens in about 200 ms with an ordinary ease-out. Nothing bounces. |
| motion.settle.behaviour | fade up a few pixels and stop | brand ### In the product: **Settle.** Results fade up a few pixels and stop. Rows never slide in from the side, and there is no stagger choreography. |
| motion.settle.duration | 200ms | app (maintainer-decision): D-14: settle takes 200 ms, the same as the brand's reveal of about 200 ms and the existing --ec-duration-normal (tokens.css:68). |
| motion.settle.rise | 4px | app (brand-starting-point): BRAND.md In the product says results fade up a few pixels and stop; the existing ec-row-enter keyframes already rise 4px (file_table.css:185-194), which the spec keeps. |
| motion.stagger | no stagger choreography | brand ### In the product: **Settle.** Results fade up a few pixels and stop. Rows never slide in from the side, and there is no stagger choreography. |
| motion.state-feedback.duration | 150ms | app (maintainer-decision): D-14: hover, pressed and focus feedback takes 150 ms, the existing --ec-duration-fast (tokens.css:67). |
| motion.toggle.duration | 200ms | app (maintainer-decision): D-14: the toggle thumb slides 200 ms with an ordinary ease-out and no overshoot. The maintainer's smooth-slide preference (a slide, not a snap) fits it; whether to confirm it in one word is a v5.2 discuss item, not a Phase 74 gate. |
| motion.v5-2-dispositions | row stagger, check pop, toggle overshoot, press scale, drop shadows | app (maintainer-decision): D-14: existing motion that conflicts with the brand is recorded for v5.2 and not changed here: row stagger (FileRow.tsx:119 and file_table.css:180-199), check pop to scale(1.15) (status_icon.css:37-45), toggle thumb overshoot (toggle_switch.css:88), press scale(0.96) (empty_state.css:100-101), and drop shadows on non-floating layers (segmented_control.css:58, toggle_switch.css:64 and :82). v5.2 removes them. |

## platformOwned

| Id | Value | Source |
| --- | --- | --- |
| platform-owned.platform.accent-fallback | #007AFF | app (platform-default): ACCENT_COLOR_FALLBACK at src/domain/accent_color.ts:4 is the accent when the OS reports none; getAccentColor in ThemeContext.tsx replaces it at runtime from systemPreferences.getAccentColor() (D-04), so the accent stays platform-owned. |
