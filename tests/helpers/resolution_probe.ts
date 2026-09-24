// Phase 52 (FID-01): this is the D-35/D-38(b) oracle. Companions are ExifTool's own framing
// tags for a re-created segment (File:ExifByteOrder, JFIF:JFIFVersion, IFD0:YCbCrPositioning)
// and are pinned per row; a companion is only permitted when it is already present in the
// source. Reuses the raw_probe.ts reader (51.1) so RAW's DocN:-prefixed embedded documents
// never collide with the main image's own resolution tags.
import { execFileSync } from "node:child_process";
import { readRawTagLines, tagLineDifferential } from "./raw_probe";
import type { RawTagLine } from "./raw_probe";

export const RESOLUTION_TAG_NAMES = [
	"XResolution",
	"YResolution",
	"ResolutionUnit",
	"PixelsPerUnitX",
	"PixelsPerUnitY",
	"PixelUnits",
] as const;

export const COPY_BACK_GROUPS = ["JFIF", "IFD0", "PNG-pHYs"] as const;

export const RESOLUTION_SENTINELS = [
	"ZZP52-ARTIST",
	"ZZP52-SOFT",
	"ZZP52-COMMENT",
] as const;

export const GENERIC_SEED_ARGS = [
	"-GPSLatitude=37.7749",
	"-GPSLatitudeRef=N",
	"-GPSLongitude=-122.4194",
	"-GPSLongitudeRef=W",
	"-Artist=ZZP52-ARTIST",
	"-Software=ZZP52-SOFT",
	"-Comment=ZZP52-COMMENT",
] as const;

export const JPEG_CONFLICT_RESOLUTION_ARGS = [
	"-JFIF:XResolution=300",
	"-JFIF:YResolution=300",
	"-JFIF:ResolutionUnit=inches",
	"-IFD0:XResolution=72",
	"-IFD0:YResolution=72",
	"-IFD0:ResolutionUnit=inches",
] as const;

// Group-qualified: a bare write lands in XMP-tiff on CR3 (RESEARCH Pitfall 3).
export const RAW_RESOLUTION_SEED_ARGS = [
	"-IFD0:XResolution=300",
	"-IFD0:YResolution=300",
	"-IFD0:ResolutionUnit=inches",
] as const;

function tagNameOf(key: string): string {
	return key.includes(":") ? key.slice(key.lastIndexOf(":") + 1) : key;
}

// Segment immediately before the tag name, after dropping any leading DocN: segment.
function groupOf(key: string): string {
	const parts = key.split(":");
	const withoutTag = parts.slice(0, -1);
	const withoutDoc =
		withoutTag.length > 0 && /^Doc\d+$/.test(withoutTag[0]!)
			? withoutTag.slice(1)
			: withoutTag;
	return withoutDoc.join(":");
}

export function seedFile(
	filePath: string,
	exiftoolPath: string,
	args: readonly string[],
	expected: Readonly<Record<string, string>>,
): void {
	execFileSync(exiftoolPath, ["-overwrite_original", ...args, filePath]);
	const lines = readRawTagLines(filePath, exiftoolPath);
	for (const [key, expectedValue] of Object.entries(expected)) {
		const observed = lines.filter((line) => line.key === key);
		const matched = observed.some((line) => line.value === expectedValue);
		if (!matched) {
			throw new Error(
				`seedFile: expected ${key} = ${JSON.stringify(expectedValue)} in ${filePath}, ` +
					`observed values: ${JSON.stringify(observed.map((line) => line.value))}`,
			);
		}
	}
}

export function resolutionLines(lines: readonly RawTagLine[]): string[] {
	return lines
		.filter((line) =>
			(RESOLUTION_TAG_NAMES as readonly string[]).includes(tagNameOf(line.key)),
		)
		.map((line) => `${line.key} : ${line.value}`);
}

export function seededTagKeys(lines: readonly RawTagLine[]): string[] {
	const keys = new Set<string>();
	for (const line of lines) {
		if (line.value.includes("ZZP52") || tagNameOf(line.key).startsWith("GPS")) {
			keys.add(line.key);
		}
	}
	return [...keys].sort();
}

export function resolutionDeltaViolations({
	source,
	off,
	on,
	companions,
}: {
	source: readonly RawTagLine[];
	off: readonly RawTagLine[];
	on: readonly RawTagLine[];
	companions: readonly string[];
}): string[] {
	const violations = new Set<string>();
	const diff = tagLineDifferential(off, on);
	const sourceByKey = new Map<string, string[]>();
	for (const line of source) {
		const existing = sourceByKey.get(line.key);
		if (existing) {
			existing.push(line.value);
		} else {
			sourceByKey.set(line.key, [line.value]);
		}
	}
	const onByKey = new Map<string, string[]>();
	for (const line of on) {
		const existing = onByKey.get(line.key);
		if (existing) {
			existing.push(line.value);
		} else {
			onByKey.set(line.key, [line.value]);
		}
	}

	for (const key of diff.added) {
		const tagName = tagNameOf(key);
		if ((RESOLUTION_TAG_NAMES as readonly string[]).includes(tagName)) {
			const sourceValues = sourceByKey.get(key) ?? [];
			const onValues = onByKey.get(key) ?? [];
			const ok = onValues.every((value) => sourceValues.includes(value));
			if (!ok) violations.add(`synthesized:${key}`);
			continue;
		}
		if (companions.includes(key)) {
			if (!sourceByKey.has(key)) {
				violations.add(`companion-not-in-source:${key}`);
			}
			continue;
		}
		violations.add(`unrequested:${key}`);
	}

	for (const { key } of diff.changed) {
		const tagName = tagNameOf(key);
		const isAllowedCompanion = companions.includes(key) && sourceByKey.has(key);
		const isAllowedResolution =
			(RESOLUTION_TAG_NAMES as readonly string[]).includes(tagName) &&
			(onByKey.get(key) ?? []).every((value) =>
				(sourceByKey.get(key) ?? []).includes(value),
			);
		if (!isAllowedCompanion && !isAllowedResolution) {
			violations.add(`changed:${key}`);
		}
	}

	for (const key of diff.removed) {
		if (!companions.includes(key)) {
			violations.add(`removed:${key}`);
		}
	}

	// Preservation: every source resolution line in a copy-back group must survive
	// identically into ON.
	for (const line of source) {
		const tagName = tagNameOf(line.key);
		if (!(RESOLUTION_TAG_NAMES as readonly string[]).includes(tagName))
			continue;
		if (!(COPY_BACK_GROUPS as readonly string[]).includes(groupOf(line.key)))
			continue;
		const onValues = onByKey.get(line.key) ?? [];
		if (!onValues.includes(line.value)) {
			violations.add(`lost:${line.key}`);
		}
	}

	return [...violations].sort();
}
