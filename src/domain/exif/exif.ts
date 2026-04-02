// Pure domain logic — zero dependencies, zero I/O, no mutation.
//
// Business rule: ExifTool includes computed fields in its output that
// aren't user-embedded metadata. These fields should be excluded from
// the "before" and "after" tag counts shown in the UI.

export type ExifData = Record<string, unknown>;

const COMPUTED_FIELDS = new Set(["SourceFile", "ImageSize", "Megapixels"]);

interface IsComputedFieldParams {
	key: string;
}

function isComputedField({ key }: IsComputedFieldParams) {
	if (COMPUTED_FIELDS.has(key)) return true;
	const colonIndex = key.indexOf(":");
	if (colonIndex !== -1) {
		return COMPUTED_FIELDS.has(key.slice(colonIndex + 1));
	}
	return false;
}

interface CleanExifDataParams {
	raw: ExifData;
}

export function cleanExifData({ raw }: CleanExifDataParams): ExifData {
	const cleaned: ExifData = {};
	for (const [key, value] of Object.entries(raw)) {
		if (!isComputedField({ key })) {
			cleaned[key] = value;
		}
	}
	return cleaned;
}
