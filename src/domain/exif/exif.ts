// Pure domain logic — zero dependencies, zero I/O, no mutation.
//
// Business rule: ExifTool includes computed fields in its output that
// aren't user-embedded metadata. These fields should be excluded from
// the "before" and "after" tag counts shown in the UI.

export type ExifData = Record<string, unknown>;

// QuickTime stores these timestamps in required movie/track/media headers.
// ExifTool cannot remove the fields entirely, but explicitly clearing each one
// resets measured values to the format's zero value instead of silently leaving
// the user's dates behind.
export const QUICKTIME_DATE_REMOVAL_ARGS = [
	"-QuickTime:CreateDate=",
	"-QuickTime:ModifyDate=",
	"-TrackCreateDate=",
	"-TrackModifyDate=",
	"-MediaCreateDate=",
	"-MediaModifyDate=",
] as const;

const COMPUTED_FIELDS = new Set(["SourceFile", "ImageSize", "Megapixels"]);
const STRUCTURAL_GROUPS = new Set([
	"System",
	"File",
	"JFIF",
	"ExifTool",
	"Composite",
]);

interface IsComputedFieldParams {
	key: string;
}

function isComputedField({ key }: IsComputedFieldParams) {
	if (COMPUTED_FIELDS.has(key)) return true;
	const parts = key.split(":");
	return (
		(parts[0] !== undefined && STRUCTURAL_GROUPS.has(parts[0])) ||
		(parts.at(-1) !== undefined && COMPUTED_FIELDS.has(parts.at(-1)!))
	);
}

function normalizeMetadataKey(key: string): string {
	const parts = key.split(":");
	return parts.length >= 3 ? parts.slice(1).join(":") : key;
}

interface CleanExifDataParams {
	raw: ExifData;
}

export function cleanExifData({ raw }: CleanExifDataParams): ExifData {
	const cleaned: ExifData = {};
	for (const [key, value] of Object.entries(raw)) {
		if (!isComputedField({ key })) {
			cleaned[normalizeMetadataKey(key)] = value;
		}
	}
	return cleaned;
}
