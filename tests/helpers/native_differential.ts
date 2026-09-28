import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { readFile as readFileAsync } from "node:fs/promises";
import { sanitizeFile } from "exifcleaner-node";
import { RESOLUTION_PRESERVE_ARGS } from "../../src/domain/exif/exif";

// Plain Node helper — no test-runner import, so both Playwright (*.spec.ts) and Vitest
// (*.test.ts) can share it as-is. See 58-10-PLAN.md's Task 1 objective: prove, on
// installed artifacts, that the app's native path is the one that actually ran, by
// comparing bytes against two independently-built references rather than any hook baked
// into the fused build.

export interface DifferentialPreservation {
	readonly preserveOrientation: boolean;
	readonly preserveColorProfile: boolean;
	readonly preserveResolution: boolean;
	readonly preserveTimestamps: boolean;
}

/**
 * Builds the "what should the native engine alone produce" reference by calling
 * exifcleaner-node's own sanitizeFile directly, outside the app, against a fresh copy of
 * the fixture supplied by the caller.
 */
export async function buildNativeReference({
	sourcePath,
	outputPath,
	preservation,
}: {
	sourcePath: string;
	outputPath: string;
	preservation: DifferentialPreservation;
}): Promise<Buffer> {
	const result = await sanitizeFile({
		sourcePath,
		destinationPath: outputPath,
		preserveOrientation: preservation.preserveOrientation,
		preserveColorProfile: preservation.preserveColorProfile,
		preserveResolution: preservation.preserveResolution,
		preserveTimestamps: preservation.preserveTimestamps,
	});
	if (!result.ok) {
		throw new Error(
			`buildNativeReference: exifcleaner-node sanitizeFile failed (${result.error.code}): ${JSON.stringify(result.error)}`,
		);
	}
	return readFileAsync(outputPath);
}

/**
 * Builds the "what should the app's bundled ExifTool alone produce" reference by
 * shelling out to the given exiftool binary with the exact argument shape
 * ExiftoolAdapter.sanitize uses for PNG/JPEG (see src/infrastructure/exiftool/
 * exiftool_adapter.ts:274-320) -- bare `-all=`, an optional `-TagsFromFile @` clause for
 * the requested preservations, an optional `-P`, then `-o <output> <source>`.
 */
export function buildExiftoolReference({
	exiftoolPath,
	sourcePath,
	outputPath,
	preservation,
}: {
	exiftoolPath: string;
	sourcePath: string;
	outputPath: string;
	preservation: DifferentialPreservation;
}): Buffer {
	const args: string[] = ["-all="];

	const preserveTags: string[] = [];
	if (preservation.preserveOrientation) preserveTags.push("-Orientation");
	if (preservation.preserveColorProfile) preserveTags.push("-ICC_Profile");
	if (preservation.preserveResolution) preserveTags.push(...RESOLUTION_PRESERVE_ARGS);
	if (preserveTags.length > 0) {
		args.push("-TagsFromFile", "@", ...preserveTags);
	}
	if (preservation.preserveTimestamps) args.push("-P");

	args.push("-o", outputPath, sourcePath);
	execFileSync(exiftoolPath, args);
	return readFileSync(outputPath);
}

/**
 * Pure comparison: given the installed artifact's output bytes and the two independently
 * built references, returns every problem found. Empty array means the installed output
 * is proven to have come from the native engine, discriminated from ExifTool.
 *
 * Deliberately NOT an early-return chain -- every check runs and every applicable problem
 * is reported, so a red control that violates more than one invariant at once (D-17) shows
 * its full failure shape rather than only the first check that happened to trip.
 */
export function nativeDifferentialProblems({
	installed,
	native,
	exiftool,
}: {
	installed: Buffer;
	native: Buffer;
	exiftool: Buffer;
}): string[] {
	const problems: string[] = [];

	if (native.equals(exiftool)) {
		problems.push(
			"native and ExifTool references are identical -- this case cannot discriminate which engine produced the installed output (references are identical)",
		);
	}
	if (!installed.equals(native)) {
		problems.push(
			"installed output does not equal the native reference -- the installed artifact did not produce the native engine's bytes",
		);
	}
	if (installed.equals(exiftool)) {
		problems.push(
			"installed output equals the ExifTool reference -- the installed artifact silently fell back to ExifTool",
		);
	}

	return problems;
}
