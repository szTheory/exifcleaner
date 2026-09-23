// Pure domain logic — zero dependencies, zero I/O.
// Settings schema defines all user preferences with typed defaults.

import type { Result } from "../common/result";

export const CURRENT_SCHEMA_VERSION = 5;

export type ThemeMode = "light" | "dark" | "system";

export interface Settings {
	readonly preserveOrientation: boolean;
	readonly preserveColorProfile: boolean;
	readonly preserveResolution: boolean;
	readonly saveAsCopy: boolean;
	readonly removeXattrs: boolean;
	readonly preserveTimestamps: boolean;
	readonly language: string | null;
	readonly themeMode: ThemeMode;
}

export const DEFAULT_SETTINGS: Readonly<Settings> = Object.freeze({
	preserveOrientation: true,
	preserveColorProfile: true,
	preserveResolution: true,
	saveAsCopy: true,
	removeXattrs: false,
	preserveTimestamps: false,
	language: null,
	themeMode: "system",
});

export interface SettingsFile {
	readonly version: number;
	readonly settings: Settings;
}

const VALID_THEME_MODES: ReadonlySet<string> = new Set([
	"light",
	"dark",
	"system",
]);

// Type guard functions keep positional params (TypeScript type predicates
// cannot reference destructured binding elements).
function isValidThemeMode(value: unknown): value is ThemeMode {
	return typeof value === "string" && VALID_THEME_MODES.has(value);
}

export function isSettingsFile(value: unknown): value is SettingsFile {
	if (typeof value !== "object" || value === null) {
		return false;
	}

	const obj: Record<string, unknown> = Object.create(null);
	Object.assign(obj, value);

	if (typeof obj["version"] !== "number") {
		return false;
	}

	if (typeof obj["settings"] !== "object" || obj["settings"] === null) {
		return false;
	}

	const settingsObj: Record<string, unknown> = Object.create(null);
	Object.assign(settingsObj, obj["settings"]);

	if (
		typeof settingsObj["preserveOrientation"] !== "boolean" ||
		typeof settingsObj["preserveColorProfile"] !== "boolean" ||
		typeof settingsObj["preserveResolution"] !== "boolean" ||
		typeof settingsObj["saveAsCopy"] !== "boolean" ||
		typeof settingsObj["removeXattrs"] !== "boolean" ||
		typeof settingsObj["preserveTimestamps"] !== "boolean"
	) {
		return false;
	}

	// language must be string or null
	if (
		settingsObj["language"] !== null &&
		typeof settingsObj["language"] !== "string"
	) {
		return false;
	}

	// themeMode must be a valid ThemeMode
	if (!isValidThemeMode(settingsObj["themeMode"])) {
		return false;
	}

	return true;
}

interface MigrateSettingsParams {
	file: SettingsFile;
}

export function migrateSettings({ file }: MigrateSettingsParams): {
	settings: Settings;
	didMigrate: boolean;
} {
	if (file.version === CURRENT_SCHEMA_VERSION) {
		// Fills gaps only, never overwrites a stored value: a hand-edited or
		// partially-written v5 file missing a field would otherwise load `undefined`
		// while the type claims `boolean` (D-40).
		return {
			settings: { ...DEFAULT_SETTINGS, ...file.settings },
			didMigrate: false,
		};
	}

	let didMigrate = false;
	let settings: Settings = {
		...DEFAULT_SETTINGS,
		...file.settings,
	};

	// v1 -> v2: Split preserveRotation into preserveOrientation + preserveColorProfile
	if (file.version < 2) {
		// Old v1 settings may have a preserveRotation field not in current type
		const oldRaw: Record<string, unknown> = Object.create(null);
		Object.assign(oldRaw, file.settings);
		const preserveRotation = oldRaw["preserveRotation"] !== false;
		// Construct clean Settings object without legacy preserveRotation key
		settings = {
			preserveOrientation: preserveRotation,
			preserveColorProfile: preserveRotation,
			preserveResolution: settings.preserveResolution,
			saveAsCopy: settings.saveAsCopy,
			removeXattrs: settings.removeXattrs,
			preserveTimestamps: settings.preserveTimestamps,
			language: settings.language,
			themeMode: settings.themeMode,
		};
		didMigrate = true;
	}

	// v2 -> v3: Add themeMode field
	if (file.version < 3) {
		settings = { ...settings, themeMode: "system" };
		didMigrate = true;
	}

	// v3 -> v4: Electron reports Vietnamese as "vi". Preserve every other
	// stored preference, including the user's existing Save as Copy choice.
	if (file.version < 4) {
		settings = {
			...settings,
			language: settings.language === "vn" ? "vi" : settings.language,
		};
		didMigrate = true;
	}

	// v4 -> v5: add the preserve-resolution toggle at its default. Every preserve
	// toggle is independent -- the value is never inferred from another toggle.
	if (file.version < 5) {
		settings = {
			...settings,
			preserveResolution: DEFAULT_SETTINGS.preserveResolution,
		};
		didMigrate = true;
	}

	return { settings, didMigrate };
}

interface ValidateSettingsParams {
	input: unknown;
}

export function validateSettings({
	input,
}: ValidateSettingsParams): Result<Settings> {
	if (typeof input !== "object" || input === null) {
		return { ok: false, error: "Settings must be a non-null object" };
	}

	const raw: Record<string, unknown> = Object.create(null);
	Object.assign(raw, input);

	const settings: Settings = {
		preserveOrientation:
			typeof raw["preserveOrientation"] === "boolean"
				? raw["preserveOrientation"]
				: DEFAULT_SETTINGS.preserveOrientation,
		preserveColorProfile:
			typeof raw["preserveColorProfile"] === "boolean"
				? raw["preserveColorProfile"]
				: DEFAULT_SETTINGS.preserveColorProfile,
		preserveResolution:
			typeof raw["preserveResolution"] === "boolean"
				? raw["preserveResolution"]
				: DEFAULT_SETTINGS.preserveResolution,
		saveAsCopy:
			typeof raw["saveAsCopy"] === "boolean"
				? raw["saveAsCopy"]
				: DEFAULT_SETTINGS.saveAsCopy,
		removeXattrs:
			typeof raw["removeXattrs"] === "boolean"
				? raw["removeXattrs"]
				: DEFAULT_SETTINGS.removeXattrs,
		preserveTimestamps:
			typeof raw["preserveTimestamps"] === "boolean"
				? raw["preserveTimestamps"]
				: DEFAULT_SETTINGS.preserveTimestamps,
		language:
			typeof raw["language"] === "string"
				? raw["language"]
				: raw["language"] === null
					? null
					: DEFAULT_SETTINGS.language,
		themeMode: isValidThemeMode(raw["themeMode"])
			? raw["themeMode"]
			: DEFAULT_SETTINGS.themeMode,
	};

	return { ok: true, value: settings };
}
