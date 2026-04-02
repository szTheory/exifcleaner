import { describe, it, expect, vi } from "vitest";
import { ExifToolAdapter } from "../../src/infrastructure/exiftool/exiftool_adapter";
import type { ExiftoolProcess } from "../../src/infrastructure/exiftool/ExiftoolProcess";

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

describe("ExifToolAdapter.readMetadata", () => {
	it("returns ok result with metadata array when process succeeds", async () => {
		const fakeProcess = makeFakeProcess();
		const adapter = new ExifToolAdapter({ process: fakeProcess });

		const result = await adapter.readMetadata({
			filePath: "/tmp/photo.jpg",
			args: ["-j"],
		});

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.value[0]?.FileName).toBe("test.jpg");
		}
	});

	it("returns process-not-open error when process throws", async () => {
		const fakeProcess = makeFakeProcess({
			readMetadata: vi.fn().mockRejectedValue(new Error("not open")),
		});
		const adapter = new ExifToolAdapter({ process: fakeProcess });

		const result = await adapter.readMetadata({
			filePath: "/tmp/photo.jpg",
			args: ["-j"],
		});

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error.code).toBe("process-not-open");
		}
	});

	it("returns exiftool-error when process result has non-null error", async () => {
		const fakeProcess = makeFakeProcess({
			readMetadata: vi
				.fn()
				.mockResolvedValue({ data: null, error: "File not found" }),
		});
		const adapter = new ExifToolAdapter({ process: fakeProcess });

		const result = await adapter.readMetadata({
			filePath: "/tmp/photo.jpg",
			args: ["-j"],
		});

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error.code).toBe("exiftool-error");
			if (result.error.code === "exiftool-error") {
				expect(result.error.detail).toBe("File not found");
			}
		}
	});

	it("returns exiftool-error with no-data message when data is null and error is null", async () => {
		const fakeProcess = makeFakeProcess({
			readMetadata: vi
				.fn()
				.mockResolvedValue({ data: null, error: null }),
		});
		const adapter = new ExifToolAdapter({ process: fakeProcess });

		const result = await adapter.readMetadata({
			filePath: "/tmp/photo.jpg",
			args: ["-j"],
		});

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error.code).toBe("exiftool-error");
			if (result.error.code === "exiftool-error") {
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
