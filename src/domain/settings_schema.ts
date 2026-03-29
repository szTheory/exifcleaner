// Pure domain logic — zero dependencies, zero I/O.
// Settings schema defines all user preferences with typed defaults.

import type { Result } from "../common/result";

export const CURRENT_SCHEMA_VERSION = 2;

export interface Settings {
	preserveOrientation: boolean;
	preserveColorProfile: boolean;
	saveAsCopy: boolean;
	removeXattrs: boolean;
	preserveTimestamps: boolean;
	language: string | null;
}

export const DEFAULT_SETTINGS: Readonly<Settings> = Object.freeze({
	preserveOrientation: true,
	preserveColorProfile: true,
	saveAsCopy: false,
	removeXattrs: false,
	preserveTimestamps: false,
	language: null,
});

export interface SettingsFile {
	version: number;
	settings: Settings;
}

export function migrateSettings(file: SettingsFile): {
	settings: Settings;
	didMigrate: boolean;
} {
	if (file.version === CURRENT_SCHEMA_VERSION) {
		return { settings: file.settings, didMigrate: false };
	}

	let didMigrate = false;
	let settings: Settings = {
		...DEFAULT_SETTINGS,
		...file.settings,
	};

	// v1 -> v2: Split preserveRotation into preserveOrientation + preserveColorProfile
	if (file.version < 2) {
		const oldSettings = file.settings as unknown as Record<string, unknown>;
		const preserveRotation = oldSettings["preserveRotation"] !== false;
		settings = {
			...DEFAULT_SETTINGS,
			...settings,
			preserveOrientation: preserveRotation,
			preserveColorProfile: preserveRotation,
		};
		delete (settings as unknown as Record<string, unknown>)["preserveRotation"];
		didMigrate = true;
	}

	return { settings, didMigrate };
}

export function validateSettings(input: unknown): Result<Settings> {
	if (typeof input !== "object" || input === null) {
		return { ok: false, error: "Settings must be a non-null object" };
	}

	const raw = input as Record<string, unknown>;

	const settings: Settings = {
		preserveOrientation:
			typeof raw["preserveOrientation"] === "boolean"
				? raw["preserveOrientation"]
				: DEFAULT_SETTINGS.preserveOrientation,
		preserveColorProfile:
			typeof raw["preserveColorProfile"] === "boolean"
				? raw["preserveColorProfile"]
				: DEFAULT_SETTINGS.preserveColorProfile,
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
			typeof raw["language"] === "string" || raw["language"] === null
				? (raw["language"] as string | null)
				: DEFAULT_SETTINGS.language,
	};

	return { ok: true, value: settings };
}
