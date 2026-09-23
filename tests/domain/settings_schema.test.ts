import { it, expect, describe } from "vitest";
import {
	validateSettings,
	migrateSettings,
	isSettingsFile,
	DEFAULT_SETTINGS,
	CURRENT_SCHEMA_VERSION,
} from "../../src/domain/settings_schema";
import type { Settings, SettingsFile } from "../../src/domain/settings_schema";

describe("CURRENT_SCHEMA_VERSION", () => {
	it("is version 5", () => {
		expect(CURRENT_SCHEMA_VERSION).toBe(5);
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

	it("has themeMode defaulting to system", () => {
		expect(DEFAULT_SETTINGS.themeMode).toBe("system");
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
		const result = validateSettings({ input });
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.value.preserveOrientation).toBe(false);
			expect(result.value.preserveColorProfile).toBe(true);
			expect(result.value.saveAsCopy).toBe(true);
			expect(result.value.language).toBe("fr");
		}
	});

	it("fills defaults for missing boolean fields", () => {
		const result = validateSettings({ input: {} });
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.value.preserveOrientation).toBe(true);
			expect(result.value.preserveColorProfile).toBe(true);
			expect(result.value.saveAsCopy).toBe(true);
			expect(result.value.removeXattrs).toBe(false);
			expect(result.value.preserveTimestamps).toBe(false);
			expect(result.value.language).toBeNull();
		}
	});

	it("falls back to default for non-boolean preserveOrientation", () => {
		const result = validateSettings({
			input: { preserveOrientation: "yes" },
		});
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.value.preserveOrientation).toBe(true);
		}
	});

	it("falls back to default for non-boolean preserveColorProfile", () => {
		const result = validateSettings({
			input: { preserveColorProfile: 42 },
		});
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.value.preserveColorProfile).toBe(true);
		}
	});

	it("rejects non-object input", () => {
		const result = validateSettings({ input: "string" });
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain("non-null object");
		}
	});

	it("rejects null input", () => {
		const result = validateSettings({ input: null });
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain("non-null object");
		}
	});

	it("validates themeMode=dark", () => {
		const result = validateSettings({ input: { themeMode: "dark" } });
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.value.themeMode).toBe("dark");
		}
	});

	it("defaults themeMode for invalid value", () => {
		const result = validateSettings({ input: { themeMode: "invalid" } });
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.value.themeMode).toBe("system");
		}
	});

	it("defaults themeMode when missing", () => {
		const result = validateSettings({ input: {} });
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.value.themeMode).toBe("system");
		}
	});
});

describe("isSettingsFile", () => {
	it("returns true for a valid SettingsFile shape", () => {
		const valid = {
			version: 3,
			settings: {
				preserveOrientation: true,
				preserveColorProfile: true,
				preserveResolution: true,
				saveAsCopy: false,
				removeXattrs: false,
				preserveTimestamps: false,
				language: null,
				themeMode: "system",
			},
		};
		expect(isSettingsFile(valid)).toBe(true);
	});

	it("returns true when language is a string", () => {
		const valid = {
			version: 3,
			settings: {
				preserveOrientation: true,
				preserveColorProfile: true,
				preserveResolution: true,
				saveAsCopy: false,
				removeXattrs: false,
				preserveTimestamps: false,
				language: "en",
				themeMode: "dark",
			},
		};
		expect(isSettingsFile(valid)).toBe(true);
	});

	it("returns false for null", () => {
		expect(isSettingsFile(null)).toBe(false);
	});

	it("returns false for undefined", () => {
		expect(isSettingsFile(undefined)).toBe(false);
	});

	it("returns false for a string", () => {
		expect(isSettingsFile("hello")).toBe(false);
	});

	it("returns false when version is missing", () => {
		expect(
			isSettingsFile({
				settings: { ...DEFAULT_SETTINGS },
			}),
		).toBe(false);
	});

	it("returns false when version is not a number", () => {
		expect(
			isSettingsFile({
				version: "3",
				settings: { ...DEFAULT_SETTINGS },
			}),
		).toBe(false);
	});

	it("returns false when settings is missing", () => {
		expect(isSettingsFile({ version: 3 })).toBe(false);
	});

	it("returns false when settings is null", () => {
		expect(isSettingsFile({ version: 3, settings: null })).toBe(false);
	});

	it("returns false when settings has wrong field types", () => {
		expect(
			isSettingsFile({
				version: 3,
				settings: {
					preserveOrientation: "yes", // wrong type
					preserveColorProfile: true,
					saveAsCopy: false,
					removeXattrs: false,
					preserveTimestamps: false,
					language: null,
					themeMode: "system",
				},
			}),
		).toBe(false);
	});

	it("returns false when themeMode is invalid", () => {
		expect(
			isSettingsFile({
				version: 3,
				settings: {
					preserveOrientation: true,
					preserveColorProfile: true,
					saveAsCopy: false,
					removeXattrs: false,
					preserveTimestamps: false,
					language: null,
					themeMode: "invalid",
				},
			}),
		).toBe(false);
	});
});

