// Phase 69-08 (WEBP-08; D-03, D-04): the committed WebP shape sweep. Every row in
// fixtures/copy_mode_webp_sweep.json is the key set the real bundled ExifTool (13.59) read back
// from a copy written for a WebP shape users actually have (lossless VP8L, alpha, animated, ICC,
// XMP, identifying EXIF+XMP, plus colour and sample sources and three system ICC profiles), over
// all eight orientation x colour-profile x resolution preserve combinations (timestamps off):
//   route "router"          the real HybridMetadataEngine over the real native adapter
//   route "exiftool-direct" ExifToolAdapter.sanitize with the same request (what a fallback or a
//                           rollback would publish)
// This test replays the DATA only (no source import): plan 69-09 transcribes the constants of
// 69-WEBP-SWEEP-MATRIX.md "## Derived allowlist" into copy_mode_leak_check.ts, and the local copies
// below are pinned against the measurement so a transcription error or a new shape that surfaces
// a new key fails here as data, not as a user's rejected Save as copy.
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.resolve(__dirname, "../e2e/fixtures");

interface WebpSweepRow {
	readonly variant: string;
	readonly fixtureSha256: string;
	readonly format: "webp";
	readonly combo: string;
	readonly preserveOrientation: boolean;
	readonly preserveColorProfile: boolean;
	readonly preserveResolution: boolean;
	readonly preserveTimestamps: boolean;
	readonly sourceWebpFlags: string | null;
	readonly webpFlags: string | null;
	readonly fileType: string | null;
	readonly engine: "native" | "exiftool";
	readonly route: "router" | "exiftool-direct";
	readonly outcome: "written" | "declined" | "error";
	readonly keys: readonly string[];
	readonly dirAfter: readonly string[];
	readonly decline?: {
		readonly nativeCode: string;
		readonly phase: string;
		readonly nativeWrite: string;
	};
	readonly error?: string;
}

const rows = (
	JSON.parse(
		fs.readFileSync(
			path.join(__dirname, "fixtures/copy_mode_webp_sweep.json"),
			"utf8",
		),
	) as { readonly rows: readonly WebpSweepRow[] }
).rows;
const writtenRows = rows.filter((row) => row.outcome === "written");
const nativeWritten = writtenRows.filter((row) => row.engine === "native");

const COMBO_COUNT = 8;
const SHAPES = [
	"lossless",
	"alpha",
	"animated",
	"icc",
	"xmp",
	"identifying",
	"truncated",
] as const;

function allOff(row: WebpSweepRow): boolean {
	return (
		!row.preserveOrientation &&
		!row.preserveColorProfile &&
		!row.preserveResolution
	);
}

// Identifying surface (D-03): any XMP-* / ExifIFD / GPS / IFD1 group key, or a free-text IFD0 or
// RIFF key. A written output of a supported shape may carry none of them.
const IDENTIFYING_GROUPS =
	/^(XMP|XMP-[^:]+|ExifIFD|GPS|IFD1|PNG|Photoshop|IPTC|JFIF|MakerNotes):/;
const IDENTIFYING_TAGS = new Set([
	"IFD0:Make",
	"IFD0:Model",
	"IFD0:Artist",
	"IFD0:Software",
	"IFD0:Copyright",
	"IFD0:DateTime",
	"IFD0:ImageDescription",
	"RIFF:Comment",
	"RIFF:Software",
	"RIFF:Artist",
	"RIFF:Copyright",
]);
function identifyingKeysOf(row: {
	readonly keys: readonly string[];
}): string[] {
	return row.keys.filter(
		(key) => IDENTIFYING_GROUPS.test(key) || IDENTIFYING_TAGS.has(key),
	);
}

