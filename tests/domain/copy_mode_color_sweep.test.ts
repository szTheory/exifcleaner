// Phase 69-03 (OVR-01; D-22b, amendment A2): the committed per-format colour sweep. Every row in
// fixtures/copy_mode_color_sweep.json is the key set the real bundled ExifTool (13.59) read back
// from a copy written by one of the two engines for a colour source, over all eight
// orientation x colour-profile x resolution preserve combinations (timestamps off):
//   route "router"          the real HybridMetadataEngine, whichever engine it picked
//   route "exiftool-direct" ExifToolAdapter.sanitize with the same request (what a fallback or a
//                           rollback would publish; recorded for every natively written variant)
// The test replays findLeakedTags over the committed data, so a new colour source that surfaces a
// structural key fails here as data, not as a user's rejected Save as copy.
//
// WebP rows are replayed here without the flags key; the WebP allowlist itself is 69-09's, replayed
// with recorded flag values in copy_mode_webp_sweep.test.ts.
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
	copyModeLeakCheckFormatOf,
	findLeakedTags,
} from "../../src/domain/exif/copy_mode_leak_check";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.resolve(__dirname, "../e2e/fixtures");

interface ColorSweepRow {
	readonly variant: string;
	readonly fixtureSha256: string;
	readonly format: "jpeg" | "png" | "heic" | "avif" | "webp";
	readonly combo: string;
	readonly preserveOrientation: boolean;
	readonly preserveColorProfile: boolean;
	readonly preserveResolution: boolean;
	readonly preserveTimestamps: boolean;
	readonly fileType: string | null;
	readonly engine: "native" | "exiftool";
	readonly route: "router" | "exiftool-direct";
	readonly outcome: "written" | "declined" | "error";
	readonly keys: readonly string[];
}

const rows = (
	JSON.parse(
		fs.readFileSync(
			path.join(__dirname, "fixtures/copy_mode_color_sweep.json"),
			"utf8",
		),
	) as { readonly rows: readonly ColorSweepRow[] }
).rows;
const writtenRows = rows.filter((row) => row.outcome === "written");

function recordFromKeys(keys: readonly string[]): Record<string, unknown> {
	return Object.fromEntries(keys.map((key) => [key, "placeholder-value"]));
}