describe("migrateSettings", () => {
	it("does not migrate when version matches current", () => {
		const file: SettingsFile = {
			version: CURRENT_SCHEMA_VERSION,
			settings: { ...DEFAULT_SETTINGS, saveAsCopy: true },
		};
		const { settings, didMigrate } = migrateSettings({ file });
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
		const { settings, didMigrate } = migrateSettings({ file });
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
		const { settings, didMigrate } = migrateSettings({ file });
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
		const { settings, didMigrate } = migrateSettings({ file });
		expect(didMigrate).toBe(true);
		expect(settings.preserveOrientation).toBe(true);
		expect(settings.preserveColorProfile).toBe(true);
	});

	it("migrates v2 to v3 by adding themeMode=system", () => {
		const file: SettingsFile = {
			version: 2,
			settings: {
				preserveOrientation: true,
				preserveColorProfile: true,
				saveAsCopy: false,
				removeXattrs: false,
				preserveTimestamps: false,
				language: null,
			} as unknown as Settings,
		};
		const { settings, didMigrate } = migrateSettings({ file });
		expect(didMigrate).toBe(true);
		expect(settings.themeMode).toBe("system");
		expect(settings.preserveOrientation).toBe(true);
	});

	it("migrates v1 to v3 applying both migrations", () => {
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
		const { settings, didMigrate } = migrateSettings({ file });
		expect(didMigrate).toBe(true);
		// v1->v2 migration
		expect(settings.preserveOrientation).toBe(false);
		expect(settings.preserveColorProfile).toBe(false);
		expect("preserveRotation" in settings).toBe(false);
		// v2->v3 migration
		expect(settings.themeMode).toBe("system");
		expect(settings.language).toBe("de");
	});

	it("migrates v0 and fills defaults", () => {
		const file = {
			version: 0,
			settings: {} as Settings,
		} as unknown as SettingsFile;
		const { settings, didMigrate } = migrateSettings({ file });
		expect(didMigrate).toBe(true);
		expect(settings.preserveOrientation).toBe(true);
		expect(settings.preserveColorProfile).toBe(true);
		expect(settings.saveAsCopy).toBe(true);
	});

	it("migrates Vietnamese locale code without changing an existing copy choice", () => {
		const file = {
			version: 3,
			settings: {
				...DEFAULT_SETTINGS,
				saveAsCopy: false,
				language: "vn",
			},
		} as SettingsFile;
		const { settings, didMigrate } = migrateSettings({ file });
		expect(didMigrate).toBe(true);
		expect(settings.language).toBe("vi");
		expect(settings.saveAsCopy).toBe(false);
	});
});