const ORIENTATION_KEYS = ["IFD0:Orientation"];
const RESOLUTION_KEYS = [
	"IFD0:ResolutionUnit",
	"IFD0:XResolution",
	"IFD0:YResolution",
];
const EXIF_COMPANIONS = ["File:ExifByteOrder", "IFD0:YCbCrPositioning"];
function isIccKey(key: string): boolean {
	return key.startsWith("ICC-") || key.startsWith("ICC_");
}

// The derived constants of 69-WEBP-SWEEP-MATRIX.md, copied verbatim; the tests below pin each
// against the data so 69-09's transcription has a measured oracle.
const DERIVED_ALWAYS = [
	"Composite:ImageSize",
	"Composite:Megapixels",
	"File:FileType",
	"File:FileTypeExtension",
	"File:MIMEType",
	"RIFF:AlphaCompression",
	"RIFF:AlphaFiltering",
	"RIFF:AlphaIsUsed",
	"RIFF:AlphaPreprocessing",
	"RIFF:AnimationLoopCount",
	"RIFF:BackgroundColor",
	"RIFF:Duration",
	"RIFF:HorizontalScale",
	"RIFF:ImageHeight",
	"RIFF:ImageWidth",
	"RIFF:VP8Version",
	"RIFF:VerticalScale",
];
const DERIVED_ORIENTATION = [
	"File:ExifByteOrder",
	"IFD0:Orientation",
	"IFD0:YCbCrPositioning",
];
const DERIVED_RESOLUTION = [
	"File:ExifByteOrder",
	"IFD0:ResolutionUnit",
	"IFD0:XResolution",
	"IFD0:YCbCrPositioning",
	"IFD0:YResolution",
];
const DERIVED_COLOR = [
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
	"ICC-meas:MeasurementBacking",
	"ICC-meas:MeasurementFlare",
	"ICC-meas:MeasurementGeometry",
	"ICC-meas:MeasurementIlluminant",
	"ICC-meas:MeasurementObserver",
	"ICC-view:ViewingCondIlluminant",
	"ICC-view:ViewingCondIlluminantType",
	"ICC-view:ViewingCondSurround",
	"ICC_Profile:BlueMatrixColumn",
	"ICC_Profile:BlueTRC",
	"ICC_Profile:ChromaticAdaptation",
	"ICC_Profile:DeviceMfgDesc",
	"ICC_Profile:DeviceModelDesc",
	"ICC_Profile:GreenMatrixColumn",
	"ICC_Profile:GreenTRC",
	"ICC_Profile:Luminance",
	"ICC_Profile:MediaBlackPoint",
	"ICC_Profile:MediaWhitePoint",
	"ICC_Profile:ProfileCopyright",
	"ICC_Profile:ProfileDescription",
	"ICC_Profile:RedMatrixColumn",
	"ICC_Profile:RedTRC",
	"ICC_Profile:Technology",
	"ICC_Profile:ViewingCondDesc",
];
const WEBP_FILE_TYPES = [
	"Extended WEBP",
	"Extended WEBP (lossless)",
	"WEBP",
	"WEBP (lossless)",
];

// WEBP_FLAGS_RULE of the matrix: value-aware, vocabulary pinned to the print-converted tokens of
// the bundled ExifTool 13.59 with the app's verification arguments. Returns the tokens the
// preservation does NOT permit; an unknown, empty or non-string value is itself unpermitted.
function unpermittedFlagTokens(
	flags: unknown,
	preservation: {
		readonly preserveOrientation: boolean;
		readonly preserveColorProfile: boolean;
		readonly preserveResolution: boolean;
	},
): string[] {
	if (typeof flags !== "string") return ["<non-string>"];
	const out: string[] = [];
	for (const raw of flags.split(",")) {
		const token = raw.trim();
		const permitted =
			token === "Alpha" ||
			token === "Animation" ||
			(token === "EXIF" &&
				(preservation.preserveOrientation ||
					preservation.preserveResolution)) ||
			(token === "ICC Profile" && preservation.preserveColorProfile);
		if (!permitted) out.push(token);
	}
	return out;
}

