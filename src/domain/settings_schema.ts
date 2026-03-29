// Pure domain logic — zero dependencies, zero I/O.
// Settings schema defines all user preferences with typed defaults.

import type { Result } from "../common/result";

export const CURRENT_SCHEMA_VERSION = 1;

export interface Settings {
	preserveRotation: boolean;
	saveAsCopy: boolean;
	removeXattrs: boolean;
	preserveTimestamps: boolean;
	language: string | null;
}

export const DEFAULT_SETTINGS: Readonly<Settings> = Object.freeze({
	preserveRotation: true,
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

	// Merge file settings over defaults to fill any missing fields
	const migrated: Settings = {
		...DEFAULT_SETTINGS,
		...file.settings,
	};

	return { settings: migrated, didMigrate: true };
}

export function validateSettings(input: unknown): Result<Settings> {
	if (typeof input !== "object" || input === null) {
		return { ok: false, error: "Settings must be a non-null object" };
	}

	const raw = input as Record<string, unknown>;

	const settings: Settings = {
		preserveRotation:
			typeof raw["preserveRotation"] === "boolean"
				? raw["preserveRotation"]
				: DEFAULT_SETTINGS.preserveRotation,
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
