// Directory-effect enforcement gate — keeps GATE-01 true after the retrofit phase ends.
//
// Context: Phase 18 retrofitted 38 assertDirEffect call sites across 12 test files so every
// disk-writing test names its whole-directory delta instead of asserting on one named file
// (the class of bug that hid a broken sample.pdf for the whole v4.0 cycle undetected — see
// tests/e2e/fixtures/fixture_integrity.test.ts:15-27). A retrofit is a snapshot: without this
// gate, the next test written goes straight back to asserting on a named file and nobody
// notices. This script is what keeps that true on every PR, not just on the day of the sweep.
//
// GRANULARITY LIMIT (D-26): this gate is FILE-LEVEL, not test()-block-level. It asks "does
// this file's source reference assertDirEffect at all", not "does every disk-writing test()
// inside this file call it". A six-test spec where only one test calls assertDirEffect
// satisfies this gate — concretely, tests/e2e/settings.spec.ts does, because most of its
// tests never touch disk. Per-test-block granularity needs an AST walk (distinguishing which
// test() body a disk-write call and an assertDirEffect call both live inside) and is
// deliberately deferred to Phase 24. Do not read a passing run of this gate as "every
// disk-writing test in this file is covered" — read it as "this file has not silently
// regressed to zero coverage".
//
// EXEMPTION CONTRACT (D-25): the EXEMPT map below is a Map<relativePath, reason>. An entry
// records a *known, countable, permanent* gap — not a way to make a red file quiet. Every
// entry must carry a prose reason. This gate self-prunes: an exemption whose file no longer
// exists, no longer writes to disk, or now references assertDirEffect is itself a FAILURE
// (see the prune loop in main()). That bidirectional property is what stops the list rotting
// into the kind of permanent amnesty a stale-expectation file becomes once nobody prunes it.
// Do not add an entry here to silence a red file — the gap is closed by asserting, not by
// exempting (a prohibition this plan carries verbatim from D-24/D-25).
//
// DETECTOR (V5 / T-18-08-01): three plain identifiers, alternated with no nested or
// overlapping quantifiers — the same discipline classifySpctl already models in
// scripts/gatekeeper_check.mjs (plain string containment plus one anchored pattern). A
// pathologically backtracking pattern here would be a denial-of-service against the CI gate
// itself, which is exactly the kind of gate this phase does not want to ship.
//
// The third identifier — the bare OS-temp-directory accessor (`tmpdir`) — is the widening
// RESEARCH.md's Pitfall 2 requires. The detector as originally specified (fixture-directory
// factory + Node's temp-dir-creating call only) never matched the manual idiom of joining
// os.tmpdir() with a random suffix and calling a plain mkdir — which is exactly how
// tests/infrastructure/settings_service.test.ts was written before plan 18-07 normalised it
// to mkdtempSync. A gate blind to a file looks identical, from the outside, to a gate
// reporting that file compliant. This third alternative exists so a *future* test written the
// old way is caught rather than silently uncovered.
//
// Usage:  node scripts/dir_effect_gate.mjs
// Exits 0 when every collected disk-writing test file references assertDirEffect (or carries
// a live, non-stale exemption); exits 1 otherwise. Always runs — no platform skip.

import fs from "node:fs";
import path from "node:path";

const TESTS_DIR = "tests";
const ASSERTION_TOKEN = "assertDirEffect";

// Plain literal alternation, no quantifiers beyond the identifiers themselves — see the V5
// note above. Order does not affect correctness; only which token is reported first if a
// file happens to match more than one.
const DISK_WRITE_TOKENS = ["createFixtureDir", "mkdtemp", "tmpdir"];
const DISK_WRITE_DETECTOR = new RegExp(DISK_WRITE_TOKENS.join("|"));

// The three collection conventions this repo already uses (playwright.config.ts's
// testDir/testMatch pairs and vitest.config.ts's `tests/**/*.test.ts` include). A helper
// module under tests/**/helpers/ never matches any of these three suffix patterns, so it is
// out of scope by construction — no separate directory-name exclusion is needed.
const VITEST_TEST_PATH = /(?:^|\/)tests\/.*\.test\.ts$/;
const PLAYWRIGHT_SPEC_PATH = /(?:^|\/)tests\/e2e\/.*\.spec\.ts$/;
const SMOKE_TEST_PATH = /(?:^|\/)tests\/smoke\/.*\.smoke\.ts$/;

// The exact, countable size of the remaining GATE-01 gap (D-23): ExpandFolderCommand only
// reads the directory tree it is given (fs.readdir under the hood) and never writes, so its
// directory delta is tautologically empty — asserting one would assert nothing real. This is
// the ONE intended exemption. EXEMPT.size is printed in the passing summary below so the gap
// stays a number, not a rhetorical claim.
const EXEMPT = new Map([
	[
		"tests/application/expand_folder_command.test.ts",
		"ExpandFolderCommand's subject under test only reads the directory tree (fs.readdir) — " +
			"it never writes, so a before/after directory delta would always be empty. Asserting " +
			"a tautologically-empty delta would test nothing real (D-23).",
	],
]);

