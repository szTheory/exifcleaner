import { beforeEach, describe, expect, it } from "vitest";
import { VerifyGeneratedOutputQuery } from "../../src/application/queries/verify_generated_output";
import { FakeExifTool } from "../fakes/fake_exiftool";

let exiftool: FakeExifTool;
let query: VerifyGeneratedOutputQuery;

beforeEach(() => {
	// A successful generated artifact is one structured, recognized ExifTool record.
	exiftool = new FakeExifTool();
	exiftool.readResult = { ok: true, value: [{ FileType: "RAF" }] };
	query = new VerifyGeneratedOutputQuery({ exiftool });
});

describe("VerifyGeneratedOutputQuery", () => {
	it("reopens only the supplied generated path once", async () => {
		const generatedPath = "/tmp/sample_cleaned.raf";

		const result = await query.execute({ generatedPath });

		expect(result).toEqual({ ok: true, value: undefined });
		expect(exiftool.calls).toEqual([
			{
				method: "readMetadata",
				args: [
					generatedPath,
					["-G2", "-File:FileType", "-File:Error"],
				],
			},
		]);
	});

	it.each([
		{
			description: "port failure",
			setResult: () => {
				exiftool.readResult = { ok: false, error: { code: "exiftool-error", detail: "cannot read" } };
			},
		},
		{ description: "no records", setResult: () => { exiftool.readResult = { ok: true, value: [] }; } },
		{ description: "multiple records", setResult: () => { exiftool.readResult = { ok: true, value: [{ FileType: "RAF" }, { FileType: "RAF" }] }; } },
		{ description: "missing file type", setResult: () => { exiftool.readResult = { ok: true, value: [{ FileName: "sample.raf" }] }; } },
		{ description: "empty file type", setResult: () => { exiftool.readResult = { ok: true, value: [{ FileType: "" }] }; } },
		{ description: "ExifTool Error", setResult: () => { exiftool.readResult = { ok: true, value: [{ FileType: "RAF", Error: "bad output" }] }; } },
	])("rejects $description", async ({ setResult }) => {
		setResult();

		const result = await query.execute({ generatedPath: "/tmp/sample_cleaned.raf" });

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error.code).toBe("output-verification-failed");
		}
	});

	it("accepts a warning-only recognized record", async () => {
		exiftool.readResult = {
			ok: true,
			value: [{ FileType: "MP4", Warning: "minor container warning" }],
		};

		await expect(
			query.execute({ generatedPath: "/tmp/sample_cleaned.mp4" }),
		).resolves.toEqual({ ok: true, value: undefined });
	});
});
