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
// WebP rows are measured and shape-checked only: the WebP allowlist is plan 69-09's.
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
	it("holds at least 150 written rows and no declined or errored row", () => {
		expect(writtenRows.length).toBeGreaterThanOrEqual(150);
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

	it("WebP rows are shape-checked only (the WebP allowlist belongs to plan 69-09)", () => {
		const webp = writtenRows.filter((row) => row.format === "webp");
		expect(webp.length).toBeGreaterThanOrEqual(16);
		for (const row of webp) {
			expect(row.fileType === "WEBP" || row.fileType === "Extended WEBP").toBe(
				true,
			);
			expect(row.keys).toContain("File:FileType");
			expect(copyModeLeakCheckFormatOf({ fileType: row.fileType })).toBe(
				undefined,
			);
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
