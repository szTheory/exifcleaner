import { it, expect, describe, beforeEach } from "vitest";
import { StripMetadataCommand } from "../../src/application/strip_metadata_command";
import { FakeExifTool } from "../fakes/fake_exiftool";

let exiftool: FakeExifTool;
let command: StripMetadataCommand;

beforeEach(() => {
	exiftool = new FakeExifTool();
	command = new StripMetadataCommand({ exiftool });
});

describe("arg assembly", () => {
	it("always starts with -all= as first element", async () => {
		await command.execute({
			filePath: "/tmp/photo.jpg",
			preserveOrientation: false,
			preserveColorProfile: false,
			preserveTimestamps: false,
			saveAsCopy: false,
		});

		const args = exiftool.calls[0]!.args[1] as string[];
		expect(args[0]).toBe("-all=");
	});

	it("with preserveOrientation=true, preserveColorProfile=false: has -Orientation but NOT -ICC_Profile", async () => {
		await command.execute({
			filePath: "/tmp/photo.jpg",
			preserveOrientation: true,
			preserveColorProfile: false,
			preserveTimestamps: false,
			saveAsCopy: false,
		});

		const args = exiftool.calls[0]!.args[1] as string[];
		expect(args).toContain("-TagsFromFile");
		expect(args).toContain("@");
		expect(args).toContain("-Orientation");
		expect(args).not.toContain("-ICC_Profile");
	});

	it("with preserveOrientation=false, preserveColorProfile=true: has -ICC_Profile but NOT -Orientation", async () => {
		await command.execute({
			filePath: "/tmp/photo.jpg",
			preserveOrientation: false,
			preserveColorProfile: true,
			preserveTimestamps: false,
			saveAsCopy: false,
		});

		const args = exiftool.calls[0]!.args[1] as string[];
		expect(args).toContain("-TagsFromFile");
		expect(args).toContain("@");
		expect(args).toContain("-ICC_Profile");
		expect(args).not.toContain("-Orientation");
	});

	it("with both preserveOrientation=true and preserveColorProfile=true: has both tags", async () => {
		await command.execute({
			filePath: "/tmp/photo.jpg",
			preserveOrientation: true,
			preserveColorProfile: true,
			preserveTimestamps: false,
			saveAsCopy: false,
		});

		const args = exiftool.calls[0]!.args[1] as string[];
		expect(args).toContain("-TagsFromFile");
		expect(args).toContain("@");
		expect(args).toContain("-Orientation");
		expect(args).toContain("-ICC_Profile");
	});

	it("with both false: does NOT contain -TagsFromFile", async () => {
		await command.execute({
			filePath: "/tmp/photo.jpg",
			preserveOrientation: false,
			preserveColorProfile: false,
			preserveTimestamps: false,
			saveAsCopy: false,
		});

		const args = exiftool.calls[0]!.args[1] as string[];
		expect(args).not.toContain("-TagsFromFile");
	});

	it("with preserveTimestamps=true: args contain -P", async () => {
		await command.execute({
			filePath: "/tmp/photo.jpg",
			preserveOrientation: false,
			preserveColorProfile: false,
			preserveTimestamps: true,
			saveAsCopy: false,
		});

		const args = exiftool.calls[0]!.args[1] as string[];
		expect(args).toContain("-P");
	});

	it("with saveAsCopy=true: args contain -o and output path, NOT -overwrite_original", async () => {
		await command.execute({
			filePath: "/tmp/photo.jpg",
			preserveOrientation: false,
			preserveColorProfile: false,
			preserveTimestamps: false,
			saveAsCopy: true,
			outputPath: "/tmp/photo_cleaned.jpg",
		});

		const args = exiftool.calls[0]!.args[1] as string[];
		expect(args).toContain("-o");
		expect(args).toContain("/tmp/photo_cleaned.jpg");
		expect(args).not.toContain("-overwrite_original");
	});

	it("with saveAsCopy=false: args contain -overwrite_original and NOT -o", async () => {
		await command.execute({
			filePath: "/tmp/photo.jpg",
			preserveOrientation: false,
			preserveColorProfile: false,
			preserveTimestamps: false,
			saveAsCopy: false,
		});

		const args = exiftool.calls[0]!.args[1] as string[];
		expect(args).toContain("-overwrite_original");
		expect(args).not.toContain("-o");
	});

	it("uses correct flag order: -all= before -TagsFromFile", async () => {
		await command.execute({
			filePath: "/tmp/photo.jpg",
			preserveOrientation: true,
			preserveColorProfile: false,
			preserveTimestamps: false,
			saveAsCopy: false,
		});

		const args = exiftool.calls[0]!.args[1] as string[];
		const allIndex = args.indexOf("-all=");
		const tagsFromFileIndex = args.indexOf("-TagsFromFile");
		expect(allIndex).toBeLessThan(tagsFromFileIndex);
	});
});

describe("signal handling", () => {
	it("returns Aborted when signal is already aborted", async () => {
		const controller = new AbortController();
		controller.abort();

		const result = await command.execute({
			filePath: "/tmp/photo.jpg",
			preserveOrientation: false,
			preserveColorProfile: false,
			preserveTimestamps: false,
			saveAsCopy: false,
			signal: controller.signal,
		});

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toBe("Aborted");
		}
		expect(exiftool.calls).toHaveLength(0);
	});
});

describe("error handling", () => {
	it("returns error result when exiftool fails", async () => {
		exiftool.removeResult = { data: null, error: "Permission denied" };

		const result = await command.execute({
			filePath: "/tmp/photo.jpg",
			preserveOrientation: false,
			preserveColorProfile: false,
			preserveTimestamps: false,
			saveAsCopy: false,
		});

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toBe("Permission denied");
		}
	});
});
