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
 * `added`, `modified` and `removed` are exact: any observed mutation not declared in the
 * right bucket fails, and any declared mutation that did not happen also fails. `unchanged`
 * is a subset assertion — it only pins the files a test cares about, so nobody has to
 * enumerate an entire directory just to prove one file was left alone.
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
const UNREADABLE_DIGEST = "unreadable";

// A runaway walk (a symlink loop, a build output nobody expected) fails loudly as an
// oversized snapshot instead of hanging the suite.
const MAX_DEPTH = 32;
const MAX_ENTRIES = 10000;
const REPORT_ROW_LIMIT = 40;

interface CollectedEntry {
	readonly key: string;
	readonly entry: DirSnapshotEntry;
}

function hashFile(absolute: string): string {
	try {
		return createHash("sha256").update(fs.readFileSync(absolute)).digest("hex");
	} catch {
		return UNREADABLE_DIGEST;
	}
}

function collect(
	root: string,
	dir: string,
	depth: number,
	out: CollectedEntry[],
): void {
	if (depth > MAX_DEPTH) {
		throw new Error(
			`snapshotDir: exceeded max depth of ${MAX_DEPTH} while walking ${dir} — snapshot too large`,
		);
	}
	for (const name of fs.readdirSync(dir)) {
		if (out.length >= MAX_ENTRIES) {
			throw new Error(
				`snapshotDir: exceeded max entry count of ${MAX_ENTRIES} — snapshot too large`,
			);
		}
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
			collect(root, absolute, depth + 1, out);
			continue;
		}

		out.push({
			key: relative,
			entry: { kind: "file", size: stat.size, digest: hashFile(absolute) },
		});
	}
}

export function snapshotDir(dir: string): DirSnapshot {
	const collected: CollectedEntry[] = [];
	collect(dir, dir, 0, collected);
	// Sort by key so two runs over the same unchanged directory produce byte-identical
	// snapshots regardless of readdir order.
	collected.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

	const snapshot = new Map<string, DirSnapshotEntry>();
	for (const { key, entry } of collected) {
		snapshot.set(key, entry);
	}
	return snapshot;
}

// Rejects a path declared in two different buckets, or two entries differing only by
// ASCII case, before any snapshot comparison runs. NTFS is case-insensitive-preserving,
// so a pair that is two keys on Linux collides into one on the Windows runner.
function assertNoBucketCollisions({
	added = [],
	modified = [],
	removed = [],
	unchanged = [],
}: DirEffectExpectation): void {
	const buckets: { name: string; keys: readonly string[] }[] = [
		{ name: "added", keys: added },
		{ name: "modified", keys: modified },
		{ name: "removed", keys: removed },
		{ name: "unchanged", keys: unchanged },
	];

	const bucketOf = new Map<string, string>();
	const casedKeyOf = new Map<string, string>();

	for (const { name, keys } of buckets) {
		for (const key of keys) {
			const priorBucket = bucketOf.get(key);
			if (priorBucket !== undefined && priorBucket !== name) {
				throw new Error(
					`assertDirEffect: "${key}" is declared in both "${priorBucket}" and "${name}" — a path may only appear in one bucket`,
				);
			}
			bucketOf.set(key, name);

			const lower = key.toLowerCase();
			const priorCased = casedKeyOf.get(lower);
			if (priorCased !== undefined && priorCased !== key) {
				throw new Error(
					`assertDirEffect: "${priorCased}" and "${key}" collide when compared case-insensitively (NTFS treats them as one path)`,
				);
			}
			casedKeyOf.set(lower, key);
		}
	}
}

// Reason field drawn from a small fixed set, mirroring diff/git status.
function classify(
	before: DirSnapshotEntry | undefined,
	after: DirSnapshotEntry | undefined,
): { reason: string } | undefined {
	if (before === undefined || after === undefined) {
		return undefined;
	}
	if (
		before.digest === UNREADABLE_DIGEST ||
		after.digest === UNREADABLE_DIGEST
	) {
		return before.digest === after.digest && before.kind === after.kind
			? undefined
			: { reason: "unreadable" };
	}
	if (before.kind !== after.kind) {
		return { reason: "kind changed" };
	}
	if (before.digest !== after.digest) {
		return {
			reason:
				before.kind === "symlink"
					? "symlink target changed"
					: "content differs",
		};
	}
	return undefined;
}