describe("69-08 WebP sweep data: non-vacuity and coverage", () => {
	it("holds exactly 368 rows: 352 written, 8 declined, 8 errored, 23 variants, all webp", () => {
		expect(rows.length).toBe(368);
		expect(writtenRows.length).toBe(352);
		expect(rows.filter((row) => row.outcome === "declined").length).toBe(8);
		expect(rows.filter((row) => row.outcome === "error").length).toBe(8);
		expect(new Set(rows.map((row) => row.variant)).size).toBe(23);
		expect(rows.every((row) => row.format === "webp")).toBe(true);
		expect(rows.every((row) => row.preserveTimestamps === false)).toBe(true);
	});

	it.each(SHAPES)("has rows for the %s shape", (shape) => {
		const matching = rows.filter((row) => row.variant.includes(shape));
		expect(matching.length).toBeGreaterThanOrEqual(2 * COMBO_COUNT);
	});

	it("every variant has all eight preserve combinations on BOTH routes", () => {
		for (const variant of new Set(rows.map((row) => row.variant))) {
			for (const route of ["router", "exiftool-direct"] as const) {
				const combos = new Set(
					rows
						.filter((row) => row.variant === variant && row.route === route)
						.map((row) => row.combo),
				);
				expect(combos.size, `${variant} ${route}`).toBe(COMBO_COUNT);
			}
		}
	});

	it("native default is confirmed: every router row of every variant except the truncated file was written by native", () => {
		const router = rows.filter(
			(row) => row.route === "router" && !row.variant.includes("truncated"),
		);
		expect(router.length).toBe(176);
		expect(
			router.every(
				(row) => row.engine === "native" && row.outcome === "written",
			),
		).toBe(true);
		// the default combination (all options off) is among them
		expect(router.filter(allOff).length).toBe(22);
	});

	it("rows measured from a committed fixture hash to the committed bytes", () => {
		const checked: string[] = [];
		for (const row of rows) {
			if (row.variant.includes("+")) continue;
			const file = path.join(FIXTURES, row.variant);
			const digest = createHash("sha256")
				.update(fs.readFileSync(file))
				.digest("hex");
			expect(digest, row.variant).toBe(row.fixtureSha256);
			checked.push(row.variant);
		}
		expect(new Set(checked).size).toBe(9);
	});

	it("the destination directory of every row holds exactly the source and (when written) the one output: no stage, no _exiftool_tmp", () => {
		for (const row of rows) {
			const expected =
				row.outcome === "written"
					? ["input-cleaned.webp", "input.webp"]
					: ["input.webp"];
			expect(row.dirAfter, `${row.variant} ${row.combo} ${row.route}`).toEqual(
				expected,
			);
		}
	});

	it("written outputs report exactly the four WebP FileType strings the leak check must map", () => {
		expect([...new Set(writtenRows.map((row) => row.fileType))].sort()).toEqual(
			WEBP_FILE_TYPES,
		);
	});
});

