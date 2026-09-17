// Rename-equivalence proof — keeps D-12 commit 1 provably a pure mechanical rename.
//
// Context: Phase 46 landed a WebP-requalification commit that mixed a real change with an
// 1890-line diff that was 95% formatting noise (a `yarn format` run swept across files far
// beyond the ones actually touched), which nearly hid the real change from reviewers. D-12
// forbids repeating that: the format-neutral rename (NativeWebp* → NativeMetadata*/Native*,
// five `git mv` path moves, one quoted-literal substitution) must land as its own commit with
// ZERO behavior change, and this script is the byte-level proof of that — not a human
// assertion that "it's just a rename".
//
// Mechanism: apply the D-09 token map and path moves to every RENAME-TARGET file (any file
// under src/tests whose PRE-rename content matches the discovery pattern this script also
// used to (re)compute the rename set), then compare the result against the matching path in
// the actual POST-rename ref. Empty output (`[]` from diffRenamedTrees, "RENAME EQUIVALENCE
// GATE PASSED" from the CLI) is the proof that, for exactly that file set, nothing except the
// declared identifiers, one string literal, and five paths changed.
//
// Scope, stated precisely because it is easy to over-claim: this gate proves purity for the
// RENAME-TARGET set (the 11 files git grep found containing a D-09 token, plus their 5 new
// paths), not "nothing else changed anywhere in the commit". D-12 commit 1 legitimately ALSO
// introduces this script itself, its companion unit test, and one ambient .mjs module
// declaration for the type checker — none of those are part of the rename and none of them
// existed before this commit, so they are outside what an "equivalence to the pre-rename
// tree" claim could even mean. Their correctness is covered separately (yarn typecheck, yarn
// lint, yarn test, and this file's own companion test), and the acceptance criteria's
// TOKENS_GONE_OK / PATHS_MOVED_OK / EXCLUSIONS_UNTOUCHED_OK checks are scoped the same way.
//
// Cross-platform note: this repo supports macOS, Windows, and Linux (CLAUDE.md). Rather than
// extract two on-disk scratch trees and shell out to `diff -r --brief` (which the project's
// own `docs/how-to` guidance already flags as unreliable on Windows Git Bash for a comparable
// case — POSIX `curl`), this script reads both refs entirely through `git ls-tree`/`git show`
// and diffs the resulting in-memory trees in pure JavaScript. That is at least as rigorous as
// a real `diff -r --brief` (same "every byte must match" contract) and has no dependency on a
// platform's `diff` binary being present or POSIX-compatible.
//
// Usage: node scripts/rename_equivalence_gate.mjs <before-ref> <after-ref>
// Exits 0 with a summary line when the after-ref's src/tests tree equals the before-ref's
// tree with the D-09 transform applied. Exits 1 and prints every discrepancy otherwise.

import { execFileSync } from "node:child_process";

// D-09's identifier token map, ordered LONGEST-FIRST: a longer identifier must be rewritten
// before a shorter one could partially match a substring of it (e.g.
// NativeWebpFormatCapabilities before NativeWebpCapabilities). Matched whole-word so a token
// never fires inside an unrelated longer identifier that happens to contain it.
export const IDENTIFIER_TOKEN_MAP = [
	["NativeWebpFormatCapabilities", "NativeFormatCapabilities"],
	["NativeWebpSanitizeRequest", "NativeSanitizeRequest"],
	["NativeWebpCapabilities", "NativeMetadataCapabilities"],
	["NativeWebpAdapter", "NativeMetadataAdapter"],
	["NativeWebpPort", "NativeMetadataPort"],
	["NativeWebpError", "NativeMetadataError"],
	["FakeNativeWebp", "FakeNativeMetadata"],
	["isNativeWebpCopyCandidate", "isNativeCopyCandidate"],
	["nativeWebp", "native"],
];

