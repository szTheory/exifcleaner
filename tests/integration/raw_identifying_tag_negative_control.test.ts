// Phase 51.1 D-44: a permanent negative control proving the RAW identifying-tag assertions
// discriminate the defect (the TIFF -CommonIFD0= shortcut, which strips Make/Model and would
// break every RAW decoder) from the fix (the group-qualified RAW_IDENTIFYING_TAG_DELETES
// branch), plus the image-data-hash control, the fix's exact blast radius relative to the
// pre-fix shipped arguments, idempotency/empty-input and the dual-encoding edge. Every half
// imports decoderTagMismatches/RAW_CASES from tests/helpers/raw_probe.ts -- the same
// assertion and case table tests/e2e/raw-metadata-removal.spec.ts uses -- so this cannot
// drift from the proof it guards. Per D-28/Phase 50 D-18b precedent, no title here carries an
// NC- number: this is a negative control in substance but deliberately not registered in the
// numbered NC ledger (tests/contracts/negative_control_evidence.test.ts), which pins only the
// v4.8 native-seam controls. EXPECTED_CONTROL_TITLES and scripts/nc_evidence_gate.mjs are
// untouched by this file.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { ExifToolAdapter } from "../../src/infrastructure/exiftool/exiftool_adapter";
import { ExiftoolProcess } from "../../src/infrastructure/exiftool/ExiftoolProcess";
import { assertDirEffect, snapshotDir } from "../helpers/dir_effect";
import {
	RAW_CASES,
	decoderTagMismatches,
	findSentinelBytes,
	readImageDataHash,
	readRawTagLines,
	readRawTags,
	retainedIdentifyingKeys,
	tagLineDifferential,
	type RawTagLine,
} from "../helpers/raw_probe";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = path.resolve(__dirname, "../e2e/fixtures");
const EXIFTOOL_PATH =
	process.platform === "win32"
		? path.resolve(__dirname, "../../.resources/win/bin/exiftool.exe")
		: path.resolve(__dirname, "../../.resources/nix/bin/exiftool");

