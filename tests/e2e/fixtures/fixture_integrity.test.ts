import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { snapshotDir, assertDirEffect } from "../../helpers/dir_effect";
import { readTiffGroupedTags } from "../../helpers/tiff_probe";
import { readRawTags } from "../../helpers/raw_probe";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = __dirname;
const EXIFTOOL =
	process.platform === "win32"
		? path.resolve(__dirname, "../../../.resources/win/bin/exiftool.exe")
		: path.resolve(__dirname, "../../../.resources/nix/bin/exiftool");
const RAF_FIXTURE = "sample.raf";
const RAF_SHA256 =
	"e12e30bd0cf5f160b82b93f043696c04d1d5f4628f1fdd19abdab9f8328d8bf0";
const RAF_SIZE_BYTES = 38_452;

/**
 * Guards the fixtures themselves rather than the app.
 *
 * sample.pdf shipped broken for the whole v4.0 cycle: `.gitattributes` had a blanket
 * `* text=auto eol=lf`, and because that minimal PDF is pure ASCII with no NUL bytes,
 * git classified it as text and rewrote its xref terminators from CRLF to LF on commit.
 * The PDF spec requires xref entries to be exactly 20 bytes; the rewrite made them 19,
 * and ExifTool refused the file with "Invalid xref table".
 *
 * Nothing caught it. The generator swallowed the injection failure behind a comment
 * asserting the file was "still valid", and the one E2E test using sample.pdf asserted
 * the status bar contained the file *count* -- which a hard-erroring PDF still satisfies.
 * So PDF metadata removal, one of the three headline file types, was never verified.
 *
 * These assertions run against the fixtures as they exist on disk, so they fail whether
 * the cause is a bad generator, a bad commit, or a checkout on a platform that renormalizes
 * line endings.
 *
 * The shared helper below now asserts a whole-directory digest delta around the strip
 * attempt instead of the file-count check that missed sample.pdf, so a hard-erroring file
 * that still satisfies a count can no longer pass silently here either.
 */

/** Fixtures the app is expected to strip successfully. */
const WRITABLE_FIXTURES = [
	"sample.jpg",
	"sample.png",
	"sample.webp",
	"sample.pdf",
	"sample.mp4",
	"sample.m4a",
	"issue240.mp4",
	"orientation.jpg",
	"no_metadata.jpg",
	"sample.tif",
	"multipage.tif",
];

/** Fixtures that exist precisely to exercise the error path. */
const UNWRITABLE_FIXTURES = [
	"corrupted.jpg",
	"zero_byte.jpg",
	"unsupported.txt",
	"sample.mkv",
];

