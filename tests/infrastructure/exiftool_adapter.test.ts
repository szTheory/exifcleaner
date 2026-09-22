import { describe, it, expect, vi } from "vitest";
import { ExifToolAdapter } from "../../src/infrastructure/exiftool/exiftool_adapter";
import type { ExiftoolProcess } from "../../src/infrastructure/exiftool/ExiftoolProcess";
import { UnsafeExifToolPathError } from "../../src/infrastructure/exiftool/ExiftoolProcess";
import { QUICKTIME_DATE_REMOVAL_ARGS } from "../../src/domain/exif/exif";

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
	it("maps output verification to the historical file-only preset", async () => {
		const fakeProcess = makeFakeProcess({
			readMetadata: vi.fn().mockResolvedValue({
				data: [{ FileType: "RAF" }],
				error: null,
			}),
		});
		const adapter = new ExifToolAdapter({ process: fakeProcess });

		const result = await adapter.inspect({
			source: "/tmp/photo.raf",
			purpose: "output-verification",
		});

		expect(fakeProcess.readMetadata).toHaveBeenCalledWith({
			filePath: "/tmp/photo.raf",
			args: ["-File:FileType", "-File:Error"],
		});
		expect(result).toMatchObject({
			ok: true,
			value: {
				recordCount: 1,
				verification: { fileType: "RAF", error: undefined },
			},
		});
	});

	it("fails closed when the output-verification diagnostic scan returns no record", async () => {
		// Negative control for the #344 re-fold (48-06): master's pre-refactor
		// VerifyGeneratedOutputQuery rejected an empty diagnostic scan. The adapter must too --
		// recordCount reports the FIRST call's length, so a fail-open here would surface to the
		// caller as a healthy recordCount of 1 with no error, accepting a file ExifTool never
		// actually re-read. Mutating the guard back to `if (diagnosticRecord !== undefined)`
		// must make this test fail.
		const readMetadata = vi
			.fn()
			// First call: the plain-key FileType/Error scan succeeds with one record.
			.mockResolvedValueOnce({ data: [{ FileType: "JPEG" }], error: null })
			// Second call: the -G1:2:4 diagnostic scan yields nothing.
			.mockResolvedValueOnce({ data: [], error: null });
		const fakeProcess = makeFakeProcess({ readMetadata });
		const adapter = new ExifToolAdapter({ process: fakeProcess });

		const result = await adapter.inspect({
			source: "/tmp/generated.jpg",
			purpose: "output-verification",
		});

		expect(readMetadata).toHaveBeenCalledTimes(2);
		expect(result).toEqual({
			ok: false,
			error: {
				code: "engine-error",
				detail: "Expected exactly one ExifTool metadata record",
				backend: "exiftool",
			},
		});
	});

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
			args: ["-G1:2:4"],
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

