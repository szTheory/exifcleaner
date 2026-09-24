// Phase 51.1 D-42 re-verification rule, made permanent: the 2026-09-22 leave-one-out
// measurement dropped -MakerNotes:SerialNumber= from RAW_IDENTIFYING_TAG_DELETES because it
// was a no-op on every fixture. This file turns that measurement into a standing guard so the
// same class of drift is caught automatically in future: adding an entry to the constant
// without a fixture proving it does something, or an ExifTool upgrade that makes an existing
// entry a silent no-op, must go red here.
//
// For every entry, the full-list clean and the leave-one-out clean (constant minus that one
// entry) are compared on the fixture EFFECTIVE_FIXTURE_BY_ENTRY names for it -- the entry is
// non-vacuous only if the leave-one-out output retains at least one tag-line whose tag name
// equals the entry's own tag name that the full-list output does not have.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
	QUICKTIME_DATE_REMOVAL_ARGS,
	RAW_IDENTIFYING_TAG_DELETES,
} from "../../src/domain/exif/exif";
import { assertDirEffect, snapshotDir } from "../helpers/dir_effect";
import { readRawTagLines, type RawTagLine } from "../helpers/raw_probe";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = path.resolve(__dirname, "../e2e/fixtures");
const EXIFTOOL_PATH =
	process.platform === "win32"
		? path.resolve(__dirname, "../../.resources/win/bin/exiftool.exe")
		: path.resolve(__dirname, "../../.resources/nix/bin/exiftool");

// Measured 2026-09-22 (see <interfaces> in 51.1-03-PLAN.md): the smallest fixture that proves
// each entry is load-bearing. Sorted keys must equal the sorted constant exactly -- a new
// entry with no row here, or a dropped entry that still has one, fails the map/constant
// equality check below before any ExifTool invocation runs.
const EFFECTIVE_FIXTURE_BY_ENTRY: Record<string, string> = {
	"-IFD0:Artist=": "CanonRaw.cr2",
	"-IFD0:Software=": "CanonRaw.cr2",
	"-IFD0:ImageDescription=": "CanonRaw.cr2",
	"-IFD0:Copyright=": "CanonRaw.cr2",
	"-IFD0:XPComment=": "CanonRaw.cr2",
	"-IFD0:XPAuthor=": "CanonRaw.cr2",
	"-IFD0:XPTitle=": "CanonRaw.cr2",
	"-IFD0:XPSubject=": "CanonRaw.cr2",
	"-IFD0:XPKeywords=": "CanonRaw.cr2",
	"-ExifIFD:UserComment=": "CanonRaw.cr2",
	"-ExifIFD:SerialNumber=": "CanonRaw.cr2",
	"-ExifIFD:LensSerialNumber=": "CanonRaw.cr2",
	"-ExifIFD:OwnerName=": "CanonRaw.cr2",
	"-IFD0:CameraSerialNumber=": "DNG.dng",
	"-IFD0:OriginalRawFileName=": "DNG.dng",
	"-IFD0:RawDataUniqueID=": "DNG.dng",
	"-MakerNotes:OwnerName=": "CanonRaw.cr2",
	"-MakerNotes:InternalSerialNumber=": "CanonRaw.cr3",
	"-ExifIFD:DateTimeOriginal=": "CanonRaw.cr2",
	"-ExifIFD:CreateDate=": "CanonRaw.cr2",
	"-IFD0:ModifyDate=": "CanonRaw.cr2",
	"-ExifIFD:OffsetTime=": "CanonRaw.cr3",
	"-ExifIFD:OffsetTimeOriginal=": "CanonRaw.cr3",
	"-ExifIFD:OffsetTimeDigitized=": "CanonRaw.cr3",
	"-ExifIFD:SubSecTime=": "CanonRaw.cr3",
	"-ExifIFD:SubSecTimeOriginal=": "CanonRaw.cr3",
	"-ExifIFD:SubSecTimeDigitized=": "CanonRaw.cr3",
};

function tagNameOf(key: string): string {
	return key.includes(":") ? key.slice(key.lastIndexOf(":") + 1) : key;
}