/**
 * Classify one test file's SOURCE TEXT. Pure function — unit-tested in
 * tests/scripts/dir_effect_gate.test.ts over literal fixture strings, so the parser (the
 * part that rots) is covered on every PR with zero filesystem access.
 *
 * `collected` is true when `filename` matches one of the three collection conventions this
 * repo already uses. `writesToDisk` is true when `source` matches the disk-write detector.
 * `ok` is false only for the specific case this gate exists to catch: a collected test that
 * writes to disk but never references assertDirEffect.
 *
 * @param {string} source the file's full contents
 * @param {string} filename the file's path (relative or absolute; only the trailing
 *   `tests/...` segment is inspected)
 * @returns {{ok: boolean, collected: boolean, writesToDisk: boolean, reason?: string}}
 */
export function classifyTestFile(source, filename) {
	const normalized = String(filename).replace(/\\/g, "/");
	const collected =
		VITEST_TEST_PATH.test(normalized) ||
		PLAYWRIGHT_SPEC_PATH.test(normalized) ||
		SMOKE_TEST_PATH.test(normalized);

	if (!collected) {
		return { ok: true, collected: false, writesToDisk: false };
	}

	const writesToDisk = DISK_WRITE_DETECTOR.test(source);
	if (!writesToDisk) {
		return { ok: true, collected: true, writesToDisk: false };
	}

	if (source.includes(ASSERTION_TOKEN)) {
		return { ok: true, collected: true, writesToDisk: true };
	}

	const token = DISK_WRITE_TOKENS.find((candidate) =>
		source.includes(candidate),
	);
	return {
		ok: false,
		collected: true,
		writesToDisk: true,
		reason: `${normalized}: writes to disk (matched "${token}") but never references ${ASSERTION_TOKEN}`,
	};
}

/**
 * Given the relative path of a KNOWN EXEMPT entry and a (real or hypothetical) source for
 * that file, report whether the exemption is stale. Pure function -- unit-tested in
 * tests/scripts/dir_effect_gate.test.ts over literal fixture strings -- so both directions
 * of D-25's self-pruning obligation (file no longer writes to disk / file now asserts) are
 * covered without filesystem access. The third staleness direction -- the exempted file no
 * longer existing at all -- inherently requires a filesystem check and lives only in
 * checkExemptionsAreLive() below.
 *
 * @param {string} relPath must be a key present in EXEMPT
 * @param {string} source the file's contents to re-classify
 * @returns {{stale: boolean, reason?: string}}
 */
export function classifyExemptionFreshness(relPath, source) {
	if (!EXEMPT.has(relPath)) {
		throw new Error(
			`classifyExemptionFreshness: "${relPath}" is not an EXEMPT entry`,
		);
	}

	const result = classifyTestFile(source, relPath);

	if (!result.writesToDisk) {
		return { stale: true, reason: `${relPath} no longer writes to disk` };
	}
	if (result.ok) {
		return {
			stale: true,
			reason: `${relPath} now references ${ASSERTION_TOKEN}`,
		};
	}
	return { stale: false };
}

function fail(message) {
	console.error(`\n✗ DIRECTORY-EFFECT GATE FAILED:\n${message}\n`);
	process.exit(1);
}

function walk(dir, out) {
	for (const name of fs.readdirSync(dir)) {
		const absolute = path.join(dir, name);
		const stat = fs.statSync(absolute);
		if (stat.isDirectory()) {
			walk(absolute, out);
			continue;
		}
		out.push(absolute);
	}
	return out;
}

function toRelativePosix(absolute) {
	return path.relative(process.cwd(), absolute).split(path.sep).join("/");
}

function checkExemptionsAreLive(problems) {
	for (const [relPath, reason] of EXEMPT) {
		const absolute = path.join(process.cwd(), relPath);
		if (!fs.existsSync(absolute)) {
			problems.push(
				`stale exemption: ${relPath} no longer exists — prune this EXEMPT entry ` +
					`(recorded reason: "${reason}")`,
			);
			continue;
		}

		const source = fs.readFileSync(absolute, "utf8");
		const freshness = classifyExemptionFreshness(relPath, source);
		if (freshness.stale) {
			problems.push(
				`stale exemption: ${freshness.reason} — prune this EXEMPT entry`,
			);
		}
	}
}

function main() {
	if (!fs.existsSync(TESTS_DIR)) {
		fail(`no such directory: ${TESTS_DIR} (run from the repo root)`);
		return;
	}

	const files = walk(TESTS_DIR, []).filter((absolute) =>
		absolute.endsWith(".ts"),
	);
	let scanned = 0;
	let diskWriting = 0;
	const problems = [];

	for (const absolute of files) {
		const relPath = toRelativePosix(absolute);
		const source = fs.readFileSync(absolute, "utf8");
		const result = classifyTestFile(source, relPath);

		if (!result.collected) {
			continue;
		}
		scanned += 1;
		if (result.writesToDisk) {
			diskWriting += 1;
		}
		if (result.ok) {
			continue;
		}
		if (EXEMPT.has(relPath)) {
			continue;
		}
		problems.push(result.reason ?? `${relPath}: unnamed disk-effect gap`);
	}

	checkExemptionsAreLive(problems);

	if (problems.length > 0) {
		fail(problems.join("\n"));
		return;
	}

	console.log(
		`\n✓ DIRECTORY-EFFECT GATE PASSED — ${scanned} collected test file(s) scanned, ` +
			`${diskWriting} writing to disk, ${EXEMPT.size} exemption(s) recorded and verified live.\n`,
	);
}

// Only run when invoked directly, so the module can be imported by tests.
if (
	process.argv[1] !== undefined &&
	import.meta.url.endsWith(path.basename(process.argv[1]))
) {
	main();
}
