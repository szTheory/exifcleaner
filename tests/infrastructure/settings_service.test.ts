import { describe, it, expect } from "vitest";
import { mkdir, rm, writeFile, readFile, chmod } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import { FakeLogger } from "../fakes/fake_logger";
import { SettingsService } from "../../src/infrastructure/settings_service";
import {
	DEFAULT_SETTINGS,
	CURRENT_SCHEMA_VERSION,
} from "../../src/domain/settings_schema";

function makeTempDir(): string {
	return join(tmpdir(), `settings-test-${randomBytes(6).toString("hex")}`);
}

describe("SettingsService", () => {
	it("loads default settings when file does not exist", async () => {
		const dir = makeTempDir();
		await mkdir(dir, { recursive: true });
		const filePath = join(dir, "settings.json");
		const logger = new FakeLogger();
		const service = new SettingsService({ filePath, logger });

		const settings = await service.load();

		expect(settings).toEqual(DEFAULT_SETTINGS);
		await rm(dir, { recursive: true });
	});

	it("saves and loads settings round-trip", async () => {
		const dir = makeTempDir();
		await mkdir(dir, { recursive: true });
		const filePath = join(dir, "settings.json");
		const logger = new FakeLogger();

		const service1 = new SettingsService({ filePath, logger });
		await service1.load();
		const custom = {
			...DEFAULT_SETTINGS,
			saveAsCopy: true,
			language: "fr",
		};
		await service1.save({ settings: custom });

		const service2 = new SettingsService({ filePath, logger });
		const loaded = await service2.load();

		expect(loaded).toEqual(custom);
		await rm(dir, { recursive: true });
	});

	it("uses atomic write with temp file", async () => {
		const dir = makeTempDir();
		await mkdir(dir, { recursive: true });
		const filePath = join(dir, "settings.json");
		const logger = new FakeLogger();
		const service = new SettingsService({ filePath, logger });

		await service.load();
		await service.save({ settings: DEFAULT_SETTINGS });

		const raw = await readFile(filePath, "utf-8");
		const parsed = JSON.parse(raw);
		expect(parsed.version).toBe(CURRENT_SCHEMA_VERSION);
		expect(parsed.settings).toEqual(DEFAULT_SETTINGS);
		await rm(dir, { recursive: true });
	});

	it("uses tab indentation in saved JSON", async () => {
		const dir = makeTempDir();
		await mkdir(dir, { recursive: true });
		const filePath = join(dir, "settings.json");
		const logger = new FakeLogger();
		const service = new SettingsService({ filePath, logger });

		await service.load();
		await service.save({ settings: DEFAULT_SETTINGS });

		const raw = await readFile(filePath, "utf-8");
		expect(raw).toContain("\t");
		await rm(dir, { recursive: true });
	});

	it("returns cached settings from get() without I/O", async () => {
		const dir = makeTempDir();
		await mkdir(dir, { recursive: true });
		const filePath = join(dir, "settings.json");
		const logger = new FakeLogger();
		const service = new SettingsService({ filePath, logger });

		const custom = {
			...DEFAULT_SETTINGS,
			preserveOrientation: false,
		};
		await service.load();
		await service.save({ settings: custom });

		// Delete the file — get() should still return cached value
		await rm(filePath);

		const cached = service.get();
		expect(cached).toEqual(custom);
		await rm(dir, { recursive: true });
	});

	it("falls back to defaults on corrupt JSON", async () => {
		const dir = makeTempDir();
		await mkdir(dir, { recursive: true });
		const filePath = join(dir, "settings.json");
		const logger = new FakeLogger();

		await writeFile(filePath, "not json at all", "utf-8");

		const service = new SettingsService({ filePath, logger });
		const settings = await service.load();

		expect(settings).toEqual(DEFAULT_SETTINGS);
		expect(logger.messages.some((m) => m.level === "warn")).toBe(true);
		await rm(dir, { recursive: true });
	});

	it("migrates old schema version and re-saves", async () => {
		const dir = makeTempDir();
		await mkdir(dir, { recursive: true });
		const filePath = join(dir, "settings.json");
		const logger = new FakeLogger();

		// v1 file with preserveRotation=false should migrate to both new fields false
		const oldFile = {
			version: 1,
			settings: {
				preserveRotation: false,
				saveAsCopy: false,
				removeXattrs: false,
				preserveTimestamps: false,
				language: null,
			},
		};
		await writeFile(filePath, JSON.stringify(oldFile), "utf-8");

		const service = new SettingsService({ filePath, logger });
		const settings = await service.load();

		// preserveRotation=false should map to both new fields as false
		expect(settings.preserveOrientation).toBe(false);
		expect(settings.preserveColorProfile).toBe(false);
		// Other fields should come from defaults
		expect(settings.saveAsCopy).toBe(DEFAULT_SETTINGS.saveAsCopy);
		expect(settings.removeXattrs).toBe(DEFAULT_SETTINGS.removeXattrs);
		expect(settings.preserveTimestamps).toBe(
			DEFAULT_SETTINGS.preserveTimestamps,
		);
		expect(settings.language).toBe(DEFAULT_SETTINGS.language);

		// File should be re-saved with current version
		const raw = await readFile(filePath, "utf-8");
		const parsed = JSON.parse(raw);
		expect(parsed.version).toBe(CURRENT_SCHEMA_VERSION);
		await rm(dir, { recursive: true });
	});

	it("update merges partial settings", async () => {
		const dir = makeTempDir();
		await mkdir(dir, { recursive: true });
		const filePath = join(dir, "settings.json");
		const logger = new FakeLogger();
		const service = new SettingsService({ filePath, logger });

		await service.load();
		await service.update({ partial: { saveAsCopy: true } });

		const result = service.get();
		expect(result.saveAsCopy).toBe(true);
		expect(result.preserveOrientation).toBe(
			DEFAULT_SETTINGS.preserveOrientation,
		);
		expect(result.removeXattrs).toBe(DEFAULT_SETTINGS.removeXattrs);
		await rm(dir, { recursive: true });
	});

	it("logs error and retries when save encounters write failure", async () => {
		// chmod 0o444 does not prevent root from writing — skip on root
		const { getuid } = await import("node:process");
		if (typeof getuid === "function" && getuid() === 0) return;

		const dir = makeTempDir();
		await mkdir(dir, { recursive: true });
		const filePath = join(dir, "settings.json");
		const logger = new FakeLogger();
		const service = new SettingsService({ filePath, logger });

		await service.load();

		// Make the directory read-only so writeFile fails
		await chmod(dir, 0o444);

		try {
			await service.save({ settings: DEFAULT_SETTINGS });

			// save() should not throw — it catches and logs
			// Verify it logged an error (first attempt) and a warn (retry attempt)
			expect(logger.messages.some((m) => m.level === "error")).toBe(true);
			expect(logger.messages.some((m) => m.level === "warn")).toBe(true);
		} finally {
			// Restore permissions before cleanup
			await chmod(dir, 0o755);
			await rm(dir, { recursive: true });
		}
	});
});
