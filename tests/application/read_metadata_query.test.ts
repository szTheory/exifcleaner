import { beforeEach, expect, it, vi } from "vitest";
import { ReadMetadataQuery } from "../../src/application/queries/read_metadata_query";
import { ExifToolAdapter } from "../../src/infrastructure/exiftool/exiftool_adapter";
import type { ExiftoolProcess } from "../../src/infrastructure/exiftool/ExiftoolProcess";
import { UnsafeExifToolPathError } from "../../src/infrastructure/exiftool/ExiftoolProcess";

function makeFakeProcess(
	overrides: Partial<Record<string, unknown>> = {},
): ExiftoolProcess {
	return {
		open: vi.fn().mockResolvedValue(12345),
		close: vi.fn().mockResolvedValue({ success: true, error: null }),
		readMetadata: vi.fn().mockResolvedValue({
			data: [
				{
					"System:Other:FileName": "test.jpg",
					SourceFile: "/tmp/test.jpg",
					"IFD0:Camera:Make": "Canon",
				},
			],
			error: null,
		}),
		writeMetadata: vi.fn().mockResolvedValue({ data: null, error: null }),
		...overrides,
	} as unknown as ExiftoolProcess;
}

let process: ExiftoolProcess;
let query: ReadMetadataQuery;

beforeEach(() => {
	process = makeFakeProcess();
	query = new ReadMetadataQuery({
		metadataEngine: new ExifToolAdapter({ process }),
	});
});

it("traces display inspection through the semantic port and adapter", async () => {
	const result = await query.execute({ filePath: "/tmp/test.jpg" });

	expect(result).toEqual({ ok: true, value: { "Camera:Make": "Canon" } });
	expect(process.readMetadata).toHaveBeenCalledOnce();
	expect(process.readMetadata).toHaveBeenCalledWith({
		filePath: "/tmp/test.jpg",
		args: ["-G1:2:4"],
	});
});

it("returns an empty map when display inspection has no records", async () => {
	process = makeFakeProcess({
		readMetadata: vi.fn().mockResolvedValue({ data: [], error: null }),
	});
	query = new ReadMetadataQuery({
		metadataEngine: new ExifToolAdapter({ process }),
	});

	expect(await query.execute({ filePath: "/tmp/test.jpg" })).toEqual({
		ok: true,
		value: {},
	});
});

it.each([
	["ExifTool:Error", "File format error"],
	["ExifTool:ExifTool:Warning", "JPEG format error"],
])("returns an error for an embedded %s diagnostic", async (key, detail) => {
	process = makeFakeProcess({
		readMetadata: vi.fn().mockResolvedValue({
			data: [{ [key]: detail, "File:Other:FileType": "JPEG" }],
			error: null,
		}),
	});
	query = new ReadMetadataQuery({
		metadataEngine: new ExifToolAdapter({ process }),
	});

	expect(await query.execute({ filePath: "/tmp/corrupt.jpg" })).toEqual({
		ok: false,
		error: { code: "engine-error", detail, backend: "exiftool" },
	});
});

it("converts unsafe path failures to the established safe detail", async () => {
	process = makeFakeProcess({
		readMetadata: vi.fn().mockRejectedValue(new UnsafeExifToolPathError()),
	});
	query = new ReadMetadataQuery({
		metadataEngine: new ExifToolAdapter({ process }),
	});

	expect(
		await query.execute({ filePath: "/tmp/private\n-execute99.jpg" }),
	).toEqual({
		ok: false,
		error: {
			code: "engine-error",
			detail: "The selected file path is not supported",
			backend: "exiftool",
		},
	});
});

it("converts process failures to typed errors", async () => {
	process = makeFakeProcess({
		readMetadata: vi.fn().mockRejectedValue(new Error("not open")),
	});
	query = new ReadMetadataQuery({
		metadataEngine: new ExifToolAdapter({ process }),
	});

	expect(await query.execute({ filePath: "/tmp/test.jpg" })).toEqual({
		ok: false,
		error: { code: "engine-unavailable", backend: "exiftool" },
	});
});