describe("v4 → v5 preserveResolution migration (FID-05, D-40)", () => {
	it("migrates a v4 object with non-default values for every other field to preserveResolution true, didMigrate true, and every other value unchanged (FID-05, D-40)", () => {
		const file = {
			version: 4,
			settings: {
				preserveOrientation: false,
				preserveColorProfile: false,
				saveAsCopy: false,
				removeXattrs: true,
				preserveTimestamps: true,
				language: "de",
				themeMode: "dark",
			},
		} as unknown as SettingsFile;
		const { settings, didMigrate } = migrateSettings({ file });
		expect(didMigrate).toBe(true);
		expect(settings).toEqual({
			preserveOrientation: false,
			preserveColorProfile: false,
			preserveResolution: true,
			saveAsCopy: false,
			removeXattrs: true,
			preserveTimestamps: true,
			language: "de",
			themeMode: "dark",
		});
	});

	it("migrates a v4 object with a stray preserveResolution false to true unconditionally, never inferred from another toggle (FID-05, D-40)", () => {
		const file = {
			version: 4,
			settings: {
				preserveOrientation: false,
				preserveColorProfile: false,
				preserveResolution: false,
				saveAsCopy: false,
				removeXattrs: true,
				preserveTimestamps: true,
				language: "de",
				themeMode: "dark",
			},
		} as unknown as SettingsFile;
		const { settings, didMigrate } = migrateSettings({ file });
		expect(didMigrate).toBe(true);
		expect(settings).toEqual({
			preserveOrientation: false,
			preserveColorProfile: false,
			preserveResolution: true,
			saveAsCopy: false,
			removeXattrs: true,
			preserveTimestamps: true,
			language: "de",
			themeMode: "dark",
		});
	});

	it("the full v1 to v5 chain lands on the v1 split, themeMode system and preserveResolution true (FID-05, D-40)", () => {
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
		const { settings, didMigrate } = migrateSettings({ file });
		expect(didMigrate).toBe(true);
		expect(settings).toEqual({
			preserveOrientation: false,
			preserveColorProfile: false,
			preserveResolution: true,
			saveAsCopy: true,
			removeXattrs: false,
			preserveTimestamps: false,
			language: "de",
			themeMode: "system",
		});
		expect("preserveRotation" in settings).toBe(false);
	});

	it("keeps a stored v5 preserveResolution false with didMigrate false (FID-05, D-40)", () => {
		const file: SettingsFile = {
			version: CURRENT_SCHEMA_VERSION,
			settings: {
				preserveOrientation: true,
				preserveColorProfile: true,
				preserveResolution: false,
				saveAsCopy: true,
				removeXattrs: false,
				preserveTimestamps: false,
				language: "fr",
				themeMode: "dark",
			},
		};
		const { settings, didMigrate } = migrateSettings({ file });
		expect(didMigrate).toBe(false);
		expect(settings).toEqual({
			preserveOrientation: true,
			preserveColorProfile: true,
			preserveResolution: false,
			saveAsCopy: true,
			removeXattrs: false,
			preserveTimestamps: false,
			language: "fr",
			themeMode: "dark",
		});
	});

	it("loads a v5 object missing preserveResolution as true via the defaults-merge short-circuit, every other stored value kept (FID-05, D-40)", () => {
		const file = {
			version: CURRENT_SCHEMA_VERSION,
			settings: {
				preserveOrientation: false,
				preserveColorProfile: true,
				saveAsCopy: false,
				removeXattrs: true,
				preserveTimestamps: true,
				language: "es",
				themeMode: "light",
			},
		} as unknown as SettingsFile;
		const { settings, didMigrate } = migrateSettings({ file });
		expect(didMigrate).toBe(false);
		expect(settings).toEqual({
			preserveOrientation: false,
			preserveColorProfile: true,
			preserveResolution: true,
			saveAsCopy: false,
			removeXattrs: true,
			preserveTimestamps: true,
			language: "es",
			themeMode: "light",
		});
	});

	it("migrating an already-migrated v5 result again is idempotent: identical settings, didMigrate false (FID-05, D-40)", () => {
		const file = {
			version: 4,
			settings: {
				preserveOrientation: false,
				preserveColorProfile: false,
				saveAsCopy: false,
				removeXattrs: true,
				preserveTimestamps: true,
				language: "de",
				themeMode: "dark",
			},
		} as unknown as SettingsFile;
		const first = migrateSettings({ file });
		expect(first.didMigrate).toBe(true);

		const second = migrateSettings({
			file: { version: CURRENT_SCHEMA_VERSION, settings: first.settings },
		});
		expect(second.didMigrate).toBe(false);
		expect(second.settings).toEqual(first.settings);
	});
});

describe("preserveResolution guard and validation (D-40)", () => {
	it("isSettingsFile accepts a valid boolean preserveResolution (FID-05, D-40)", () => {
		const valid = {
			version: CURRENT_SCHEMA_VERSION,
			settings: { ...DEFAULT_SETTINGS, preserveResolution: false },
		};
		expect(isSettingsFile(valid)).toBe(true);
	});

	it("isSettingsFile rejects a settings object missing preserveResolution (FID-05, D-40)", () => {
		const settings: Record<string, unknown> = { ...DEFAULT_SETTINGS };
		delete settings["preserveResolution"];
		expect(isSettingsFile({ version: CURRENT_SCHEMA_VERSION, settings })).toBe(
			false,
		);
	});

	it('isSettingsFile rejects a non-boolean preserveResolution ("yes") (FID-05, D-40)', () => {
		expect(
			isSettingsFile({
				version: CURRENT_SCHEMA_VERSION,
				settings: { ...DEFAULT_SETTINGS, preserveResolution: "yes" },
			}),
		).toBe(false);
	});

	it("validateSettings keeps a stored preserveResolution false (FID-05, D-40)", () => {
		const result = validateSettings({ input: { preserveResolution: false } });
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.value.preserveResolution).toBe(false);
		}
	});

	it('validateSettings falls back to true for a non-boolean preserveResolution ("yes") (FID-05, D-40)', () => {
		const result = validateSettings({ input: { preserveResolution: "yes" } });
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.value.preserveResolution).toBe(true);
		}
	});

	it("validateSettings defaults preserveResolution to true when missing (FID-05, D-40)", () => {
		const result = validateSettings({ input: {} });
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.value.preserveResolution).toBe(true);
		}
	});
});
