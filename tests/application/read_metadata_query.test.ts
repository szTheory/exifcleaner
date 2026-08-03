import { it, expect, beforeEach } from "vitest";
import { ReadMetadataQuery } from "../../src/application/queries/read_metadata_query";
import { FakeExifTool } from "../fakes/fake_exiftool";

let exiftool: FakeExifTool;
let query: ReadMetadataQuery;

beforeEach(() => {
	exiftool = new FakeExifTool();
	query = new ReadMetadataQuery({ exiftool });
});

it("reads and cleans metadata from a file", async () => {
	exiftool.readResult = {
		ok: true,
		value: [
			{
				"System:Other:FileName": "test.jpg",
				SourceFile: "/tmp/test.jpg",
				"IFD0:Camera:Make": "Canon",
			},
		],
	};

	const result = await query.execute({ filePath: "/tmp/test.jpg" });

	expect(result.ok).toBe(true);
	if (result.ok) {
		expect(result.value).toEqual({ "Camera:Make": "Canon" });
		// SourceFile is a computed field and should be filtered out
		expect(result.value).not.toHaveProperty("SourceFile");
	}
	expect(exiftool.calls[0]).toEqual({
		method: "readMetadata",
		args: ["/tmp/test.jpg", ["-G1:2"]],
	});
});

it("returns empty object when no metadata entries", async () => {
	exiftool.readResult = { ok: true, value: [] };

	const result = await query.execute({ filePath: "/tmp/test.jpg" });

	expect(result.ok).toBe(true);
	if (result.ok) {
		expect(result.value).toEqual({});
	}
});

it("returns error when exiftool fails", async () => {
	exiftool.readResult = {
		ok: false,
		error: { code: "exiftool-error", detail: "File not found" },
	};

	const result = await query.execute({ filePath: "/tmp/test.jpg" });

	expect(result.ok).toBe(false);
	if (!result.ok) {
		expect(result.error.code).toBe("exiftool-error");
	}
});

it.each([
	["ExifTool:Error", "File format error"],
	["ExifTool:ExifTool:Warning", "JPEG format error"],
])("returns an error for an embedded %s diagnostic", async (key, detail) => {
	exiftool.readResult = {
		ok: true,
		value: [{ [key]: detail, "File:Other:FileType": "JPEG" }],
	};

	const result = await query.execute({ filePath: "/tmp/corrupt.jpg" });

	expect(result).toEqual({
		ok: false,
		error: { code: "exiftool-error", detail },
	});
});
