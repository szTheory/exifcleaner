import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import {
	findLeakedTags,
	copyModeLeakCheckFormatOf,
	PERMITTED_SETS_FOR_TESTS,
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

interface HeifSweepRow {
	readonly variant: string;
	readonly fileType: string;
	readonly engine: "exiftool" | "native";
	readonly route: "router" | "exiftool-direct";
	readonly combo: string;
	readonly preserveOrientation: boolean;
	readonly preserveColorProfile: boolean;
	readonly preserveResolution: boolean;
	readonly preserveTimestamps: boolean;
	readonly outcome: "written" | "declined" | "error";
	readonly handlerDescription: string | null;
	readonly keys: readonly string[];
}

function alwaysSet(name: string): ReadonlySet<string> {
	const set = PERMITTED_SETS_FOR_TESTS[name];
	if (set === undefined) throw new Error(`no permitted set named ${name}`);
	return set;
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

	it("maps AVIF to avif", () => {
		expect(copyModeLeakCheckFormatOf({ fileType: "AVIF" })).toBe("avif");
	});

	it.each([["WEBP"], ["MOV"], ["MP4"], [""], [undefined], [42]])(
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

	describe("HEIC and AVIF allowlist shape (63-09)", () => {
		const everySet = Object.entries(PERMITTED_SETS_FOR_TESTS);

		it("has the eight per-format sets", () => {
			expect(everySet.map(([name]) => name).sort()).toEqual([
				"AVIF_ALWAYS_PERMITTED",
				"AVIF_COLOR_PROFILE_ONLY",
				"AVIF_ORIENTATION_ONLY",
				"AVIF_RESOLUTION_ONLY",
				"HEIC_ALWAYS_PERMITTED",
				"HEIC_COLOR_PROFILE_ONLY",
				"HEIC_ORIENTATION_ONLY",
				"HEIC_RESOLUTION_ONLY",
			]);
		});

		it.each(everySet)(
			"%s never permits QuickTime:HandlerDescription",
			(_n, set) => {
				expect(
					[...set].filter((key) => key.endsWith(":HandlerDescription")),
				).toEqual([]);
			},
		);

		it.each(everySet)(
			"%s lists only full Group1:Tag keys, never a group",
			(_n, set) => {
				for (const key of set) {
					expect(key).toMatch(/^[A-Za-z0-9_-]+:[A-Za-z0-9]+$/);
				}
			},
		);

		it.each(everySet)(
			"%s holds no System, ExifTool, XMP or GPS key",
			(_n, set) => {
				expect(
					[...set].filter((key) => /^(System|ExifTool|XMP|GPS)/.test(key)),
				).toEqual([]);
			},
		);

		it.each(
			Object.entries(PERMITTED_SETS_FOR_TESTS).filter(
				([name]) => !name.endsWith("COLOR_PROFILE_ONLY"),
			),
		)(
			"%s holds no ICC key (colour-profile keys live only in the colour-profile set)",
			(_n, set) => {
				expect([...set].filter((key) => key.startsWith("ICC"))).toEqual([]);
			},
		);

		it("lists the QuickTime entries of HEIC always one by one", () => {
			const quickTime = [...alwaysSet("HEIC_ALWAYS_PERMITTED")].filter((key) =>
				key.startsWith("QuickTime:"),
			);
			expect(quickTime.length).toBeGreaterThan(30);
		});
	});

	describe("AVIF (63-09)", () => {
		const allOff = {
			preserveOrientation: false,
			preserveColorProfile: false,
			preserveResolution: false,
		};

		it.each([["GPS:GPSLatitude"], ["XMP-dc:Creator"]])(
			"reports AVIF %s as a leak",
			(key) => {
				const result = findLeakedTags({
					record: { [key]: "x" },
					format: "avif",
					writtenBy: "native",
					fileType: "AVIF",
					preservation: allOff,
				});
				expect(result.leakedTags).toEqual([key]);
			},
		);

		it("passes an AVIF record of exactly the always set", () => {
			const result = findLeakedTags({
				record: recordFromKeys([
					...alwaysSet("AVIF_ALWAYS_PERMITTED"),
					"System:FileName",
					"ExifTool:ExifToolVersion",
				]),
				format: "avif",
				writtenBy: "native",
				fileType: "AVIF",
				preservation: allOff,
			});
			expect(result.leakedTags).toEqual([]);
		});

		it("flags QuickTime:HandlerDescription as an AVIF leak under every preservation", () => {
			for (const flag of [false, true]) {
				const result = findLeakedTags({
					record: { "QuickTime:Meta:HandlerDescription": "ZZ63-HANDLER" },
					format: "avif",
					writtenBy: "exiftool",
					fileType: "AVIF",
					preservation: {
						preserveOrientation: flag,
						preserveColorProfile: flag,
						preserveResolution: flag,
					},
				});
				expect(result.leakedTags).toEqual(["QuickTime:HandlerDescription"]);
			}
		});
	});

	// 63-09 decisions for the keys the 63-08 iPhone 13 Pro Max measurement found outside the
	// 63-07 derivation. Encoded by key name only; no byte or value of the external file is used.
	describe("iPhone-derived keys (63-09 decisions)", () => {
		const off = {
			preserveOrientation: false,
			preserveColorProfile: false,
			preserveResolution: false,
		};
		const colourOn = { ...off, preserveColorProfile: true };

		function leaks(
			key: string,
			format: CopyModeLeakCheckFormat,
			writtenBy: "native" | "exiftool",
			preservation: typeof off,
		): readonly string[] {
			return findLeakedTags({
				record: { [key]: "name-only" },
				format,
				writtenBy,
				fileType: format === "avif" ? "AVIF" : "HEIC",
				preservation,
			}).leakedTags;
		}

		it("permits QuickTime:AuxiliaryImageType for HEIC under every engine and combination", () => {
			for (const writtenBy of ["native", "exiftool"] as const) {
				for (const preservation of [off, colourOn]) {
					expect(
						leaks(
							"QuickTime:AuxiliaryImageType",
							"heic",
							writtenBy,
							preservation,
						),
					).toEqual([]);
				}
			}
		});

		it("keeps QuickTime:AuxiliaryImageType a leak for AVIF (not measured there)", () => {
			expect(
				leaks("QuickTime:AuxiliaryImageType", "avif", "native", off),
			).toEqual(["QuickTime:AuxiliaryImageType"]);
		});

		it.each(["heic", "avif"] as const)(
			"permits ICC_Profile:ChromaticAdaptation for %s only with preserveColorProfile",
			(format) => {
				expect(
					leaks("ICC_Profile:ChromaticAdaptation", format, "native", colourOn),
				).toEqual([]);
				expect(
					leaks("ICC_Profile:ChromaticAdaptation", format, "native", off),
				).toEqual(["ICC_Profile:ChromaticAdaptation"]);
			},
		);

		it("keeps ICC_Profile:ChromaticAdaptation out of the shared PNG/JPEG colour-profile set", () => {
			for (const format of ["png", "jpeg"] as const) {
				expect(
					findLeakedTags({
						record: { "ICC_Profile:ChromaticAdaptation": "x" },
						format,
						writtenBy: "native",
						fileType: format === "png" ? "PNG" : "JPEG",
						preservation: colourOn,
					}).leakedTags,
				).toEqual(["ICC_Profile:ChromaticAdaptation"]);
			}
		});

		it.each(["XMP-HDRGainMap:HDRGainMapVersion", "XMP-x:XMPToolkit"])(
			"keeps %s a leak for every engine, format and combination (the input fails closed on the ExifTool path)",
			(key) => {
				for (const format of ["heic", "avif"] as const) {
					for (const writtenBy of ["native", "exiftool"] as const) {
						for (const preservation of [off, colourOn]) {
							expect(leaks(key, format, writtenBy, preservation)).toEqual([
								key,
							]);
						}
					}
				}
			},
		);

		it("permits QuickTime:PixelAspectRatio for AVIF only, and keeps it a leak for HEIC", () => {
			expect(
				leaks("QuickTime:PixelAspectRatio", "avif", "exiftool", off),
			).toEqual([]);
			expect(
				leaks("QuickTime:PixelAspectRatio", "heic", "exiftool", off),
			).toEqual(["QuickTime:PixelAspectRatio"]);
		});
	});

	describe("F-HEIC-ICC exemption (63-09, D-05 #1)", () => {
		const off = {
			preserveOrientation: false,
			preserveColorProfile: false,
			preserveResolution: false,
		};
		const iccBase = [
			"File:FileType",
			"ICC-header:ProfileVersion",
			"ICC_Profile:ProfileDescription",
		];

		function check(
			keys: readonly string[],
			over: {
				format?: CopyModeLeakCheckFormat;
				writtenBy?: "native" | "exiftool";
				fileType?: string;
				preservation?: typeof off;
			} = {},
		) {
			return findLeakedTags({
				record: Object.freeze(recordFromKeys(keys)),
				format: over.format ?? "heic",
				writtenBy: over.writtenBy ?? "native",
				fileType: over.fileType ?? "HEIC",
				preservation: over.preservation ?? off,
			});
		}

		it("leaks ICC keys for native output with preserveColorProfile=false and reports no exemption", () => {
			const result = check(iccBase);
			expect(result.leakedTags).toEqual([
				"ICC-header:ProfileVersion",
				"ICC_Profile:ProfileDescription",
			]);
			expect(result.exemptionsApplied).toEqual([]);
		});

		it("accepts ICC keys for ExifTool output and reports F-HEIC-ICC", () => {
			const result = check(iccBase, { writtenBy: "exiftool" });
			expect(result.leakedTags).toEqual([]);
			expect(result.exemptionsApplied).toEqual(["F-HEIC-ICC"]);
		});

		it.each([
			["HEIF", "heic"],
			["AVIF", "avif"],
		] as const)("treats FileType %s like HEIC", (fileType, format) => {
			expect(
				check(iccBase, { writtenBy: "exiftool", fileType, format }),
			).toEqual({ leakedTags: [], exemptionsApplied: ["F-HEIC-ICC"] });
			expect(check(iccBase, { fileType, format }).leakedTags).toEqual([
				"ICC-header:ProfileVersion",
				"ICC_Profile:ProfileDescription",
			]);
		});

		it("still leaks the ICC keys of a JPEG written by ExifTool", () => {
			const result = check(iccBase, {
				writtenBy: "exiftool",
				format: "jpeg",
				fileType: "JPEG",
			});
			expect(result.leakedTags).toEqual([
				"ICC-header:ProfileVersion",
				"ICC_Profile:ProfileDescription",
			]);
			expect(result.exemptionsApplied).toEqual([]);
		});

		it("still leaks a non-ICC sentinel next to exempted ICC keys", () => {
			const result = check([...iccBase, "GPS:GPSLatitude"], {
				writtenBy: "exiftool",
			});
			expect(result.leakedTags).toEqual(["GPS:GPSLatitude"]);
			expect(result.exemptionsApplied).toEqual(["F-HEIC-ICC"]);
		});

		it("does not match ICC groups by prefix: ICC-zz63 still leaks", () => {
			const result = check([...iccBase, "ICC-zz63:Probe"], {
				writtenBy: "exiftool",
			});
			expect(result.leakedTags).toEqual(["ICC-zz63:Probe"]);
		});

		it("reports no exemption when preserveColorProfile=true even for ExifTool output", () => {
			const result = check(iccBase, {
				writtenBy: "exiftool",
				preservation: { ...off, preserveColorProfile: true },
			});
			expect(result.leakedTags).toEqual([]);
			expect(result.exemptionsApplied).toEqual([]);
		});

		it("reports no exemption when ExifTool output carries no ICC key", () => {
			const result = check(["File:FileType"], { writtenBy: "exiftool" });
			expect(result).toEqual({ leakedTags: [], exemptionsApplied: [] });
		});

		it("is idempotent and never mutates its frozen input", () => {
			const record = Object.freeze(
				recordFromKeys([...iccBase, "GPS:GPSLatitude"]),
			);
			const before = JSON.stringify(record);
			const params = {
				record,
				format: "heic",
				writtenBy: "exiftool",
				fileType: "HEIC",
				preservation: off,
			} as const;
			const first = findLeakedTags(params);
			const second = findLeakedTags(params);
			expect(second).toEqual(first);
			expect(JSON.stringify(record)).toBe(before);
		});
	});

	describe("HEIF sweep replay (63-07 rows, copy_mode_heif_sweep.json)", () => {
		const sweepPath = path.join(
			__dirname,
			"fixtures/copy_mode_heif_sweep.json",
		);
		const parsed = JSON.parse(fs.readFileSync(sweepPath, "utf8")) as {
			readonly rows: readonly HeifSweepRow[];
		};
		const writtenRows = parsed.rows.filter((row) => row.outcome === "written");
		const hasIccKey = (row: HeifSweepRow): boolean =>
			row.keys.some(
				(key) =>
					key.startsWith("ICC-header:") || key.startsWith("ICC_Profile:"),
			);
		const hasHandlerDescription = (row: HeifSweepRow): boolean =>
			row.keys.some((key) => key === "QuickTime:HandlerDescription");

		function replay(row: HeifSweepRow) {
			const format = copyModeLeakCheckFormatOf({ fileType: row.fileType });
			if (format === undefined) {
				throw new Error(`no leak-check format for FileType ${row.fileType}`);
			}
			return findLeakedTags({
				record: Object.freeze(recordFromKeys(row.keys)),
				format,
				writtenBy: row.engine,
				fileType: row.fileType,
				preservation: {
					preserveOrientation: row.preserveOrientation,
					preserveColorProfile: row.preserveColorProfile,
					preserveResolution: row.preserveResolution,
				},
			});
		}

		it("has at least 300 written rows to replay", () => {
			expect(writtenRows.length).toBeGreaterThanOrEqual(300);
		});

		it("covers a populated native row set and an ExifTool row set", () => {
			expect(writtenRows.some((row) => row.engine === "native")).toBe(true);
			expect(writtenRows.some((row) => row.engine === "exiftool")).toBe(true);
		});

		it.each(
			writtenRows.map(
				(row) =>
					[
						`${row.variant} ${row.combo} ${row.route} ${row.engine}`,
						row,
					] as const,
			),
		)("replays %s exactly as the allowlist predicts", (_label, row) => {
			const result = replay(row);
			if (hasHandlerDescription(row)) {
				// D-17 fail-closed: a non-empty handler name is pinned as the one and only leak.
				expect(result.leakedTags).toEqual(["QuickTime:HandlerDescription"]);
			} else {
				expect(result.leakedTags).toEqual([]);
			}
			if (row.engine === "native") {
				expect(result.exemptionsApplied).toEqual([]);
			} else {
				const expected =
					!row.preserveColorProfile && hasIccKey(row) ? ["F-HEIC-ICC"] : [];
				expect(result.exemptionsApplied).toEqual(expected);
			}
		});

		it("never reports the exemption on a native row and uses it on ICC-bearing ExifTool rows", () => {
			const native = writtenRows.filter((row) => row.engine === "native");
			expect(
				native.every((row) => replay(row).exemptionsApplied.length === 0),
			).toBe(true);
			const used = writtenRows.filter(
				(row) => replay(row).exemptionsApplied.length > 0,
			);
			expect(used.length).toBe(80);
			expect(used.every((row) => row.engine === "exiftool")).toBe(true);
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
