import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import {
	findLeakedTags,
	copyModeLeakCheckFormatOf,
	type CopyModeLeakCheckFormat,
} from "../../src/domain/exif/copy_mode_leak_check";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface SweepRow {
	readonly variant: string;
	readonly format: "jpeg" | "png";
	readonly combo: string;
	readonly preserveOrientation: boolean;
	readonly preserveColorProfile: boolean;
	readonly preserveResolution: boolean;
	readonly engine: "exiftool" | "native";
	readonly outcome: "written" | "declined" | "error";
	readonly keys: readonly string[];
}

function recordFromKeys(keys: readonly string[]): Record<string, unknown> {
	const record: Record<string, unknown> = {};
	for (const key of keys) {
		record[key] = "placeholder-value";
	}
	return record;
}

describe("copyModeLeakCheckFormatOf", () => {
	it("maps PNG to png", () => {
		expect(copyModeLeakCheckFormatOf({ fileType: "PNG" })).toBe("png");
	});

	it("maps JPEG to jpeg", () => {
		expect(copyModeLeakCheckFormatOf({ fileType: "JPEG" })).toBe("jpeg");
	});

	it.each([["HEIC"], ["HEIF"]])("maps %s to heic", (fileType) => {
		expect(copyModeLeakCheckFormatOf({ fileType })).toBe("heic");
	});

	it.each([["WEBP"], ["AVIF"], [undefined], [42]])(
		"returns undefined for %s",
		(fileType) => {
			expect(copyModeLeakCheckFormatOf({ fileType })).toBeUndefined();
		},
	);
});

