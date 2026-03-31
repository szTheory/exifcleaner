import { it, expect, beforeEach } from "vitest";
import { ProcessFilesUseCase } from "../../src/application/process_files_use_case";
import type { FileResult } from "../../src/application/process_files_use_case";
import { StripMetadataCommand } from "../../src/application/commands/strip_metadata_command";
import { ReadMetadataQuery } from "../../src/application/queries/read_metadata_query";
import { ExpandFolderCommand } from "../../src/application/commands/expand_folder_command";
import { FakeExifTool } from "../fakes/fake_exiftool";
import { FakeSettings } from "../fakes/fake_settings";
import { FakeLogger } from "../fakes/fake_logger";
import { FakeXattrCommand } from "../fakes/fake_xattr";

let exiftool: FakeExifTool;
let settings: FakeSettings;
let logger: FakeLogger;
let xattr: FakeXattrCommand;
let useCase: ProcessFilesUseCase;

beforeEach(() => {
	exiftool = new FakeExifTool();
	settings = new FakeSettings();
	logger = new FakeLogger();
	xattr = new FakeXattrCommand();
	const stripMetadata = new StripMetadataCommand({ exiftool });
	const readMetadata = new ReadMetadataQuery({ exiftool });
	const expandFolder = new ExpandFolderCommand();
	useCase = new ProcessFilesUseCase({
		stripMetadata,
		readMetadata,
		expandFolder,
		xattr,
		settings,
		logger,
	});
});

it("processes files and calls onProgress for each", async () => {
	const progressCalls: FileResult[] = [];

	const result = await useCase.execute({
		paths: ["/tmp/a.jpg", "/tmp/b.jpg"],
		onProgress: (r) => progressCalls.push(r),
	});

	expect(result.ok).toBe(true);
	if (result.ok) {
		expect(result.value).toHaveLength(2);
	}
	expect(progressCalls).toHaveLength(2);
});

it("continues processing after per-file failure", async () => {
	let callCount = 0;
	const originalRemove = exiftool.removeMetadata.bind(exiftool);
	exiftool.removeMetadata = async (filePath: string, args: string[]) => {
		callCount++;
		if (callCount === 1) {
			return { data: null, error: "Failed on first file" };
		}
		return originalRemove(filePath, args);
	};

	const result = await useCase.execute({
		paths: ["/tmp/a.jpg", "/tmp/b.jpg"],
	});

	expect(result.ok).toBe(true);
	if (result.ok) {
		expect(result.value).toHaveLength(2);
		expect(result.value[0]!.status).toBe("error");
		expect(result.value[1]!.status).toBe("success");
	}
});

it("stops processing when signal is aborted", async () => {
	const controller = new AbortController();
	let processedCount = 0;

	const originalRemove = exiftool.removeMetadata.bind(exiftool);
	exiftool.removeMetadata = async (filePath: string, args: string[]) => {
		processedCount++;
		// Abort after processing first file
		controller.abort();
		return originalRemove(filePath, args);
	};

	const result = await useCase.execute({
		paths: ["/tmp/a.jpg", "/tmp/b.jpg", "/tmp/c.jpg"],
		signal: controller.signal,
	});

	expect(result.ok).toBe(true);
	if (result.ok) {
		// First file should process, rest should be skipped
		const successes = result.value.filter((r) => r.status === "success");
		const skipped = result.value.filter((r) => r.status === "skipped");
		expect(successes.length).toBeGreaterThanOrEqual(1);
		expect(skipped.length).toBeGreaterThanOrEqual(1);
	}
});

it("reads settings from SettingsPort", async () => {
	await settings.update({ preserveOrientation: true });

	await useCase.execute({
		paths: ["/tmp/a.jpg"],
	});

	// Check that the strip command received preserveOrientation via args
	const removeCalls = exiftool.calls.filter(
		(c) => c.method === "removeMetadata",
	);
	expect(removeCalls).toHaveLength(1);
	const args = removeCalls[0]!.args[1] as string[];
	expect(args).toContain("-TagsFromFile");
});

it("passes generateCleanedPath output when saveAsCopy is true", async () => {
	await settings.update({ saveAsCopy: true });

	await useCase.execute({
		paths: ["/tmp/a.jpg"],
	});

	const removeCalls = exiftool.calls.filter(
		(c) => c.method === "removeMetadata",
	);
	expect(removeCalls).toHaveLength(1);
	const args = removeCalls[0]!.args[1] as string[];
	expect(args).toContain("-o");
	// Output path should contain _cleaned
	const oIndex = args.indexOf("-o");
	expect(args[oIndex + 1]).toContain("_cleaned");
});

it("calls xattr after successful strip when removeXattrs is enabled", async () => {
	await settings.update({ removeXattrs: true });

	await useCase.execute({
		paths: ["/tmp/a.jpg"],
	});

	expect(xattr.calls).toHaveLength(1);
	expect(xattr.calls[0]!.filePath).toBe("/tmp/a.jpg");
});

it("does not call xattr when removeXattrs is disabled", async () => {
	await settings.update({ removeXattrs: false });

	await useCase.execute({
		paths: ["/tmp/a.jpg"],
	});

	expect(xattr.calls).toHaveLength(0);
});
