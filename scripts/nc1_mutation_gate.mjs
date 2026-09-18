// NC-1 mutation gate — proves the fallback-authority check can actually FAIL.
//
// Context: Phase 46 shipped five checks that read correctly and could never fire — a check
// nobody has watched fail is not a gate, it is a comment with a green checkmark next to it. D-27
// gives NC-1 a meta-requirement on top of its own assertion: restoring the deleted error-code
// switch (src/infrastructure/metadata/hybrid_metadata_engine.ts's pre-D-05 authority) must make
// EXACTLY the NC-1 test fail — demonstrated by running a real mutated suite, not merely asserted
// in prose. This script is that demonstration, and it is designed to be re-run on every PR
// (`yarn verify:nc1-mutation`) so a future refactor that silently makes NC-1 unfirable again is
// caught immediately rather than discovered in the next retrofit phase.
//
// Mechanism: the working tree is copied to a scratch directory (node_modules is SYMLINKED, never
// copied — it is unaffected by the mutation and copying it would cost hundreds of megabytes per
// run for no benefit). The baseline (unmutated) suite is run there first and must be fully green,
// proving the copy itself is a faithful, working clone and not a tautologically-broken control.
// Then ONE mutation is applied: a code-keyed fallback branch is reintroduced into
// hybrid_metadata_engine.ts's sanitize() — the exact shape of the switch D-05 deleted, matched on
// nativeCode alone with no regard for write state. The mutated suite is run again and must fail
// with EXACTLY the expected failing-test set (see EXPECTED_FAILING_TITLES below). More failures
// (breaks something else) or fewer (the mutation is a no-op against the suite) are both findings
// about the control's precision, not gate bugs to relax away.
//
// UPDATED (47-05 Task 3): plan 47-05's NC-9b (tests/contracts/native_seam_containment.test.ts)
// independently scans hybrid_metadata_engine.ts for zero occurrences of the "nativeCode"
// identifier. The same mutation that reintroduces the nativeCode-keyed switch to fire NC-1 also,
// correctly, makes NC-9b fail — both gates are legitimately watching the same regression from two
// independent angles (write-state-keyed behavior vs. source-text containment). The expected
// failing set below was widened from "exactly NC-1" to "exactly NC-1 and NC-9b" to reflect that;
// a mutation that stopped firing either one would still be caught as a precision finding.
//
// COMMENT-TEXT DISCIPLINE: the mutation text below necessarily contains native error-code
// identifiers in a fallback-branch shape. This file lives under scripts/, outside the src/tests
// scope plan 47-05's NC-9 source-scan covers — do not move this mutation text (or copies of it)
// into any file under src/, including a comment, or NC-9 becomes unfirable.
//
// Usage:  node scripts/nc1_mutation_gate.mjs
// Exits 0 when the baseline run is fully green AND the mutated run fails with exactly the NC-1
// title; exits 1 otherwise. Always runs — no platform skip (this is a Vitest-only proof; nothing
// here touches Playwright).

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const TARGET_SOURCE = "src/infrastructure/metadata/hybrid_metadata_engine.ts";
const NC1_TEST_TITLE =
	"NC-1: a post-write malformed-file error authorizes zero substitute writers, keyed on write state not error code";
// 47-05 Task 3: NC-9b independently scans this same file for the nativeCode identifier and
// legitimately also fails under this mutation — see the file-header note above.
const NC9B_TEST_TITLE =
	"NC-9b: hybrid_metadata_engine.ts contains zero occurrences of the nativeCode identifier";
const EXPECTED_FAILING_TITLES = [NC1_TEST_TITLE, NC9B_TEST_TITLE];

// The exact seam D-05 replaced the pre-existing error-code switch with. Matched as a plain
// literal (no regex, no nested quantifiers — see dir_effect_gate.mjs's V5 note for why a gate's
// own detector must never itself be a ReDoS surface), so a future reformatting of this block
// makes the mutation refuse to apply loudly (via the "exactly one occurrence" check below)
// instead of silently mutating the wrong thing or nothing at all.
const FALLBACK_AUTHORITY_SEAM =
	"\t\tconst grant = mintFallbackGrant(native.error.libraryError);\n" +
	"\t\tif (grant === undefined || !redeemFallbackGrant(grant)) {\n" +
	"\t\t\treturn native;\n" +
	"\t\t}\n" +
	"\t\treturn this.exiftool.sanitize(request);";

