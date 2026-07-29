import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/**
 * assertDirEffect asserts a whole-directory before/after delta: everything that changed
 * must be named, and everything named must have changed the declared way. Expected values
 * are file names, never digests — digests are computed at run time from the real bytes on
 * disk. This repo's own .gitattributes rule (`* text=auto eol=lf`) already rewrote a fixture
 * once and hid a broken sample.pdf for the whole v4.0 cycle undetected (see
 * tests/e2e/fixtures/fixture_integrity.test.ts:18-32); a literal golden digest here would
 * reintroduce that exact failure class the moment a fixture is regenerated or renormalized,
 * so nobody should "improve" this into hardcoded hashes.
 *
 * There is deliberately no ignore list and no exemption parameter anywhere below. rsync's
 * exclude-implies-protect is the cautionary tale: an escape hatch here is the erosion vector
 * this helper exists to remove. Every mutation must be named, always.
 *
 * Runner-agnostic on purpose: only node:crypto, node:fs and node:path are imported, so this
 * file is callable identically from a Playwright *.spec.ts and a Vitest *.test.ts.
 */

export type DirEntryKind = "file" | "dir" | "symlink";

interface DirSnapshotEntry {
	readonly kind: DirEntryKind;
	readonly size: number;
	readonly digest: string;
}

export type DirSnapshot = ReadonlyMap<string, DirSnapshotEntry>;

export interface DirEffectExpectation {
	readonly added?: readonly string[];
	readonly modified?: readonly string[];
	readonly removed?: readonly string[];
	readonly unchanged?: readonly string[];
}

// Directories carry no content of their own, so they get one constant sentinel digest
// rather than a hash of anything — their presence/absence is what matters, not bytes.
const DIRECTORY_DIGEST = "directory";

interface CollectedEntry {
	readonly key: string;
	readonly entry: DirSnapshotEntry;
}

function collect(root: string, dir: string, out: CollectedEntry[]): void {
	for (const name of fs.readdirSync(dir)) {
		const absolute = path.join(dir, name);
		// POSIX-separated so an expectation written on macOS is byte-identical on Windows.
		const relative = path.relative(root, absolute).split(path.sep).join("/");

		// lstat, never stat: following a symlink would let it point outside the snapshot
		// root undetected.
		const stat = fs.lstatSync(absolute);

		if (stat.isSymbolicLink()) {
			const target = fs.readlinkSync(absolute);
			out.push({
				key: relative,
				entry: {
					kind: "symlink",
					size: Buffer.byteLength(target),
					digest: createHash("sha256").update(target).digest("hex"),
				},
			});
			continue;
		}

		if (stat.isDirectory()) {
			out.push({
				key: relative,
				entry: { kind: "dir", size: 0, digest: DIRECTORY_DIGEST },
			});
			collect(root, absolute, out);
			continue;
		}

		out.push({
			key: relative,
			entry: {
				kind: "file",
				size: stat.size,
				digest: createHash("sha256")
					.update(fs.readFileSync(absolute))
					.digest("hex"),
			},
		});
	}
}

export function snapshotDir(dir: string): DirSnapshot {
	const collected: CollectedEntry[] = [];
	collect(dir, dir, collected);
	// Sort by key so two runs over the same unchanged directory produce byte-identical
	// snapshots regardless of readdir order.
	collected.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

	const snapshot = new Map<string, DirSnapshotEntry>();
	for (const { key, entry } of collected) {
		snapshot.set(key, entry);
	}
	return snapshot;
}

export function assertDirEffect(
	before: DirSnapshot,
	after: DirSnapshot,
	expected: DirEffectExpectation,
): void {
	const { added = [], unchanged = [] } = expected;
	const addedSet = new Set(added);
	const problems: string[] = [];

	for (const key of after.keys()) {
		if (!before.has(key) && !addedSet.has(key)) {
			problems.push(`unnamed file added: ${key}`);
		}
	}

	for (const key of unchanged) {
		const beforeEntry = before.get(key);
		const afterEntry = after.get(key);
		if (beforeEntry === undefined || afterEntry === undefined) {
			problems.push(`declared unchanged but missing: ${key}`);
			continue;
		}
		if (beforeEntry.digest !== afterEntry.digest) {
			problems.push(`declared unchanged but content differs: ${key}`);
		}
	}

	if (problems.length > 0) {
		throw new Error(
			`assertDirEffect found ${problems.length} problem(s):\n${problems.join("\n")}`,
		);
	}
}
