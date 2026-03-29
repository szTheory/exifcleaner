import { it, expect } from "vitest";
import {
	validateSettings,
	migrateSettings,
	DEFAULT_SETTINGS,
	CURRENT_SCHEMA_VERSION,
} from "../../src/domain/settings_schema";

it("validates a correct settings object", () => {
	const input = {
		preserveRotation: false,
		saveAsCopy: true,
		removeXattrs: false,
		preserveTimestamps: true,
		language: "fr",
	};
	const result = validateSettings(input);
	expect(result.ok).toBe(true);
	if (result.ok) {
		expect(result.value.preserveRotation).toBe(false);
		expect(result.value.saveAsCopy).toBe(true);
		expect(result.value.language).toBe("fr");
	}
});

it("fills defaults for missing boolean fields", () => {
	const result = validateSettings({});
	expect(result.ok).toBe(true);
	if (result.ok) {
		expect(result.value.preserveRotation).toBe(true);
		expect(result.value.saveAsCopy).toBe(false);
		expect(result.value.removeXattrs).toBe(false);
		expect(result.value.preserveTimestamps).toBe(false);
		expect(result.value.language).toBeNull();
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

it("does not migrate when version matches", () => {
	const file = {
		version: CURRENT_SCHEMA_VERSION,
		settings: { ...DEFAULT_SETTINGS, saveAsCopy: true },
	};
	const { settings, didMigrate } = migrateSettings(file);
	expect(didMigrate).toBe(false);
	expect(settings.saveAsCopy).toBe(true);
});

it("migrates and fills defaults when version differs", () => {
	const file = {
		version: 0,
		settings: {
			preserveRotation: false,
		} as ReturnType<typeof validateSettings> extends { ok: true; value: infer T }
			? T
			: never,
	};
	const { settings, didMigrate } = migrateSettings(file);
	expect(didMigrate).toBe(true);
	expect(settings.preserveRotation).toBe(false);
	// Missing fields filled with defaults
	expect(settings.saveAsCopy).toBe(false);
	expect(settings.language).toBeNull();
});

it("defaults preserveRotation to true", () => {
	expect(DEFAULT_SETTINGS.preserveRotation).toBe(true);
});

it("defaults language to null", () => {
	expect(DEFAULT_SETTINGS.language).toBeNull();
});