/**
 * Reintroduce a code-keyed fallback branch ahead of the grant-based authority check — the exact
 * defect class D-05 deleted (fallback decided by error CODE alone, with no regard for write
 * state). Pure function: takes source text, returns mutated text, never touches disk. Unit-tested
 * over literal fixture strings in tests/scripts/nc1_mutation_gate.test.ts.
 *
 * @param {string} source
 * @returns {string}
 */
export function applyNc1Mutation(source) {
	const occurrences = source.split(FALLBACK_AUTHORITY_SEAM).length - 1;
	if (occurrences !== 1) {
		throw new Error(
			`expected exactly one fallback-authority seam, found ${occurrences}`,
		);
	}
	const mutated =
		"\t\t// MUTATION (nc1_mutation_gate.mjs): reintroduces the pre-D-05\n" +
		"\t\t// error-code-keyed fallback switch, ignoring write state entirely.\n" +
		"\t\tswitch (native.error.nativeCode) {\n" +
		'\t\t\tcase "unsupported-format":\n' +
		'\t\t\tcase "malformed-file":\n' +
		'\t\t\tcase "unsafe-structure":\n' +
		'\t\t\tcase "unsupported-feature":\n' +
		"\t\t\t\treturn this.exiftool.sanitize(request);\n" +
		"\t\t}\n" +
		FALLBACK_AUTHORITY_SEAM;
	return source.replace(FALLBACK_AUTHORITY_SEAM, mutated);
}

/**
 * Pure verdict function: given a baseline (unmutated) run result and a mutated run result, decide
 * whether the mutation gate passes. Never touches disk or spawns a process — the CLI wrapper's
 * job is to produce these `{success, failingTitles}` shapes from a real Vitest JSON report.
 *
 * @param {{
 *   baseline: {success: boolean, failingTitles: string[]},
 *   mutated: {success: boolean, failingTitles: string[]},
 *   expectedFailingTitles: string[],
 * }} input
 * @returns {{ok: boolean, reason: string}}
 */
export function evaluateMutationVerdict({
	baseline,
	mutated,
	expectedFailingTitles,
}) {
	if (!baseline.success || baseline.failingTitles.length > 0) {
		return {
			ok: false,
			reason:
				"baseline (unmutated) run was not fully green — the scratch copy is not a faithful clone: " +
				JSON.stringify(baseline.failingTitles),
		};
	}
	if (mutated.success && mutated.failingTitles.length === 0) {
		return {
			ok: false,
			reason:
				"mutated run was fully green — NC-1 cannot fire, it is an unfirable check (Phase 46's defect class)",
		};
	}
	const actualSorted = [...mutated.failingTitles].sort();
	const expectedSorted = [...expectedFailingTitles].sort();
	const isExactMatch =
		actualSorted.length === expectedSorted.length &&
		actualSorted.every((title, index) => title === expectedSorted[index]);
	if (!isExactMatch) {
		return {
			ok: false,
			reason:
				`mutated run's failing-test set was not exactly ${JSON.stringify(expectedSorted)}: ` +
				JSON.stringify(mutated.failingTitles),
		};
	}
	return {
		ok: true,
		reason: "mutated run failed with exactly the expected failing-test set",
	};
}

const COPY_EXCLUDE = new Set([
	"node_modules",
	"dist",
	"exiftool_downloads",
	"out",
	"playwright-report",
	"test-results",
	".git",
	".DS_Store",
]);

