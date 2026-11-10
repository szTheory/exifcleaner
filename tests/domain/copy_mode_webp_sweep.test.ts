// Phase 69-09 (WEBP-08; D-03, D-04, D-05): replays the committed 69-08 WebP sweep
// (fixtures/copy_mode_webp_sweep.json, 368 rows measured with the real bundled ExifTool 13.59) through
// the real findLeakedTags / copyModeLeakCheckFormatOf. Every row of a WRITTEN output must be
// accepted under the preserve flags it was written with; the shapes 69-08 decided on
// (69-WEBP-SWEEP-MATRIX.md "## Shape decisions") are asserted exactly: none is a refusal, only the
// truncated file is not written (nothing to leak-check). The oracle for the stricter replay is
// typed independently from the matrix, not imported from the source. A new shape that surfaces a new
// key fails here as data, not as a user's rejected Save as copy.
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
	copyModeLeakCheckFormatOf,
	findLeakedTags,
} from "../../src/domain/exif/copy_mode_leak_check";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface WebpSweepRow {
	readonly variant: string;
	readonly combo: string;
	readonly preserveOrientation: boolean;
	readonly preserveColorProfile: boolean;
	readonly preserveResolution: boolean;
	readonly webpFlags: string | null;
	readonly fileType: string | null;
	readonly engine: "native" | "exiftool";
	readonly route: "router" | "exiftool-direct";
	readonly outcome: "written" | "declined" | "error";
	readonly keys: readonly string[];
	readonly dirAfter: readonly string[];
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
const notWritten = rows.filter((row) => row.outcome !== "written");

const FLAGS_KEY = "RIFF:WebP_Flags";

// Independent oracle: keys that exist only because a preserve option asked for them.
const OPTION_ONLY_KEYS = new Set([
	"File:ExifByteOrder",
	"IFD0:Orientation",
	"IFD0:ResolutionUnit",
	"IFD0:XResolution",
	"IFD0:YCbCrPositioning",
	"IFD0:YResolution",
]);
function isIccKey(key: string): boolean {
	return key.startsWith("ICC-") || key.startsWith("ICC_");
}

function recordOf(row: WebpSweepRow): Record<string, unknown> {
	const record: Record<string, unknown> = {};
	for (const key of row.keys) {
		record[key] = key === FLAGS_KEY ? row.webpFlags : "placeholder-value";
	}
	return record;
}

type Preservation = {
	preserveOrientation: boolean;
	preserveColorProfile: boolean;
	preserveResolution: boolean;
};

function replay(
	row: WebpSweepRow,
	preservation: Preservation,
	record: Record<string, unknown> = recordOf(row),
) {
	const format = copyModeLeakCheckFormatOf({ fileType: row.fileType });
	if (format === undefined || row.fileType === null) {
		throw new Error(`no leak-check format for ${row.variant} ${row.combo}`);
	}
	return findLeakedTags({
		record,
		format,
		writtenBy: row.engine,
		fileType: row.fileType,
		preservation,
	}).leakedTags;
}

const ownFlags = (row: WebpSweepRow): Preservation => ({
	preserveOrientation: row.preserveOrientation,
	preserveColorProfile: row.preserveColorProfile,
	preserveResolution: row.preserveResolution,
});
const ALL_OFF: Preservation = {
	preserveOrientation: false,
	preserveColorProfile: false,
	preserveResolution: false,
};

describe("69-09 WebP sweep replay: non-vacuity", () => {
	it("holds the 368 measured rows: 352 written, 16 not written", () => {
		expect(rows).toHaveLength(368);
		expect(writtenRows).toHaveLength(352);
		expect(notWritten).toHaveLength(16);
	});

	it("covers all four reopened FileType strings and maps every one to webp", () => {
		const types = new Set(writtenRows.map((row) => row.fileType));
		expect([...types].sort()).toEqual([
			"Extended WEBP",
			"Extended WEBP (lossless)",
			"WEBP",
			"WEBP (lossless)",
		]);
		for (const row of writtenRows) {
			expect(copyModeLeakCheckFormatOf({ fileType: row.fileType })).toBe(
				"webp",
			);
		}
	});

	it("carries rows from both engines and both routes", () => {
		expect(writtenRows.some((row) => row.engine === "native")).toBe(true);
		expect(writtenRows.some((row) => row.engine === "exiftool")).toBe(true);
		expect(writtenRows.some((row) => row.route === "exiftool-direct")).toBe(
			true,
		);
	});

	it("the flags key and its recorded value agree on every written row", () => {
		for (const row of writtenRows) {
			expect(row.keys.includes(FLAGS_KEY), `${row.variant} ${row.combo}`).toBe(
				row.webpFlags !== null,
			);
		}
	});

	it("every measured flag token of the data is one of the five pinned print tokens", () => {
		const tokens = new Set<string>();
		for (const row of writtenRows) {
			for (const token of (row.webpFlags ?? "").split(",")) {
				if (token.trim().length > 0) tokens.add(token.trim());
			}
		}
		expect([...tokens].sort()).toEqual([
			"Alpha",
			"Animation",
			"EXIF",
			"ICC Profile",
		]);
	});
});

describe("69-09 WebP sweep replay: every written row passes under its own flags", () => {
	it("accepts all 352 written rows", () => {
		const failures = writtenRows
			.map((row) => ({
				row: `${row.variant} ${row.combo} ${row.route}`,
				leaks: replay(row, ownFlags(row)),
			}))
			.filter((entry) => entry.leaks.length > 0);
		expect(failures).toEqual([]);
	});

	it("accepts the 44 all-flags-off rows (the default combination) including the structural alpha, lossless and animation shapes", () => {
		const off = writtenRows.filter(
			(row) =>
				!row.preserveOrientation &&
				!row.preserveColorProfile &&
				!row.preserveResolution,
		);
		expect(off).toHaveLength(44);
		for (const row of off) {
			expect(replay(row, ALL_OFF), `${row.variant} ${row.route}`).toEqual([]);
		}
		const shapes = new Set(
			off.map((row) => row.variant.replace(/\.webp.*$/, "")),
		);
		for (const shape of ["webp_lossless", "webp_alpha", "webp_animated"]) {
			expect(shapes.has(shape), shape).toBe(true);
		}
		// The alpha and animation shapes carry their flag token with every option off: a blanket
		// "flags only when an option is on" rule would refuse them (review N3).
		expect(
			off.filter((row) => row.webpFlags === "Alpha").length,
		).toBeGreaterThan(0);
		expect(
			off.filter((row) => row.webpFlags === "Animation").length,
		).toBeGreaterThan(0);
	});

	it("accepts every row under all options on as well (a looser request never narrows the allowlist)", () => {
		for (const row of writtenRows) {
			expect(
				replay(row, {
					preserveOrientation: true,
					preserveColorProfile: true,
					preserveResolution: true,
				}),
				`${row.variant} ${row.combo}`,
			).toEqual([]);
		}
	});

	it("no written row carries an ExifTool:Warning or ExifTool:Error key (the ExifTool group is exempt, so only the data can show it)", () => {
		const keys = writtenRows.flatMap((row) =>
			row.keys.filter((key) => /^ExifTool:(Warning|Error)$/.test(key)),
		);
		expect(keys).toEqual([]);
	});
});

describe("69-09 WebP sweep replay: the stricter replay is non-vacuous", () => {
	// Judged under ALL OFF, a row leaks exactly the option-dependent keys it carries (independent
	// oracle), plus RIFF:WebP_Flags when its value names EXIF or ICC Profile.
	function expectedLeaksAllOff(row: WebpSweepRow): string[] {
		const leaks = row.keys.filter(
			(key) => OPTION_ONLY_KEYS.has(key) || isIccKey(key),
		);
		const tokens = (row.webpFlags ?? "").split(",").map((t) => t.trim());
		if (tokens.includes("EXIF") || tokens.includes("ICC Profile")) {
			leaks.push(FLAGS_KEY);
		}
		return [...new Set(leaks)].sort();
	}

	it("reports exactly the option-dependent keys when a row is judged with every option off", () => {
		let withLeaks = 0;
		for (const row of writtenRows) {
			const expected = expectedLeaksAllOff(row);
			if (expected.length > 0) withLeaks += 1;
			expect(
				replay(row, ALL_OFF),
				`${row.variant} ${row.combo} ${row.route}`,
			).toEqual(expected);
		}
		// 352 written rows minus the 44 default-combination rows; the rest keep a flag-dependent key
		// only where the source carried matching metadata, so the count is measured, not derived.
		expect(withLeaks).toBeGreaterThan(100);
	});

	it("reports the ICC keys of an ICC row judged without the colour profile, and accepts them with it", () => {
		const iccRows = writtenRows.filter(
			(row) =>
				row.preserveColorProfile && row.keys.some((key) => isIccKey(key)),
		);
		expect(iccRows.length).toBeGreaterThan(40);
		for (const row of iccRows) {
			const withoutColor = replay(row, {
				...ownFlags(row),
				preserveColorProfile: false,
			});
			expect(withoutColor).toContain(FLAGS_KEY);
			expect(withoutColor.some((key) => isIccKey(key))).toBe(true);
			expect(replay(row, ownFlags(row))).toEqual([]);
		}
	});

	it("planted identifying keys are caught on every written row, whatever the flags", () => {
		for (const row of writtenRows) {
			const record = {
				...recordOf(row),
				"XMP-dc:Creator": "ZZLEAK-69",
				"GPS:GPSLatitude": "ZZLEAK-69",
				"IFD0:Make": "ZZLEAK-69",
			};
			expect(
				replay(row, ownFlags(row), record),
				`${row.variant} ${row.combo}`,
			).toEqual(["GPS:GPSLatitude", "IFD0:Make", "XMP-dc:Creator"]);
		}
	});

	it("an XMP token planted into the flags value is caught on every written row, under all options on", () => {
		for (const row of writtenRows) {
			const record = {
				...recordOf(row),
				[FLAGS_KEY]: row.webpFlags === null ? "XMP" : `${row.webpFlags}, XMP`,
			};
			expect(
				replay(
					row,
					{
						preserveOrientation: true,
						preserveColorProfile: true,
						preserveResolution: true,
					},
					record,
				),
				`${row.variant} ${row.combo}`,
			).toEqual([FLAGS_KEY]);
		}
	});

	it("an EXIF token planted into a row that never had one is caught when no option permits it", () => {
		const row = writtenRows.find(
			(candidate) =>
				candidate.variant === "webp_alpha.webp" &&
				candidate.combo === "none" &&
				candidate.route === "router",
		);
		expect(row).toBeDefined();
		if (row === undefined) return;
		expect(row.webpFlags).toBe("Alpha");
		const record = { ...recordOf(row), [FLAGS_KEY]: "EXIF, Alpha" };
		expect(replay(row, ALL_OFF, record)).toEqual([FLAGS_KEY]);
	});
});

describe("69-09 WebP sweep replay: shape decisions of 69-08", () => {
	it("no shape is decided as a refusal: every written row of every shape passed above", () => {
		const shapes = new Set(
			writtenRows.map((row) => row.variant.replace(/\.webp.*$/, "")),
		);
		for (const shape of [
			"webp_lossless",
			"webp_alpha",
			"webp_animated",
			"webp_icc",
			"webp_xmp",
			"webp_identifying",
			"color_lossy",
			"sample",
		]) {
			expect(
				[...shapes].some((name) => name.startsWith(shape)),
				shape,
			).toBe(true);
		}
	});

	it("only the truncated file is not written: native declines at admission, the ExifTool fallback fails, nothing is published", () => {
		expect(notWritten.map((row) => row.variant)).toEqual(
			notWritten.map(() => "webp_truncated.webp"),
		);
		expect(notWritten.filter((row) => row.outcome === "declined")).toHaveLength(
			8,
		);
		expect(notWritten.filter((row) => row.outcome === "error")).toHaveLength(8);
		for (const row of notWritten) {
			// No output file means nothing reaches the leak check; the whole directory is the source.
			expect(row.dirAfter).toEqual(["input.webp"]);
			expect(row.fileType).toBeNull();
			expect(copyModeLeakCheckFormatOf({ fileType: row.fileType })).toBe(
				undefined,
			);
		}
	});

	it("XMP never survives in any written output, so the always-leak rule for XMP never produces a false red", () => {
		for (const row of writtenRows) {
			expect(row.keys.filter((key) => key.startsWith("XMP"))).toEqual([]);
			expect(row.webpFlags ?? "").not.toMatch(/XMP/);
		}
	});
});
