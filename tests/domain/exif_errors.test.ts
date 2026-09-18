import { describe, it, expect } from "vitest";
import {
	formatMetadataEngineError,
	type MetadataEngineError,
} from "../../src/domain/exif/exif_errors";

describe("MetadataEngineError", () => {
	describe("formatMetadataEngineError", () => {
		it("formats unavailable engines with restart guidance", () => {
			const result = formatMetadataEngineError({ code: "engine-unavailable" });

			expect(result).toContain("not running");
			expect(result).toContain("Restart");
		});

		it("preserves ExifTool detail only when its backend is supplied", () => {
			const result = formatMetadataEngineError({
				code: "engine-error",
				detail: "File not found",
				backend: "exiftool",
			});

			expect(result).toContain("ExifTool");
			expect(result).toContain("File not found");
		});

		it("does not label a backend-neutral failure as ExifTool", () => {
			const result = formatMetadataEngineError({
				code: "engine-error",
				detail: "Unsupported data",
			});

			expect(result).toContain("Metadata engine");
			expect(result).not.toContain("ExifTool");
		});

		it("keeps native failure text generic", () => {
			const result = formatMetadataEngineError({
				code: "native-error",
				nativeCode: "write-failed",
				detail: "/private/output.webp write failed",
				path: "/private/output.webp",
				backend: "native",
				phase: "transaction",
				nativeWrite: "started",
				libraryError: {
					code: "write-failed",
					detail: "/private/output.webp write failed",
					path: "/private/output.webp",
					phase: "transaction",
					nativeWrite: "started",
				},
			});

			expect(result).toContain("native processing failed");
			expect(result).not.toContain("/private/output.webp");
		});

		it("produces non-empty strings for all codes", () => {
			const errors: MetadataEngineError[] = [
				{ code: "engine-unavailable" },
				{ code: "engine-unavailable", backend: "exiftool" },
				{ code: "engine-error", detail: "err" },
				{ code: "engine-error", detail: "err", backend: "exiftool" },
				{
					code: "native-error",
					nativeCode: "unsupported-feature",
					detail: "err",
					path: "/files/source.webp",
					feature: "orientation-preservation",
					cause: { code: "EINVAL", message: "unsupported" },
					backend: "native",
					phase: "admission",
					nativeWrite: "not-started",
					libraryError: {
						code: "unsupported-feature",
						detail: "err",
						path: "/files/source.webp",
						feature: "orientation-preservation",
						phase: "admission",
						nativeWrite: "not-started",
					},
				},
			];

			for (const error of errors) {
				expect(formatMetadataEngineError(error).length).toBeGreaterThan(0);
			}
		});
	});

	describe("serialization", () => {
		it("all engine-neutral variants survive JSON round-trip", () => {
			const errors: MetadataEngineError[] = [
				{ code: "engine-unavailable" },
				{ code: "engine-unavailable", backend: "exiftool" },
				{ code: "engine-error", detail: "err" },
				{ code: "engine-error", detail: "err", backend: "exiftool" },
			];

			for (const error of errors) {
				const roundTripped = JSON.parse(
					JSON.stringify(error),
				) as MetadataEngineError;
				expect(roundTripped).toEqual(error);
			}
		});
	});
});
