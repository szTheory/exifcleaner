import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { snapshotDir, assertDirEffect } from "../../helpers/dir_effect";

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
