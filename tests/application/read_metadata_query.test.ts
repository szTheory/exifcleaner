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
		// -G4 disambiguates co-occurring ExifTool-group diagnostics (48-D06-SETTLEMENT.md);
		// cleanExifData strips the CopyN segment it adds back off ordinary tag names.
		args: ["/tmp/test.jpg", ["-G1:2:4"]],
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

it("is lenient on a [minor]-prefixed ExifTool:Warning (issue #344, D-03 display leniency)", async () => {
	exiftool.readResult = {
		ok: true,
		value: [
			{
				"ExifTool:Warning":
					"[minor] Fixed incorrect URI for xmlns:MicrosoftPhoto",
				"File:Other:FileType": "JPEG",
			},
		],
	};

	const result = await query.execute({ filePath: "/tmp/issue344.jpg" });

	expect(result.ok).toBe(true);
});

it("stays fatal when a non-minor warning co-occurs with a [minor] one under a family-4 CopyN key (NC-4, D-06)", async () => {
	exiftool.readResult = {
		ok: true,
		value: [
			{
				"ExifTool:Warning": "Bad offset for IFD1 Make",
				"ExifTool:Copy1:Warning":
					"[minor] Fixed incorrect URI for xmlns:MicrosoftPhoto",
				"File:Other:FileType": "JPEG",
			},
		],
	};

	const result = await query.execute({ filePath: "/tmp/cooccurrence.jpg" });

	expect(result).toEqual({
		ok: false,
		error: {
			code: "exiftool-error",
			detail: "Bad offset for IFD1 Make",
		},
	});
});

it("normalizes a family-4 CopyN duplicate tag key back to its ordinary display name", async () => {
	exiftool.readResult = {
		ok: true,
		value: [
			{
				"IFD0:Camera:Make": "TestCamera",
				"IFD0:Camera:Copy1:Make": "TestCamera",
			},
		],
	};

	const result = await query.execute({ filePath: "/tmp/duplicate-tag.jpg" });

	expect(result.ok).toBe(true);
	if (result.ok) {
		// Both duplicate JSON entries normalize to the same displayed key -- the second
		// overwrites the first in the returned object, matching pre-#344 -G1:2 behaviour
		// where only one survived in ExifTool's own JSON output.
		expect(result.value).toEqual({ "Camera:Make": "TestCamera" });
	}
});