function sha256(filePath: string): string {
	return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

// The pinned per-fixture image-data offset key each fixture's decoder uses to locate pixel
// data -- measured 2026-09-22 with `exiftool -a -G3:1 -s -n`, CR3 is ISO-BMFF so it is never
// derived from the TIFF-shaped keys the other three share.
const IMAGE_DATA_OFFSET_KEY_BY_FIXTURE: Record<string, string> = {
	"CanonRaw.cr2": "IFD3:StripOffsets",
	"DNG.dng": "SubIFD:TileOffsets",
	"CanonRaw.cr3": "QuickTime:MediaDataOffset",
	"Panasonic.rw2": "IFD0:RawDataOffset",
};

// Pre-fix shipped RAW arguments (EVIDENCE / <interfaces>, measured 2026-09-22): the exact
// argument list in place before the isRawFile branch existed.
function preFixArgs(source: string, out: string): string[] {
	return [
		"-all=",
		"-TagsFromFile",
		"@",
		"-Orientation",
		"-ICC_Profile",
		"-o",
		out,
		source,
	];
}

// Hand-written per-fixture { removed, added, changed } literal -- pinned from this session's
// own measurement (tagLineDifferential(readRawTagLines(pre), readRawTagLines(product))),
// cross-checked against <interfaces>'s differential summary: every key here is one of the
// D-42/D-43 tag names, a derived Composite date, or one of the documented empty/zero-date
// value changes -- nothing outside that set.
const DIFFERENTIAL_BY_FIXTURE: Record<
	string,
	{
		removed: string[];
		added: string[];
		changed: { key: string; value: string }[];
	}
> = {
	"CanonRaw.cr2": {
		removed: [
			"ExifIFD:CreateDate",
			"ExifIFD:DateTimeOriginal",
			"ExifIFD:LensSerialNumber",
			"ExifIFD:OwnerName",
			"ExifIFD:SerialNumber",
			"ExifIFD:UserComment",
			"IFD0:Artist",
			"IFD0:Copyright",
			"IFD0:ImageDescription",
			"IFD0:ModifyDate",
			"IFD0:Software",
			"IFD0:XPAuthor",
			"IFD0:XPComment",
			"IFD0:XPKeywords",
			"IFD0:XPSubject",
			"IFD0:XPTitle",
		],
		added: [],
		changed: [{ key: "Canon:OwnerName", value: "" }],
	},
	"DNG.dng": {
		removed: [
			"IFD0:Artist",
			"IFD0:CameraSerialNumber",
			"IFD0:Copyright",
			"IFD0:ImageDescription",
			"IFD0:ModifyDate",
			"IFD0:OriginalRawFileName",
			"IFD0:RawDataUniqueID",
			"IFD0:Software",
			"IFD0:XPAuthor",
			"IFD0:XPComment",
			"IFD0:XPKeywords",
			"IFD0:XPSubject",
			"IFD0:XPTitle",
		],
		added: [],
		changed: [],
	},
	"CanonRaw.cr3": {
		removed: [
			"Composite:SubSecCreateDate",
			"Composite:SubSecDateTimeOriginal",
			"Composite:SubSecModifyDate",
			"ExifIFD:CreateDate",
			"ExifIFD:DateTimeOriginal",
			"ExifIFD:LensSerialNumber",
			"ExifIFD:OffsetTime",
			"ExifIFD:OffsetTimeDigitized",
			"ExifIFD:OffsetTimeOriginal",
			"ExifIFD:OwnerName",
			"ExifIFD:SerialNumber",
			"ExifIFD:SubSecTime",
			"ExifIFD:SubSecTimeDigitized",
			"ExifIFD:SubSecTimeOriginal",
			"ExifIFD:UserComment",
			"IFD0:Artist",
			"IFD0:Copyright",
			"IFD0:ImageDescription",
			"IFD0:ModifyDate",
			"IFD0:Software",
			"IFD0:XPAuthor",
			"IFD0:XPComment",
			"IFD0:XPKeywords",
			"IFD0:XPSubject",
			"IFD0:XPTitle",
		],
		added: [],
		changed: [
			{ key: "Canon:InternalSerialNumber", value: "" },
			{ key: "QuickTime:CreateDate", value: "0000:00:00 00:00:00" },
			{ key: "QuickTime:ModifyDate", value: "0000:00:00 00:00:00" },
			{ key: "Track1:MediaCreateDate", value: "0000:00:00 00:00:00" },
			{ key: "Track1:MediaModifyDate", value: "0000:00:00 00:00:00" },
			{ key: "Track1:TrackCreateDate", value: "0000:00:00 00:00:00" },
			{ key: "Track1:TrackModifyDate", value: "0000:00:00 00:00:00" },
			{ key: "Track2:MediaCreateDate", value: "0000:00:00 00:00:00" },
			{ key: "Track2:MediaModifyDate", value: "0000:00:00 00:00:00" },
			{ key: "Track2:TrackCreateDate", value: "0000:00:00 00:00:00" },
			{ key: "Track2:TrackModifyDate", value: "0000:00:00 00:00:00" },
			{ key: "Track3:MediaCreateDate", value: "0000:00:00 00:00:00" },
			{ key: "Track3:MediaModifyDate", value: "0000:00:00 00:00:00" },
			{ key: "Track3:TrackCreateDate", value: "0000:00:00 00:00:00" },
			{ key: "Track3:TrackModifyDate", value: "0000:00:00 00:00:00" },
			{ key: "Track4:MediaCreateDate", value: "0000:00:00 00:00:00" },
			{ key: "Track4:MediaModifyDate", value: "0000:00:00 00:00:00" },
			{ key: "Track4:TrackCreateDate", value: "0000:00:00 00:00:00" },
			{ key: "Track4:TrackModifyDate", value: "0000:00:00 00:00:00" },
		],
	},
	"Panasonic.rw2": {
		removed: [
			"ExifIFD:CreateDate",
			"ExifIFD:DateTimeOriginal",
			"ExifIFD:LensSerialNumber",
			"ExifIFD:OwnerName",
			"ExifIFD:SerialNumber",
			"ExifIFD:UserComment",
		],
		added: [],
		changed: [],
	},
};

async function sanitizeWithProduct({
	source,
	destination,
}: {
	source: string;
	destination: string;
}) {
	const process = new ExiftoolProcess({ binPath: EXIFTOOL_PATH });
	const exiftool = new ExifToolAdapter({ process });
	await process.open();
	try {
		return await exiftool.sanitize({
			source,
			destination,
			outputMode: "copy",
			preserveOrientation: true,
			preserveColorProfile: true,
			preserveResolution: false,
			preserveTimestamps: false,
		});
	} finally {
		await process.close();
	}
}

describe("RAW identifying-tag assertions discriminate the defect from the fix (D-44)", () => {
	const temporaryDirs: string[] = [];

	afterEach(() => {
		for (const dir of temporaryDirs.splice(0)) {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});

	it.each(RAW_CASES)(
		"the TIFF -CommonIFD0= shortcut strips Make/Model on $fixture (D-44)",
		(raw) => {
			const dir = fs.mkdtempSync(path.join(os.tmpdir(), "raw-nc-shortcut-"));
			temporaryDirs.push(dir);
			const source = path.join(dir, raw.fixture);
			fs.copyFileSync(path.join(FIXTURE_DIR, raw.fixture), source);
			const out = path.join(dir, "shortcut-" + raw.fixture);
			const before = snapshotDir(dir);

			execFileSync(EXIFTOOL_PATH, [
				"-all=",
				"-CommonIFD0=",
				"-TagsFromFile",
				"@",
				"-Orientation",
				"-ICC_Profile",
				"-o",
				out,
				source,
			]);

			const after = snapshotDir(dir);
			assertDirEffect(before, after, {
				added: [path.basename(out)],
				modified: [],
				removed: [],
				unchanged: [raw.fixture],
			});

			const sourceTags = readRawTags(source, EXIFTOOL_PATH);
			const outputTags = readRawTags(out, EXIFTOOL_PATH);
			expect(
				decoderTagMismatches(sourceTags, outputTags, [
					"IFD0:Make",
					"IFD0:Model",
				]),
			).toEqual(["IFD0:Make", "IFD0:Model"]);
		},
	);

	it.each(RAW_CASES)(
		"the product adapter's default arguments keep decoder tags, remove identifying tags and keep image data on $fixture (D-44)",
		async (raw) => {
			const dir = fs.mkdtempSync(path.join(os.tmpdir(), "raw-nc-product-"));
			temporaryDirs.push(dir);
			const source = path.join(dir, raw.fixture);
			fs.copyFileSync(path.join(FIXTURE_DIR, raw.fixture), source);
			const sourceDigestBefore = sha256(source);
			const destination = path.join(dir, "product-" + raw.fixture);
			const before = snapshotDir(dir);

			const result = await sanitizeWithProduct({ source, destination });
			expect(result).toEqual({ ok: true, value: undefined });

			const after = snapshotDir(dir);
			assertDirEffect(before, after, {
				added: [path.basename(destination)],
				modified: [],
				removed: [],
				unchanged: [raw.fixture],
			});
			expect(sha256(source)).toBe(sourceDigestBefore);

			const sourceTags = readRawTags(source, EXIFTOOL_PATH, { numeric: true });
			const outputTags = readRawTags(destination, EXIFTOOL_PATH, {
				numeric: true,
			});

			expect(
				decoderTagMismatches(sourceTags, outputTags, raw.decoderKeys),
			).toEqual([]);
			expect(retainedIdentifyingKeys(outputTags, raw.residueAllowlist)).toEqual(
				[],
			);
			expect(readImageDataHash(destination, EXIFTOOL_PATH)).toBe(
				raw.imageDataHash,
			);
		},
	);

	it.each(RAW_CASES)(
		"a one-byte flip at the pinned image-data offset changes readImageDataHash on $fixture (D-44)",
		async (raw) => {
			const dir = fs.mkdtempSync(path.join(os.tmpdir(), "raw-nc-imagedata-"));
			temporaryDirs.push(dir);
			const source = path.join(dir, raw.fixture);
			fs.copyFileSync(path.join(FIXTURE_DIR, raw.fixture), source);
			const destination = path.join(dir, "product-" + raw.fixture);
			const flipped = path.join(dir, "flipped-" + raw.fixture);
			const before = snapshotDir(dir);

			const result = await sanitizeWithProduct({ source, destination });
			expect(result).toEqual({ ok: true, value: undefined });
			fs.copyFileSync(destination, flipped);

			const offsetKey = IMAGE_DATA_OFFSET_KEY_BY_FIXTURE[raw.fixture];
			if (offsetKey === undefined) {
				throw new Error(`No pinned image-data offset key for ${raw.fixture}`);
			}
			const outputTags = readRawTags(destination, EXIFTOOL_PATH, {
				numeric: true,
			});
			const offsetValue = outputTags[offsetKey];
			if (typeof offsetValue !== "number") {
				throw new Error(
					`Expected numeric ${offsetKey} on ${destination}, got ${JSON.stringify(offsetValue)}`,
				);
			}

			const beforeHash = readImageDataHash(destination, EXIFTOOL_PATH);

			const bytes = fs.readFileSync(flipped);
			const flippedByte = bytes[offsetValue];
			if (flippedByte === undefined) {
				throw new Error(`Offset ${offsetValue} out of range for ${flipped}`);
			}
			bytes[offsetValue] = flippedByte ^ 0xff;
			fs.writeFileSync(flipped, bytes);

			const after = snapshotDir(dir);
			assertDirEffect(before, after, {
				added: [path.basename(destination), path.basename(flipped)],
				modified: [],
				removed: [],
				unchanged: [raw.fixture],
			});

			const flippedHash = readImageDataHash(flipped, EXIFTOOL_PATH);
			expect(flippedHash).not.toBe(beforeHash);
		},
	);

	it.each(RAW_CASES)(
		"the fix's blast radius relative to the pre-fix shipped arguments equals the pinned differential on $fixture (D-44)",
		async (raw) => {
			const dir = fs.mkdtempSync(
				path.join(os.tmpdir(), "raw-nc-differential-"),
			);
			temporaryDirs.push(dir);
			const source = path.join(dir, raw.fixture);
			fs.copyFileSync(path.join(FIXTURE_DIR, raw.fixture), source);
			const preOut = path.join(dir, "pre-" + raw.fixture);
			const productOut = path.join(dir, "product-" + raw.fixture);
			const before = snapshotDir(dir);

			execFileSync(EXIFTOOL_PATH, preFixArgs(source, preOut));
			const result = await sanitizeWithProduct({
				source,
				destination: productOut,
			});
			expect(result).toEqual({ ok: true, value: undefined });

			const after = snapshotDir(dir);
			assertDirEffect(before, after, {
				added: [path.basename(preOut), path.basename(productOut)],
				modified: [],
				removed: [],
				unchanged: [raw.fixture],
			});

			const preLines: RawTagLine[] = readRawTagLines(preOut, EXIFTOOL_PATH);
			const productLines: RawTagLine[] = readRawTagLines(
				productOut,
				EXIFTOOL_PATH,
			);
			const diff = tagLineDifferential(preLines, productLines);

			const expected = DIFFERENTIAL_BY_FIXTURE[raw.fixture];
			if (expected === undefined) {
				throw new Error(`No pinned differential for ${raw.fixture}`);
			}
			expect(diff.added).toEqual([]);
			expect([...diff.removed].sort()).toEqual([...expected.removed].sort());
			expect(
				[...diff.changed].sort((a, b) =>
					a.key < b.key ? -1 : a.key > b.key ? 1 : 0,
				),
			).toEqual(
				[...expected.changed].sort((a, b) =>
					a.key < b.key ? -1 : a.key > b.key ? 1 : 0,
				),
			);
		},
	);

	it.each(RAW_CASES)(
		"cleaning the product output again is a byte-level no-op on $fixture (idempotency edge)",
		async (raw) => {
			const dir = fs.mkdtempSync(path.join(os.tmpdir(), "raw-nc-idempotent-"));
			temporaryDirs.push(dir);
			const source = path.join(dir, raw.fixture);
			fs.copyFileSync(path.join(FIXTURE_DIR, raw.fixture), source);
			const firstOut = path.join(dir, "first-" + raw.fixture);
			const secondOut = path.join(dir, "second-" + raw.fixture);
			const before = snapshotDir(dir);

			const firstResult = await sanitizeWithProduct({
				source,
				destination: firstOut,
			});
			expect(firstResult).toEqual({ ok: true, value: undefined });
			// The already-cleaned first output carries none of the listed identifying tags --
			// this second clean also covers the empty-input edge: every delete of an absent
			// tag must be a no-op that never fails the write.
			const secondResult = await sanitizeWithProduct({
				source: firstOut,
				destination: secondOut,
			});
			expect(secondResult).toEqual({ ok: true, value: undefined });

			const after = snapshotDir(dir);
			assertDirEffect(before, after, {
				added: [path.basename(firstOut), path.basename(secondOut)],
				modified: [],
				removed: [],
				unchanged: [raw.fixture],
			});

			expect(sha256(secondOut)).toBe(sha256(firstOut));
		},
	);

	it("the pre-fix CR2 output's UTF-16LE XP sentinel is found by findSentinelBytes but not by a latin1-only search (encoding edge)", () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "raw-nc-encoding-"));
		temporaryDirs.push(dir);
		const source = path.join(dir, "CanonRaw.cr2");
		fs.copyFileSync(path.join(FIXTURE_DIR, "CanonRaw.cr2"), source);
		const out = path.join(dir, "pre-CanonRaw.cr2");
		const before = snapshotDir(dir);

		execFileSync(EXIFTOOL_PATH, preFixArgs(source, out));

		const after = snapshotDir(dir);
		assertDirEffect(before, after, {
			added: [path.basename(out)],
			modified: [],
			removed: [],
			unchanged: ["CanonRaw.cr2"],
		});

		const sentinel = "ZZP511-XPCOMMENT";
		expect(findSentinelBytes(out, [sentinel])).toEqual([sentinel]);

		const latin1Text = fs.readFileSync(out).toString("latin1");
		expect(latin1Text.includes(sentinel)).toBe(false);
	});
});
