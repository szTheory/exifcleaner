// Pure domain logic — zero dependencies, zero I/O.
//
// Phase 63-09 (D-15): HEIC/HEIF/AVIF allowlists are measured in
// .planning/phases/63-app-adoption/63-SWEEP-MATRIX.md ("## Allowlist derivation" and
// "## 63-09 decisions"), per key, never group-wide.
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

export type CopyModeLeakCheckFormat = "png" | "jpeg" | "heic" | "avif";

interface CopyModeLeakCheckFormatOfParams {
	readonly fileType: unknown;
}

export function copyModeLeakCheckFormatOf({
	fileType,
}: CopyModeLeakCheckFormatOfParams): CopyModeLeakCheckFormat | undefined {
	if (fileType === "PNG") return "png";
	if (fileType === "JPEG") return "jpeg";
	// ExifTool reports a reopened HEIC or HEIF container as either FileType; both share the
	// HEVC ISOBMFF allowlist. AVIF has its own (AV1) allowlist. WebP, MOV and anything else stay
	// undefined (fail closed).
	if (fileType === "HEIC" || fileType === "HEIF") return "heic";
	if (fileType === "AVIF") return "avif";
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

// 63-SWEEP-MATRIX.md "## Allowlist derivation" (HEIC) -- always permitted (no preservation
// required): the union over both engines of the keys present with every preservation off, minus
// the System/ExifTool groups exempted wholesale and minus the ICC residue (F-HEIC-ICC). Composite,
// File and Meta keys and the QuickTime keys are ISOBMFF structure facts (brands, HEVC
// configuration, pixel geometry, item references). Every QuickTime key is listed ONE BY ONE and
// no QuickTime group-wide allowance exists. QuickTime:HandlerDescription is deliberately absent:
// the handler name is free text that can carry an encoder or user string (D-15, D-17; maintainer
// decision 2026-10-19: fail-closed).
// QuickTime:AuxiliaryImageType is the 63-09 decision from the 63-08 iPhone measurement (matrix
// "## 63-09 decisions"): the auxC type URN of an auxiliary image item (the HDR gain map) that both
// engines keep at every combo; its value class is a fixed vocabulary URN naming the kind of
// image, not source identity.
const HEIC_ALWAYS_PERMITTED: ReadonlySet<string> = new Set([
	"Composite:ImageSize",
	"Composite:Megapixels",
	"File:FileType",
	"File:FileTypeExtension",
	"File:ImageHeight",
	"File:ImageWidth",
	"File:MIMEType",
	"Meta:MetaImageSize",
	"Meta:PrimaryItemReference",
	"QuickTime:AuxiliaryImageType",
	"QuickTime:AverageFrameRate",
	"QuickTime:BitDepthChroma",
	"QuickTime:BitDepthLuma",
	"QuickTime:ChromaFormat",
	"QuickTime:CleanAperture",
	"QuickTime:ColorPrimaries",
	"QuickTime:ColorProfiles",
	"QuickTime:CompatibleBrands",
	"QuickTime:ConstantFrameRate",
	"QuickTime:ConstraintIndicatorFlags",
	"QuickTime:GenProfileCompatibilityFlags",
	"QuickTime:GeneralLevelIDC",
	"QuickTime:GeneralProfileIDC",
	"QuickTime:GeneralProfileSpace",
	"QuickTime:GeneralTierFlag",
	"QuickTime:HEVCConfigurationVersion",
	"QuickTime:HandlerType",
	"QuickTime:ImagePixelDepth",
	"QuickTime:ImageSpatialExtent",
	"QuickTime:MajorBrand",
	"QuickTime:MatrixCoefficients",
	"QuickTime:MaxContentLightLevel",
	"QuickTime:MaxPicAverageLightLevel",
	"QuickTime:MediaDataOffset",
	"QuickTime:MediaDataSize",
	"QuickTime:MinSpatialSegmentationIDC",
	"QuickTime:MinorVersion",
	"QuickTime:NumTemporalLayers",
	"QuickTime:ParallelismType",
	"QuickTime:Rotation",
	"QuickTime:TemporalIDNested",
	"QuickTime:TransferCharacteristics",
	"QuickTime:VideoFullRangeFlag",
]);

// 63-SWEEP-MATRIX.md "## Allowlist derivation" (HEIC) -- permitted only when preserveOrientation
// is requested: per-engine delta over that engine's none bucket, unioned. IFD0:YCbCrPositioning is
// the ExifTool-only Exif companion (Decision 15 (c)).
const HEIC_ORIENTATION_ONLY: ReadonlySet<string> = new Set([
	"File:ExifByteOrder",
	"IFD0:Orientation",
	"IFD0:YCbCrPositioning",
]);

// 63-SWEEP-MATRIX.md "## Allowlist derivation" (HEIC) -- permitted only when preserveColorProfile
// is requested: the native engine's 25 ICC keys (ICC_GROUP_TAGS) plus ICC_Profile:ChromaticAdaptation
// (the chad tag, 9 numbers of colorimetry, the same class as ICC_Profile:MediaWhitePoint), measured
// on the iPhone sample in 63-08 and decided in 63-09 ("## 63-09 decisions"). It is not added to the
// shared ICC_GROUP_TAGS because JPEG and PNG were not re-measured for it.
const HEIC_COLOR_PROFILE_ONLY: ReadonlySet<string> = new Set([
	...ICC_GROUP_TAGS,
	"ICC_Profile:ChromaticAdaptation",
]);

// 63-SWEEP-MATRIX.md "## Allowlist derivation" (HEIC) -- permitted only when preserveResolution is
// requested.
const HEIC_RESOLUTION_ONLY: ReadonlySet<string> = new Set([
	"File:ExifByteOrder",
	"IFD0:ResolutionUnit",
	"IFD0:XResolution",
	"IFD0:YCbCrPositioning",
	"IFD0:YResolution",
]);

// 63-SWEEP-MATRIX.md "## Allowlist derivation" (AVIF) -- always permitted: same derivation rules as
// HEIC. QuickTime:HandlerDescription is never permitted (D-15, D-17; the link-u cavif string stays
// the fail-closed control). QuickTime:PixelAspectRatio is the 63-09 decision ("## 63-09 decisions"):
// the pasp box, two integers of pixel spacing, the same class as the permitted CleanAperture and
// ImageSpatialExtent; measured on ExifTool-written output only.
const AVIF_ALWAYS_PERMITTED: ReadonlySet<string> = new Set([
	"Composite:ImageSize",
	"Composite:Megapixels",
	"File:FileType",
	"File:FileTypeExtension",
	"File:ImageHeight",
	"File:ImageWidth",
	"File:MIMEType",
	"Meta:PrimaryItemReference",
	"QuickTime:AV1ConfigurationVersion",
	"QuickTime:ChromaFormat",
	"QuickTime:ChromaSamplePosition",
	"QuickTime:CleanAperture",
	"QuickTime:ColorPrimaries",
	"QuickTime:ColorProfiles",
	"QuickTime:CompatibleBrands",
	"QuickTime:HandlerType",
	"QuickTime:ImagePixelDepth",
	"QuickTime:ImageSpatialExtent",
	"QuickTime:MajorBrand",
	"QuickTime:MatrixCoefficients",
	"QuickTime:MaxContentLightLevel",
	"QuickTime:MaxPicAverageLightLevel",
	"QuickTime:MediaDataOffset",
	"QuickTime:MediaDataSize",
	"QuickTime:MinorVersion",
	"QuickTime:PixelAspectRatio",
	"QuickTime:Rotation",
	"QuickTime:TransferCharacteristics",
	"QuickTime:VideoFullRangeFlag",
]);

// 63-SWEEP-MATRIX.md "## Allowlist derivation" (AVIF) -- permitted only when preserveOrientation
// is requested.
const AVIF_ORIENTATION_ONLY: ReadonlySet<string> = new Set([
	"File:ExifByteOrder",
	"IFD0:Orientation",
	"IFD0:YCbCrPositioning",
]);

// 63-SWEEP-MATRIX.md "## Allowlist derivation" (AVIF) -- permitted only when preserveColorProfile
// is requested; ICC_Profile:ChromaticAdaptation measured on a Display P3 libavif AVIF in 63-09.
const AVIF_COLOR_PROFILE_ONLY: ReadonlySet<string> = new Set([
	...ICC_GROUP_TAGS,
	"ICC_Profile:ChromaticAdaptation",
]);

// 63-SWEEP-MATRIX.md "## Allowlist derivation" (AVIF) -- permitted only when preserveResolution is
// requested.
const AVIF_RESOLUTION_ONLY: ReadonlySet<string> = new Set([
	"File:ExifByteOrder",
	"IFD0:ResolutionUnit",
	"IFD0:XResolution",
	"IFD0:YCbCrPositioning",
	"IFD0:YResolution",
]);

// Test-only view of the per-format sets so the shape guards can iterate every set without a
// production consumer.
export const PERMITTED_SETS_FOR_TESTS: Readonly<
	Record<string, ReadonlySet<string>>
> = {
	HEIC_ALWAYS_PERMITTED,
	HEIC_ORIENTATION_ONLY,
	HEIC_COLOR_PROFILE_ONLY,
	HEIC_RESOLUTION_ONLY,
	AVIF_ALWAYS_PERMITTED,
	AVIF_ORIENTATION_ONLY,
	AVIF_COLOR_PROFILE_ONLY,
	AVIF_RESOLUTION_ONLY,
};

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

	// Exhaustive on purpose: a new format must add its own branch and can never fall into
	// another format's sets.
	switch (format) {
		case "jpeg": {
			if (JPEG_ALWAYS_PERMITTED.has(groupTag)) return true;
			if (
				preservation.preserveOrientation &&
				JPEG_ORIENTATION_ONLY.has(groupTag)
			) {
				return true;
			}
			if (preservation.preserveColorProfile && ICC_GROUP_TAGS.has(groupTag)) {
				return true;
			}
			return (
				preservation.preserveResolution && JPEG_RESOLUTION_ONLY.has(groupTag)
			);
		}
		case "png": {
			if (PNG_ALWAYS_PERMITTED.has(groupTag)) return true;
			if (
				preservation.preserveOrientation &&
				PNG_ORIENTATION_ONLY.has(groupTag)
			) {
				return true;
			}
			if (
				preservation.preserveColorProfile &&
				PNG_COLOR_PROFILE_ONLY.has(groupTag)
			) {
				return true;
			}
			return (
				preservation.preserveResolution && PNG_RESOLUTION_ONLY.has(groupTag)
			);
		}
		case "heic": {
			if (HEIC_ALWAYS_PERMITTED.has(groupTag)) return true;
			if (
				preservation.preserveOrientation &&
				HEIC_ORIENTATION_ONLY.has(groupTag)
			) {
				return true;
			}
			if (
				preservation.preserveColorProfile &&
				HEIC_COLOR_PROFILE_ONLY.has(groupTag)
			) {
				return true;
			}
			return (
				preservation.preserveResolution && HEIC_RESOLUTION_ONLY.has(groupTag)
			);
		}
		case "avif": {
			if (AVIF_ALWAYS_PERMITTED.has(groupTag)) return true;
			if (
				preservation.preserveOrientation &&
				AVIF_ORIENTATION_ONLY.has(groupTag)
			) {
				return true;
			}
			if (
				preservation.preserveColorProfile &&
				AVIF_COLOR_PROFILE_ONLY.has(groupTag)
			) {
				return true;
			}
			return (
				preservation.preserveResolution && AVIF_RESOLUTION_ONLY.has(groupTag)
			);
		}
		default: {
			const unreachable: never = format;
			throw new Error(`Unhandled leak-check format: ${String(unreachable)}`);
		}
	}
}

interface FindLeakedTagsParams {
	readonly record: Record<string, unknown>;
	readonly format: CopyModeLeakCheckFormat;
	readonly preservation: Preservation;
	// Router provenance (D-01; structurally the application layer's WrittenBy, repeated here so
	// the domain imports nothing from application): which engine wrote the output. Consumed by the F-HEIC-ICC
	// exemption rule that lands in 63-09; unused by every rule in this file today.
	readonly writtenBy: "native" | "exiftool";
	// The reopened FileType string (HEIC vs HEIF), likewise for 63-09.
	readonly fileType: string;
}

export interface FindLeakedTagsResult {
	readonly leakedTags: readonly string[];
	readonly exemptionsApplied: readonly string[];
}

// Returns every key of `record` (a grouped -G1:2:4 record) not permitted for `format` and
// `preservation`, as sorted unique "Group1:Tag" names. Fail-closed: an unparseable key (no
// Group1:Tag shape, other than the bare SourceFile key) is reported as a leak. Result is
// names only, values are never echoed.
export function findLeakedTags({
	record,
	format,
	preservation,
}: FindLeakedTagsParams): FindLeakedTagsResult {
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

	return { leakedTags: [...leaks].sort(), exemptionsApplied: [] };
}
