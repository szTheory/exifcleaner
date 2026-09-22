// D-18: pins the group1 File classification table AND re-derives ExifTool's own writability
// live against the bundled binary. These are hand-transcribed literals, never a snapshot --
// the only way to change them is a hand edit visible in review, matching the rule
// user_facing_contract_freeze.test.ts states in its own header. This file scans no source
// over itself, so the comment-text-discipline hazard other contract tests guard against does
// not apply here.
//
// D-18a keeps three protection targets distinct, and none of them claims to cover the fourth:
//   (a) the TABLE -- someone edits the allowlist -- covered by the toEqual literal assertions
//   (b) the ExifTool BEHAVIOR -- an upgrade changes what is writable -- covered by the live
//       -listw -File:all re-derivation plus the pinned version constant
//   (c) the END-TO-END outcome -- NOT covered here; that belongs to
//       tests/e2e/file-type-coverage.spec.ts's comment-only JPEG case (Task 1 of this plan)

import { execFileSync } from "node:child_process";
import path from "node:path";
import { describe, expect, test } from "vitest";
import {
	FILE_GROUP_WRITABLE_TAGS,
	FILE_GROUP_STRUCTURAL_OVERRIDE,
	FILE_GROUP_NON_FILE_FAMILY1_TAGS,
	isRemovableFileGroupTag,
} from "../../src/domain/exif/exif";

const ROOT = path.resolve(import.meta.dirname, "../..");
const TARGET_VERSION = "13.59";

const EXIFTOOL_PATH =
	process.platform === "win32"
		? path.join(ROOT, ".resources/win/bin/exiftool.exe")
		: path.join(ROOT, ".resources/nix/bin/exiftool");

/**
 * Pure parser, extracted so it can be proven to exclude in both directions with a synthetic
 * string before it is trusted against the real binary's output. Drops the leading heading
 * line ("Writable File tags:") and returns the whitespace-delimited tag names, sorted.
 */
export function parseWritableFileTagNames(stdout: string): string[] {
	const lines = stdout.split("\n").slice(1);
	const names = lines
		.join(" ")
		.split(/\s+/)
		.map((name) => name.trim())
		.filter((name) => name.length > 0);
	return names.slice().sort();
}

// Hand-transcribed, one entry per line, from 50-SWEEP-MATRIX.md §3's family-0/family-1
// reconciliation, measured live against the bundled ExifTool 13.59 binary.
const EXPECTED_WRITABLE_TAGS = [
	"Comment",
	"ExifByteOrder",
	"ExifUnicodeByteOrder",
	"Geolocate",
	"Geosync",
	"Geotag",
	"Geotime",
	"HardLink",
	"PreviewImage",
	"SymLink",
	"TestName",
	"Trailer",
].sort();

const EXPECTED_STRUCTURAL_OVERRIDE = [
	"ExifByteOrder",
	"ExifUnicodeByteOrder",
	"Geolocate",
	"Geosync",
	"Geotag",
	"Geotime",
	"HardLink",
	"PreviewImage",
	"SymLink",
	"TestName",
	"Trailer",
].sort();

const EXPECTED_NON_FILE_FAMILY1_TAGS = [
	"Directory",
	"FileCreateDate",
	"FileGroupID",
	"FileModifyDate",
	"FileName",
	"FilePermissions",
	"FileUserID",
	"MDItemFSCreationDate",
	"MDItemFSLabel",
	"MDItemFinderComment",
	"MDItemUserTags",
	"XAttrMDItemWhereFroms",
	"XAttrQuarantine",
	"ZoneIdentifier",
].sort();

// The full 26-name union `-listw -File:all` reports (family 0), pinned as its own literal so
// the union invariant below is checkable against a hand-transcribed value, not derived from
// the two sets it is meant to cross-check.
const EXPECTED_ALL_WRITABLE_FILE_TAGS = [
	...EXPECTED_WRITABLE_TAGS,
	...EXPECTED_NON_FILE_FAMILY1_TAGS,
].sort();

