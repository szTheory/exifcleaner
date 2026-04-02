import { it, expect } from "vitest";
import { FakeExifTool } from "./fake_exiftool";
import { FakeSettings } from "./fake_settings";
import { FakeLogger } from "./fake_logger";

it("FakeExifTool tracks calls and returns configured results", async () => {
	const fake = new FakeExifTool();
	const result = await fake.readMetadata({
		filePath: "/test.jpg",
		args: ["-all"],
	});
	expect(result.ok).toBe(true);
	if (result.ok) {
		expect(result.value).toEqual([{ FileName: "test.jpg" }]);
	}
	expect(fake.calls).toHaveLength(1);
	expect(fake.calls[0]?.method).toBe("readMetadata");
});

it("FakeExifTool removeMetadata returns success by default", async () => {
	const fake = new FakeExifTool();
	const result = await fake.removeMetadata({
		filePath: "/test.jpg",
		args: ["-all="],
	});
	expect(result.ok).toBe(true);
});

it("FakeExifTool allows configuring error results", async () => {
	const fake = new FakeExifTool();
	fake.readResult = {
		ok: false,
		error: { code: "exiftool-error", detail: "File not found" },
	};
	const result = await fake.readMetadata({
		filePath: "/missing.jpg",
		args: [],
	});
	expect(result.ok).toBe(false);
	if (!result.ok) {
		expect(result.error.code).toBe("exiftool-error");
	}
});

it("FakeSettings initializes with DEFAULT_SETTINGS", async () => {
	const fake = new FakeSettings();
	const settings = fake.get();
	expect(settings.preserveOrientation).toBe(true);
	expect(settings.language).toBeNull();
});

it("FakeSettings update merges partial settings", async () => {
	const fake = new FakeSettings();
	await fake.update({ partial: { saveAsCopy: true } });
	const settings = fake.get();
	expect(settings.saveAsCopy).toBe(true);
	expect(settings.preserveOrientation).toBe(true);
});

it("FakeLogger records all messages with levels", () => {
	const fake = new FakeLogger();
	fake.info({ message: "started", context: { file: "test.jpg" } });
	fake.warn({ message: "slow" });
	fake.error({ message: "failed", context: { code: 1 } });
	expect(fake.messages).toHaveLength(3);
	expect(fake.messages[0]?.level).toBe("info");
	expect(fake.messages[1]?.level).toBe("warn");
	expect(fake.messages[2]?.level).toBe("error");
});
