import { describe, expect, it } from "vitest";
import { FileProcessingStatus } from "../../src/domain";
import type { FileEntry } from "../../src/renderer/contexts/AppContext";
import { sortFiles } from "../../src/renderer/components/file-list/FileTable";

function entry(name: string, overrides: Partial<FileEntry> = {}): FileEntry {
	return {
		id: name,
		path: `/tmp/${name}`,
		name,
		extension: name.split(".").at(-1)?.toUpperCase() ?? "",
		size: 100,
		folder: null,
		status: FileProcessingStatus.Complete,
		beforeTags: 2,
		afterTags: 0,
		beforeMetadata: {},
		afterMetadata: {},
		error: null,
		...overrides,
	};
}

describe("file table sorting", () => {
	it("uses natural, stable name ordering", () => {
		const files = [
			entry("photo10.jpg"),
			entry("photo2.jpg"),
			entry("photo2.jpg", { id: "second" }),
		];
		expect(
			sortFiles(files, { key: "name", direction: "ascending" }).map(
				(file) => file.id,
			),
		).toEqual(["photo2.jpg", "second", "photo10.jpg"]);
	});

	it("sorts source size and before/after counts numerically", () => {
		const files = [
			entry("large.jpg", { size: 900, beforeTags: 1, afterTags: 1 }),
			entry("small.jpg", { size: 100, beforeTags: 9, afterTags: 0 }),
		];
		expect(
			sortFiles(files, { key: "size", direction: "ascending" })[0]?.name,
		).toBe("small.jpg");
		expect(
			sortFiles(files, { key: "before", direction: "descending" })[0]?.name,
		).toBe("small.jpg");
		expect(
			sortFiles(files, { key: "after", direction: "ascending" })[0]?.name,
		).toBe("small.jpg");
	});

	it("keeps in-progress work and errors after completed results", () => {
		const files = [
			entry("error.jpg", { status: FileProcessingStatus.Error }),
			entry("pending.jpg", { status: FileProcessingStatus.Pending }),
			entry("done.jpg"),
		];
		expect(
			sortFiles(files, { key: "name", direction: "ascending" }).map(
				(file) => file.name,
			),
		).toEqual(["done.jpg", "pending.jpg", "error.jpg"]);
	});
});
