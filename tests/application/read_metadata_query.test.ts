import { it, expect, beforeEach } from "vitest";
import { ReadMetadataQuery } from "../../src/application/read_metadata_query";
import { FakeExifTool } from "../fakes/fake_exiftool";

let exiftool: FakeExifTool;
let query: ReadMetadataQuery;

beforeEach(() => {
	exiftool = new FakeExifTool();
	query = new ReadMetadataQuery({ exiftool });
});

it("reads and cleans metadata from a file", async () => {
	exiftool.readResult = {
		data: [{ FileName: "test.jpg", SourceFile: "/tmp/test.jpg", Make: "Canon" }],
		error: null,
	};

	const result = await query.execute({ filePath: "/tmp/test.jpg" });

	expect(result.ok).toBe(true);
	if (result.ok) {
		expect(result.value).toHaveProperty("FileName");
		expect(result.value).toHaveProperty("Make");
		// SourceFile is a computed field and should be filtered out
		expect(result.value).not.toHaveProperty("SourceFile");
	}
});

it("returns empty object when no metadata entries", async () => {
	exiftool.readResult = { data: [], error: null };

	const result = await query.execute({ filePath: "/tmp/test.jpg" });

	expect(result.ok).toBe(true);
	if (result.ok) {
		expect(result.value).toEqual({});
	}
});

it("returns error when exiftool fails", async () => {
	exiftool.readResult = { data: null, error: "File not found" };

	const result = await query.execute({ filePath: "/tmp/test.jpg" });

	expect(result.ok).toBe(false);
	if (!result.ok) {
		expect(result.error).toBe("File not found");
	}
});
