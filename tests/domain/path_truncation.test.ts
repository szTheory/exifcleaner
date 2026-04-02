import { describe, it, expect } from "vitest";
import { middleTruncatePath } from "../../src/domain/path_truncation";

describe("middleTruncatePath", () => {
	it("returns short paths unchanged", () => {
		expect(middleTruncatePath({ folderPath: "short/path/", maxLength: 50 })).toBe(
			"short/path/",
		);
	});

	it("returns paths with 2 or fewer segments unchanged", () => {
		expect(middleTruncatePath({ folderPath: "a/b/", maxLength: 50 })).toBe(
			"a/b/",
		);
	});

	it("truncates long paths with ellipsis keeping first and last segments", () => {
		const result = middleTruncatePath({
			folderPath:
				"very-long-first/second/third/fourth/fifth/last-segment/",
			maxLength: 35,
		});
		expect(result).toContain("very-long-first");
		expect(result).toContain("last-segment");
		expect(result).toContain("\u2026");
		expect(result.length).toBeLessThanOrEqual(35);
	});

	it("handles Windows backslash paths", () => {
		const result = middleTruncatePath({
			folderPath: "C:\\Users\\Jon\\Photos\\Vacation\\Beach\\",
			maxLength: 25,
		});
		expect(result).toContain("C:");
		expect(result).toContain("Beach");
		expect(result).toContain("\u2026");
	});

	it("truncates at path separator boundaries, never mid-name", () => {
		const result = middleTruncatePath({
			folderPath: "alpha/beta/gamma/delta/epsilon/",
			maxLength: 20,
		});
		// Should not cut a directory name in the middle
		expect(result).not.toMatch(/[a-z]\u2026[a-z]/);
	});

	it("includes second-to-last segment if it fits", () => {
		const result = middleTruncatePath({
			folderPath: "a/b/c/d/e/f/",
			maxLength: 11,
		});
		expect(result).toContain("\u2026");
		// First segment should be present
		expect(result.startsWith("a")).toBe(true);
		// Should include last segment
		expect(result).toContain("f");
	});

	it("returns empty string for empty input", () => {
		expect(middleTruncatePath({ folderPath: "", maxLength: 50 })).toBe("");
	});

	it("handles single segment paths", () => {
		expect(
			middleTruncatePath({ folderPath: "folder/", maxLength: 50 }),
		).toBe("folder/");
	});
});
