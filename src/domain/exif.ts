// Pure domain logic — zero dependencies, zero I/O, no mutation.
//
// Business rule: ExifTool includes computed fields in its output that
// aren't user-embedded metadata. These fields should be excluded from
// the "before" and "after" tag counts shown in the UI.

export type ExifData = Record<string, unknown>;

const COMPUTED_FIELDS = new Set(["SourceFile", "ImageSize", "Megapixels"]);

export function cleanExifData(raw: ExifData): ExifData {
	const cleaned: ExifData = {};
	for (const [key, value] of Object.entries(raw)) {
		if (!COMPUTED_FIELDS.has(key)) {
			cleaned[key] = value;
		}
	}
	return cleaned;
}