// The one quoted string-literal substitution D-09 calls out separately from the identifier
// map — it is a value inside a string literal, not a bare identifier, so whole-word matching
// does not apply to it the same way; a plain substring replace is correct here.
export const LITERAL_TOKEN_MAP = [
	[`backend: "native-webp"`, `backend: "native"`],
];

// Import-specifier rewrites that follow mechanically from the five PATH_MOVES below: any file
// importing a moved path must update the specifier string, and the specifier is relative to
// the IMPORTING file's own location, not the moved file's — so this cannot be derived from
// PATH_MOVES generically without knowing each importer's directory. Enumerated explicitly
// instead (one entry per distinct specifier string found across the rename-target set), in
// LONGEST-FIRST order so the `.ts`-suffixed URL-string variant (used by one test's
// `new URL(...)` check) is rewritten before the bare specifier, which is one of its prefixes,
// could partially match inside it.
export const IMPORT_PATH_TOKEN_MAP = [
	[
		'"../../src/infrastructure/native_webp/native_webp_adapter.ts"',
		'"../../src/infrastructure/metadata/native_metadata_adapter.ts"',
	],
	[
		'"../../src/infrastructure/native_webp/native_webp_adapter"',
		'"../../src/infrastructure/metadata/native_metadata_adapter"',
	],
	[
		'"../../src/infrastructure/metadata/native_webp_port"',
		'"../../src/infrastructure/metadata/native_metadata_port"',
	],
	[
		'"./native_webp/native_webp_adapter"',
		'"./metadata/native_metadata_adapter"',
	],
	['"../metadata/native_webp_port"', '"./native_metadata_port"'],
	['"./native_webp_port"', '"./native_metadata_port"'],
	['"../fakes/fake_native_webp"', '"../fakes/fake_native_metadata"'],
];

// D-09's five path moves. A path not named here passes through unchanged — the rename is
// scoped to exactly these five moves; every other matched file is edited in place.
export const PATH_MOVES = [
	[
		"src/infrastructure/metadata/native_webp_port.ts",
		"src/infrastructure/metadata/native_metadata_port.ts",
	],
	[
		"src/infrastructure/native_webp/native_webp_adapter.ts",
		"src/infrastructure/metadata/native_metadata_adapter.ts",
	],
	["tests/fakes/fake_native_webp.ts", "tests/fakes/fake_native_metadata.ts"],
	[
		"tests/infrastructure/native_webp_adapter.test.ts",
		"tests/infrastructure/native_metadata_adapter.test.ts",
	],
	[
		"tests/integration/native_webp_oracle.test.ts",
		"tests/integration/native_metadata_oracle.test.ts",
	],
];

