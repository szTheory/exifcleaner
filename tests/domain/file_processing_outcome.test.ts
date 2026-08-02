import { describe, expect, it } from "vitest";
import {
	classifyMetadataOutcome,
	summarizeMetadataChange,
} from "../../src/domain/files/file_processing_outcome";

describe("file processing outcomes", () => {
	it("counts removed fields by key instead of subtracting totals", () => {
		expect(
			summarizeMetadataChange({
				before: { Make: "Canon", CreateDate: "2024", Width: 100 },
				after: { Width: 100, FileType: "JPEG" },
			}),
		).toEqual({
			beforeCount: 3,
			afterCount: 2,
			removedCount: 2,
			stillPresentCount: 1,
		});
	});

	it("distinguishes cleaned, already-clean, and unchanged", () => {
		expect(classifyMetadataOutcome({ beforeCount: 0, removedCount: 0 })).toBe(
			"already-clean",
		);
		expect(classifyMetadataOutcome({ beforeCount: 2, removedCount: 0 })).toBe(
			"unchanged",
		);
		expect(classifyMetadataOutcome({ beforeCount: 2, removedCount: 1 })).toBe(
			"cleaned",
		);
	});
});