describe("group1 File classification table (D-18a target a)", () => {
	test("FILE_GROUP_WRITABLE_TAGS equals the hand-transcribed twelve-name literal", () => {
		expect([...FILE_GROUP_WRITABLE_TAGS].sort()).toEqual(
			EXPECTED_WRITABLE_TAGS,
		);
	});

	test("FILE_GROUP_STRUCTURAL_OVERRIDE equals the hand-transcribed eleven-name literal", () => {
		expect([...FILE_GROUP_STRUCTURAL_OVERRIDE].sort()).toEqual(
			EXPECTED_STRUCTURAL_OVERRIDE,
		);
	});

	test("FILE_GROUP_NON_FILE_FAMILY1_TAGS equals the hand-transcribed fourteen-name literal", () => {
		expect([...FILE_GROUP_NON_FILE_FAMILY1_TAGS].sort()).toEqual(
			EXPECTED_NON_FILE_FAMILY1_TAGS,
		);
	});

	test("the override set is a strict subset of the writable set", () => {
		for (const name of FILE_GROUP_STRUCTURAL_OVERRIDE) {
			expect(FILE_GROUP_WRITABLE_TAGS.has(name)).toBe(true);
		}
		expect(FILE_GROUP_STRUCTURAL_OVERRIDE.size).toBeLessThan(
			FILE_GROUP_WRITABLE_TAGS.size,
		);
	});

	test("the writable set and the non-File set are disjoint", () => {
		for (const name of FILE_GROUP_WRITABLE_TAGS) {
			expect(FILE_GROUP_NON_FILE_FAMILY1_TAGS.has(name)).toBe(false);
		}
	});

	// The removability of the comment tag is a CONSEQUENCE of the writability rule, not a
	// special case -- this is what RMV-02 and ROADMAP criterion 2 require.
	test("the writable set minus the override set equals exactly the comment tag name", () => {
		const difference = [...FILE_GROUP_WRITABLE_TAGS].filter(
			(name) => !FILE_GROUP_STRUCTURAL_OVERRIDE.has(name),
		);
		expect(difference).toEqual(["Comment"]);
	});
});

describe("ExifTool writability BEHAVIOR, re-derived live (D-18a target b)", () => {
	test("the bundled binary reports the pinned target version", () => {
		const version = execFileSync(EXIFTOOL_PATH, ["-ver"], {
			encoding: "utf8",
		}).trim();
		expect(version).toBe(TARGET_VERSION);
	});

	test("-listw -File:all equals the pinned twenty-six-name literal", () => {
		const stdout = execFileSync(EXIFTOOL_PATH, ["-listw", "-File:all"], {
			encoding: "utf8",
		});
		const names = parseWritableFileTagNames(stdout);
		expect(names).toEqual(EXPECTED_ALL_WRITABLE_FILE_TAGS);
	});

	// This is the assertion that makes the family-0 to family-1 reconciliation load-bearing
	// rather than decorative: it fails if a future ExifTool version adds a writable File tag
	// that nobody classified. Because the binary is checksum-pinned via update_exiftool.pl,
	// this fires exactly once, at the deliberate version bump, in front of precisely the
	// person who must re-run the sweep.
	test("the pinned twenty-six-name literal is exactly the union of the writable and non-File sets", () => {
		const union = [
			...new Set([
				...FILE_GROUP_WRITABLE_TAGS,
				...FILE_GROUP_NON_FILE_FAMILY1_TAGS,
			]),
		].sort();
		expect(EXPECTED_ALL_WRITABLE_FILE_TAGS).toEqual(union);
	});
});

describe("synthetic counter-examples (every check proven able to fire)", () => {
	test("parseWritableFileTagNames rejects a synthetic string omitting a name", () => {
		const synthetic = "Writable File tags:\n  Comment Directory\n";
		expect(parseWritableFileTagNames(synthetic)).not.toEqual(
			EXPECTED_ALL_WRITABLE_FILE_TAGS,
		);
	});

	test("parseWritableFileTagNames rejects a synthetic string adding an unknown name", () => {
		const synthetic = `Writable File tags:\n  ${EXPECTED_ALL_WRITABLE_FILE_TAGS.join(" ")} TotallyUnknownTag\n`;
		expect(parseWritableFileTagNames(synthetic)).not.toEqual(
			EXPECTED_ALL_WRITABLE_FILE_TAGS,
		);
	});

	test("isRemovableFileGroupTag returns false for a synthetic key naming a tag absent from the writable set", () => {
		expect(
			isRemovableFileGroupTag({ key: "File:Other:TotallyUnknownTag" }),
		).toBe(false);
	});

	test("isRemovableFileGroupTag returns false for a synthetic key naming an override member", () => {
		expect(isRemovableFileGroupTag({ key: "File:Preview:PreviewImage" })).toBe(
			false,
		);
	});

	test("isRemovableFileGroupTag returns true for a synthetic key carrying an instance segment before the comment tag name", () => {
		expect(isRemovableFileGroupTag({ key: "File:Image:Copy1:Comment" })).toBe(
			true,
		);
	});
});
