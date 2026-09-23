// D-50 unit gates for tests/helpers/large_file_fixture.ts. Calls only the pure functions --
// this file never touches a temp directory or the filesystem -- so `verify:direffect` (the
// whole-directory blast-radius gate other suites run against) does not collect it at all.
// (Phase 53-03 fix: the prior wording of this comment literally contained the disk-write
// detector's own substring tokens as prose, tripping scripts/dir_effect_gate.mjs's naive
// plain-string match with a false positive -- see that script's own "V5" detector note.) Each
// gate below is exercised on both its throwing side and its passing side, at the exact
// boundary, so a future regression to any threshold or comparison operator turns the relevant
// case red rather than silently drifting.
import { describe, expect, it } from "vitest";
import {
	FOUR_GIB,
	MAX_SPARSE_ALLOCATED_BYTES,
	assertBeyondFourGiB,
	assertSparse,
	classifyLargeFileHost,
} from "./large_file_fixture";

// Not exported by large_file_fixture.ts (Claude's discretion, per the plan's interface list --
// only the seven documented exports plus the two magic constants are public). ext4's real
// magic number, used here only to prove classifyLargeFileHost returns null for a real,
// non-tmpfs/ramfs filesystem type, not just for an arbitrary non-matching number.
const EXT4_MAGIC = 0xef53;

describe("large_file_fixture gates", () => {
	describe("classifyLargeFileHost", () => {
		it("returns a reason naming both free-byte figures when freeBytes is one below minFreeBytes", () => {
			const minFreeBytes = 6 * 1024 * 1024 * 1024;
			const reason = classifyLargeFileHost({
				freeBytes: minFreeBytes - 1,
				fsType: EXT4_MAGIC,
				minFreeBytes,
			});
			expect(reason).not.toBeNull();
			expect(reason).toContain(String(minFreeBytes - 1));
			expect(reason).toContain(String(minFreeBytes));
		});

		it("returns a tmpfs reason for fsType 0x01021994", () => {
			const reason = classifyLargeFileHost({
				freeBytes: 100 * 1024 * 1024 * 1024,
				fsType: 0x01021994,
				minFreeBytes: 6 * 1024 * 1024 * 1024,
			});
			expect(reason).not.toBeNull();
			expect(reason).toContain("tmpfs");
		});

		it("returns a ramfs reason for fsType 0x858458f6", () => {
			const reason = classifyLargeFileHost({
				freeBytes: 100 * 1024 * 1024 * 1024,
				fsType: 0x858458f6,
				minFreeBytes: 6 * 1024 * 1024 * 1024,
			});
			expect(reason).not.toBeNull();
			expect(reason).toContain("ramfs");
		});

		it("returns null for a large-free ext4 host", () => {
			const reason = classifyLargeFileHost({
				freeBytes: 100 * 1024 * 1024 * 1024,
				fsType: EXT4_MAGIC,
				minFreeBytes: 6 * 1024 * 1024 * 1024,
			});
			expect(reason).toBeNull();
		});
	});

	describe("assertSparse", () => {
		it("throws when allocatedBytes equals MAX_SPARSE_ALLOCATED_BYTES", () => {
			expect(() =>
				assertSparse({
					logicalBytes: FOUR_GIB,
					allocatedBytes: MAX_SPARSE_ALLOCATED_BYTES,
				}),
			).toThrow(/not sparse/);
		});

		it("passes when allocatedBytes is one byte below MAX_SPARSE_ALLOCATED_BYTES", () => {
			expect(() =>
				assertSparse({
					logicalBytes: FOUR_GIB,
					allocatedBytes: MAX_SPARSE_ALLOCATED_BYTES - 1,
				}),
			).not.toThrow();
		});
	});

	describe("assertBeyondFourGiB", () => {
		it("throws when logicalBytes equals FOUR_GIB exactly", () => {
			expect(() =>
				assertBeyondFourGiB({
					logicalBytes: FOUR_GIB,
					mdatLargeSize: 2n ** 32n + 1n,
				}),
			).toThrow(/logicalBytes/);
		});

		it("throws when mdatLargeSize equals 2^32 exactly", () => {
			expect(() =>
				assertBeyondFourGiB({
					logicalBytes: FOUR_GIB + 1,
					mdatLargeSize: 2n ** 32n,
				}),
			).toThrow(/mdatLargeSize/);
		});

		it("passes at FOUR_GIB + 1 with mdatLargeSize one above 2^32", () => {
			expect(() =>
				assertBeyondFourGiB({
					logicalBytes: FOUR_GIB + 1,
					mdatLargeSize: 2n ** 32n + 1n,
				}),
			).not.toThrow();
		});
	});
});
