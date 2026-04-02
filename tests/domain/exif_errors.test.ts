import { describe, it, expect } from "vitest";
import { formatExifError } from "../../src/domain/exif/exif_errors";
import type { ExifError } from "../../src/domain/exif/exif_errors";

describe("ExifError", () => {
	describe("formatExifError", () => {
		it("formats process-not-open with restart guidance", () => {
			const result = formatExifError({ code: "process-not-open" });

			expect(result).toContain("not running");
			expect(result).toContain("Restart");
		});

		it("formats spawn-failed with binPath and reinstall guidance", () => {
			const result = formatExifError({
				code: "spawn-failed",
				binPath: "/usr/bin/exiftool",
			});

			expect(result).toContain("/usr/bin/exiftool");
			expect(result).toContain("Reinstall");
		});

		it("formats command-timeout with retry guidance", () => {
			const result = formatExifError({
				code: "command-timeout",
				executeNum: 5,
			});

			expect(result).toContain("too long");
			expect(result).toContain("Try");
		});

		it("formats process-exited with restart guidance", () => {
			const result = formatExifError({
				code: "process-exited",
				exitCode: 1,
				signal: null,
			});

			expect(result).toContain("crashed");
			expect(result).toContain("Restart");
		});

		it("formats parse-failed with retry guidance", () => {
			const result = formatExifError({
				code: "parse-failed",
				raw: "{bad json",
			});

			expect(result).toContain("unreadable");
			expect(result).toContain("Try");
		});

		it("formats exiftool-error with detail", () => {
			const result = formatExifError({
				code: "exiftool-error",
				detail: "File not found",
			});

			expect(result).toContain("File not found");
		});

		it("produces non-empty strings for all codes", () => {
			const errors: ExifError[] = [
				{ code: "process-not-open" },
				{ code: "spawn-failed", binPath: "/bin/exiftool" },
				{ code: "command-timeout", executeNum: 1 },
				{ code: "process-exited", exitCode: null, signal: "SIGKILL" },
				{ code: "parse-failed", raw: "" },
				{ code: "exiftool-error", detail: "err" },
			];

			for (const error of errors) {
				expect(formatExifError(error).length).toBeGreaterThan(0);
			}
		});
	});

	describe("serialization", () => {
		it("all error variants survive JSON round-trip", () => {
			const errors: ExifError[] = [
				{ code: "process-not-open" },
				{ code: "spawn-failed", binPath: "/bin/exiftool" },
				{ code: "command-timeout", executeNum: 5 },
				{ code: "process-exited", exitCode: 1, signal: null },
				{ code: "parse-failed", raw: "{bad}" },
				{ code: "exiftool-error", detail: "err" },
			];

			for (const error of errors) {
				const roundTripped = JSON.parse(
					JSON.stringify(error),
				) as ExifError;
				expect(roundTripped).toEqual(error);
			}
		});
	});
});