describe("69-08 WebP sweep data: no identifying key, no diagnostic", () => {
	it("no written NATIVE row of any shape carries an XMP-*, ExifIFD, GPS or free-text key", () => {
		expect(nativeWritten.length).toBe(176);
		for (const row of nativeWritten) {
			expect(identifyingKeysOf(row), `${row.variant} ${row.combo}`).toEqual([]);
		}
	});

	it("no written row of either engine carries an identifying key", () => {
		for (const row of writtenRows) {
			expect(identifyingKeysOf(row), `${row.variant} ${row.combo}`).toEqual([]);
		}
	});

	it("negative control: a doctored copy of a native row with an XMP creator key is caught by the identifying check", () => {
		const native = nativeWritten.find((row) => row.variant === "webp_xmp.webp");
		expect(native).toBeDefined();
		if (native === undefined) return;
		expect(identifyingKeysOf(native)).toEqual([]);
		const doctored = { ...native, keys: [...native.keys, "XMP-dc:Creator"] };
		expect(identifyingKeysOf(doctored)).toEqual(["XMP-dc:Creator"]);
		const gps = { ...native, keys: [...native.keys, "GPS:GPSLatitude"] };
		expect(identifyingKeysOf(gps)).toEqual(["GPS:GPSLatitude"]);
		const make = { ...native, keys: [...native.keys, "IFD0:Make"] };
		expect(identifyingKeysOf(make)).toEqual(["IFD0:Make"]);
	});

	it("no written row carries an ExifTool:Warning or ExifTool:Error key (the ExifTool group is exempt in findLeakedTags, so only the sweep can show it)", () => {
		const diagnostic = writtenRows.filter((row) =>
			row.keys.some(
				(key) => key === "ExifTool:Warning" || key === "ExifTool:Error",
			),
		);
		expect(diagnostic.map((row) => `${row.variant} ${row.combo}`)).toEqual([]);
	});

	it("every key of every written row lies in the D-03 frame (plus the measured ICC-meas/ICC-view groups and the exempt ExifTool group)", () => {
		const frame =
			/^(RIFF|File|Composite|IFD0|ICC-header|ICC_Profile|ICC-meas|ICC-view|ExifTool):/;
		const outside = new Set<string>();
		for (const row of writtenRows) {
			for (const key of row.keys) if (!frame.test(key)) outside.add(key);
		}
		expect([...outside]).toEqual([]);
	});

	it("no written row's flags carry the XMP token (no preserve option keeps XMP)", () => {
		expect(
			writtenRows.filter((row) => row.webpFlags?.includes("XMP") === true),
		).toEqual([]);
		// the sources did carry it: the sweep is not vacuous for XMP
		expect(
			rows.filter((row) => row.sourceWebpFlags?.includes("XMP") === true)
				.length,
		).toBeGreaterThan(0);
	});
});

describe("69-08 WebP sweep data: preservation governs exactly its keys", () => {
	it("every written row under all-flags-off has none of the orientation, resolution, EXIF-companion or ICC keys", () => {
		const off = writtenRows.filter(allOff);
		expect(off.length).toBe(44);
		for (const row of off) {
			const forbidden = row.keys.filter(
				(key) =>
					ORIENTATION_KEYS.includes(key) ||
					RESOLUTION_KEYS.includes(key) ||
					EXIF_COMPANIONS.includes(key) ||
					isIccKey(key),
			);
			expect(forbidden, `${row.variant} ${row.route}`).toEqual([]);
			expect(
				row.webpFlags === null ||
					row.webpFlags === "Alpha" ||
					row.webpFlags === "Animation",
			).toBe(true);
		}
	});

	it("orientation keys appear only with preserveOrientation; resolution keys only with preserveResolution; ICC keys only with preserveColorProfile; the EXIF block only with orientation or resolution", () => {
		for (const row of writtenRows) {
			const id = `${row.variant} ${row.combo} ${row.engine}`;
			if (!row.preserveOrientation) {
				expect(
					row.keys.filter((k) => ORIENTATION_KEYS.includes(k)),
					id,
				).toEqual([]);
			}
			if (!row.preserveResolution) {
				expect(
					row.keys.filter((k) => RESOLUTION_KEYS.includes(k)),
					id,
				).toEqual([]);
			}
			if (!row.preserveColorProfile) {
				expect(row.keys.filter(isIccKey), id).toEqual([]);
			}
			if (!row.preserveOrientation && !row.preserveResolution) {
				expect(
					row.keys.filter((k) => EXIF_COMPANIONS.includes(k)),
					id,
				).toEqual([]);
			}
		}
	});

	it("native output never carries the ExifTool-only companion IFD0:YCbCrPositioning; ExifTool output carries it with every EXIF block", () => {
		for (const row of nativeWritten) {
			expect(row.keys, `${row.variant} ${row.combo}`).not.toContain(
				"IFD0:YCbCrPositioning",
			);
		}
		const exiftoolWithExif = writtenRows.filter(
			(row) =>
				row.engine === "exiftool" && row.webpFlags?.includes("EXIF") === true,
		);
		expect(exiftoolWithExif.length).toBeGreaterThan(0);
		expect(
			exiftoolWithExif.every((row) =>
				row.keys.includes("IFD0:YCbCrPositioning"),
			),
		).toBe(true);
	});

	it("both engines emit the same key set modulo the ExifTool companion, for every variant and combination", () => {
		const byKey = new Map<
			string,
			{ native?: WebpSweepRow; exiftool?: WebpSweepRow }
		>();
		for (const row of writtenRows) {
			const id = `${row.variant}|${row.combo}`;
			const slot = byKey.get(id) ?? {};
			if (row.route === "router") slot.native = row;
			else slot.exiftool = row;
			byKey.set(id, slot);
		}
		expect(byKey.size).toBe(176);
		for (const [id, slot] of byKey) {
			expect(slot.native, id).toBeDefined();
			expect(slot.exiftool, id).toBeDefined();
			if (slot.native === undefined || slot.exiftool === undefined) continue;
			expect(
				slot.exiftool.keys.filter((k) => k !== "IFD0:YCbCrPositioning"),
				id,
			).toEqual(slot.native.keys);
		}
	});
});