describe("findLeakedTags", () => {
	it("reports a JPEG XMP-dc identifying tag as a leak", () => {
		const record = {
			SourceFile: "/tmp/a.jpg",
			"File:Other:FileType": "JPEG",
			"XMP-dc:Author:Creator": "ZZ58-ARTIST",
		};
		const result = findLeakedTags({
			record,
			format: "jpeg",
			writtenBy: "exiftool",
			fileType: "JPEG",
			preservation: {
				preserveOrientation: false,
				preserveColorProfile: false,
				preserveResolution: false,
			},
		});
		expect(result.leakedTags).toEqual(["XMP-dc:Creator"]);
	});

	it("includes a GPS identifying tag as a leak alongside XMP", () => {
		const record = {
			SourceFile: "/tmp/a.jpg",
			"File:Other:FileType": "JPEG",
			"XMP-dc:Author:Creator": "ZZ58-ARTIST",
			"GPS:Location:GPSLatitude": "37 deg 46' 29.64\" N",
		};
		const result = findLeakedTags({
			record,
			format: "jpeg",
			writtenBy: "exiftool",
			fileType: "JPEG",
			preservation: {
				preserveOrientation: false,
				preserveColorProfile: false,
				preserveResolution: false,
			},
		});
		expect(result.leakedTags).toContain("GPS:GPSLatitude");
		expect(result.leakedTags).toContain("XMP-dc:Creator");
	});

	it("reports a PNG text-chunk comment as a leak while ImageWidth stays permitted", () => {
		const record = {
			"PNG:Image:ImageWidth": 1,
			"PNG:Author:Comment": "ZZ58-COMMENT",
		};
		const result = findLeakedTags({
			record,
			format: "png",
			writtenBy: "exiftool",
			fileType: "PNG",
			preservation: {
				preserveOrientation: false,
				preserveColorProfile: false,
				preserveResolution: false,
			},
		});
		expect(result.leakedTags).toEqual(["PNG:Comment"]);
	});

	it("treats IFD0:Orientation as a leak when preserveOrientation is false", () => {
		const record = { "IFD0:Image:Orientation": "Rotate 90 CW" };
		const result = findLeakedTags({
			record,
			format: "jpeg",
			writtenBy: "exiftool",
			fileType: "JPEG",
			preservation: {
				preserveOrientation: false,
				preserveColorProfile: false,
				preserveResolution: false,
			},
		});
		expect(result.leakedTags).toEqual(["IFD0:Orientation"]);
	});

	it("permits IFD0:Orientation when preserveOrientation is true", () => {
		const record = { "IFD0:Image:Orientation": "Rotate 90 CW" };
		const result = findLeakedTags({
			record,
			format: "jpeg",
			writtenBy: "exiftool",
			fileType: "JPEG",
			preservation: {
				preserveOrientation: true,
				preserveColorProfile: false,
				preserveResolution: false,
			},
		});
		expect(result.leakedTags).toEqual([]);
	});

	it.each([
		["preserveOrientation" as const, "IFD0:Image:Orientation"],
		["preserveResolution" as const, "IFD0:Image:XResolution"],
	])(
		"resolution keys follow the same permit-when-requested pattern (%s)",
		(flag, key) => {
			const record = { [key]: "1" };
			const off = findLeakedTags({
				record,
				format: "jpeg",
				writtenBy: "exiftool",
				fileType: "JPEG",
				preservation: {
					preserveOrientation: false,
					preserveColorProfile: false,
					preserveResolution: false,
				},
			});
			expect(off.leakedTags).toEqual([
				`${key.split(":")[0]}:${key.split(":").at(-1)}`,
			]);

			const on = findLeakedTags({
				record,
				format: "jpeg",
				writtenBy: "exiftool",
				fileType: "JPEG",
				preservation: {
					preserveOrientation: flag === "preserveOrientation",
					preserveColorProfile: false,
					preserveResolution: flag === "preserveResolution",
				},
			});
			expect(on.leakedTags).toEqual([]);
		},
	);

	it("permits ICC groups only when preserveColorProfile is true", () => {
		const record = { "ICC_Profile:Image:ProfileDescription": "Test" };
		const off = findLeakedTags({
			record,
			format: "jpeg",
			writtenBy: "exiftool",
			fileType: "JPEG",
			preservation: {
				preserveOrientation: false,
				preserveColorProfile: false,
				preserveResolution: false,
			},
		});
		expect(off.leakedTags).toEqual(["ICC_Profile:ProfileDescription"]);

		const on = findLeakedTags({
			record,
			format: "jpeg",
			writtenBy: "exiftool",
			fileType: "JPEG",
			preservation: {
				preserveOrientation: false,
				preserveColorProfile: true,
				preserveResolution: false,
			},
		});
		expect(on.leakedTags).toEqual([]);
	});

	it("treats JFIF:Image:Copy1:XResolution as JFIF:XResolution", () => {
		const record = { "JFIF:Image:Copy1:XResolution": "300" };
		const on = findLeakedTags({
			record,
			format: "jpeg",
			writtenBy: "exiftool",
			fileType: "JPEG",
			preservation: {
				preserveOrientation: false,
				preserveColorProfile: false,
				preserveResolution: true,
			},
		});
		expect(on.leakedTags).toEqual([]);
	});

	it("reports XMP-dc:Author:Copy1:Creator as a leak (duplicate of a forbidden tag)", () => {
		const record = { "XMP-dc:Author:Copy1:Creator": "ZZ58-ARTIST" };
		const result = findLeakedTags({
			record,
			format: "jpeg",
			writtenBy: "exiftool",
			fileType: "JPEG",
			preservation: {
				preserveOrientation: false,
				preserveColorProfile: false,
				preserveResolution: false,
			},
		});
		expect(result.leakedTags).toEqual(["XMP-dc:Creator"]);
	});

	it("reports a key with no Group1:Tag shape as a leak", () => {
		const record = { UnknownFlatKey: "value" };
		const result = findLeakedTags({
			record,
			format: "jpeg",
			writtenBy: "exiftool",
			fileType: "JPEG",
			preservation: {
				preserveOrientation: false,
				preserveColorProfile: false,
				preserveResolution: false,
			},
		});
		expect(result.leakedTags).toEqual(["UnknownFlatKey"]);
	});

	it("never reports SourceFile", () => {
		const record = { SourceFile: "/tmp/a.jpg" };
		const result = findLeakedTags({
			record,
			format: "jpeg",
			writtenBy: "exiftool",
			fileType: "JPEG",
			preservation: {
				preserveOrientation: false,
				preserveColorProfile: false,
				preserveResolution: false,
			},
		});
		expect(result.leakedTags).toEqual([]);
	});

	it.each(["System:Other:FileName", "ExifTool:ExifToolVersion"])(
		"never reports a %s key (whole-group exemption)",
		(key) => {
			const record = { [key]: "value" };
			const result = findLeakedTags({
				record,
				format: "jpeg",
				writtenBy: "exiftool",
				fileType: "JPEG",
				preservation: {
					preserveOrientation: false,
					preserveColorProfile: false,
					preserveResolution: false,
				},
			});
			expect(result.leakedTags).toEqual([]);
		},
	);

	it("sorts and de-duplicates the returned leak names", () => {
		const record = {
			"XMP-dc:Author:Creator": "a",
			"GPS:Location:GPSLatitude": "b",
			"GPS:Location:Copy1:GPSLatitude": "c",
		};
		const result = findLeakedTags({
			record,
			format: "jpeg",
			writtenBy: "exiftool",
			fileType: "JPEG",
			preservation: {
				preserveOrientation: false,
				preserveColorProfile: false,
				preserveResolution: false,
			},
		});
		expect(result.leakedTags).toEqual(["GPS:GPSLatitude", "XMP-dc:Creator"]);
	});

	it("never echoes tag values into the result (names only)", () => {
		const record = { "XMP-dc:Author:Creator": "super-secret-value" };
		const result = findLeakedTags({
			record,
			format: "jpeg",
			writtenBy: "exiftool",
			fileType: "JPEG",
			preservation: {
				preserveOrientation: false,
				preserveColorProfile: false,
				preserveResolution: false,
			},
		});
		expect(result.leakedTags.join(" ")).not.toContain("super-secret-value");
	});

	describe("HEIC (63-02 tracer rows)", () => {
		const allOn = {
			preserveOrientation: true,
			preserveColorProfile: true,
			preserveResolution: true,
		};
		const allOff = {
			preserveOrientation: false,
			preserveColorProfile: false,
			preserveResolution: false,
		};
		const tracerAllOnKeys = [
			"Composite:ImageSize",
			"Composite:Megapixels",
			"ExifTool:ExifToolVersion",
			"File:ExifByteOrder",
			"File:FileType",
			"File:FileTypeExtension",
			"File:ImageHeight",
			"File:ImageWidth",
			"File:MIMEType",
			"IFD0:Orientation",
			"IFD0:ResolutionUnit",
			"IFD0:XResolution",
			"IFD0:YResolution",
			"Meta:PrimaryItemReference",
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
			"System:Directory",
			"System:FileAccessDate",
			"System:FileInodeChangeDate",
			"System:FileModifyDate",
			"System:FileName",
			"System:FilePermissions",
			"System:FileSize",
		];

		it("reports a HEIC GPS tag as a leak", () => {
			const result = findLeakedTags({
				record: { "GPS:Location:GPSLatitude": "37 deg" },
				format: "heic",
				writtenBy: "native",
				fileType: "HEIC",
				preservation: allOn,
			});
			expect(result.leakedTags).toEqual(["GPS:GPSLatitude"]);
		});

		it("passes a HEIC record of exactly the tracer all-on keys with every preservation on", () => {
			const result = findLeakedTags({
				record: recordFromKeys(tracerAllOnKeys),
				format: "heic",
				writtenBy: "native",
				fileType: "HEIC",
				preservation: allOn,
			});
			expect(result.leakedTags).toEqual([]);
		});

		it("flags QuickTime:HandlerDescription as a HEIC leak under every preservation", () => {
			for (const preservation of [allOff, allOn]) {
				const result = findLeakedTags({
					record: { "QuickTime:Meta:HandlerDescription": "ZZ63-HANDLER" },
					format: "heic",
					writtenBy: "native",
					fileType: "HEIF",
					preservation,
				});
				expect(result.leakedTags).toEqual(["QuickTime:HandlerDescription"]);
			}
		});
	});

	describe("sweep replay", () => {
		const sweepPath = path.join(
			__dirname,
			"fixtures/copy_mode_leak_sweep.json",
		);
		const rows = JSON.parse(
			fs.readFileSync(sweepPath, "utf8"),
		) as readonly SweepRow[];
		const writtenRows = rows.filter((row) => row.outcome === "written");

		it("has at least 200 written rows to replay", () => {
			expect(writtenRows.length).toBeGreaterThanOrEqual(200);
		});

		it.each(
			writtenRows.map(
				(row) => [`${row.variant} ${row.combo} ${row.engine}`, row] as const,
			),
		)("clean output %s has zero leaks", (_label, row) => {
			const format: CopyModeLeakCheckFormat = row.format;
			const record = recordFromKeys(row.keys);
			const result = findLeakedTags({
				record,
				format,
				writtenBy: row.engine,
				fileType: row.format === "png" ? "PNG" : "JPEG",
				preservation: {
					preserveOrientation: row.preserveOrientation,
					preserveColorProfile: row.preserveColorProfile,
					preserveResolution: row.preserveResolution,
				},
			});
			expect(result.leakedTags).toEqual([]);
		});
	});
});
