import { it, expect, describe } from "vitest";
import {
	validateSettings,
	migrateSettings,
	DEFAULT_SETTINGS,
	CURRENT_SCHEMA_VERSION,
} from "../../src/domain/settings_schema";
import type { Settings, SettingsFile } from "../../src/domain/settings_schema";

describe("CURRENT_SCHEMA_VERSION", () => {
	it("is version 2", () => {
		expect(CURRENT_SCHEMA_VERSION).toBe(2);
	});
});

describe("DEFAULT_SETTINGS", () => {
	it("has preserveOrientation true", () => {
		expect(DEFAULT_SETTINGS.preserveOrientation).toBe(true);
	});

	it("has preserveColorProfile true", () => {
		expect(DEFAULT_SETTINGS.preserveColorProfile).toBe(true);
	});

	it("defaults language to null", () => {
		expect(DEFAULT_SETTINGS.language).toBeNull();
	});

	it("does not have preserveRotation field", () => {
		expect("preserveRotation" in DEFAULT_SETTINGS).toBe(false);
	});
});

describe("validateSettings", () => {
	it("validates a correct settings object with new fields", () => {
		const input = {
			preserveOrientation: false,
			preserveColorProfile: true,
			saveAsCopy: true,
			removeXattrs: false,
			preserveTimestamps: true,
			language: "fr",
		};
		const result = validateSettings(input);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.value.preserveOrientation).toBe(false);
			expect(result.value.preserveColorProfile).toBe(true);
			expect(result.value.saveAsCopy).toBe(true);
			expect(result.value.language).toBe("fr");
		}
	});

	it("fills defaults for missing boolean fields", () => {
		const result = validateSettings({});
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.value.preserveOrientation).toBe(true);
			expect(result.value.preserveColorProfile).toBe(true);
			expect(result.value.saveAsCopy).toBe(false);
			expect(result.value.removeXattrs).toBe(false);
			expect(result.value.preserveTimestamps).toBe(false);
			expect(result.value.language).toBeNull();
		}
	});

	it("falls back to default for non-boolean preserveOrientation", () => {
		const result = validateSettings({ preserveOrientation: "yes" });
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.value.preserveOrientation).toBe(true);
		}
	});

	it("falls back to default for non-boolean preserveColorProfile", () => {
		const result = validateSettings({ preserveColorProfile: 42 });
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.value.preserveColorProfile).toBe(true);
		}
	});

	it("rejects non-object input", () => {
		const result = validateSettings("string");
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain("non-null object");
		}
	});

	it("rejects null input", () => {
		const result = validateSettings(null);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain("non-null object");
		}
	});
});

describe("migrateSettings", () => {
	it("does not migrate when version matches current", () => {
		const file: SettingsFile = {
			version: CURRENT_SCHEMA_VERSION,
			settings: { ...DEFAULT_SETTINGS, saveAsCopy: true },
		};
		const { settings, didMigrate } = migrateSettings(file);
		expect(didMigrate).toBe(false);
		expect(settings.saveAsCopy).toBe(true);
	});

	it("migrates v1 preserveRotation=true to both new fields true", () => {
		const file = {
			version: 1,
			settings: {
				preserveRotation: true,
				saveAsCopy: false,
				removeXattrs: false,
				preserveTimestamps: false,
				language: null,
			},
		} as unknown as SettingsFile;
		const { settings, didMigrate } = migrateSettings(file);
		expect(didMigrate).toBe(true);
		expect(settings.preserveOrientation).toBe(true);
		expect(settings.preserveColorProfile).toBe(true);
		expect("preserveRotation" in settings).toBe(false);
	});

	it("migrates v1 preserveRotation=false to both new fields false", () => {
		const file = {
			version: 1,
			settings: {
				preserveRotation: false,
				saveAsCopy: true,
				removeXattrs: false,
				preserveTimestamps: false,
				language: "de",
			},
		} as unknown as SettingsFile;
		const { settings, didMigrate } = migrateSettings(file);
		expect(didMigrate).toBe(true);
		expect(settings.preserveOrientation).toBe(false);
		expect(settings.preserveColorProfile).toBe(false);
		expect(settings.saveAsCopy).toBe(true);
		expect(settings.language).toBe("de");
	});

	it("migrates v1 with missing preserveRotation defaults both to true", () => {
		const file = {
			version: 1,
			settings: {
				saveAsCopy: false,
				removeXattrs: false,
				preserveTimestamps: false,
				language: null,
			},
		} as unknown as SettingsFile;
		const { settings, didMigrate } = migrateSettings(file);
		expect(didMigrate).toBe(true);
		expect(settings.preserveOrientation).toBe(true);
		expect(settings.preserveColorProfile).toBe(true);
	});

	it("migrates v0 and fills defaults", () => {
		const file = {
			version: 0,
			settings: {} as Settings,
		} as unknown as SettingsFile;
		const { settings, didMigrate } = migrateSettings(file);
		expect(didMigrate).toBe(true);
		expect(settings.preserveOrientation).toBe(true);
		expect(settings.preserveColorProfile).toBe(true);
		expect(settings.saveAsCopy).toBe(false);
	});
});
