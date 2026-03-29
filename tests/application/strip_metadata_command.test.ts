import { it, expect, beforeEach } from "vitest";
import { StripMetadataCommand } from "../../src/application/strip_metadata_command";
import { FakeExifTool } from "../fakes/fake_exiftool";

let exiftool: FakeExifTool;
let command: StripMetadataCommand;

beforeEach(() => {
	exiftool = new FakeExifTool();
	command = new StripMetadataCommand({ exiftool });
});

it("strips metadata from a file with default settings", async () => {
	const result = await command.execute({
		filePath: "/tmp/photo.jpg",
		preserveRotation: false,
		preserveTimestamps: false,
	});

	expect(result.ok).toBe(true);
	expect(exiftool.calls).toHaveLength(1);
	const call = exiftool.calls[0]!;
	expect(call.method).toBe("removeMetadata");
	const args = call.args[1] as string[];
	expect(args).toContain("-all=");
	expect(args).toContain("-overwrite_original");
});

it("includes orientation preservation flags when preserveRotation is true", async () => {
	await command.execute({
		filePath: "/tmp/photo.jpg",
		preserveRotation: true,
		preserveTimestamps: false,
	});

	const args = exiftool.calls[0]!.args[1] as string[];
	expect(args).toContain("-TagsFromFile");
	expect(args).toContain("@");
	expect(args).toContain("-Orientation");
	expect(args).toContain("-ICC_Profile:all");
});

it("includes preserve flag when preserveTimestamps is true", async () => {
	await command.execute({
		filePath: "/tmp/photo.jpg",
		preserveRotation: false,
		preserveTimestamps: true,
	});

	const args = exiftool.calls[0]!.args[1] as string[];
	expect(args).toContain("-preserve");
});

it("returns error result when exiftool fails", async () => {
	exiftool.removeResult = { data: null, error: "Permission denied" };

	const result = await command.execute({
		filePath: "/tmp/photo.jpg",
		preserveRotation: false,
		preserveTimestamps: false,
	});

	expect(result.ok).toBe(false);
	if (!result.ok) {
		expect(result.error).toBe("Permission denied");
	}
});

it("respects abort signal", async () => {
	const controller = new AbortController();
	controller.abort();

	const result = await command.execute({
		filePath: "/tmp/photo.jpg",
		preserveRotation: false,
		preserveTimestamps: false,
		signal: controller.signal,
	});

	expect(result.ok).toBe(false);
	if (!result.ok) {
		expect(result.error).toBe("Aborted");
	}
	expect(exiftool.calls).toHaveLength(0);
});

it("uses correct flag order: -all= before -TagsFromFile", async () => {
	await command.execute({
		filePath: "/tmp/photo.jpg",
		preserveRotation: true,
		preserveTimestamps: false,
	});

	const args = exiftool.calls[0]!.args[1] as string[];
	const allIndex = args.indexOf("-all=");
	const tagsFromFileIndex = args.indexOf("-TagsFromFile");
	expect(allIndex).toBeLessThan(tagsFromFileIndex);
});
