import { beforeEach, describe, expect, it } from "vitest";
import { VerifyGeneratedOutputQuery } from "../../src/application/queries/verify_generated_output_query";
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
	it("reopens the supplied generated path with both the FileType guard and the -G1:2 diagnostic scan", async () => {
		const generatedPath = "/tmp/sample_cleaned.raf";

		const result = await query.execute({ generatedPath });

		expect(result).toEqual({ ok: true, value: undefined });
		// Two calls, not one merged arg set: ExifTool's -G option renames every JSON key
		// (including File:FileType) to Group:Tag, so the plain-key FileType guard and the
		// classifyInspectionDiagnostics scan cannot share one readMetadata call.
		expect(exiftool.calls).toEqual([
			{
				method: "readMetadata",
				args: [generatedPath, ["-File:FileType", "-File:Error"]],
			},
			{
				method: "readMetadata",
				args: [generatedPath, ["-G1:2"]],
			},
		]);
	});

	it.each([
		{
			description: "port failure",
			setResult: () => {
				exiftool.readResult = {
					ok: false,
					error: { code: "exiftool-error", detail: "cannot read" },
				};
			},
		},
		{
			description: "no records",
			setResult: () => {
				exiftool.readResult = { ok: true, value: [] };
			},
		},
		{
			description: "multiple records",
			setResult: () => {
				exiftool.readResult = {
					ok: true,
					value: [{ FileType: "RAF" }, { FileType: "RAF" }],
				};
			},
		},
		{
			description: "missing file type",
			setResult: () => {
				exiftool.readResult = { ok: true, value: [{ FileName: "sample.raf" }] };
			},
		},
		{
			description: "empty file type",
			setResult: () => {
				exiftool.readResult = { ok: true, value: [{ FileType: "" }] };
			},
		},
		{
			description: "ExifTool-group Error",
			setResult: () => {
				exiftool.readResult = {
					ok: true,
					value: [{ FileType: "RAF", "ExifTool:Error": "bad output" }],
				};
			},
		},
		{
			description:
				"ExifTool-group Warning (approved scope addition: this path had no Warning scan before)",
			setResult: () => {
				exiftool.readResult = {
					ok: true,
					value: [
						{ FileType: "RAF", "ExifTool:Warning": "Bad offset for GPSInfo" },
					],
				};
			},
		},
		{
			description:
				"ExifTool-group [minor] Warning (output-verification stays strict; only display is lenient)",
			setResult: () => {
				exiftool.readResult = {
					ok: true,
					value: [
						{
							FileType: "RAF",
							"ExifTool:Warning":
								"[minor] Fixed incorrect URI for xmlns:MicrosoftPhoto",
						},
					],
				};
			},
		},
	])("rejects $description", async ({ setResult }) => {
		setResult();

		const result = await query.execute({
			generatedPath: "/tmp/sample_cleaned.raf",
		});

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error.code).toBe("output-verification-failed");
		}
	});

	it("accepts a non-ExifTool-group Warning tag (the policy only scans the ExifTool pseudo-group)", async () => {
		exiftool.readResult = {
			ok: true,
			value: [{ FileType: "MP4", Warning: "minor container warning" }],
		};

		await expect(
			query.execute({ generatedPath: "/tmp/sample_cleaned.mp4" }),
		).resolves.toEqual({ ok: true, value: undefined });
	});
});
