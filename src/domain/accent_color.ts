// Pure domain logic -- zero dependencies, zero I/O.
// Parses OS accent color from Electron's systemPreferences.getAccentColor() format.

export const ACCENT_COLOR_FALLBACK = "#007AFF";

export function parseAccentColorHex(raw: string): string {
	if (typeof raw !== "string" || raw.length < 6) {
		return ACCENT_COLOR_FALLBACK;
	}
	return `#${raw.slice(0, 6).toLowerCase()}`;
}
