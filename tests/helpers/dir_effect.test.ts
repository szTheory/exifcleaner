import { describe, expect, test } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { assertDirEffect, snapshotDir } from "./dir_effect";

/**
 * Permanent negative control for assertDirEffect (D-20). This is not a demonstration —
 * it is exercised only by bugs, which by definition are not present on a green run. See
 * the header comment on dir_effect.ts and tests/e2e/fixtures/fixture_integrity.test.ts:18-32,
 * where sample.pdf shipped broken for the whole v4.0 cycle because a check counted files
 * instead of naming them.
 */

function mkTempDir(): string {
	return fs.mkdtempSync(path.join(os.tmpdir(), "exifcleaner-dir-effect-"));
}

describe("assertDirEffect", () => {
	test("#304 shape: a declared added file plus a declared unchanged file passes", () => {
		const dir = mkTempDir();
		try {
			fs.writeFileSync(path.join(dir, "sample.jpg"), "original-bytes");
			const before = snapshotDir(dir);

			fs.writeFileSync(path.join(dir, "sample_cleaned.jpg"), "cleaned-bytes");
			const after = snapshotDir(dir);

			expect(() =>
				assertDirEffect(before, after, {
					added: ["sample_cleaned.jpg"],
					unchanged: ["sample.jpg"],
				}),
			).not.toThrow();
		} finally {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});

	test("unnamed file added: an undeclared new file throws and names it", () => {
		const dir = mkTempDir();
		try {
			fs.writeFileSync(path.join(dir, "sample.jpg"), "original-bytes");
			const before = snapshotDir(dir);

			fs.writeFileSync(path.join(dir, "sample_cleaned.jpg"), "cleaned-bytes");
			fs.writeFileSync(path.join(dir, "stray.txt"), "unexpected");
			const after = snapshotDir(dir);

			expect(() =>
				assertDirEffect(before, after, {
					added: ["sample_cleaned.jpg"],
					unchanged: ["sample.jpg"],
				}),
			).toThrowError(/stray\.txt/);
		} finally {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});
});
