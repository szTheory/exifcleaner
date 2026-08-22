import { describe, it, expect, vi } from "vitest";
import { ExifToolAdapter } from "../../src/infrastructure/exiftool/exiftool_adapter";
import type { ExiftoolProcess } from "../../src/infrastructure/exiftool/ExiftoolProcess";
import { UnsafeExifToolPathError } from "../../src/infrastructure/exiftool/ExiftoolProcess";

function makeFakeProcess(overrides: Partial<Record<string, unknown>> = {}) {
	return {
		open: vi.fn().mockResolvedValue(12345),
		close: vi.fn().mockResolvedValue({ success: true, error: null }),
		readMetadata: vi.fn().mockResolvedValue({
			data: [{ FileName: "test.jpg", FileSize: "1024" }],
			error: null,
		}),
		writeMetadata: vi.fn().mockResolvedValue({ data: null, error: null }),
		...overrides,
	} as unknown as ExiftoolProcess;
}

describe("ExifToolAdapter.inspect", () => {
	it("maps display inspection to the historical grouped preset", async () => {
		const fakeProcess = makeFakeProcess();
		const adapter = new ExifToolAdapter({ process: fakeProcess });

		const result = await adapter.inspect({
			source: "/tmp/photo.jpg",
			purpose: "display",
		});

		expect(fakeProcess.readMetadata).toHaveBeenCalledOnce();
		expect(fakeProcess.readMetadata).toHaveBeenCalledWith({
			filePath: "/tmp/photo.jpg",
			args: ["-G1:2"],
		});
		expect(result).toEqual({
			ok: true,
			value: {
				metadata: { FileName: "test.jpg", FileSize: "1024" },
				recordCount: 1,
				verification: { fileType: undefined, error: undefined },
			},
		});
	});

	it("returns an empty normalized map when no records are found", async () => {
		const fakeProcess = makeFakeProcess({
			readMetadata: vi.fn().mockResolvedValue({ data: [], error: null }),
		});
		const adapter = new ExifToolAdapter({ process: fakeProcess });

		expect(
			await adapter.inspect({ source: "/tmp/photo.jpg", purpose: "display" }),
		).toEqual({
			ok: true,
			value: {
				metadata: {},
				recordCount: 0,
				verification: { fileType: undefined, error: undefined },
			},
		});
	});

	it.each([
		["ExifTool:Error", "File format error"],
		["ExifTool:ExifTool:Warning", "JPEG format error"],
	])("converts embedded %s diagnostics", async (key, detail) => {
		const fakeProcess = makeFakeProcess({
			readMetadata: vi
				.fn()
				.mockResolvedValue({ data: [{ [key]: detail }], error: null }),
		});
		const adapter = new ExifToolAdapter({ process: fakeProcess });

		expect(
			await adapter.inspect({ source: "/tmp/photo.jpg", purpose: "display" }),
		).toEqual({
			ok: false,
			error: { code: "engine-error", detail, backend: "exiftool" },
		});
	});

	it("returns engine-unavailable when process throws", async () => {
		const fakeProcess = makeFakeProcess({
			readMetadata: vi.fn().mockRejectedValue(new Error("not open")),
		});
		const adapter = new ExifToolAdapter({ process: fakeProcess });

		const result = await adapter.inspect({
			source: "/tmp/photo.jpg",
			purpose: "display",
		});

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toEqual({
				code: "engine-unavailable",
				backend: "exiftool",
			});
		}
	});

	it("returns a safe typed error for a protocol-unsafe path", async () => {
		const fakeProcess = makeFakeProcess({
			readMetadata: vi.fn().mockRejectedValue(new UnsafeExifToolPathError()),
		});
		const adapter = new ExifToolAdapter({ process: fakeProcess });

		const result = await adapter.inspect({
			source: "/tmp/private\n-execute99.jpg",
			purpose: "display",
		});

		expect(result).toEqual({
			ok: false,
			error: {
				code: "engine-error",
				detail: "The selected file path is not supported",
				backend: "exiftool",
			},
		});
	});

	it("returns engine-error when process reports an error", async () => {
		const fakeProcess = makeFakeProcess({
			readMetadata: vi
				.fn()
				.mockResolvedValue({ data: null, error: "File not found" }),
		});
		const adapter = new ExifToolAdapter({ process: fakeProcess });

		const result = await adapter.inspect({
			source: "/tmp/photo.jpg",
			purpose: "display",
		});

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error.code).toBe("engine-error");
			if (result.error.code === "engine-error") {
				expect(result.error.detail).toBe("File not found");
				expect(result.error.backend).toBe("exiftool");
			}
		}
	});

	it("returns engine-error with no-data message when process has no data", async () => {
		const fakeProcess = makeFakeProcess({
			readMetadata: vi.fn().mockResolvedValue({ data: null, error: null }),
		});
		const adapter = new ExifToolAdapter({ process: fakeProcess });

		const result = await adapter.inspect({
			source: "/tmp/photo.jpg",
			purpose: "display",
		});

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error.code).toBe("engine-error");
			if (result.error.code === "engine-error") {
				expect(result.error.detail).toBe("No data returned");
			}
		}
	});
});

