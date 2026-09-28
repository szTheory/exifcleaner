// Pure domain logic — zero dependencies, zero I/O.
//
// Phase 58-03 (D-07/D-08/D-09): a fail-closed leak allowlist for PNG/JPEG copy-mode output,
// measured against the bundled ExifTool and exifcleaner-node in
// .planning/phases/58-app-adoption/58-SWEEP-MATRIX.md. Every constant below is transcribed
// verbatim from that sweep's "## Allowlist derivation" section — nothing here is guessed.
//
// exif.ts's own display-cleaning group-wide allowance set is deliberately NOT reused here: it
// omits the PNG group entirely (a false red for the always-permitted PNG structural tags
// below), and reusing any group-wide allowance beyond System/ExifTool would fail open for
// this check's purpose (an identifying PNG text chunk lands in the same PNG group as
// ImageWidth).
import { groupAndTagOf } from "./exif";

export type CopyModeLeakCheckFormat = "png" | "jpeg";

interface CopyModeLeakCheckFormatOfParams {
	readonly fileType: unknown;
}

export function copyModeLeakCheckFormatOf({
	fileType,
}: CopyModeLeakCheckFormatOfParams): CopyModeLeakCheckFormat | undefined {
	if (fileType === "PNG") return "png";
	if (fileType === "JPEG") return "jpeg";
	return undefined;
}

// Group1 buckets exempted wholesale (D-07): System is filesystem attributes of the output
// file (FileName/FileSize/FileModifyDate/...), ExifTool is the tool's own version/diagnostics
// surface already adjudicated by classifyInspectionDiagnostics before this check ever runs.
// Neither carries source-image content, so neither can leak identifying metadata.
const EXEMPT_GROUPS: ReadonlySet<string> = new Set(["System", "ExifTool"]);

// 58-SWEEP-MATRIX.md "## Allowlist derivation" — JPEG, always permitted (no preservation
// required): APP14 Adobe segment fields (survive -all= unconditionally when present), basic
// File-group format facts, Composite size/megapixel derivations.
const JPEG_ALWAYS_PERMITTED: ReadonlySet<string> = new Set([
	"Adobe:APP14Flags0",
	"Adobe:APP14Flags1",
	"Adobe:ColorTransform",
	"Adobe:DCTEncodeVersion",
	"Composite:ImageSize",
	"Composite:Megapixels",
	"File:BitsPerSample",
	"File:ColorComponents",
	"File:EncodingProcess",
	"File:FileType",
	"File:FileTypeExtension",
	"File:ImageHeight",
	"File:ImageWidth",
	"File:MIMEType",
]);

// 58-SWEEP-MATRIX.md — JPEG, permitted only when preserveOrientation is requested.
// File:ExifByteOrder/IFD0:YCbCrPositioning are measured companions: ExifTool's
// -TagsFromFile @ re-creates a fresh EXIF segment whenever orientation is preserved, and that
// re-creation always adds these two (matches JPEG_EXIF_COMPANIONS, Phase 52).
const JPEG_ORIENTATION_ONLY: ReadonlySet<string> = new Set([
	"File:ExifByteOrder",
	"IFD0:Orientation",
	"IFD0:YCbCrPositioning",
]);

// 58-SWEEP-MATRIX.md — JPEG and PNG, permitted only when preserveColorProfile is requested.
// ICC_Profile:ProfileDescription/etc. are content descriptors of the colour profile itself,
// never source-identifying, and only present when the caller explicitly asked to keep them.
const ICC_GROUP_TAGS: ReadonlySet<string> = new Set([
	"ICC-header:CMMFlags",
	"ICC-header:ColorSpaceData",
	"ICC-header:ConnectionSpaceIlluminant",
	"ICC-header:DeviceAttributes",
	"ICC-header:DeviceManufacturer",
	"ICC-header:DeviceModel",
	"ICC-header:PrimaryPlatform",
	"ICC-header:ProfileCMMType",
	"ICC-header:ProfileClass",
	"ICC-header:ProfileConnectionSpace",
	"ICC-header:ProfileCreator",
	"ICC-header:ProfileDateTime",
	"ICC-header:ProfileFileSignature",
	"ICC-header:ProfileID",
	"ICC-header:ProfileVersion",
	"ICC-header:RenderingIntent",
	"ICC_Profile:BlueMatrixColumn",
	"ICC_Profile:BlueTRC",
	"ICC_Profile:GreenMatrixColumn",
	"ICC_Profile:GreenTRC",
	"ICC_Profile:MediaWhitePoint",
	"ICC_Profile:ProfileCopyright",
	"ICC_Profile:ProfileDescription",
	"ICC_Profile:RedMatrixColumn",
	"ICC_Profile:RedTRC",
]);

// 58-SWEEP-MATRIX.md — JPEG, permitted only when preserveResolution is requested.
const JPEG_RESOLUTION_ONLY: ReadonlySet<string> = new Set([
	"File:ExifByteOrder",
	"IFD0:ResolutionUnit",
	"IFD0:XResolution",
	"IFD0:YCbCrPositioning",
	"IFD0:YResolution",
	"JFIF:JFIFVersion",
	"JFIF:ResolutionUnit",
	"JFIF:XResolution",
	"JFIF:YResolution",
]);