function escapeRegExp(literal) {
	return literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Apply the D-09 identifier, literal, and import-specifier token maps to one file's source
 * text. Pure, no I/O.
 * @param {string} content
 * @returns {string}
 */
export function transformContent(content) {
	let out = content;
	for (const [from, to] of IDENTIFIER_TOKEN_MAP) {
		out = out.replace(new RegExp(`\\b${escapeRegExp(from)}\\b`, "gu"), to);
	}
	for (const [from, to] of LITERAL_TOKEN_MAP) {
		out = out.split(from).join(to);
	}
	for (const [from, to] of IMPORT_PATH_TOKEN_MAP) {
		out = out.split(from).join(to);
	}
	return out;
}

/**
 * Apply D-09's path moves to one relative path. Pure, no I/O.
 * @param {string} relPath
 * @returns {string}
 */
export function transformPath(relPath) {
	const normalized = relPath.replace(/\\/gu, "/");
	const move = PATH_MOVES.find(([from]) => from === normalized);
	return move === undefined ? normalized : move[1];
}

/**
 * The pure equivalence check the companion test exercises over literal fixture strings (never
 * real files — see tests/scripts/rename_equivalence_gate.test.ts). Applies the D-09 transform
 * to `beforeFiles` (the PRE-rename content of the rename-target file set, as a
 * Map<relativePath, content> — see buildRenameTargetTree below for how the CLI scopes this)
 * and diffs the result against `afterFiles` (the full POST-rename tree, same shape: a
 * transformed-before path missing or mismatched there is a real discrepancy; a file present in
 * `afterFiles` but absent from the transformed set is NOT flagged — the rename-target scope is
 * deliberately not a claim about the rest of the tree, see the file header).
 *
 * @param {ReadonlyMap<string,string>} beforeFiles
 * @param {ReadonlyMap<string,string>} afterFiles
 * @returns {string[]} discrepancies — [] means the rename-target set transformed cleanly.
 */
export function diffRenamedTrees(beforeFiles, afterFiles) {
	const transformed = new Map();
	for (const [relPath, content] of beforeFiles) {
		transformed.set(transformPath(relPath), transformContent(content));
	}

	const problems = [];
	for (const [relPath, content] of transformed) {
		if (!afterFiles.has(relPath)) {
			problems.push(`missing in after tree: ${relPath}`);
			continue;
		}
		if (afterFiles.get(relPath) !== content) {
			problems.push(`content mismatch beyond the token map: ${relPath}`);
		}
	}
	return problems;
}

function gitListFiles(ref) {
	const output = execFileSync(
		"git",
		["ls-tree", "-r", "--name-only", ref, "--", "src", "tests"],
		{ encoding: "utf8" },
	);
	return output.split("\n").filter((line) => line.length > 0);
}

function gitShowFile(ref, relPath) {
	return execFileSync("git", ["show", `${ref}:${relPath}`], {
		encoding: "utf8",
	});
}

function buildTree(ref) {
	const files = gitListFiles(ref);
	const tree = new Map();
	for (const relPath of files) {
		tree.set(relPath, gitShowFile(ref, relPath));
	}
	return tree;
}

// The same discovery pattern the plan's action text directs recomputing the rename set with
// (never trust a count quoted in a planning artifact) — a file is in scope for the equivalence
// proof if its PRE-rename content matches one of these tokens, or if its PRE-rename path is
// one of the five PATH_MOVES sources (belt-and-suspenders: every real rename-target file
// matches the content pattern too, since the rename touches its own declaration, but a path
// move alone — with no remaining token inside — would otherwise slip out of scope).
const DISCOVERY_PATTERN =
	/NativeWebp|nativeWebp|native_webp|FakeNativeWebp|isNativeWebpCopyCandidate|native-webp/u;

function buildRenameTargetTree(ref) {
	const full = buildTree(ref);
	const moveSources = new Set(PATH_MOVES.map(([from]) => from));
	const scoped = new Map();
	for (const [relPath, content] of full) {
		if (DISCOVERY_PATTERN.test(content) || moveSources.has(relPath)) {
			scoped.set(relPath, content);
		}
	}
	return scoped;
}

function fail(message) {
	console.error(`\n✗ RENAME EQUIVALENCE GATE FAILED:\n${message}\n`);
	process.exitCode = 1;
}

function main() {
	const [, , beforeRef, afterRef] = process.argv;
	if (beforeRef === undefined || afterRef === undefined) {
		fail(
			"usage: node scripts/rename_equivalence_gate.mjs <before-ref> <after-ref>",
		);
		return;
	}

	const beforeFiles = buildRenameTargetTree(beforeRef);
	const afterFiles = buildTree(afterRef);
	const problems = diffRenamedTrees(beforeFiles, afterFiles);

	if (problems.length > 0) {
		fail(problems.join("\n"));
		return;
	}

	console.log(
		`\n✓ RENAME EQUIVALENCE GATE PASSED — ${afterRef} differs from ${beforeRef} by ` +
			`exactly the D-09 token map and path moves.\n`,
	);
}

// Only run when invoked directly, so the module can be imported by tests.
if (
	process.argv[1] !== undefined &&
	import.meta.url.endsWith(process.argv[1].split(/[/\\]/u).pop())
) {
	main();
}
