// D-17 red control for tests/helpers/native_differential.ts: proves the differential
// helper itself fails closed. Two layers:
//   1. Pure unit coverage of nativeDifferentialProblems over synthetic Buffers (no I/O).
//   2. A real-fixture red control: passing the ExifTool reference as "installed" must be
//      rejected, passing the native reference must be accepted, and a case measured to be
//      non-discriminating (sample.jpg/sample.png under full strip collapse to identical
//      bytes per 58-10-PLAN.md's planning-time measurement) must be flagged as such rather
//      than silently passing.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import {
	buildExiftoolReference,
	buildNativeReference,
	nativeDifferentialProblems,
	type DifferentialPreservation,
} from "../helpers/native_differential";
import { assertDirEffect, snapshotDir } from "../helpers/dir_effect";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURES_DIR = path.resolve(__dirname, "../e2e/fixtures");
const EXIFTOOL_PATH =
	process.platform === "win32"
		? path.resolve(__dirname, "../../.resources/win/bin/exiftool.exe")
		: path.resolve(__dirname, "../../.resources/nix/bin/exiftool");

// D-15: the app's default preservations -- Save as copy, orientation, color profile and
// resolution on, timestamps off.
const DEFAULT_PRESERVATION: DifferentialPreservation = {
	preserveOrientation: true,
	preserveColorProfile: true,
	preserveResolution: true,
	preserveTimestamps: false,
};

const FULL_STRIP_PRESERVATION: DifferentialPreservation = {
	preserveOrientation: false,
	preserveColorProfile: false,
	preserveResolution: false,
	preserveTimestamps: false,
};

function makeTempDir(): { dir: string; cleanup: () => void } {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "exifcleaner-differential-"));
	return { dir, cleanup: (): void => fs.rmSync(dir, { recursive: true, force: true }) };
}

// exifcleaner-node's native publication transaction leaves a documented, empty
// `.exifcleaner-stage-<uuid>` directory on POSIX for every native-routed write (see
// tests/helpers/processing_driver.ts's identical discoverNativeStageResidue comment).
// buildNativeReference calls sanitizeFile directly, so it hits this same residue.
function residueEntries(dir: string): string[] {
	return fs
		.readdirSync(dir)
		.filter((name) => name.startsWith(".exifcleaner-stage-"));
}

/**
 * Builds both real references from independent fresh copies of `fixture`, inside their
 * own mkdtemp directory, and asserts the directory's whole effect is exactly the four
 * files this produces (two source copies, two outputs) -- nothing else.
 */
async function buildRealReferences({
	fixture,
	preservation,
}: {
	fixture: string;
	preservation: DifferentialPreservation;
}): Promise<{ native: Buffer; exiftool: Buffer; cleanup: () => void }> {
	const { dir, cleanup } = makeTempDir();
	const before = snapshotDir(dir);

	const nativeSource = path.join(dir, `native-${fixture}`);
	fs.copyFileSync(path.join(FIXTURES_DIR, fixture), nativeSource);
	const nativeOutput = path.join(dir, `native-out-${fixture}`);
	const native = await buildNativeReference({
		sourcePath: nativeSource,
		outputPath: nativeOutput,
		preservation,
	});

	const exiftoolSource = path.join(dir, `exiftool-${fixture}`);
	fs.copyFileSync(path.join(FIXTURES_DIR, fixture), exiftoolSource);
	const exiftoolOutput = path.join(dir, `exiftool-out-${fixture}`);
	const exiftool = buildExiftoolReference({
		exiftoolPath: EXIFTOOL_PATH,
		sourcePath: exiftoolSource,
		outputPath: exiftoolOutput,
		preservation,
	});

	const after = snapshotDir(dir);
	assertDirEffect(before, after, {
		modified: [],
		removed: [],
		unchanged: [],
		added: [
			path.basename(nativeSource),
			path.basename(nativeOutput),
			path.basename(exiftoolSource),
			path.basename(exiftoolOutput),
			...residueEntries(dir),
		],
	});

	return { native, exiftool, cleanup };
}

describe("nativeDifferentialProblems (pure)", () => {
	it("returns [] when installed equals native and native differs from exiftool", () => {
		const native = Buffer.from("native-bytes");
		const exiftool = Buffer.from("exiftool-bytes");
		expect(
			nativeDifferentialProblems({ installed: native, native, exiftool }),
		).toEqual([]);
	});

	it('flags non-discriminating references with "references are identical"', () => {
		const shared = Buffer.from("shared-bytes");
		const problems = nativeDifferentialProblems({
			installed: shared,
			native: shared,
			exiftool: shared,
		});
		expect(problems.some((p) => p.includes("references are identical"))).toBe(true);
	});

	it('flags installed != native with "does not equal the native reference"', () => {
		const native = Buffer.from("native-bytes");
		const exiftool = Buffer.from("exiftool-bytes");
		const installed = Buffer.from("something-else-entirely");
		const problems = nativeDifferentialProblems({ installed, native, exiftool });
		expect(
			problems.some((p) => p.includes("does not equal the native reference")),
		).toBe(true);
	});

	it('flags installed == exiftool with "equals the ExifTool reference"', () => {
		const native = Buffer.from("native-bytes");
		const exiftool = Buffer.from("exiftool-bytes");
		const problems = nativeDifferentialProblems({
			installed: exiftool,
			native,
			exiftool,
		});
		expect(problems.some((p) => p.includes("equals the ExifTool reference"))).toBe(
			true,
		);
	});
});

describe("D-17 red control: real fixtures, real bundled ExifTool", () => {
	it("rejects the ExifTool reference passed as installed (sample.jpg, default preservations)", async () => {
		const { native, exiftool, cleanup } = await buildRealReferences({
			fixture: "sample.jpg",
			preservation: DEFAULT_PRESERVATION,
		});
		try {
			// Discrimination precondition: this case must actually be able to tell the
			// two engines apart, or the assertion below would be vacuous.
			expect(native.equals(exiftool)).toBe(false);
			expect(
				nativeDifferentialProblems({ installed: exiftool, native, exiftool }),
			).not.toEqual([]);
		} finally {
			cleanup();
		}
	});

	it("accepts the native reference passed as installed (sample.jpg, default preservations)", async () => {
		const { native, exiftool, cleanup } = await buildRealReferences({
			fixture: "sample.jpg",
			preservation: DEFAULT_PRESERVATION,
		});
		try {
			expect(
				nativeDifferentialProblems({ installed: native, native, exiftool }),
			).toEqual([]);
		} finally {
			cleanup();
		}
	});

	it("flags sample.png under full strip as non-discriminating (references identical)", async () => {
		const { native, exiftool, cleanup } = await buildRealReferences({
			fixture: "sample.png",
			preservation: FULL_STRIP_PRESERVATION,
		});
		try {
			expect(native.equals(exiftool)).toBe(true);
			const problems = nativeDifferentialProblems({
				installed: native,
				native,
				exiftool,
			});
			expect(problems.some((p) => p.includes("references are identical"))).toBe(
				true,
			);
		} finally {
			cleanup();
		}
	});
});