// 58-SWEEP-MATRIX.md — PNG, always permitted (no preservation required). cHRM (WhitePointX/Y,
// RedX/Y, GreenX/Y, BlueX/Y), sBIT (SignificantBits), bKGD (BackgroundColor), tRNS
// (Transparency) and PLTE (Palette) were measured to survive -all= unconditionally on BOTH
// engines -- structural colour-calibration/palette/transparency-geometry chunks, never
// identifying content. gAMA and sRGB do NOT survive -all= under any measured combination and
// are therefore intentionally absent from this set (see 58-SWEEP-MATRIX.md "Observed keys").
const PNG_ALWAYS_PERMITTED: ReadonlySet<string> = new Set([
	"Composite:ImageSize",
	"Composite:Megapixels",
	"File:FileType",
	"File:FileTypeExtension",
	"File:MIMEType",
	"PNG:BackgroundColor",
	"PNG:BitDepth",
	"PNG:BlueX",
	"PNG:BlueY",
	"PNG:ColorType",
	"PNG:Compression",
	"PNG:Filter",
	"PNG:GreenX",
	"PNG:GreenY",
	"PNG:ImageHeight",
	"PNG:ImageWidth",
	"PNG:Interlace",
	"PNG:Palette",
	"PNG:RedX",
	"PNG:RedY",
	"PNG:SignificantBits",
	"PNG:Transparency",
	"PNG:WhitePointX",
	"PNG:WhitePointY",
]);

// 58-SWEEP-MATRIX.md — PNG, permitted only when preserveOrientation is requested (an eXIf
// chunk creates the same File:ExifByteOrder/IFD0:YCbCrPositioning companions as JPEG).
const PNG_ORIENTATION_ONLY: ReadonlySet<string> = new Set([
	"File:ExifByteOrder",
	"IFD0:Orientation",
	"IFD0:YCbCrPositioning",
]);

// 58-SWEEP-MATRIX.md — PNG, permitted only when preserveColorProfile is requested.
// PNG:ProfileName is the iCCP chunk's profile-name field (ExifTool's own naming, not
// content), additional to the shared ICC_GROUP_TAGS set.
const PNG_COLOR_PROFILE_ONLY: ReadonlySet<string> = new Set([
	...ICC_GROUP_TAGS,
	"PNG:ProfileName",
]);

// 58-SWEEP-MATRIX.md — PNG, permitted only when preserveResolution is requested.
const PNG_RESOLUTION_ONLY: ReadonlySet<string> = new Set([
	"PNG-pHYs:PixelUnits",
	"PNG-pHYs:PixelsPerUnitX",
	"PNG-pHYs:PixelsPerUnitY",
]);

interface Preservation {
	readonly preserveOrientation: boolean;
	readonly preserveColorProfile: boolean;
	readonly preserveResolution: boolean;
}

function isPermitted({
	format,
	group1,
	tag,
	preservation,
}: {
	format: CopyModeLeakCheckFormat;
	group1: string;
	tag: string;
	preservation: Preservation;
}): boolean {
	const groupTag = `${group1}:${tag}`;

	if (format === "jpeg") {
		if (JPEG_ALWAYS_PERMITTED.has(groupTag)) return true;
		if (preservation.preserveOrientation && JPEG_ORIENTATION_ONLY.has(groupTag)) {
			return true;
		}
		if (preservation.preserveColorProfile && ICC_GROUP_TAGS.has(groupTag)) {
			return true;
		}
		if (preservation.preserveResolution && JPEG_RESOLUTION_ONLY.has(groupTag)) {
			return true;
		}
		return false;
	}

	if (PNG_ALWAYS_PERMITTED.has(groupTag)) return true;
	if (preservation.preserveOrientation && PNG_ORIENTATION_ONLY.has(groupTag)) {
		return true;
	}
	if (preservation.preserveColorProfile && PNG_COLOR_PROFILE_ONLY.has(groupTag)) {
		return true;
	}
	if (preservation.preserveResolution && PNG_RESOLUTION_ONLY.has(groupTag)) {
		return true;
	}
	return false;
}

interface FindLeakedTagsParams {
	readonly record: Record<string, unknown>;
	readonly format: CopyModeLeakCheckFormat;
	readonly preservation: Preservation;
}

// Returns every key of `record` (a grouped -G1:2:4 record) not permitted for `format` and
// `preservation`, as sorted unique "Group1:Tag" names. Fail-closed: an unparseable key (no
// Group1:Tag shape, other than the bare SourceFile key) is reported as a leak. Result is
// names only, values are never echoed.
export function findLeakedTags({
	record,
	format,
	preservation,
}: FindLeakedTagsParams): readonly string[] {
	const leaks = new Set<string>();

	for (const key of Object.keys(record)) {
		if (key === "SourceFile") continue;

		const parsed = groupAndTagOf({ key });
		if (parsed === undefined) {
			leaks.add(key);
			continue;
		}

		const { group1, tag } = parsed;
		if (EXEMPT_GROUPS.has(group1)) continue;

		if (!isPermitted({ format, group1, tag, preservation })) {
			leaks.add(`${group1}:${tag}`);
		}
	}

	return [...leaks].sort();
}