describe("69-08 WebP sweep data: the derived allowlist is measured, minimal and sufficient", () => {
	it("the always-permitted set equals the union of non-flag keys observed with every option off (minimal: no member without evidence)", () => {
		const observed = new Set<string>();
		for (const row of writtenRows.filter(allOff)) {
			for (const key of row.keys) {
				if (key === "RIFF:WebP_Flags" || key.startsWith("ExifTool:")) continue;
				observed.add(key);
			}
		}
		expect([...observed].sort()).toEqual([...DERIVED_ALWAYS].sort());
	});

	it("the colour-profile set equals the union of ICC keys observed with preserveColorProfile (40 keys across four profiles)", () => {
		const observed = new Set<string>();
		for (const row of writtenRows) {
			for (const key of row.keys) if (isIccKey(key)) observed.add(key);
		}
		expect([...observed].sort()).toEqual([...DERIVED_COLOR].sort());
		expect(DERIVED_COLOR.length).toBe(40);
	});

	it("the orientation set equals the keys that appear only because of preserveOrientation (sufficient and minimal)", () => {
		const observed = new Set<string>();
		for (const row of writtenRows.filter(
			(r) => r.preserveOrientation && !r.preserveResolution,
		)) {
			for (const key of row.keys) {
				if (ORIENTATION_KEYS.includes(key) || EXIF_COMPANIONS.includes(key)) {
					observed.add(key);
				}
			}
		}
		expect([...observed].sort()).toEqual([...DERIVED_ORIENTATION].sort());
	});

	it("the resolution set equals the keys that appear only because of preserveResolution (sufficient and minimal)", () => {
		const observed = new Set<string>();
		for (const row of writtenRows.filter(
			(r) => r.preserveResolution && !r.preserveOrientation,
		)) {
			for (const key of row.keys) {
				if (RESOLUTION_KEYS.includes(key) || EXIF_COMPANIONS.includes(key)) {
					observed.add(key);
				}
			}
		}
		expect([...observed].sort()).toEqual([...DERIVED_RESOLUTION].sort());
	});

	it("every key of every written row is permitted by the derived sets under that row's preservation (sufficiency across 352 rows)", () => {
		for (const row of writtenRows) {
			const permitted = new Set<string>(DERIVED_ALWAYS);
			if (row.preserveOrientation)
				for (const key of DERIVED_ORIENTATION) permitted.add(key);
			if (row.preserveResolution)
				for (const key of DERIVED_RESOLUTION) permitted.add(key);
			if (row.preserveColorProfile)
				for (const key of DERIVED_COLOR) permitted.add(key);
			const unpermitted = row.keys.filter(
				(key) =>
					key !== "RIFF:WebP_Flags" &&
					!key.startsWith("ExifTool:") &&
					!permitted.has(key),
			);
			expect(unpermitted, `${row.variant} ${row.combo} ${row.engine}`).toEqual(
				[],
			);
		}
	});

	it("the value-aware flags rule permits every measured flag value under its row's preservation", () => {
		for (const row of writtenRows) {
			if (row.webpFlags === null) {
				expect(row.keys, `${row.variant} ${row.combo}`).not.toContain(
					"RIFF:WebP_Flags",
				);
				continue;
			}
			expect(row.keys).toContain("RIFF:WebP_Flags");
			expect(
				unpermittedFlagTokens(row.webpFlags, row),
				`${row.variant} ${row.combo} ${row.engine}: ${row.webpFlags}`,
			).toEqual([]);
		}
	});

	it("cross-check: the EXIF token is present iff an orientation or resolution key is, the ICC Profile token iff ICC keys are", () => {
		for (const row of writtenRows) {
			const tokens = (row.webpFlags ?? "").split(",").map((t) => t.trim());
			const hasExifKeys = row.keys.some(
				(k) => ORIENTATION_KEYS.includes(k) || RESOLUTION_KEYS.includes(k),
			);
			expect(tokens.includes("EXIF"), `${row.variant} ${row.combo}`).toBe(
				hasExifKeys,
			);
			expect(
				tokens.includes("ICC Profile"),
				`${row.variant} ${row.combo}`,
			).toBe(row.keys.some(isIccKey));
		}
	});

	it("measured flag vocabulary is exactly Alpha, Animation, EXIF, ICC Profile (never XMP)", () => {
		const tokens = new Set<string>();
		for (const row of writtenRows) {
			if (row.webpFlags === null) continue;
			for (const t of row.webpFlags.split(",")) tokens.add(t.trim());
		}
		expect([...tokens].sort()).toEqual([
			"Alpha",
			"Animation",
			"EXIF",
			"ICC Profile",
		]);
	});

	it("flags rule negative controls: XMP, an unknown token, an empty value, a non-string and EXIF/ICC without their option all fail closed", () => {
		const off = {
			preserveOrientation: false,
			preserveColorProfile: false,
			preserveResolution: false,
		};
		expect(unpermittedFlagTokens("Alpha", off)).toEqual([]);
		expect(unpermittedFlagTokens("Animation", off)).toEqual([]);
		expect(
			unpermittedFlagTokens("XMP", { ...off, preserveOrientation: true }),
		).toEqual(["XMP"]);
		expect(
			unpermittedFlagTokens("EXIF, XMP", { ...off, preserveResolution: true }),
		).toEqual(["XMP"]);
		expect(unpermittedFlagTokens("EXIF", off)).toEqual(["EXIF"]);
		expect(unpermittedFlagTokens("ICC Profile", off)).toEqual(["ICC Profile"]);
		expect(
			unpermittedFlagTokens("EXIF", { ...off, preserveResolution: true }),
		).toEqual([]);
		expect(
			unpermittedFlagTokens("ICC Profile", {
				...off,
				preserveColorProfile: true,
			}),
		).toEqual([]);
		expect(unpermittedFlagTokens("Lossless Magic", off)).toEqual([
			"Lossless Magic",
		]);
		expect(unpermittedFlagTokens("", off)).toEqual([""]);
		expect(unpermittedFlagTokens(undefined, off)).toEqual(["<non-string>"]);
		expect(unpermittedFlagTokens(3, off)).toEqual(["<non-string>"]);
	});
});

