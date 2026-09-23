// Phase 52-05 (FID-03, D-37): every one of SUPPORTED_EXTENSIONS' 30 members has exactly one
// decided coverage row -- a resolution-matrix row (52-04), a RAW row (this plan, FID-04), the
// pre-existing RAF refusal, or an explicit not-covered entry naming why. Pure -- no ExifTool, no
// temp dirs -- mirroring raw_residue_pin.test.ts's "RAW coverage ledger" describe block, but
// scoped to the full SUPPORTED_EXTENSIONS set rather than just RAW_EXTENSIONS. Adding a new
// supported extension without deciding its resolution-coverage row fails this file.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SUPPORTED_EXTENSIONS } from "../../src/domain/files/file_types";
import { RAW_CASES } from "../helpers/raw_probe";
import { RESOLUTION_MATRIX_ROWS } from "../helpers/resolution_matrix";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// One row per SUPPORTED_EXTENSIONS member that has been measured: 19 non-RAW extensions
// through resolution-matrix.spec.ts (52-04), four RAW extensions through raw-resolution.spec.ts
// (this plan, FID-04), and RAF's pre-existing refusal-before-sanitize() path.
const RESOLUTION_COVERAGE: Readonly<Record<string, string>> = {
	".jpg": "resolution-matrix.spec.ts",
	".jpeg": "resolution-matrix.spec.ts",
	".png": "resolution-matrix.spec.ts",
	".gif": "resolution-matrix.spec.ts",
	".tif": "resolution-matrix.spec.ts",
	".tiff": "resolution-matrix.spec.ts",
	".webp": "resolution-matrix.spec.ts",
	".heic": "resolution-matrix.spec.ts",
	".heif": "resolution-matrix.spec.ts",
	".mp4": "resolution-matrix.spec.ts",
	".mov": "resolution-matrix.spec.ts",
	".m4v": "resolution-matrix.spec.ts",
	".3gp": "resolution-matrix.spec.ts",
	".m4a": "resolution-matrix.spec.ts",
	".pdf": "resolution-matrix.spec.ts",
	".bmp": "resolution-matrix.spec.ts",
	".svg": "resolution-matrix.spec.ts",
	".avi": "resolution-matrix.spec.ts",
	".wmv": "resolution-matrix.spec.ts",
	".cr2": "raw-resolution.spec.ts",
	".cr3": "raw-resolution.spec.ts",
	".dng": "raw-resolution.spec.ts",
	".rw2": "raw-resolution.spec.ts",
	".raf": "raf-refused-before-sanitize",
};

// No redistributable sample exists for arw/orf/pef/srw at all; avif has no honest write path
// (renaming the vendored HEIC fixture to .avif reports FileType HEIF, not AVIF -- measured,
// 52-04-SUMMARY.md); the vendored Nikon.nef is a truncated stub ("Undersized IFD0
// StripByteCounts") that proves nothing either way (51.1-RESEARCH.md), the same reason
// raw_residue_pin.test.ts's RAW_NOT_COVERED excludes it.
const RESOLUTION_NOT_COVERED: Readonly<Record<string, string>> = {
	".avif":
		"no honest AVIF write path -- a renamed HEIC fixture reports FileType HEIF, not AVIF",
	".arw": "no redistributable sample fixture",
	".orf": "no redistributable sample fixture",
	".pef": "no redistributable sample fixture",
	".srw": "no redistributable sample fixture",
	".nef":
		"the vendored Nikon.nef is a truncated stub (Undersized IFD0 StripByteCounts), proves nothing",
};

describe("Resolution coverage ledger (FID-03, D-37)", () => {
	it("every SUPPORTED_EXTENSIONS member is covered exactly once, either by a decided row or an explicit not-covered entry", () => {
		const decided = [
			...Object.keys(RESOLUTION_COVERAGE),
			...Object.keys(RESOLUTION_NOT_COVERED),
		].sort();
		expect(decided).toEqual([...SUPPORTED_EXTENSIONS].sort());
	});

	it("RESOLUTION_COVERAGE and RESOLUTION_NOT_COVERED are disjoint", () => {
		const covered = new Set(Object.keys(RESOLUTION_COVERAGE));
		const overlap = Object.keys(RESOLUTION_NOT_COVERED).filter((ext) =>
			covered.has(ext),
		);
		expect(overlap).toEqual([]);
	});

	it("every extension mapped to resolution-matrix.spec.ts is a RESOLUTION_MATRIX_ROWS row", () => {
		const matrixExts: ReadonlySet<string> = new Set(
			RESOLUTION_MATRIX_ROWS.map((row) => row.ext),
		);
		for (const [ext, marker] of Object.entries(RESOLUTION_COVERAGE)) {
			if (marker !== "resolution-matrix.spec.ts") continue;
			expect(matrixExts.has(ext), ext).toBe(true);
		}
	});

	it("every extension mapped to raw-resolution.spec.ts is the extension of a RAW_CASES fixture", () => {
		const rawCasesExts: ReadonlySet<string> = new Set(
			RAW_CASES.map((raw) => path.extname(raw.fixture).toLowerCase()),
		);
		for (const [ext, marker] of Object.entries(RESOLUTION_COVERAGE)) {
			if (marker !== "raw-resolution.spec.ts") continue;
			expect(rawCasesExts.has(ext), ext).toBe(true);
		}
	});

	it("RAF's refusal-before-sanitize() path with Preserve resolution on is proven by the e2e suite (raw-resolution.spec.ts)", () => {
		const specPath = path.resolve(__dirname, "../e2e/raw-resolution.spec.ts");
		const contents = fs.readFileSync(specPath, "utf8");
		expect(contents).toContain("runRafRefusalScenario");
	});
});
