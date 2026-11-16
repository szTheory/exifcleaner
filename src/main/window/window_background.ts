// Pure main-process logic: no electron import, so a node-environment test can import it.
// The BrowserWindow first-paint background, chosen from the system theme at creation time.
//
// Each value equals `--ec-color-bg` of its theme in src/renderer/styles/tokens.css, so the
// window does not flash another colour before the renderer paints. The gate test
// tests/renderer/gates/window_background.test.ts (GAT-02) compares both with the stylesheet.
// The dark value was #1e1e1e (an old, unrelated grey) until Phase 76.

const LIGHT_BACKGROUND_COLOR = "#FFFFFF";
const DARK_BACKGROUND_COLOR = "#0A2E2B";

export function windowBackgroundColor(isDark: boolean): string {
	return isDark ? DARK_BACKGROUND_COLOR : LIGHT_BACKGROUND_COLOR;
}
