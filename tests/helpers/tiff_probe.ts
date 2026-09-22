// Phase 51 (RMV-03/RMV-04): a single, shared TIFF assertion, reused by this plan's e2e spec,
// the 51-02 negative control, and the 51-03 multi-page pin (D-28's "same assertion"
// requirement depends on this staying one file). Plain Node — synchronous execFileSync, no
// @playwright/test or vitest import — so both a Playwright *.spec.ts and a Vitest *.test.ts
// can call it identically.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

// The RMV-03 acceptance floor: the four IFD0 private tags -CommonIFD0= removes that this
// phase's tests assert on by name. Never a remaining-field count (D-26) -- TIFF's structural
// IFD0 tags (ImageWidth, StripOffsets, ...) are counted as metadata by the app's classifier,
// so a count-based assertion would false-fail.
export const TIFF_PRIVATE_TAG_FLOOR = [
	"ImageDescription",
	"Software",
	"Artist",
	"Copyright",
] as const;

export function readTiffGroupedTags(
	filePath: string,
	exiftoolPath: string,
): Record<string, unknown> {
	const output = execFileSync(exiftoolPath, [
		"-a",
		"-G1",
		"-s",
		"-json",
		filePath,
	]).toString();
	const parsed = JSON.parse(output) as unknown;
	if (!Array.isArray(parsed) || parsed.length !== 1) {
		throw new Error(`Expected one ExifTool result for ${filePath}`);
	}
	const first = parsed[0];
	if (first === null || typeof first !== "object" || Array.isArray(first)) {
		throw new Error(`Expected ExifTool object result for ${filePath}`);
	}
	return first as Record<string, unknown>;
}

// Every floor tag present as `${group}:${tag}`, in floor order. Names tags -- never counts
// remaining fields (D-26).
export function retainedPrivateTags(
	tags: Record<string, unknown>,
	group: string,
): string[] {
	return TIFF_PRIVATE_TAG_FLOOR.filter((tag) => `${group}:${tag}` in tags).map(
		(tag) => `${group}:${tag}`,
	);
}

// Every key whose group1 prefix is exactly "GPS".
export function gpsKeys(tags: Record<string, unknown>): string[] {
	return Object.keys(tags).filter((key) => key.startsWith("GPS:"));
}

// Every sentinel whose latin1 bytes occur anywhere in the raw file -- a byte-level check
// independent of ExifTool's own tag interpretation.
export function findSentinels(
	filePath: string,
	sentinels: readonly string[],
): string[] {
	const raw = readFileSync(filePath).toString("latin1");
	return sentinels.filter((sentinel) => raw.includes(sentinel));
}
