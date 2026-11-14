<!-- Generated from ui-spec.json by .storybook/catalog/catalog.mjs. Do not edit: edit ui-spec.json and run yarn catalog:write. -->

# UI-SPEC

Brand pin: `7629b8fcd5794df708000e49abd9a2a9402d4c7b`

Sources: 13 values: tokens 1, brand 3, app 9 (brand-starting-point 4, wcag-derived 1, platform-default 1, maintainer-decision 3); 4 states cells n/a. Each value names exactly one source; an app value is an app decision, not brand text.

## type

| Id | Value | Source |
| --- | --- | --- |
| type.label.weight | 600 | brand Type: the hierarchy: Label: Instrument Sans 600, 13/16 px, tracking +6%, capitals. Table headers, section labels. Sample: “FIELDS REMOVED” |

## radii

| Id | Value | Source |
| --- | --- | --- |
| radii.button | 8 px | brand ## In the product: Shape language: soft rectangles, 8 px radius for buttons and cards, 6 px for badges. |

## spacing

| Id | Value | Source |
| --- | --- | --- |
| spacing.base | 4px | app (maintainer-decision): D-11 keeps the existing 4 px-base --ec-space scale (tokens.css:44, --ec-space-1: 4px); the brand tokens set no spacing. |

## focus

| Id | Value | Source |
| --- | --- | --- |
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
| motion.reveal.duration | 200 ms | brand ### In the product: **Reveal.** Expanding a file’s before-and-after list opens in about 200 ms with an ordinary ease-out. Nothing bounces. |

## platformOwned

| Id | Value | Source |
| --- | --- | --- |
| platform-owned.platform.accent-fallback | #007AFF | app (platform-default): ACCENT_COLOR_FALLBACK at src/domain/accent_color.ts:4 is the accent when the OS reports none; getAccentColor in ThemeContext.tsx replaces it at runtime from systemPreferences.getAccentColor() (D-04), so the accent stays platform-owned. |
