import { describe, it, expect } from "vitest";
import { mkdtempSync } from "node:fs";
import { rm, writeFile, readFile, chmod } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { FakeLogger } from "../fakes/fake_logger";
import { SettingsService } from "../../src/infrastructure/settings_service";
import {
	DEFAULT_SETTINGS,
	CURRENT_SCHEMA_VERSION,
} from "../../src/domain/settings_schema";
import { snapshotDir, assertDirEffect } from "../helpers/dir_effect";

function makeTempDir(): string {
	return mkdtempSync(join(tmpdir(), "settings-test-"));
}

describe("SettingsService", () => {
	it("loads default settings when file does not exist", async () => {
		const dir = makeTempDir();
		const filePath = join(dir, "settings.json");
		const logger = new FakeLogger();
		const service = new SettingsService({ filePath, logger });

		const before = snapshotDir(dir);
		const settings = await service.load();
		const after = snapshotDir(dir);

		expect(settings).toEqual(DEFAULT_SETTINGS);
		// The file does not exist and load() never creates one on a cold read.
		assertDirEffect(before, after, { added: [], modified: [], removed: [] });
		await rm(dir, { recursive: true });
	});

	it("saves and loads settings round-trip", async () => {
		const dir = makeTempDir();
		const filePath = join(dir, "settings.json");
		const logger = new FakeLogger();

		const service1 = new SettingsService({ filePath, logger });

		const before = snapshotDir(dir);
		await service1.load();
		const custom = {
			...DEFAULT_SETTINGS,
			saveAsCopy: true,
			language: "fr",
		};
		await service1.save({ settings: custom });
		const after = snapshotDir(dir);

		assertDirEffect(before, after, {
			added: ["settings.json"],
			modified: [],
			removed: [],
		});

		const service2 = new SettingsService({ filePath, logger });
		const loaded = await service2.load();

		expect(loaded).toEqual(custom);
		await rm(dir, { recursive: true });
	});

	it("uses atomic write with temp file", async () => {
		const dir = makeTempDir();
		const filePath = join(dir, "settings.json");
		const logger = new FakeLogger();
		const service = new SettingsService({ filePath, logger });

		const before = snapshotDir(dir);
		await service.load();
		await service.save({ settings: DEFAULT_SETTINGS });
		const after = snapshotDir(dir);

		// The atomic-write scratch file (filePath + "." + random hex) must be
		// renamed away by the time save() resolves -- a lingering scratch file
		// here would surface as an unnamed added file, which this call is what
		// actually checks the "atomic" claim in this test's own name.
		assertDirEffect(before, after, {
			added: ["settings.json"],
			modified: [],
			removed: [],
		});

		const raw = await readFile(filePath, "utf-8");
		const parsed = JSON.parse(raw);
		expect(parsed.version).toBe(CURRENT_SCHEMA_VERSION);
		expect(parsed.settings).toEqual(DEFAULT_SETTINGS);
		await rm(dir, { recursive: true });
	});

	it("uses tab indentation in saved JSON", async () => {
		const dir = makeTempDir();
		const filePath = join(dir, "settings.json");
		const logger = new FakeLogger();
		const service = new SettingsService({ filePath, logger });

		const before = snapshotDir(dir);
		await service.load();
		await service.save({ settings: DEFAULT_SETTINGS });
		const after = snapshotDir(dir);

		assertDirEffect(before, after, {
			added: ["settings.json"],
			modified: [],
			removed: [],
		});

		const raw = await readFile(filePath, "utf-8");
		expect(raw).toContain("\t");
		await rm(dir, { recursive: true });
	});

	it("returns cached settings from get() without I/O", async () => {
		const dir = makeTempDir();
		const filePath = join(dir, "settings.json");
		const logger = new FakeLogger();
		const service = new SettingsService({ filePath, logger });

		const custom = {
			...DEFAULT_SETTINGS,
			preserveOrientation: false,
		};

		const before = snapshotDir(dir);
		await service.load();
		await service.save({ settings: custom });
		const after = snapshotDir(dir);

		assertDirEffect(before, after, {
			added: ["settings.json"],
			modified: [],
			removed: [],
		});

		// Delete the file — get() should still return cached value
		await rm(filePath);

		const cached = service.get();
		expect(cached).toEqual(custom);
		await rm(dir, { recursive: true });
	});

	it("falls back to defaults on corrupt JSON", async () => {
		const dir = makeTempDir();
		const filePath = join(dir, "settings.json");
		const logger = new FakeLogger();

		await writeFile(filePath, "not json at all", "utf-8");

		const service = new SettingsService({ filePath, logger });

		const before = snapshotDir(dir);
		const settings = await service.load();
		const after = snapshotDir(dir);

		expect(settings).toEqual(DEFAULT_SETTINGS);
		expect(logger.messages.some((m) => m.level === "warn")).toBe(true);
		// A corrupt file is never self-healed by a cold read -- load() falls back
		// to in-memory defaults and leaves the bad bytes on disk exactly as found.
		assertDirEffect(before, after, { unchanged: ["settings.json"] });
		await rm(dir, { recursive: true });
	});

	it("migrates old schema version and re-saves", async () => {
		const dir = makeTempDir();
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

		const beforeWrite = snapshotDir(dir);
		await writeFile(filePath, JSON.stringify(oldFile), "utf-8");
		const afterWrite = snapshotDir(dir);
		assertDirEffect(beforeWrite, afterWrite, {
			added: ["settings.json"],
			modified: [],
			removed: [],
		});

		const service = new SettingsService({ filePath, logger });

		const beforeLoad = snapshotDir(dir);
		const settings = await service.load();
		const afterLoad = snapshotDir(dir);

		// load() detects the legacy schema and re-saves in the current format --
		// a second, distinct disk write from the manual setup write above, so it
		// gets its own before/after pair rather than folding into the first.
		assertDirEffect(beforeLoad, afterLoad, {
			modified: ["settings.json"],
			added: [],
			removed: [],
		});

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
		const filePath = join(dir, "settings.json");
		const logger = new FakeLogger();
		const service = new SettingsService({ filePath, logger });

		await service.load();

		const before = snapshotDir(dir);
		await service.update({ partial: { saveAsCopy: true } });
		const after = snapshotDir(dir);

		assertDirEffect(before, after, {
			added: ["settings.json"],
			modified: [],
			removed: [],
		});

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
		const filePath = join(dir, "settings.json");
		const logger = new FakeLogger();
		const service = new SettingsService({ filePath, logger });

		await service.load();

		// Make the directory read-only so writeFile fails
		await chmod(dir, 0o444);

		try {
			const before = snapshotDir(dir);
			await service.save({ settings: DEFAULT_SETTINGS });
			const after = snapshotDir(dir);

			// save() should not throw — it catches and logs
			// Verify it logged an error (first attempt) and a warn (retry attempt)
			expect(logger.messages.some((m) => m.level === "error")).toBe(true);
			expect(logger.messages.some((m) => m.level === "warn")).toBe(true);
			// Both write attempts fail before the rename step, so nothing lands
			// on disk -- the retry path must not leave a partial scratch file.
			assertDirEffect(before, after, { added: [], modified: [], removed: [] });
		} finally {
			// Restore permissions before cleanup
			await chmod(dir, 0o755);
			await rm(dir, { recursive: true });
		}
	});
});
