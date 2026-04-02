import { it, expect, describe } from "vitest";
import { generateCleanedPath } from "../../src/domain/files/cleaned_path";

describe("generateCleanedPath", () => {
	it("appends _cleaned suffix when no collision", () => {
		const result = generateCleanedPath({
			filePath: "/dir/photo.jpg",
			exists: () => false,
		});
		expect(result).toBe("/dir/photo_cleaned.jpg");
	});

	it("increments counter on collision", () => {
		const existing = new Set(["/dir/photo_cleaned.jpg"]);
		const result = generateCleanedPath({
			filePath: "/dir/photo.jpg",
			exists: (p) => existing.has(p),
		});
		expect(result).toBe("/dir/photo_cleaned_2.jpg");
	});

	it("increments counter multiple times for repeated collisions", () => {
		const existing = new Set([
			"/dir/photo_cleaned.jpg",
			"/dir/photo_cleaned_2.jpg",
		]);
		const result = generateCleanedPath({
			filePath: "/dir/photo.jpg",
			exists: (p) => existing.has(p),
		});
		expect(result).toBe("/dir/photo_cleaned_3.jpg");
	});

	it("handles filenames with multiple dots", () => {
		const result = generateCleanedPath({
			filePath: "/dir/file.name.jpg",
			exists: () => false,
		});
		expect(result).toBe("/dir/file.name_cleaned.jpg");
	});

	it("handles files with no extension", () => {
		const result = generateCleanedPath({
			filePath: "/dir/noext",
			exists: () => false,
		});
		expect(result).toBe("/dir/noext_cleaned");
	});
});
