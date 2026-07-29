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

	test("unnamed file modified: an undeclared byte change throws and names it", () => {
		const dir = mkTempDir();
		try {
			fs.writeFileSync(path.join(dir, "sample.jpg"), "original-bytes");
			const before = snapshotDir(dir);

			fs.writeFileSync(path.join(dir, "sample.jpg"), "different-bytes!!");
			const after = snapshotDir(dir);

			expect(() => assertDirEffect(before, after, {})).toThrowError(
				/sample\.jpg/,
			);
		} finally {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});

	test("unnamed file deleted: an undeclared deletion throws and names it", () => {
		const dir = mkTempDir();
		try {
			fs.writeFileSync(path.join(dir, "sample.jpg"), "original-bytes");
			const before = snapshotDir(dir);

			fs.rmSync(path.join(dir, "sample.jpg"));
			const after = snapshotDir(dir);

			expect(() => assertDirEffect(before, after, {})).toThrowError(
				/sample\.jpg/,
			);
		} finally {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});

	test("declared but did not happen: an added path that was never created throws", () => {
		const dir = mkTempDir();
		try {
			const before = snapshotDir(dir);
			const after = snapshotDir(dir);

			expect(() =>
				assertDirEffect(before, after, { added: ["never_written.jpg"] }),
			).toThrowError(/never_written\.jpg/);
		} finally {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});

	test("same size, different bytes: overwriting a declared-unchanged file throws (digest, not stat)", () => {
		const dir = mkTempDir();
		try {
			fs.writeFileSync(path.join(dir, "sample.jpg"), "AAAAAAAAAA");
			const before = snapshotDir(dir);

			fs.writeFileSync(path.join(dir, "sample.jpg"), "BBBBBBBBBB");
			const after = snapshotDir(dir);

			expect(() =>
				assertDirEffect(before, after, { unchanged: ["sample.jpg"] }),
			).toThrow();
		} finally {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});

	test("file becomes a directory: a kind swap throws naming the kind change", () => {
		const dir = mkTempDir();
		try {
			fs.writeFileSync(path.join(dir, "sample.jpg"), "bytes");
			const before = snapshotDir(dir);

			fs.rmSync(path.join(dir, "sample.jpg"));
			fs.mkdirSync(path.join(dir, "sample.jpg"));
			const after = snapshotDir(dir);

			expect(() => assertDirEffect(before, after, {})).toThrowError(
				/kind changed/,
			);
		} finally {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});

	test("case-colliding expectation: two entries differing only by ASCII case throw before any comparison", () => {
		const dir = mkTempDir();
		try {
			const before = snapshotDir(dir);
			const after = snapshotDir(dir);

			expect(() =>
				assertDirEffect(before, after, { added: ["Photo.jpg", "photo.jpg"] }),
			).toThrowError(/collide/);
		} finally {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});

	test("same name in two buckets: a path declared in two buckets throws before any comparison", () => {
		const dir = mkTempDir();
		try {
			const before = snapshotDir(dir);
			const after = snapshotDir(dir);

			expect(() =>
				assertDirEffect(before, after, {
					added: ["a.jpg"],
					removed: ["a.jpg"],
				}),
			).toThrowError(/both/);
		} finally {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});

	test("empty directory, empty expectation: passes", () => {
		const dir = mkTempDir();
		try {
			const before = snapshotDir(dir);
			const after = snapshotDir(dir);

			expect(() => assertDirEffect(before, after, {})).not.toThrow();
		} finally {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});

	test("read-only snapshot: snapshotting twice with no mutation passes and serialises identically", () => {
		const dir = mkTempDir();
		try {
			fs.writeFileSync(path.join(dir, "sample.jpg"), "bytes");
			const first = snapshotDir(dir);
			const second = snapshotDir(dir);

			expect(() => assertDirEffect(first, second, {})).not.toThrow();
			expect(JSON.stringify([...second])).toBe(JSON.stringify([...first]));
		} finally {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});

	test("failure report includes all four gutter characters for a mixed delta", () => {
		const dir = mkTempDir();
		try {
			fs.writeFileSync(path.join(dir, "unchanged.txt"), "same");
			fs.writeFileSync(path.join(dir, "toRemove.txt"), "gone soon");
			fs.writeFileSync(path.join(dir, "toModify.txt"), "before");
			const before = snapshotDir(dir);

			fs.rmSync(path.join(dir, "toRemove.txt"));
			fs.writeFileSync(path.join(dir, "toModify.txt"), "after-bytes");
			fs.writeFileSync(path.join(dir, "newFile.txt"), "surprise");
			const after = snapshotDir(dir);

			let message = "";
			try {
				assertDirEffect(before, after, {
					unchanged: ["unchanged.txt"],
					modified: ["toModify.txt"],
					removed: ["toRemove.txt"],
					// newFile.txt is deliberately left undeclared, so this throws.
				});
			} catch (err: unknown) {
				message = err instanceof Error ? err.message : String(err);
			}

			expect(message).toContain("=");
			expect(message).toContain("~");
			expect(message).toContain("+");
			expect(message).toContain("-");
		} finally {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});
});
