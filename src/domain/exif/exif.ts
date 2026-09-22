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
// The File group is deliberately NOT a blanket entry here -- see the writability-anchored
// rule below (FILE_GROUP_WRITABLE_TAGS / FILE_GROUP_STRUCTURAL_OVERRIDE /
// isRemovableFileGroupTag). System, JFIF, ExifTool and Composite remain unchanged blanket
// exclusions; the writability-anchored approach is not generalized to them.
const STRUCTURAL_GROUPS = new Set(["System", "JFIF", "ExifTool", "Composite"]);

// ExifTool's -G4 (family 4, "instance number") option inserts a "CopyN" segment just
// before the tag name whenever two tags of the same group+name collide -- e.g.
// "JFIF:Image:Copy1:ResolutionUnit" for the second of two same-named tags. Issue #344's
// fix (exiftool_diagnostics.ts) needs -G4 in the read args so co-occurring ExifTool-group
// diagnostics don't silently collide onto one suppressed JSON key (ExifTool's own
// documented -json duplicate-suppression). Stripping any CopyN segment here keeps this
// module's displayed tag names identical to what -G1:2 alone produced, so a file that
// happens to carry a duplicate ordinary tag (e.g. a JFIF/Composite resolution dupe) is
// unaffected by the diagnostic-args change -- only the ExifTool-group diagnostic keys
// (already excluded by the ExifTool entry in STRUCTURAL_GROUPS) needed the disambiguation.
const FAMILY_4_INSTANCE_PATTERN = /^Copy\d+$/;

// D-15/RMV-02: the group1 File bucket is classified by a writability-anchored rule, never
// by a single-tag string match. A non-writable File tag defaults structural (ExifTool
// cannot remove what it cannot write, so counting it would produce a rewrite that changes
// nothing and a stillPresentFields count that never drops). A writable File tag defaults
// removable, minus an explicit structural override for the writable tags that are not
// removable user content. Pure fail-open (treat every File tag as removable) was rejected
// by measurement: it would count the several hundred read-only File tags ExifTool cannot
// write, and it would misclassify PreviewImage -- which is writable, reachable under the
// app's real read args (-G1:2:4), and SURVIVES -all= on RAW files. Marking PreviewImage
// removable would mark RAW files carrying an embedded preview permanently unclean after
// every clean. D-17's recorded boundary: the System and MacOS family-1 buckets (filesystem
// pseudo-tags, macOS xattr/MDItem surfaces) are OS-sidecar surfaces owned by removeXattrs,
// unreachable under the app's read args, and excluded by decision, not oversight -- see
// FILE_GROUP_NON_FILE_FAMILY1_TAGS below.
//
// Both sets are transcribed verbatim from the family-0/family-1-reconciled sweep in
// .planning/phases/50-comment-classifier-correctness/50-SWEEP-MATRIX.md §3, measured live
// against the bundled ExifTool 13.59 binary.
export const FILE_GROUP_WRITABLE_TAGS: ReadonlySet<string> = new Set([
	"Comment",
	"ExifByteOrder",
	"ExifUnicodeByteOrder",
	"Geolocate",
	"Geosync",
	"Geotag",
	"Geotime",
	"HardLink",
	"PreviewImage",
	"SymLink",
	"TestName",
	"Trailer",
]);

export const FILE_GROUP_STRUCTURAL_OVERRIDE: ReadonlySet<string> = new Set([
	"ExifByteOrder",
	"ExifUnicodeByteOrder",
	"PreviewImage",
	"Trailer",
	"Geolocate",
	"Geosync",
	"Geotag",
	"Geotime",
	"HardLink",
	"SymLink",
	"TestName",
]);

// Writable File tags (per -listw -File:all) that never reach the classifier as group1
// File keys, because family 1 places them under System or MacOS instead (D-15d). Recorded
// so the contract test can prove the classifier's set and ExifTool's own list partition
// cleanly, and so the OS-sidecar exclusion (D-17) is a recorded decision, not an omission.
export const FILE_GROUP_NON_FILE_FAMILY1_TAGS: ReadonlySet<string> = new Set([
	"Directory",
	"FileCreateDate",
	"FileGroupID",
	"FileModifyDate",
	"FileName",
	"FilePermissions",
	"FileUserID",
	"ZoneIdentifier",
	"MDItemFSCreationDate",
	"MDItemFSLabel",
	"MDItemFinderComment",
	"MDItemUserTags",
	"XAttrMDItemWhereFroms",
	"XAttrQuarantine",
]);

function normalizeMetadataKey(key: string): string {
	const parts = key
		.split(":")
		.filter((part) => !FAMILY_4_INSTANCE_PATTERN.test(part));
	return parts.length >= 3 ? parts.slice(1).join(":") : parts.join(":");
}

interface IsRemovableFileGroupTagParams {
	key: string;
}

// D-15c: the CopyN instance segment must be stripped BEFORE the tag-name lookup, reusing
// the same FAMILY_4_INSTANCE_PATTERN filter normalizeMetadataKey already applies -- a real
// fixture seeds File:Image:Copy1:Comment, not File:Image:Comment. isComputedField's
// existing group check reads only the first segment and is accidentally immune to the
// instance segment; this per-tag lookup is not, so it must filter explicitly.
export function isRemovableFileGroupTag({
	key,
}: IsRemovableFileGroupTagParams): boolean {
	const parts = key
		.split(":")
		.filter((part) => !FAMILY_4_INSTANCE_PATTERN.test(part));
	const tagName = parts.at(-1);
	if (tagName === undefined) return false;
	return (
		FILE_GROUP_WRITABLE_TAGS.has(tagName) &&
		!FILE_GROUP_STRUCTURAL_OVERRIDE.has(tagName)
	);
}

interface IsComputedFieldParams {
	key: string;
}

function isComputedField({ key }: IsComputedFieldParams) {
	if (COMPUTED_FIELDS.has(key)) return true;
	const parts = key.split(":");
	const group1 = parts[0];
	if (group1 !== undefined && STRUCTURAL_GROUPS.has(group1)) return true;
	if (group1 === "File" && !isRemovableFileGroupTag({ key })) return true;
	return parts.at(-1) !== undefined && COMPUTED_FIELDS.has(parts.at(-1)!);
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
