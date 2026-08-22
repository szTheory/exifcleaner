import { it, expect } from "vitest";
import { FakeMetadataEngine } from "./fake_metadata_engine";
import { FakeSettings } from "./fake_settings";
import { FakeLogger } from "./fake_logger";

it("FakeMetadataEngine tracks semantic inspect calls and returns configured results", async () => {
	const fake = new FakeMetadataEngine();
	const result = await fake.inspect({
		source: "/test.jpg",
		purpose: "display",
	});
	expect(result.ok).toBe(true);
	if (result.ok) {
		expect(result.value).toEqual({
			metadata: { FileName: "test.jpg" },
			recordCount: 1,
			verification: { fileType: "JPEG", error: undefined },
		});
	}
	expect(fake.calls).toHaveLength(1);
	expect(fake.calls[0]).toEqual({
		method: "inspect",
		request: { source: "/test.jpg", purpose: "display" },
	});
});

it("FakeMetadataEngine sanitize returns success by default", async () => {
	const fake = new FakeMetadataEngine();
	const result = await fake.sanitize({
		source: "/test.jpg",
		preserveOrientation: true,
		preserveColorProfile: true,
		preserveTimestamps: false,
	});
	expect(result.ok).toBe(true);
	expect(fake.calls[0]).toEqual({
		method: "sanitize",
		request: {
			source: "/test.jpg",
			preserveOrientation: true,
			preserveColorProfile: true,
			preserveTimestamps: false,
		},
	});
});

it("FakeMetadataEngine allows configuring engine-neutral error results", async () => {
	const fake = new FakeMetadataEngine();
	fake.inspectResult = {
		ok: false,
		error: { code: "metadata-read-failed", detail: "File not found" },
	};
	const result = await fake.inspect({
		source: "/missing.jpg",
		purpose: "output-verification",
	});
	expect(result.ok).toBe(false);
	if (!result.ok) {
		expect(result.error.code).toBe("metadata-read-failed");
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
