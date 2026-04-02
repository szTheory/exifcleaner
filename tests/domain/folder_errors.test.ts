import { describe, it, expect } from "vitest";
import { formatFolderError } from "../../src/domain/files/folder_errors";
import type { FolderError } from "../../src/domain/files/folder_errors";

describe("FolderError", () => {
	describe("formatFolderError", () => {
		it("formats read-failed with dirPath and permission context", () => {
			const result = formatFolderError({
				code: "read-failed",
				dirPath: "/d",
				cause: "EACCES",
			});

			expect(result).toContain("/d");
			expect(result).toMatch(/permission/i);
		});

		it("formats inaccessible-path with the path", () => {
			const result = formatFolderError({
				code: "inaccessible-path",
				path: "/x",
			});

			expect(result).toContain("/x");
		});

		it("produces non-empty strings for all codes", () => {
			const errors: FolderError[] = [
				{ code: "read-failed", dirPath: "/d", cause: "err" },
				{ code: "inaccessible-path", path: "/x" },
			];

			for (const error of errors) {
				expect(formatFolderError(error).length).toBeGreaterThan(0);
			}
		});
	});

	describe("serialization", () => {
		it("all error variants survive JSON round-trip", () => {
			const errors: FolderError[] = [
				{ code: "read-failed", dirPath: "/d", cause: "EACCES" },
				{ code: "inaccessible-path", path: "/x" },
			];

			for (const error of errors) {
				const roundTripped = JSON.parse(
					JSON.stringify(error),
				) as FolderError;
				expect(roundTripped).toEqual(error);
			}
		});
	});
});
