import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
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
	"no_metadata.jpg",
];

/** Fixtures that exist precisely to exercise the error path. */
const UNWRITABLE_FIXTURES = [
	"corrupted.jpg",
	"zero_byte.jpg",
	"unsupported.txt",
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
});