// Two known-cause diagnostics: an exiftool backup means a code path dropped
// -overwrite_original (a regression signal), and a Finder metadata file means a Finder
// window touched the fixture directory (environment noise, not a product bug). Both still
// fail — exactness is preserved — but the maintainer isn't left guessing at 11pm.
function diagnose(key: string): string | undefined {
	const base = key.split("/").pop() ?? key;
	if (base.endsWith("_original")) {
		return "exiftool backup file — a code path dropped -overwrite_original";
	}
	if (base === ".DS_Store") {
		return "Finder metadata file — a Finder window touched this directory; close it and re-run";
	}
	return undefined;
}

interface DeltaRow {
	readonly gutter: "=" | "~" | "+" | "-";
	readonly key: string;
	readonly before: number | undefined;
	readonly after: number | undefined;
	readonly reason: string;
}

function renderFailure(
	rows: readonly DeltaRow[],
	problems: readonly string[],
): string {
	const shown = rows.slice(0, REPORT_ROW_LIMIT);
	const lines = shown.map(
		(row) =>
			`${row.gutter} ${row.key}  (${row.before ?? "—"} -> ${row.after ?? "—"})  ${row.reason}`,
	);
	if (rows.length > REPORT_ROW_LIMIT) {
		lines.push(`… ${rows.length - REPORT_ROW_LIMIT} more row(s) truncated`);
	}

	const literal = (gutter: DeltaRow["gutter"]): string =>
		JSON.stringify(
			rows.filter((row) => row.gutter === gutter).map((row) => row.key),
		);

	return [
		`assertDirEffect found ${problems.length} problem(s):`,
		...problems,
		"",
		"Full delta (= unchanged, ~ modified, + added, - removed):",
		...lines,
		"",
		"Paste-ready observed literal:",
		`added: ${literal("+")}`,
		`modified: ${literal("~")}`,
		`removed: ${literal("-")}`,
	].join("\n");
}

export function assertDirEffect(
	before: DirSnapshot,
	after: DirSnapshot,
	expected: DirEffectExpectation,
): void {
	assertNoBucketCollisions(expected);

	const { added = [], modified = [], removed = [], unchanged = [] } = expected;
	const addedSet = new Set(added);
	const modifiedSet = new Set(modified);
	const removedSet = new Set(removed);
	const unchangedSet = new Set(unchanged);

	const allKeys = new Set<string>([...before.keys(), ...after.keys()]);
	const rows: DeltaRow[] = [];
	const problems: string[] = [];

	for (const key of allKeys) {
		const beforeEntry = before.get(key);
		const afterEntry = after.get(key);

		if (beforeEntry === undefined && afterEntry !== undefined) {
			const diag = diagnose(key);
			rows.push({
				gutter: "+",
				key,
				before: undefined,
				after: afterEntry.size,
				reason: diag ?? "newly created",
			});
			if (!addedSet.has(key)) {
				problems.push(
					diag !== undefined ? `${diag}: ${key}` : `unnamed file added: ${key}`,
				);
			}
			continue;
		}

		if (beforeEntry !== undefined && afterEntry === undefined) {
			rows.push({
				gutter: "-",
				key,
				before: beforeEntry.size,
				after: undefined,
				reason: "deleted",
			});
			if (!removedSet.has(key)) {
				problems.push(`unnamed file deleted: ${key}`);
			}
			continue;
		}

		const diff = classify(beforeEntry, afterEntry);
		if (diff !== undefined) {
			rows.push({
				gutter: "~",
				key,
				before: beforeEntry?.size,
				after: afterEntry?.size,
				reason: diff.reason,
			});
			if (!modifiedSet.has(key)) {
				problems.push(`unnamed file modified (${diff.reason}): ${key}`);
			}
			continue;
		}

		if (unchangedSet.has(key)) {
			rows.push({
				gutter: "=",
				key,
				before: beforeEntry?.size,
				after: afterEntry?.size,
				reason: "—",
			});
		}
	}

	for (const key of added) {
		if (!(before.get(key) === undefined && after.get(key) !== undefined)) {
			problems.push(`declared added but did not happen: ${key}`);
		}
	}
	for (const key of removed) {
		if (!(before.get(key) !== undefined && after.get(key) === undefined)) {
			problems.push(`declared removed but did not happen: ${key}`);
		}
	}
	for (const key of modified) {
		if (classify(before.get(key), after.get(key)) === undefined) {
			problems.push(`declared modified but did not happen: ${key}`);
		}
	}
	for (const key of unchanged) {
		const beforeEntry = before.get(key);
		const afterEntry = after.get(key);
		if (
			beforeEntry === undefined ||
			afterEntry === undefined ||
			classify(beforeEntry, afterEntry) !== undefined
		) {
			problems.push(`declared unchanged but changed or missing: ${key}`);
		}
	}

	if (problems.length === 0) {
		return;
	}

	throw new Error(renderFailure(rows, problems));
}