function replay(row: ColorSweepRow) {
	const format = copyModeLeakCheckFormatOf({ fileType: row.fileType });
	if (format === undefined || row.fileType === null) {
		throw new Error(`no leak-check format for row ${row.variant} ${row.combo}`);
	}
	return findLeakedTags({
		record: recordFromKeys(row.keys),
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

const ALLOWLISTED = new Set(["jpeg", "png", "heic", "avif"]);
const allowlistedRows = writtenRows.filter((row) =>
	ALLOWLISTED.has(row.format),
);

// The 63-06 link-u cavif AVIF carries a free-text QuickTime:HandlerDescription that the allowlist
// deliberately never permits (D-15, D-17: the standing fail-closed control). It is the one named
// reason a written row of an allowlisted format may report a leak.
const HANDLER_DESCRIPTION = "QuickTime:HandlerDescription";

// Seeded identifying keys of the colour fixtures (COLOR-PROVENANCE.md) and of the HEIF seed. None
// may survive into any written output of any engine.
const IDENTIFYING_KEYS = [
	"IFD0:Make",
	"IFD0:Model",
	"IFD0:Artist",
	"IFD0:Copyright",
	"ExifIFD:DateTimeOriginal",
	"GPS:GPSLatitude",
	"GPS:GPSLongitude",
	"XMP-dc:Creator",
	"PNG:Comment",
] as const;

describe("69-03 colour sweep data: non-vacuity", () => {
	it("holds at least 480 written rows and no declined or errored row", () => {
		expect(writtenRows.length).toBeGreaterThanOrEqual(480);
		expect(rows.length).toBe(writtenRows.length);
	});

	it("covers all five formats", () => {
		const formats = new Set(rows.map((row) => row.format));
		expect([...formats].sort()).toEqual([
			"avif",
			"heic",
			"jpeg",
			"png",
			"webp",
		]);
	});

	it.each(["jpeg", "png"] as const)(
		"%s rows come from both engines (router native and the ExifTool direct route)",
		(format) => {
			const sub = writtenRows.filter((row) => row.format === format);
			expect(sub.some((row) => row.engine === "native")).toBe(true);
			expect(sub.some((row) => row.route === "exiftool-direct")).toBe(true);
		},
	);

	it("every variant has all eight preserve combinations on the router route", () => {
		const variants = new Set(rows.map((row) => row.variant));
		for (const variant of variants) {
			const combos = new Set(
				rows
					.filter((row) => row.variant === variant && row.route === "router")
					.map((row) => row.combo),
			);
			expect(combos.size, variant).toBe(8);
		}
	});

	it("colour JPEG rows carry File:YCbCrSubSampling (the measured colour signal)", () => {
		const jpeg = writtenRows.filter(
			(row) => row.format === "jpeg" && row.variant.startsWith("color_"),
		);
		expect(jpeg.length).toBeGreaterThan(0);
		expect(
			jpeg.every((row) => row.keys.includes("File:YCbCrSubSampling")),
		).toBe(true);
	});

	it("rows measured from a committed fixture hash to the committed bytes", () => {
		const checked: string[] = [];
		for (const row of rows) {
			if (row.variant.includes("+seeded")) continue;
			const file = path.join(FIXTURES, row.variant);
			if (!fs.existsSync(file)) continue;
			const digest = createHash("sha256")
				.update(fs.readFileSync(file))
				.digest("hex");
			expect(digest, row.variant).toBe(row.fixtureSha256);
			checked.push(row.variant);
		}
		expect(new Set(checked).size).toBeGreaterThanOrEqual(5);
	});
});

describe("69-03 colour sweep data: classification", () => {
	it.each(
		allowlistedRows.map(
			(row) =>
				[
					`${row.variant} ${row.combo} ${row.route} ${row.engine}`,
					row,
				] as const,
		),
	)("replays %s as the allowlist predicts", (_label, row) => {
		const result = replay(row);
		if (row.keys.includes(HANDLER_DESCRIPTION)) {
			expect(result.leakedTags).toEqual([HANDLER_DESCRIPTION]);
		} else {
			expect(result.leakedTags).toEqual([]);
		}
	});

	it("only the link-u AVIF control row set reports the handler description", () => {
		const withHandler = writtenRows.filter((row) =>
			row.keys.includes(HANDLER_DESCRIPTION),
		);
		expect(withHandler.length).toBeGreaterThan(0);
		expect(
			withHandler.every((row) =>
				row.variant.startsWith(
					"red-at-12-oclock-with-color-profile-lossy.avif",
				),
			),
		).toBe(true);
	});

	it("no written row of any engine or format carries an ExifTool:Warning or ExifTool:Error key", () => {
		// findLeakedTags exempts the ExifTool group wholesale, so only the sweep can show that a
		// colour source does not make the real ExifTool raise a (fatal, under output verification)
		// diagnostic.
		const diagnostic = writtenRows.filter((row) =>
			row.keys.some(
				(key) => key === "ExifTool:Warning" || key === "ExifTool:Error",
			),
		);
		expect(diagnostic.map((row) => `${row.variant} ${row.combo}`)).toEqual([]);
	});

	it("no seeded identifying key survives into any written output", () => {
		const surviving = writtenRows.filter((row) =>
			IDENTIFYING_KEYS.some((key) => row.keys.includes(key)),
		);
		expect(
			surviving.map((row) => `${row.variant} ${row.combo} ${row.route}`),
		).toEqual([]);
	});

	// 69-09: WebP has its allowlist. These rows hold key names only (no RIFF:WebP_Flags value was
	// recorded in the colour sweep), so the replay judges every key but the flags key, which the
	// 69-08 WebP sweep replays with its recorded values (copy_mode_webp_sweep.test.ts).
	it("WebP rows map to the webp format and pass the allowlist under their own flags (69-09)", () => {
		const webp = writtenRows.filter((row) => row.format === "webp");
		expect(webp.length).toBeGreaterThanOrEqual(16);
		for (const row of webp) {
			expect(row.fileType === "WEBP" || row.fileType === "Extended WEBP").toBe(
				true,
			);
			expect(row.keys).toContain("File:FileType");
			expect(copyModeLeakCheckFormatOf({ fileType: row.fileType })).toBe(
				"webp",
			);
			const withoutFlags: ColorSweepRow = {
				...row,
				keys: row.keys.filter((key) => key !== "RIFF:WebP_Flags"),
			};
			expect(
				replay(withoutFlags).leakedTags,
				`${row.variant} ${row.combo} ${row.route}`,
			).toEqual([]);
		}
	});

	it("negative control: a planted identifying key on a measured row is reported, alone", () => {
		const base = allowlistedRows.find(
			(row) =>
				row.format === "jpeg" &&
				row.engine === "native" &&
				row.combo === "orientation+colorProfile+resolution",
		);
		expect(base).toBeDefined();
		if (base === undefined) return;
		const planted: ColorSweepRow = {
			...base,
			keys: [...base.keys, "XMP-dc:Creator"],
		};
		expect(replay(base).leakedTags).toEqual([]);
		expect(replay(planted).leakedTags).toEqual(["XMP-dc:Creator"]);
	});
});

// 69-03 Task 2 (A2, review B3): ICC tag sets measured on the profiles people actually have. The
// three system profiles are embedded in scratch copies only (their bytes are never committed; the
// rows hold key names); color_icc_p3.jpg/png are committed and embed the profile extracted from the
// committed red-at-12-oclock AVIF (a ColorSpin sRGB v2.1 profile with no chad and no bkpt tag).
describe("69-03 colour sweep data: ICC profiles", () => {
	const iccRows = writtenRows.filter(
		(row) =>
			(row.format === "jpeg" || row.format === "png") &&
			(row.variant.startsWith("icc-") || row.variant.startsWith("color_icc_")),
	);
	const isIcc = (key: string): boolean =>
		key.startsWith("ICC-") || key.startsWith("ICC_Profile:");
	const keysOf = (variantPrefix: string, format: string): Set<string> =>
		new Set(
			iccRows
				.filter(
					(row) =>
						row.variant.startsWith(variantPrefix) &&
						row.format === format &&
						row.preserveColorProfile,
				)
				.flatMap((row) => [...row.keys]),
		);

	it("covers three system profiles on both routes and the committed fixture, JPEG and PNG", () => {
		const rowsFor = (variant: string, format: string) =>
			iccRows.filter(
				(row) =>
					row.variant.startsWith(variant) &&
					row.format === format &&
					row.preserveColorProfile,
			);
		for (const format of ["jpeg", "png"] as const) {
			for (const variant of [
				"icc-srgb-iec61966-2.1",
				"icc-adobergb1998",
				"icc-displayp3",
			]) {
				const routes = new Set(
					rowsFor(variant, format).map((row) => row.route),
				);
				expect([...routes].sort(), `${variant} ${format}`).toEqual([
					"exiftool-direct",
					"router",
				]);
			}
			// The router hands the committed fixture (profile with no chad/bkpt) to the ExifTool
			// engine when the colour profile is kept (the native engine declines before writing);
			// every written row must still verify.
			expect(
				rowsFor("color_icc_p3", format).length,
				`color_icc_p3 ${format}`,
			).toBeGreaterThanOrEqual(4);
		}
	});

	it("with preserveColorProfile off no ICC key survives on either engine", () => {
		const off = iccRows.filter((row) => !row.preserveColorProfile);
		expect(off.length).toBeGreaterThan(0);
		expect(
			off.filter((row) => row.keys.some(isIcc)).map((row) => row.variant),
		).toEqual([]);
	});

	it("with preserveColorProfile on every row keeps the profile (non-vacuous)", () => {
		const on = iccRows.filter((row) => row.preserveColorProfile);
		expect(on.length).toBeGreaterThan(0);
		expect(
			on.every((row) => row.keys.includes("ICC_Profile:ProfileDescription")),
		).toBe(true);
	});

	it.each(["jpeg", "png"] as const)(
		"%s: the measured colorimetry and descriptor keys are present for the profiles that carry them",
		(format) => {
			expect(keysOf("icc-displayp3", format)).toContain(
				"ICC_Profile:ChromaticAdaptation",
			);
			expect(keysOf("icc-adobergb1998", format)).toContain(
				"ICC_Profile:MediaBlackPoint",
			);
			const srgb = keysOf("icc-srgb-iec61966-2.1", format);
			for (const key of [
				"ICC_Profile:MediaBlackPoint",
				"ICC_Profile:DeviceMfgDesc",
				"ICC_Profile:DeviceModelDesc",
				"ICC_Profile:ViewingCondDesc",
				"ICC_Profile:Luminance",
				"ICC_Profile:Technology",
				"ICC-meas:MeasurementObserver",
				"ICC-view:ViewingCondSurround",
			]) {
				expect(srgb, key).toContain(key);
			}
			// The committed fixture's profile carries neither tag the #404 hypothesis names.
			const committed = keysOf("color_icc_p3", format);
			expect(committed).not.toContain("ICC_Profile:ChromaticAdaptation");
			expect(committed).not.toContain("ICC_Profile:MediaBlackPoint");
		},
	);

	it("the keys are classified identically by both engines (same key set per variant and combo)", () => {
		const byKey = new Map<string, string>();
		for (const row of iccRows) {
			const id = `${row.variant} ${row.combo}`;
			const iccKeys = row.keys.filter(isIcc).join(",");
			const seen = byKey.get(id);
			if (seen === undefined) byKey.set(id, iccKeys);
			else expect(iccKeys, id).toBe(seen);
		}
	});
});

// 69-03 Task 3 (A2 stretch, one bounded pass): variants beyond one-colour-fixture-per-format. Rows
// are data only (no source bytes committed); the variants were generated in scratch with cjpeg,
// magick, avifenc and a synthetic JUMBF box, then seeded with the HEIF seed.
describe("69-03 colour sweep data: stretch variants", () => {
	const variantRows = (name: string) =>
		writtenRows.filter((row) => row.variant === name);

	it.each([
		"jpeg_422",
		"jpeg_420_baseline",
		"jpeg_gray_progressive",
		"jpeg_cmyk_adobe",
		"jpeg_c2pa_jumbf",
		"png_16bit",
		"png_palette",
		"png_alpha",
		"png_interlaced",
		"png_text_after_idat",
		"png_c2pa_cabx",
		"avif_icc_srgb-iec",
		"avif_icc_adobergb",
		"avif_icc_displayp3",
	])("%s has all 8 combinations on both routes", (name) => {
		const rowsOf = variantRows(name);
		expect(new Set(rowsOf.map((row) => row.combo)).size).toBe(8);
		expect(new Set(rowsOf.map((row) => row.route))).toEqual(
			new Set(["router", "exiftool-direct"]),
		);
	});

	it("chroma subsampling is reported for 4:2:2 and 4:2:0 and absent for grayscale and CMYK (controls)", () => {
		for (const name of ["jpeg_422", "jpeg_420_baseline"]) {
			expect(
				variantRows(name).every((row) =>
					row.keys.includes("File:YCbCrSubSampling"),
				),
				name,
			).toBe(true);
		}
		for (const name of ["jpeg_gray_progressive", "jpeg_cmyk_adobe"]) {
			expect(
				variantRows(name).some((row) =>
					row.keys.includes("File:YCbCrSubSampling"),
				),
				name,
			).toBe(false);
		}
	});

	it("C2PA/JUMBF content credentials are removed by both engines (no JUMBF key in any written row)", () => {
		const survivors = writtenRows.filter((row) =>
			row.keys.some((key) => key.startsWith("JUMBF:")),
		);
		expect(survivors.map((row) => `${row.variant} ${row.route}`)).toEqual([]);
		expect(variantRows("jpeg_c2pa_jumbf").length).toBeGreaterThan(0);
		expect(variantRows("png_c2pa_cabx").length).toBeGreaterThan(0);
	});

	it("the CMYK/Adobe JPEG keeps only the already-permitted Adobe APP14 keys", () => {
		const adobe = new Set(
			variantRows("jpeg_cmyk_adobe").flatMap((row) =>
				row.keys.filter((key) => key.startsWith("Adobe:")),
			),
		);
		expect([...adobe].sort()).toEqual([
			"Adobe:APP14Flags0",
			"Adobe:APP14Flags1",
			"Adobe:ColorTransform",
			"Adobe:DCTEncodeVersion",
		]);
	});

	it("AVIF with the system sRGB IEC61966-2.1 profile carries the measured ICC keys on both engines when the profile is kept", () => {
		const on = variantRows("avif_icc_srgb-iec").filter(
			(row) => row.preserveColorProfile,
		);
		expect(new Set(on.map((row) => row.engine))).toEqual(
			new Set(["native", "exiftool"]),
		);
		for (const row of on) {
			expect(row.keys).toContain("ICC_Profile:MediaBlackPoint");
			expect(row.keys).toContain("ICC-meas:MeasurementObserver");
		}
	});
});