describe("ExifToolAdapter.sanitize", () => {
	it("maps a basic in-place sanitize request to the historical write arguments", async () => {
		const fakeProcess = makeFakeProcess();
		const adapter = new ExifToolAdapter({ process: fakeProcess });

		const result = await adapter.sanitize({
			source: "/tmp/photo.jpg",
			outputMode: "overwrite",
			preserveOrientation: false,
			preserveColorProfile: false,
			preserveTimestamps: false,
		});

		expect(result).toEqual({ ok: true, value: undefined });
		expect(fakeProcess.writeMetadata).toHaveBeenCalledWith({
			filePath: "/tmp/photo.jpg",
			metadata: {},
			extraArgs: ["-all=", "-overwrite_original"],
		});
	});

	it.each([
		{
			name: "timestamp preservation",
			request: {
				preserveOrientation: false,
				preserveColorProfile: false,
				preserveTimestamps: true,
			},
			extraArgs: ["-all=", "-P", "-overwrite_original"],
		},
		{
			name: "orientation preservation",
			request: {
				preserveOrientation: true,
				preserveColorProfile: false,
				preserveTimestamps: false,
			},
			extraArgs: [
				"-all=",
				"-TagsFromFile",
				"@",
				"-Orientation",
				"-overwrite_original",
			],
		},
		{
			name: "ICC preservation",
			request: {
				preserveOrientation: false,
				preserveColorProfile: true,
				preserveTimestamps: false,
			},
			extraArgs: [
				"-all=",
				"-TagsFromFile",
				"@",
				"-ICC_Profile",
				"-overwrite_original",
			],
		},
		{
			name: "orientation and ICC preservation",
			request: {
				preserveOrientation: true,
				preserveColorProfile: true,
				preserveTimestamps: false,
			},
			extraArgs: [
				"-all=",
				"-TagsFromFile",
				"@",
				"-Orientation",
				"-ICC_Profile",
				"-overwrite_original",
			],
		},
		{
			name: "orientation and timestamp preservation",
			request: {
				preserveOrientation: true,
				preserveColorProfile: false,
				preserveTimestamps: true,
			},
			extraArgs: [
				"-all=",
				"-TagsFromFile",
				"@",
				"-Orientation",
				"-P",
				"-overwrite_original",
			],
		},
		{
			name: "ICC and timestamp preservation",
			request: {
				preserveOrientation: false,
				preserveColorProfile: true,
				preserveTimestamps: true,
			},
			extraArgs: [
				"-all=",
				"-TagsFromFile",
				"@",
				"-ICC_Profile",
				"-P",
				"-overwrite_original",
			],
		},
		{
			name: "all preservation settings",
			request: {
				preserveOrientation: true,
				preserveColorProfile: true,
				preserveTimestamps: true,
			},
			extraArgs: [
				"-all=",
				"-TagsFromFile",
				"@",
				"-Orientation",
				"-ICC_Profile",
				"-P",
				"-overwrite_original",
			],
		},
	])("preserves exact ordering for $name", async ({ request, extraArgs }) => {
		const fakeProcess = makeFakeProcess();
		const adapter = new ExifToolAdapter({ process: fakeProcess });

		await adapter.sanitize({
			source: "/tmp/photo.jpg",
			outputMode: "overwrite",
			...request,
		});

		expect(fakeProcess.writeMetadata).toHaveBeenCalledWith({
			filePath: "/tmp/photo.jpg",
			metadata: {},
			extraArgs,
		});
	});

	it.each(["video.mp4", "audio.m4a"])(
		"clears all measured QuickTime dates for %s before destination selection",
		async (fileName) => {
			const fakeProcess = makeFakeProcess();
			const adapter = new ExifToolAdapter({ process: fakeProcess });

			await adapter.sanitize({
				source: `/tmp/${fileName}`,
				destination: `/tmp/${fileName}.cleaned`,
				outputMode: "copy",
				preserveOrientation: false,
				preserveColorProfile: false,
				preserveTimestamps: false,
			});

			expect(fakeProcess.writeMetadata).toHaveBeenCalledWith({
				filePath: `/tmp/${fileName}`,
				metadata: {},
				extraArgs: [
					"-all=",
					"-QuickTime:CreateDate=",
					"-QuickTime:ModifyDate=",
					"-TrackCreateDate=",
					"-TrackModifyDate=",
					"-MediaCreateDate=",
					"-MediaModifyDate=",
					"-o",
					`/tmp/${fileName}.cleaned`,
				],
			});
		},
	);

	it("emits the exact default copy-mode TIFF argument list, including -CommonIFD0= (D-23)", async () => {
		const fakeProcess = makeFakeProcess();
		const adapter = new ExifToolAdapter({ process: fakeProcess });

		await adapter.sanitize({
			source: "/tmp/scan.tif",
			destination: "/tmp/scan.tif.cleaned",
			outputMode: "copy",
			preserveOrientation: true,
			preserveColorProfile: true,
			preserveTimestamps: false,
		});

		expect(fakeProcess.writeMetadata).toHaveBeenCalledWith({
			filePath: "/tmp/scan.tif",
			metadata: {},
			extraArgs: [
				"-all=",
				"-CommonIFD0=",
				"-TagsFromFile",
				"@",
				"-Orientation",
				"-ICC_Profile",
				"-o",
				"/tmp/scan.tif.cleaned",
			],
		});
	});

	it("emits the exact overwrite-mode .tiff argument list with preservation off (D-23)", async () => {
		const fakeProcess = makeFakeProcess();
		const adapter = new ExifToolAdapter({ process: fakeProcess });

		await adapter.sanitize({
			source: "/tmp/scan.tiff",
			outputMode: "overwrite",
			preserveOrientation: false,
			preserveColorProfile: false,
			preserveTimestamps: false,
		});

		expect(fakeProcess.writeMetadata).toHaveBeenCalledWith({
			filePath: "/tmp/scan.tiff",
			metadata: {},
			extraArgs: ["-all=", "-CommonIFD0=", "-overwrite_original"],
		});
	});

	it.each(["photo.dng", "photo.cr2", "photo.jpg", "video.mp4"])(
		"never pushes -CommonIFD0= for a non-TIFF source: %s (D-23)",
		async (fileName) => {
			const fakeProcess = makeFakeProcess();
			const adapter = new ExifToolAdapter({ process: fakeProcess });

			await adapter.sanitize({
				source: `/tmp/${fileName}`,
				outputMode: "overwrite",
				preserveOrientation: false,
				preserveColorProfile: false,
				preserveTimestamps: false,
			});

			const call = vi.mocked(fakeProcess.writeMetadata).mock.calls[0]?.[0];
			expect(call?.extraArgs).not.toContain("-CommonIFD0=");
		},
	);

	it("a .tif source's extraArgs share no element with QUICKTIME_DATE_REMOVAL_ARGS (D-23)", async () => {
		const fakeProcess = makeFakeProcess();
		const adapter = new ExifToolAdapter({ process: fakeProcess });

		await adapter.sanitize({
			source: "/tmp/scan.tif",
			outputMode: "overwrite",
			preserveOrientation: false,
			preserveColorProfile: false,
			preserveTimestamps: false,
		});

		const call = vi.mocked(fakeProcess.writeMetadata).mock.calls[0]?.[0];
		const overlap = (call?.extraArgs ?? []).filter((arg) =>
			(QUICKTIME_DATE_REMOVAL_ARGS as readonly string[]).includes(arg),
		);
		expect(overlap).toEqual([]);
	});

	it("does not start a process write for an already-aborted request", async () => {
		const fakeProcess = makeFakeProcess();
		const adapter = new ExifToolAdapter({ process: fakeProcess });
		const controller = new AbortController();
		controller.abort();

		await expect(
			adapter.sanitize({
				source: "/tmp/photo.jpg",
				outputMode: "overwrite",
				preserveOrientation: false,
				preserveColorProfile: false,
				preserveTimestamps: false,
				signal: controller.signal,
			}),
		).resolves.toEqual({
			ok: false,
			error: { code: "engine-error", detail: "Aborted" },
		});
		expect(fakeProcess.writeMetadata).not.toHaveBeenCalled();
	});

	it("converts unsafe paths and process failures to safe engine-neutral errors", async () => {
		const unsafeAdapter = new ExifToolAdapter({
			process: makeFakeProcess({
				writeMetadata: vi.fn().mockRejectedValue(new UnsafeExifToolPathError()),
			}),
		});
		const unavailableAdapter = new ExifToolAdapter({
			process: makeFakeProcess({
				writeMetadata: vi.fn().mockRejectedValue(new Error("not open")),
			}),
		});

		await expect(
			unsafeAdapter.sanitize({
				source: "/tmp/photo\n.jpg",
				outputMode: "overwrite",
				preserveOrientation: false,
				preserveColorProfile: false,
				preserveTimestamps: false,
			}),
		).resolves.toEqual({
			ok: false,
			error: {
				code: "engine-error",
				detail: "The selected file path is not supported",
				backend: "exiftool",
			},
		});
		await expect(
			unavailableAdapter.sanitize({
				source: "/tmp/photo.jpg",
				outputMode: "overwrite",
				preserveOrientation: false,
				preserveColorProfile: false,
				preserveTimestamps: false,
			}),
		).resolves.toEqual({
			ok: false,
			error: { code: "engine-unavailable", backend: "exiftool" },
		});
	});

	it("preserves the process result detail as safe engine-neutral provenance", async () => {
		const adapter = new ExifToolAdapter({
			process: makeFakeProcess({
				writeMetadata: vi
					.fn()
					.mockResolvedValue({ data: null, error: "Permission denied" }),
			}),
		});

		await expect(
			adapter.sanitize({
				source: "/tmp/photo.jpg",
				outputMode: "overwrite",
				preserveOrientation: false,
				preserveColorProfile: false,
				preserveTimestamps: false,
			}),
		).resolves.toEqual({
			ok: false,
			error: {
				code: "engine-error",
				detail: "Permission denied",
				backend: "exiftool",
			},
		});
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
