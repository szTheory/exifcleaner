import { describe, it, expect } from "vitest";
import { formatSettingsError } from "../../src/domain/settings_errors";
import type { SettingsError } from "../../src/domain/settings_errors";

describe("SettingsError", () => {
	describe("formatSettingsError", () => {
		it("formats read-failed with filePath and cause", () => {
			const result = formatSettingsError({
				code: "read-failed",
				filePath: "/p",
				cause: "ENOENT",
			});

			expect(result).toContain("/p");
			expect(result).toContain("ENOENT");
		});

		it("formats write-failed with save context and cause", () => {
			const result = formatSettingsError({
				code: "write-failed",
				filePath: "/p",
				cause: "EACCES",
			});

			expect(result).toContain("save");
			expect(result).toContain("EACCES");
		});

		it("formats invalid-format with corrupt/invalid indication", () => {
			const result = formatSettingsError({
				code: "invalid-format",
				filePath: "/p",
			});

			expect(result).toMatch(/corrupt|invalid/i);
		});

		it("produces non-empty strings for all codes", () => {
			const errors: SettingsError[] = [
				{ code: "read-failed", filePath: "/p", cause: "err" },
				{ code: "write-failed", filePath: "/p", cause: "err" },
				{ code: "invalid-format", filePath: "/p" },
			];

			for (const error of errors) {
				expect(formatSettingsError(error).length).toBeGreaterThan(0);
			}
		});
	});

	describe("serialization", () => {
		it("all error variants survive JSON round-trip", () => {
			const errors: SettingsError[] = [
				{ code: "read-failed", filePath: "/p", cause: "ENOENT" },
				{ code: "write-failed", filePath: "/p", cause: "EACCES" },
				{ code: "invalid-format", filePath: "/p" },
			];

			for (const error of errors) {
				const roundTripped = JSON.parse(
					JSON.stringify(error),
				) as SettingsError;
				expect(roundTripped).toEqual(error);
			}
		});
	});
});