describe("69-08 WebP sweep data: shapes and the truncated fallback", () => {
	const SHAPE_KEYS: ReadonlyArray<
		readonly [string, readonly string[], string]
	> = [
		["webp_lossless.webp", ["RIFF:AlphaIsUsed"], "WEBP (lossless)"],
		[
			"webp_alpha.webp",
			[
				"RIFF:AlphaCompression",
				"RIFF:AlphaFiltering",
				"RIFF:AlphaPreprocessing",
			],
			"Extended WEBP",
		],
		[
			"webp_animated.webp",
			["RIFF:AnimationLoopCount", "RIFF:BackgroundColor", "RIFF:Duration"],
			"Extended WEBP",
		],
	];

	it.each(SHAPE_KEYS)(
		"%s keeps its structural keys on both engines under every combination",
		(variant, structuralKeys, fileType) => {
			const sub = writtenRows.filter((row) => row.variant === variant);
			expect(sub.length).toBe(16);
			for (const row of sub) {
				for (const key of structuralKeys) {
					expect(row.keys, `${row.combo} ${row.engine}`).toContain(key);
				}
				expect(row.fileType).toBe(fileType);
			}
		},
	);

	it("alpha and animated outputs keep their VP8X flag with every option off (a blanket flags-only-with-an-option rule would refuse them)", () => {
		for (const [variant, flag] of [
			["webp_alpha.webp", "Alpha"],
			["webp_animated.webp", "Animation"],
		] as const) {
			const off = writtenRows.filter(
				(row) => row.variant === variant && allOff(row),
			);
			expect(off.length).toBe(2);
			expect(off.every((row) => row.webpFlags === flag)).toBe(true);
		}
	});

	it("the truncated file: native declines malformed-file in admission before writing, the ExifTool fallback fails, nothing is published, on all 8 combinations and both routes", () => {
		const truncated = rows.filter(
			(row) => row.variant === "webp_truncated.webp",
		);
		expect(truncated.length).toBe(16);
		const router = truncated.filter((row) => row.route === "router");
		const direct = truncated.filter((row) => row.route === "exiftool-direct");
		expect(router.length).toBe(8);
		expect(direct.length).toBe(8);
		for (const row of router) {
			expect(row.outcome).toBe("declined");
			expect(row.decline).toEqual({
				nativeCode: "malformed-file",
				phase: "admission",
				nativeWrite: "not-started",
			});
			expect(row.error).toContain("engine-error");
		}
		for (const row of direct) {
			expect(row.outcome).toBe("error");
			expect(row.error).toContain("0 image files updated");
		}
		for (const row of truncated) {
			expect(row.keys).toEqual([]);
			expect(row.dirAfter).toEqual(["input.webp"]);
		}
	});

	it("the system ICC profiles add exactly the measured extension keys with the colour profile on and nothing with it off", () => {
		const extra = new Map<string, Set<string>>();
		for (const row of writtenRows) {
			const profile = ["srgb-iec61966-2.1", "adobergb1998", "displayp3"].find(
				(p) => row.variant.endsWith(`icc-${p}`),
			);
			if (profile === undefined) continue;
			const iccKeys = row.keys.filter(isIccKey);
			if (!row.preserveColorProfile) {
				expect(iccKeys, `${row.variant} ${row.combo}`).toEqual([]);
				continue;
			}
			const slot = extra.get(profile) ?? new Set<string>();
			for (const key of iccKeys) slot.add(key);
			extra.set(profile, slot);
		}
		expect(extra.get("srgb-iec61966-2.1")?.size).toBe(39);
		expect(extra.get("adobergb1998")?.size).toBe(26);
		expect(extra.get("displayp3")?.size).toBe(26);
		expect(extra.get("adobergb1998")?.has("ICC_Profile:MediaBlackPoint")).toBe(
			true,
		);
		expect(extra.get("displayp3")?.has("ICC_Profile:ChromaticAdaptation")).toBe(
			true,
		);
	});
});
