// Pure domain logic -- zero dependencies, zero I/O.
// Metadata diff computation and ExifTool family 2 group name mapping.

import { getOrThrow } from "../../common/types";

export interface MetadataDiffField {
	readonly name: string;
	readonly value: unknown;
	readonly removed: boolean;
}

export interface MetadataDiffGroup {
	readonly rawGroupName: string;
	readonly friendlyNameKey: string;
	readonly fields: readonly MetadataDiffField[];
	readonly removedCount: number;
	readonly totalCount: number;
}

const EXIFTOOL_GROUP_FRIENDLY_KEYS: Record<string, string> = {
	Camera: "metaGroupCamera",
	GPS: "metaGroupLocation",
	Time: "metaGroupTime",
	Author: "metaGroupAuthor",
	Image: "metaGroupImage",
	Video: "metaGroupVideo",
	XMP: "metaGroupDocument",
	IPTC: "metaGroupPublishing",
	ICC_Profile: "metaGroupColorProfile",
	MakerNotes: "metaGroupCameraInternals",
};

export function getFriendlyGroupKey(rawGroupName: string): string {
	return EXIFTOOL_GROUP_FRIENDLY_KEYS[rawGroupName] ?? "metaGroupOther";
}

export function parseGroupedKey(key: string): { group: string; field: string } {
	const colonIndex = key.indexOf(":");
	if (colonIndex === -1) {
		return { group: "Other", field: key };
	}
	return { group: key.slice(0, colonIndex), field: key.slice(colonIndex + 1) };
}

// Computed fields that ExifTool adds (not user metadata). Excluded from diff.
const DIFF_EXCLUDED_FIELDS = new Set(["SourceFile", "ImageSize", "Megapixels"]);

function isExcludedField(field: string): boolean {
	return DIFF_EXCLUDED_FIELDS.has(field);
}

export function computeMetadataDiff(
	before: Record<string, unknown>,
	after: Record<string, unknown>,
): MetadataDiffGroup[] {
	const groupMap = new Map<string, MetadataDiffField[]>();

	// Process all before-metadata keys
	for (const [key, value] of Object.entries(before)) {
		const { group, field } = parseGroupedKey(key);
		if (isExcludedField(field)) continue;

		if (!groupMap.has(group)) {
			groupMap.set(group, []);
		}
		const removed = !(key in after);
		getOrThrow(groupMap, group).push({ name: field, value, removed });
	}

	// Process after-only keys (preserved fields not in before -- rare but possible)
	for (const [key, value] of Object.entries(after)) {
		const { group, field } = parseGroupedKey(key);
		if (isExcludedField(field)) continue;
		if (key in before) continue; // Already processed

		if (!groupMap.has(group)) {
			groupMap.set(group, []);
		}
		getOrThrow(groupMap, group).push({ name: field, value, removed: false });
	}

	// Build sorted groups
	const groups: MetadataDiffGroup[] = [];
	for (const [rawGroupName, fields] of groupMap.entries()) {
		const removedCount = fields.filter((f) => f.removed).length;
		groups.push({
			rawGroupName,
			friendlyNameKey: getFriendlyGroupKey(rawGroupName),
			fields,
			removedCount,
			totalCount: fields.length,
		});
	}

	// Sort alphabetically by friendly name key
	groups.sort((a, b) => a.friendlyNameKey.localeCompare(b.friendlyNameKey));

	return groups;
}