// e.g. "-ExifIFD:UserComment=" -> "UserComment" (strip the leading "-" and trailing "=").
function argTagName(entry: string): string {
	const body = entry.slice(1, -1);
	return body.includes(":") ? body.slice(body.lastIndexOf(":") + 1) : body;
}

function lineKey(line: RawTagLine): string {
	return `${line.key}=${line.value}`;
}

describe("Every RAW_IDENTIFYING_TAG_DELETES entry is non-vacuous (RMV-05, D-42)", () => {
	const temporaryDirs: string[] = [];
	const fullOutputByFixture = new Map<string, string>();

	beforeAll(() => {
		const fixtures = new Set(Object.values(EFFECTIVE_FIXTURE_BY_ENTRY));
		for (const fixture of fixtures) {
			const dir = fs.mkdtempSync(
				path.join(os.tmpdir(), "raw-nonvacuity-full-"),
			);
			temporaryDirs.push(dir);
			const source = path.join(dir, fixture);
			fs.copyFileSync(path.join(FIXTURE_DIR, fixture), source);
			const out = path.join(dir, "full-" + fixture);
			execFileSync(EXIFTOOL_PATH, [
				"-all=",
				...RAW_IDENTIFYING_TAG_DELETES,
				...QUICKTIME_DATE_REMOVAL_ARGS,
				"-TagsFromFile",
				"@",
				"-Orientation",
				"-ICC_Profile",
				"-o",
				out,
				source,
			]);
			fullOutputByFixture.set(fixture, out);
		}
	});

	afterAll(() => {
		for (const dir of temporaryDirs.splice(0)) {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});

	it("EFFECTIVE_FIXTURE_BY_ENTRY's sorted keys equal RAW_IDENTIFYING_TAG_DELETES exactly", () => {
		const mapKeys = Object.keys(EFFECTIVE_FIXTURE_BY_ENTRY).sort();
		const constantKeys = [...RAW_IDENTIFYING_TAG_DELETES].sort();
		expect(mapKeys).toEqual(constantKeys);
	});

	it.each(RAW_IDENTIFYING_TAG_DELETES)(
		"%s is load-bearing on its mapped fixture (RMV-05, D-42)",
		(entry) => {
			const fixture = EFFECTIVE_FIXTURE_BY_ENTRY[entry];
			if (fixture === undefined) {
				throw new Error(`No EFFECTIVE_FIXTURE_BY_ENTRY row for ${entry}`);
			}
			const fullOut = fullOutputByFixture.get(fixture);
			if (fullOut === undefined) {
				throw new Error(`No full-list output generated for fixture ${fixture}`);
			}

			const dir = fs.mkdtempSync(path.join(os.tmpdir(), "raw-nonvacuity-loo-"));
			temporaryDirs.push(dir);
			const source = path.join(dir, fixture);
			fs.copyFileSync(path.join(FIXTURE_DIR, fixture), source);
			const leaveOneOutArgs = (
				RAW_IDENTIFYING_TAG_DELETES as readonly string[]
			).filter((candidate) => candidate !== entry);
			const looOut = path.join(dir, "loo-" + fixture);
			const before = snapshotDir(dir);

			execFileSync(EXIFTOOL_PATH, [
				"-all=",
				...leaveOneOutArgs,
				...QUICKTIME_DATE_REMOVAL_ARGS,
				"-TagsFromFile",
				"@",
				"-Orientation",
				"-ICC_Profile",
				"-o",
				looOut,
				source,
			]);

			const after = snapshotDir(dir);
			assertDirEffect(before, after, {
				added: [path.basename(looOut)],
				modified: [],
				removed: [],
				unchanged: [fixture],
			});

			const fullLines = readRawTagLines(fullOut, EXIFTOOL_PATH);
			const looLines = readRawTagLines(looOut, EXIFTOOL_PATH);
			const fullKeySet = new Set(fullLines.map(lineKey));
			const looKeySet = new Set(looLines.map(lineKey));

			const tagName = argTagName(entry);
			const newLines = [...looKeySet].filter((key) => !fullKeySet.has(key));
			const matchingNewLines = newLines.filter(
				(key) => tagNameOf(key.split("=")[0] ?? "") === tagName,
			);

			expect(matchingNewLines.length).toBeGreaterThan(0);
		},
		20000,
	);
});