describe("ExifToolAdapter.removeMetadata", () => {
	it("returns ok result on successful metadata removal", async () => {
		const fakeProcess = makeFakeProcess();
		const adapter = new ExifToolAdapter({ process: fakeProcess });

		const result = await adapter.removeMetadata({
			filePath: "/tmp/photo.jpg",
			args: ["-all=", "-overwrite_original"],
		});

		expect(result.ok).toBe(true);
	});

	it("passes args as extraArgs to writeMetadata", async () => {
		const fakeProcess = makeFakeProcess();
		const adapter = new ExifToolAdapter({ process: fakeProcess });

		await adapter.removeMetadata({
			filePath: "/tmp/photo.jpg",
			args: ["-all=", "-overwrite_original"],
		});

		expect(fakeProcess.writeMetadata).toHaveBeenCalledWith({
			filePath: "/tmp/photo.jpg",
			metadata: {},
			extraArgs: ["-all=", "-overwrite_original"],
		});
	});

	it("returns process-not-open error when process throws", async () => {
		const fakeProcess = makeFakeProcess({
			writeMetadata: vi.fn().mockRejectedValue(new Error("not open")),
		});
		const adapter = new ExifToolAdapter({ process: fakeProcess });

		const result = await adapter.removeMetadata({
			filePath: "/tmp/photo.jpg",
			args: ["-all=", "-overwrite_original"],
		});

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error.code).toBe("process-not-open");
		}
	});

	it("returns a safe typed error for an unsafe generated output path", async () => {
		const fakeProcess = makeFakeProcess({
			writeMetadata: vi.fn().mockRejectedValue(new UnsafeExifToolPathError()),
		});
		const adapter = new ExifToolAdapter({ process: fakeProcess });

		const result = await adapter.removeMetadata({
			filePath: "/tmp/photo_cleaned.jpg\r-overwrite_original",
			args: ["-all="],
		});

		expect(result).toEqual({
			ok: false,
			error: {
				code: "exiftool-error",
				detail: "The selected file path is not supported",
			},
		});
	});

	it("returns exiftool-error when process result has non-null error", async () => {
		const fakeProcess = makeFakeProcess({
			writeMetadata: vi
				.fn()
				.mockResolvedValue({ data: null, error: "Permission denied" }),
		});
		const adapter = new ExifToolAdapter({ process: fakeProcess });

		const result = await adapter.removeMetadata({
			filePath: "/tmp/photo.jpg",
			args: ["-all=", "-overwrite_original"],
		});

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error.code).toBe("exiftool-error");
		}
	});
});

describe("ExifToolAdapter.close", () => {
	it("returns ok result when close succeeds", async () => {
		const fakeProcess = makeFakeProcess();
		const adapter = new ExifToolAdapter({ process: fakeProcess });

		const result = await adapter.close();

		expect(result.ok).toBe(true);
	});

	it("returns error string when close fails", async () => {
		const fakeProcess = makeFakeProcess({
			close: vi
				.fn()
				.mockResolvedValue({ success: false, error: new Error("timeout") }),
		});
		const adapter = new ExifToolAdapter({ process: fakeProcess });

		const result = await adapter.close();

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(typeof result.error).toBe("string");
			expect(result.error.length).toBeGreaterThan(0);
		}
	});
});