function copyWorkingTree(repoRoot, scratchDir) {
	fs.cpSync(repoRoot, scratchDir, {
		recursive: true,
		filter: (src) => {
			const rel = path.relative(repoRoot, src);
			if (rel === "") return true;
			const top = rel.split(path.sep)[0];
			return !COPY_EXCLUDE.has(top);
		},
	});
	// node_modules is unaffected by the mutation; symlinking instead of copying
	// avoids copying hundreds of megabytes on every gate run.
	fs.symlinkSync(
		path.join(repoRoot, "node_modules"),
		path.join(scratchDir, "node_modules"),
		"dir",
	);
	// .git is also symlinked rather than copied: it is read-only from this
	// script's perspective (no commit/checkout is ever run against the
	// scratch copy), and tests/e2e/fixtures/fixture_integrity.test.ts's
	// "classifies sample.pdf as a binary checkout fixture" check shells out
	// to `git check-attr`, which requires a real .git to resolve at all — a
	// scratch copy with no .git would make that pre-existing, unrelated test
	// fail in the baseline run, which is exactly the "scratch copy is not a
	// faithful clone" failure evaluateMutationVerdict is designed to catch.
	fs.symlinkSync(
		path.join(repoRoot, ".git"),
		path.join(scratchDir, ".git"),
		"dir",
	);
}

/**
 * Run the full Vitest suite inside `cwd` and return `{success, failingTitles}`, parsed from the
 * JSON reporter's output file (never the human-readable stdout, which does not reliably persist
 * every flat test title).
 *
 * @param {{cwd: string, outputFile: string}} params
 * @returns {{success: boolean, failingTitles: string[]}}
 */
function runSuite({ cwd, outputFile }) {
	const vitestBin = path.join(cwd, "node_modules", ".bin", "vitest");
	const result = spawnSync(
		process.execPath,
		[vitestBin, "run", "--reporter=json", `--outputFile=${outputFile}`],
		{
			cwd,
			env: process.env,
			encoding: "utf8",
			maxBuffer: 200 * 1024 * 1024,
		},
	);
	if (!fs.existsSync(outputFile)) {
		throw new Error(
			`vitest produced no JSON report (exit ${result.status})\n${result.stdout ?? ""}${result.stderr ?? ""}`,
		);
	}
	const report = JSON.parse(fs.readFileSync(outputFile, "utf8"));
	const failingTitles = report.testResults
		.flatMap((testResult) => testResult.assertionResults)
		.filter((assertion) => assertion.status === "failed")
		.map((assertion) => assertion.title);
	return { success: report.success === true, failingTitles };
}

async function main() {
	const repoRoot = process.cwd();
	const scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), "nc1-mutation-"));
	try {
		copyWorkingTree(repoRoot, scratchDir);

		const baselineReport = path.join(scratchDir, "nc1-baseline.json");
		const baseline = runSuite({ cwd: scratchDir, outputFile: baselineReport });

		const targetPath = path.join(scratchDir, TARGET_SOURCE);
		const originalSource = fs.readFileSync(targetPath, "utf8");
		const mutatedSource = applyNc1Mutation(originalSource);
		fs.writeFileSync(targetPath, mutatedSource);

		const mutatedReport = path.join(scratchDir, "nc1-mutated.json");
		const mutated = runSuite({ cwd: scratchDir, outputFile: mutatedReport });

		const verdict = evaluateMutationVerdict({
			baseline,
			mutated,
			expectedFailingTitles: EXPECTED_FAILING_TITLES,
		});

		if (!verdict.ok) {
			console.error(`\n✗ NC-1 MUTATION GATE FAILED:\n${verdict.reason}\n`);
			process.exitCode = 1;
			return;
		}
		console.log(
			`\n✓ NC-1 MUTATION GATE PASSED — baseline fully green (${baseline.failingTitles.length} failures), ` +
				`mutated run failed with exactly ${EXPECTED_FAILING_TITLES.length} test(s): ` +
				`${JSON.stringify(EXPECTED_FAILING_TITLES)}\n`,
		);
	} finally {
		fs.rmSync(scratchDir, { recursive: true, force: true });
	}
}

const invokedPath = process.argv[1];
if (
	invokedPath !== undefined &&
	fileURLToPath(import.meta.url) === path.resolve(invokedPath)
) {
	await main();
}
