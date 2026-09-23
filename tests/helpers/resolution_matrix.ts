// Phase 52-04 (FID-02, FID-03, D-31, D-37, D-38): the negative-control matrix helper. Plain
// Node -- no test-runner import of any kind -- so both a Playwright spec and a Vitest test
// file can call it identically, matching resolution_probe.ts's own contract.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { seedFile } from "./resolution_probe";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Task 1: the two-group tracer (JPEG JFIF+IFD0 both 300, and a JFIF-only JPEG that must gain
// no synthesized EXIF block).
export const JPEG_BOTH_300_ARGS = [
	"-JFIF:XResolution=300",
	"-JFIF:YResolution=300",
	"-JFIF:ResolutionUnit=inches",
	"-IFD0:XResolution=300",
	"-IFD0:YResolution=300",
	"-IFD0:ResolutionUnit=inches",
] as const;

// No EXIF-group write here -- writing EXIF Artist would create an IFD0 block, which is
// exactly what this case must prove does NOT happen for a JFIF-only source.
export const JFIF_ONLY_SEED_ARGS = [
	"-JFIF:XResolution=300",
	"-JFIF:YResolution=300",
	"-JFIF:ResolutionUnit=inches",
	"-Comment=ZZP52-COMMENT",
	"-XMP-tiff:Artist=ZZP52-ARTIST",
	"-XMP-tiff:Software=ZZP52-SOFT",
	"-XMP-exif:GPSLatitude=37.7749",
] as const;

export const PNG_PHYS_SEED_ARGS = [
	"-PNG:PixelsPerUnitX=11811",
	"-PNG:PixelsPerUnitY=11811",
	"-PNG:PixelUnits=meters",
	"-PNG:Artist=ZZP52-ARTIST",
	"-PNG:Software=ZZP52-SOFT",
	"-PNG:Comment=ZZP52-COMMENT",
	"-XMP-exif:GPSLatitude=37.7749",
] as const;

// Measured this session (bundled ExifTool 13.59, product argument shape): a re-created JPEG
// segment always carries these framing tags along with the resolution values it copies back.
// Each is already present in the source before the copy-back runs, so resolutionDeltaViolations
// accepts them as companions rather than flagging them unrequested.
export const JPEG_EXIF_COMPANIONS = [
	"File:ExifByteOrder",
	"JFIF:JFIFVersion",
	"IFD0:YCbCrPositioning",
] as const;

export const JFIF_ONLY_COMPANIONS = ["JFIF:JFIFVersion"] as const;

export interface MatrixRow {
	readonly ext: string;
	readonly fixture: string;
	readonly fileType: string;
	readonly writable: boolean;
	readonly seedArgs: readonly string[];
	readonly seedExpect: Readonly<Record<string, string>>;
	readonly companions: readonly string[];
}

// materializeRow copies `row.fixture` into `dir/name`, asserts the copy still reports
// `row.fileType`, and (when writable) seeds it with `row.seedArgs`, verified via seedFile.
export function materializeRow(
	row: MatrixRow,
	dir: string,
	name: string,
	exiftoolPath: string,
): string {
	const fixturesDir = path.resolve(__dirname, "../e2e/fixtures");
	const src = path.join(fixturesDir, row.fixture);
	const dest = path.join(dir, name);
	fs.copyFileSync(src, dest);

	const observedType = execFileSync(exiftoolPath, ["-s3", "-FileType", dest])
		.toString()
		.trim();
	if (observedType !== row.fileType) {
		throw new Error(
			`materializeRow: ${dest} expected FileType ${row.fileType}, got ${observedType}`,
		);
	}

	if (row.writable && row.seedArgs.length > 0) {
		seedFile(dest, exiftoolPath, row.seedArgs, row.seedExpect);
	}

	return dest;
}