function stripInTempCopy(name: string): { ok: boolean; output: string } {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fixture-integrity-"));
	try {
		const copy = path.join(dir, name);
		fs.copyFileSync(path.join(FIXTURES_DIR, name), copy);

		const before = snapshotDir(dir);

		let result: { ok: boolean; output: string };
		try {
			const output = execFileSync(
				EXIFTOOL,
				["-all=", "-overwrite_original", copy],
				{ encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
			);
			result = { ok: true, output };
		} catch (err: unknown) {
			const e = err as { stdout?: string; stderr?: string };
			result = { ok: false, output: `${e.stdout ?? ""}${e.stderr ?? ""}` };
		}

		const after = snapshotDir(dir);

		// A successful strip rewrites the fixture in place; a failed strip -- the
		// outcome the UNWRITABLE_FIXTURES cases below exercise -- leaves it
		// byte-for-byte, which is exactly the distinction a file *count* cannot make.
		assertDirEffect(
			before,
			after,
			result.ok
				? { modified: [name], added: [], removed: [] }
				: { unchanged: [name], added: [], removed: [] },
		);

		return result;
	} finally {
		fs.rmSync(dir, { recursive: true, force: true });
	}
}

function readFixtureMetadata(name: string): Record<string, unknown> {
	const output = execFileSync(
		EXIFTOOL,
		["-G1", "-s", "-json", path.join(FIXTURES_DIR, name)],
		{ encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
	);
	const parsed = JSON.parse(output) as unknown;
	if (!Array.isArray(parsed) || parsed.length !== 1) {
		throw new Error(`Expected one ExifTool result for ${name}`);
	}

	const first = parsed[0];
	if (first === null || typeof first !== "object" || Array.isArray(first)) {
		throw new Error(`Expected ExifTool object result for ${name}`);
	}

	const metadata: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(first)) {
		metadata[key.replace(/^[^:]+:/, "")] = value;
	}
	return metadata;
}

function sha256(filePath: string): string {
	return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

describe("E2E fixture integrity", () => {
	it.each(WRITABLE_FIXTURES)(
		"%s is a file ExifTool can actually strip",
		(name) => {
			const { ok, output } = stripInTempCopy(name);
			expect(ok, `ExifTool failed on ${name}:\n${output}`).toBe(true);
			expect(output).toContain("1 image files updated");
		},
	);

	it.each(UNWRITABLE_FIXTURES)(
		"%s still fails, as the tests rely on",
		(name) => {
			const { ok } = stripInTempCopy(name);
			expect(ok, `${name} is meant to exercise the error path`).toBe(false);
		},
	);

	// Direct check on the specific byte-level damage, so a regression names its own cause
	// instead of surfacing as a generic ExifTool error.
	it("sample.pdf has 20-byte xref entries (CRLF preserved through git)", () => {
		const pdf = fs.readFileSync(path.join(FIXTURES_DIR, "sample.pdf"));
		const xrefEntry = /\d{10} \d{5} [fn]\r\n/g;
		const matches = pdf.toString("latin1").match(xrefEntry) ?? [];
		expect(
			matches.length,
			"no CRLF-terminated xref entries found -- git likely normalized the fixture; " +
				"check that .gitattributes marks *.pdf as binary",
		).toBeGreaterThan(0);
	});

	it("classifies sample.pdf as a binary checkout fixture", () => {
		const output = execFileSync(
			"git",
			["check-attr", "binary", "--", "tests/e2e/fixtures/sample.pdf"],
			{
				cwd: path.resolve(__dirname, "../../.."),
				encoding: "utf8",
			},
		);

		expect(output.trim()).toBe("tests/e2e/fixtures/sample.pdf: binary: set");
	});

	it("#240 fixture pins the measured create-date precondition", () => {
		const metadata = readFixtureMetadata("issue240.mp4");

		expect(metadata.CreateDate).toBe("2019:10:02 00:49:04");
		expect(metadata.TrackCreateDate).toBe("2019:10:02 00:49:04");
		expect(metadata.MediaCreateDate).toBe("2019:10:02 00:49:04");
	});

	it("sample.m4a contains removable audio metadata", () => {
		const metadata = readFixtureMetadata("sample.m4a");

		expect(metadata.Title).toBe("Test Audio");
		expect(metadata.Artist).toBe("Test Author");
	});

	it("sample.mkv demonstrates bundled ExifTool's unsupported write path", () => {
		const { ok, output } = stripInTempCopy("sample.mkv");

		expect(ok).toBe(false);
		expect(output).toContain("Writing of MKV files is not yet supported");
	});

	it("orientation fixture pins exact Orientation before processing", () => {
		const metadata = readFixtureMetadata("orientation.jpg");

		expect(metadata.Orientation).toBe("Rotate 90 CW");
	});

	it("sample.tif pins its IFD0 private-tag and GPS seeds before processing", () => {
		const filePath = path.join(FIXTURES_DIR, "sample.tif");
		const tags = readTiffGroupedTags(filePath, EXIFTOOL);

		expect(tags["IFD0:ImageDescription"]).toBe("ZZP51-DESC");
		expect(tags["IFD0:Software"]).toBe("ZZP51-SOFT");
		expect(tags["IFD0:Artist"]).toBe("ZZP51-ARTIST");
		expect(tags["IFD0:Copyright"]).toBe("ZZP51-COPY");
		expect(tags["GPS:GPSLatitudeRef"]).toBe("North");
		expect(tags["GPS:GPSLongitudeRef"]).toBe("West");
		expect(tags["File:FileType"]).toBe("TIFF");
	});

	it("multipage.tif pins distinct per-IFD seeds before processing", () => {
		const filePath = path.join(FIXTURES_DIR, "multipage.tif");
		const tags = readTiffGroupedTags(filePath, EXIFTOOL);

		expect(tags["IFD0:ImageDescription"]).toBe("ZZP51-PAGE1-DESC");
		expect(tags["IFD0:Software"]).toBe("ZZP51-PAGE1-SOFT");
		expect(tags["IFD0:Artist"]).toBe("ZZP51-PAGE1-ARTIST");
		expect(tags["IFD0:Copyright"]).toBe("ZZP51-PAGE1-COPY");
		expect(tags["GPS:GPSLatitudeRef"]).toBe("North");
		expect(tags["IFD1:ImageDescription"]).toBe("ZZP51-PAGE2-DESC");
		expect(tags["IFD1:Software"]).toBe("ZZP51-PAGE2-SOFT");
		expect(tags["IFD1:Artist"]).toBe("ZZP51-PAGE2-ARTIST");
		expect(tags["IFD1:Copyright"]).toBe("ZZP51-PAGE2-COPY");
	});

	it("classifies both TIFF fixtures as binary checkout fixtures", () => {
		for (const name of ["sample.tif", "multipage.tif"]) {
			const output = execFileSync(
				"git",
				["check-attr", "binary", "--", `tests/e2e/fixtures/${name}`],
				{
					cwd: path.resolve(__dirname, "../../.."),
					encoding: "utf8",
				},
			);

			expect(output.trim()).toBe(`tests/e2e/fixtures/${name}: binary: set`);
		}
	});

	it("pins the genuine RAF reader precondition and source identity", () => {
		const fixturePath = path.join(FIXTURES_DIR, RAF_FIXTURE);

		expect(fs.statSync(fixturePath).size).toBe(RAF_SIZE_BYTES);
		expect(sha256(fixturePath)).toBe(RAF_SHA256);
		expect(execFileSync(EXIFTOOL, ["-ver"], { encoding: "utf8" }).trim()).toBe(
			"13.59",
		);

		const metadata = readFixtureMetadata(RAF_FIXTURE);
		expect(metadata.FileType).toBe("RAF");
		expect(metadata.DateTimeOriginal).toBe("2007:05:22 13:58:30");
	});

	it("removes DateTimeOriginal from only a temporary RAF copy", () => {
		const sourcePath = path.join(FIXTURES_DIR, RAF_FIXTURE);
		const sourceHashBefore = sha256(sourcePath);
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "raf-integrity-"));
		const copiedPath = path.join(dir, RAF_FIXTURE);

		try {
			fs.copyFileSync(sourcePath, copiedPath);
			execFileSync(
				EXIFTOOL,
				["-DateTimeOriginal=", "-overwrite_original", copiedPath],
				{
					encoding: "utf8",
				},
			);

			expect(readFixtureMetadata(RAF_FIXTURE).DateTimeOriginal).toBe(
				"2007:05:22 13:58:30",
			);
			const output = execFileSync(
				EXIFTOOL,
				["-G1", "-s", "-json", copiedPath],
				{
					encoding: "utf8",
				},
			);
			expect(output).not.toContain("DateTimeOriginal");
			expect(sha256(sourcePath)).toBe(sourceHashBefore);
			expect(sourceHashBefore).toBe(RAF_SHA256);
		} finally {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});
});

// Phase 51.1-02 (RMV-05, D-47): pins for the four RAW fixtures vendored/seeded by
// generateRawFixtures -- committed digest/size, File:FileType, and every seeded/pre-existing
// identifying value readRawTags (-G3:1, tests/helpers/raw_probe.ts) reports. readRawTags is
// the SAME reader the e2e spec (51.1-01/-02) and the negative control (51.1-03) use, so a
// drift between the pin and either consumer is caught here first.
const RAW_FIXTURE_PINS = [
	{
		name: "CanonRaw.cr2",
		sha256: "a17c51b4a04f3eab2f276a5d44512a05b6d0237f21769fcd91b1415075431a59",
		sizeBytes: 9_012,
		fileType: "CR2",
		expected: {
			"IFD0:Artist": "ZZP511-ARTIST",
			"IFD0:Software": "ZZP511-SOFT",
			"IFD0:ImageDescription": "ZZP511-DESC",
			"IFD0:Copyright": "ZZP511-COPY",
			"IFD0:XPComment": "ZZP511-XPCOMMENT",
			"IFD0:XPTitle": "ZZP511-XPTITLE",
			"ExifIFD:UserComment": "ZZP511-COMMENT",
			"ExifIFD:SerialNumber": "ZZP511-BODYSN",
			"ExifIFD:LensSerialNumber": "ZZP511-LENSSN",
			"ExifIFD:OwnerName": "ZZP511-OWNER",
			"GPS:GPSLatitudeRef": "North",
			"ExifIFD:DateTimeOriginal": "2005:08:03 18:59:18",
			"Canon:SerialNumber": "0123456789",
		},
	},
	{
		name: "DNG.dng",
		sha256: "210f3b13106e4cca69ec16c393e3fe05bab41c86c5527ae3fc54f8764cdc250c",
		sizeBytes: 14_204,
		fileType: "DNG",
		expected: {
			"IFD0:Artist": "ZZP511-ARTIST",
			"IFD0:Software": "ZZP511-SOFT",
			"IFD0:ImageDescription": "ZZP511-DESC",
			"IFD0:Copyright": "ZZP511-COPY",
			"IFD0:XPComment": "ZZP511-XPCOMMENT",
			"IFD0:XPTitle": "ZZP511-XPTITLE",
			"ExifIFD:UserComment": "ZZP511-COMMENT",
			"ExifIFD:SerialNumber": "ZZP511-BODYSN",
			"ExifIFD:LensSerialNumber": "ZZP511-LENSSN",
			"ExifIFD:OwnerName": "ZZP511-OWNER",
			"GPS:GPSLatitudeRef": "North",
			// Upstream identifying values already present in the vendored file.
			"IFD0:CameraSerialNumber": "012345678",
			"IFD0:RawDataUniqueID": "0358DB4E08632D90925171A6BB8848A2",
			"IFD0:OriginalRawFileName": "Canon350D.CR2",
			"IFD0:UniqueCameraModel": "Canon EOS 350D",
		},
	},
	{
		name: "CanonRaw.cr3",
		sha256: "48ada5656150bc7a252a633183c86a835c8975686626d4e7ed1aab87111a2d43",
		sizeBytes: 53_283,
		fileType: "CR3",
		expected: {
			"IFD0:Artist": "ZZP511-ARTIST",
			"IFD0:Software": "ZZP511-SOFT",
			"IFD0:ImageDescription": "ZZP511-DESC",
			"IFD0:Copyright": "ZZP511-COPY",
			"IFD0:XPComment": "ZZP511-XPCOMMENT",
			"IFD0:XPTitle": "ZZP511-XPTITLE",
			"ExifIFD:UserComment": "ZZP511-COMMENT",
			"ExifIFD:SerialNumber": "ZZP511-BODYSN",
			"ExifIFD:LensSerialNumber": "ZZP511-LENSSN",
			"ExifIFD:OwnerName": "ZZP511-OWNER",
			"GPS:GPSLatitudeRef": "North",
			// Upstream identifying values already present in the vendored file.
			"Canon:InternalSerialNumber": "CG0156580",
			"ExifIFD:OffsetTime": "+00:00",
			"ExifIFD:SubSecTimeOriginal": 21,
			"ExifIFD:DateTimeOriginal": "2018:02:21 12:08:56",
		},
	},
	{
		name: "Panasonic.rw2",
		sha256: "a350097624881ad0007474bd7d3c1d7408eb52cd2abd8018ffa21f57cd807fc6",
		sizeBytes: 12_444,
		fileType: "RW2",
		expected: {
			// RW2's IFD0 seeds land only in the embedded JpgFromRaw preview -- readRawTags's
			// -a -G3:1 grouping reports them under the Doc1: prefix (measured this session;
			// see generate_fixtures.ts's comment on the same seed observed via plain -G1).
			"Doc1:IFD0:Artist": "ZZP511-ARTIST",
			"Doc1:IFD0:Software": "ZZP511-SOFT",
			"Doc1:IFD0:ImageDescription": "ZZP511-DESC",
			"Doc1:IFD0:Copyright": "ZZP511-COPY",
			"Doc1:IFD0:XPComment": "ZZP511-XPCOMMENT",
			"Doc1:IFD0:XPTitle": "ZZP511-XPTITLE",
			"ExifIFD:UserComment": "ZZP511-COMMENT",
			"ExifIFD:SerialNumber": "ZZP511-BODYSN",
			"ExifIFD:LensSerialNumber": "ZZP511-LENSSN",
			"ExifIFD:OwnerName": "ZZP511-OWNER",
			"GPS:GPSLatitudeRef": "North",
			// Upstream identifying value already present in the vendored file.
			"ExifIFD:DateTimeOriginal": "2008:08:06 15:21:56",
		},
	},
] as const;

describe("RAW fixtures (RMV-05, D-47)", () => {
	it.each(RAW_FIXTURE_PINS)(
		"$name matches its pinned committed digest and size (RMV-05, D-47)",
		({ name, sha256: expectedSha256, sizeBytes }) => {
			const filePath = path.join(FIXTURES_DIR, name);
			expect(fs.statSync(filePath).size).toBe(sizeBytes);
			expect(sha256(filePath)).toBe(expectedSha256);
		},
	);

	it.each(RAW_FIXTURE_PINS)(
		"$name pins its FileType and every seeded/pre-existing identifying value (RMV-05, D-47)",
		({ name, fileType, expected }) => {
			const filePath = path.join(FIXTURES_DIR, name);
			const tags = readRawTags(filePath, EXIFTOOL);
			expect(tags["File:FileType"]).toBe(fileType);
			for (const [key, value] of Object.entries(expected)) {
				expect(tags[key]).toBe(value);
			}
		},
	);

	it("classifies all four RAW fixtures and sample.raf as binary checkout fixtures (RMV-05, D-47)", () => {
		for (const name of [
			"CanonRaw.cr2",
			"DNG.dng",
			"CanonRaw.cr3",
			"Panasonic.rw2",
			"sample.raf",
		]) {
			const output = execFileSync(
				"git",
				["check-attr", "binary", "--", `tests/e2e/fixtures/${name}`],
				{
					cwd: path.resolve(__dirname, "../../.."),
					encoding: "utf8",
				},
			);

			expect(output.trim()).toBe(`tests/e2e/fixtures/${name}: binary: set`);
		}
	});
});

// Phase 52-04 (FID-03, D-37): pins for the seven matrix fixtures vendored unmodified by
// generateMatrixFixtures -- committed digest/size and File:FileType. Unlike RAW_FIXTURE_PINS,
// there is no seeded-tag check here: these fixtures are committed byte-identical to upstream,
// with no seed applied to the committed bytes (see MATRIX-PROVENANCE.md).
const MATRIX_FIXTURE_PINS = [
	{
		name: "GIF.gif",
		sha256: "55f8d30ea6fac980f35d5af11a90b10ddc0186d961b0273e66df2f8b7c5aa6be",
		sizeBytes: 2_321,
		fileType: "GIF",
	},
	{
		name: "QuickTime.heic",
		sha256: "4e1785e9924600d0274176f52609a2d514481877103b91c714bd2088ea803ae7",
		sizeBytes: 623,
		fileType: "HEIF",
	},
	{
		name: "QuickTime.mov",
		sha256: "eea529609b6026e0cd7b3d9188b997889f905cd89a93421ad7a9063c670449ec",
		sizeBytes: 3_871,
		fileType: "MOV",
	},
	{
		name: "BMP.bmp",
		sha256: "fab182ec28064483847443e29982d592b64d7019fc4f1db85e02501a40e1dcf8",
		sizeBytes: 1_142,
		fileType: "BMP",
	},
	{
		name: "XMP.svg",
		sha256: "1e6449dc39a0e61bc9a4d27beaef5e68bc72fc59c6bf1772d174fd34f5f400c2",
		sizeBytes: 2_071,
		fileType: "SVG",
	},
	{
		name: "RIFF.avi",
		sha256: "7c03b77d115118e3293833e6c1b5d5795c998051d145674368e0b97f02719d4b",
		sizeBytes: 1_262,
		fileType: "AVI",
	},
	{
		name: "ASF.wmv",
		sha256: "c3cafee199bbf19bb2fdce56211d44d108454ea7efd8ecc7c4cdda7ebce87c97",
		sizeBytes: 12_379,
		fileType: "WMV",
	},
] as const;

describe("Resolution matrix fixtures (FID-03, D-37)", () => {
	it.each(MATRIX_FIXTURE_PINS)(
		"$name matches its pinned committed digest and size (FID-03, D-37)",
		({ name, sha256: expectedSha256, sizeBytes }) => {
			const filePath = path.join(FIXTURES_DIR, name);
			expect(fs.statSync(filePath).size).toBe(sizeBytes);
			expect(sha256(filePath)).toBe(expectedSha256);
		},
	);

	it.each(MATRIX_FIXTURE_PINS)(
		"$name pins its FileType (FID-03, D-37)",
		({ name, fileType }) => {
			const filePath = path.join(FIXTURES_DIR, name);
			const output = execFileSync(EXIFTOOL, ["-s3", "-FileType", filePath])
				.toString()
				.trim();
			expect(output).toBe(fileType);
		},
	);

	it.each(MATRIX_FIXTURE_PINS)(
		"$name classifies as a binary checkout fixture (FID-03, D-37)",
		({ name }) => {
			const output = execFileSync(
				"git",
				["check-attr", "binary", "--", `tests/e2e/fixtures/${name}`],
				{
					cwd: path.resolve(__dirname, "../../.."),
					encoding: "utf8",
				},
			);
			expect(output.trim()).toBe(`tests/e2e/fixtures/${name}: binary: set`);
		},
	);
});
