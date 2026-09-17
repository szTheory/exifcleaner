// P48-NC-5: vacuity control for the #344 fatal-warning fix.
//
// Structured after scripts/orientation_mutation_gate.mjs (the mutation-gate prior art that
// exists on this branch), but deliberately NOT that script's in-place working-tree mutation
// (T-48-07): the mutation here is applied only inside a mkdtemp scratch copy with
// node_modules SYMLINKED, never to the real working tree.
//
// Sequence, always run (no platform skip):
//   1. Copy the working tree to a scratch directory (node_modules excluded, then symlinked).
//   2. Run the full suite there and require it fully green -- proves the clone is faithful,
//      not a tautologically broken control.
//   3. Apply exactly ONE mutation: restore the PRE-FIX first-match predicate in
//      src/application/queries/read_metadata_query.ts (the D-05 bug this plan's fix
//      replaced) -- NOT the adapter, and NOT "engine-error" (see 48-02-PLAN.md
//      base_architecture_amendment). The mutation text lives here, under scripts/, outside
//      the src/+tests/ scope source-scan controls cover -- never copy it into src/.
//   4. Run the mutated suite and require it to fail with EXACTLY the declared expected
//      failing-title set. More failures or fewer are both findings about the control's
//      precision, not gate bugs to relax away.
//
// Exit 0 only when the baseline is green AND the mutated run fails with exactly the
// expected set.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");

// Declared here, not derived: the exact set this ONE mutation must break, transcribed from
// a measured dry run against a scratch copy (48-02-PLAN.md Task 2). vitest's JSON reporter
// "fullName" is describe-path + title joined by a single space (no separator token).
const EXPECTED_FAILING_TITLES = [
	"is lenient on a [minor]-prefixed ExifTool:Warning (issue #344, D-03 display leniency)",
	"issue #344 end-to-end: one path only the display path is lenient on a [minor] MicrosoftPhoto warning (NC-vacuity target)",
];

const TARGET_SOURCE = "src/application/queries/read_metadata_query.ts";

// The PRE-FIX block this mutation restores: a first-match predicate over ALL ExifTool-group
// Error/Warning entries, unconditionally fatal -- no [minor] display leniency, no full scan.
// This is the measured D-05 bug the #344 fix replaced (48-02-PLAN.md
// base_architecture_amendment point 3), rewritten against read_metadata_query.ts's current
// shape rather than the retired exiftool_adapter.ts call site.
const FIX_BLOCK =
	"\t\tconst verdict = classifyInspectionDiagnostics({\n" +
	"\t\t\trecord: firstItem,\n" +
	'\t\t\tpurpose: "display",\n' +
	"\t\t});\n" +
	"\t\tif (verdict.fatal) {\n" +
	"\t\t\treturn {\n" +
	"\t\t\t\tok: false,\n" +
	"\t\t\t\terror: {\n" +
	'\t\t\t\t\tcode: "exiftool-error",\n' +
	"\t\t\t\t\tdetail: verdict.detail,\n" +
	"\t\t\t\t},\n" +
	"\t\t\t};\n" +
	"\t\t}";

const PRE_FIX_BLOCK =
	"\t\tconst diagnostic = Object.entries(firstItem).find(([key]) => {\n" +
	'\t\t\tconst parts = key.split(":");\n' +
	"\t\t\tconst tag = parts.at(-1);\n" +
	'\t\t\treturn parts[0] === "ExifTool" && (tag === "Error" || tag === "Warning");\n' +
	"\t\t});\n" +
	"\t\tif (diagnostic !== undefined) {\n" +
	"\t\t\treturn {\n" +
	"\t\t\t\tok: false,\n" +
	"\t\t\t\terror: {\n" +
	'\t\t\t\t\tcode: "exiftool-error",\n' +
	"\t\t\t\t\tdetail: String(diagnostic[1]),\n" +
	"\t\t\t\t},\n" +
	"\t\t\t};\n" +
	"\t\t}";

const COPY_EXCLUDES = new Set([
	"node_modules",
	"dist",
	"out",
	"exiftool_downloads",
]);

function shouldCopy(src) {
	const base = path.basename(src);
	return !COPY_EXCLUDES.has(base);
}

function makeScratchCopy() {
	const scratchDir = fs.mkdtempSync(
		path.join(os.tmpdir(), "issue344-vacuity-gate-"),
	);
	fs.cpSync(REPO_ROOT, scratchDir, {
		recursive: true,
		filter: shouldCopy,
	});
	const realNodeModules = path.join(REPO_ROOT, "node_modules");
	const scratchNodeModules = path.join(scratchDir, "node_modules");
	fs.symlinkSync(
		realNodeModules,
		scratchNodeModules,
		process.platform === "win32" ? "junction" : "dir",
	);
	return scratchDir;
}

function runSuite(cwd, reportPath) {
	const result = spawnSync(
		"yarn",
		["vitest", "run", "--reporter=json", `--outputFile=${reportPath}`],
		{
			cwd,
			encoding: "utf8",
			env: process.env,
			maxBuffer: 50 * 1024 * 1024,
		},
	);
	if (!fs.existsSync(reportPath)) {
		throw new Error(
			`vitest did not write a report to ${reportPath} (exit ${result.status})\n${result.stdout ?? ""}${result.stderr ?? ""}`,
		);
	}
	const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
	return report;
}

function failedTitles(report) {
	const titles = [];
	for (const suite of report.testResults ?? []) {
		for (const assertion of suite.assertionResults ?? []) {
			if (assertion.status === "failed") {
				titles.push(assertion.fullName ?? assertion.title);
			}
		}
	}
	return titles;
}

function applyMutation(scratchDir) {
	const targetPath = path.join(scratchDir, TARGET_SOURCE);
	const original = fs.readFileSync(targetPath, "utf8");
	const occurrences = original.split(FIX_BLOCK).length - 1;
	if (occurrences !== 1) {
		throw new Error(
			`expected exactly one fix-block occurrence in ${TARGET_SOURCE}, found ${occurrences}`,
		);
	}
	const mutated = original.replace(FIX_BLOCK, PRE_FIX_BLOCK);
	fs.writeFileSync(targetPath, mutated);
}

function setsEqual(actual, expected) {
	const actualSorted = [...actual].sort();
	const expectedSorted = [...expected].sort();
	return (
		actualSorted.length === expectedSorted.length &&
		actualSorted.every((value, index) => value === expectedSorted[index])
	);
}

async function main() {
	const scratchDir = makeScratchCopy();
	try {
		const baselineReportPath = path.join(scratchDir, "vacuity-baseline.json");
		const baseline = runSuite(scratchDir, baselineReportPath);
		if (baseline.success !== true || baseline.numFailedTests !== 0) {
			console.error(
				`✗ ISSUE344 VACUITY GATE FAILED: baseline is not green (numFailedTests=${baseline.numFailedTests}). The scratch clone must pass before any mutation is applied.`,
			);
			console.error(`Failed titles: ${JSON.stringify(failedTitles(baseline))}`);
			process.exitCode = 1;
			return;
		}

		applyMutation(scratchDir);

		const mutatedReportPath = path.join(scratchDir, "vacuity-mutated.json");
		const mutated = runSuite(scratchDir, mutatedReportPath);
		const actualFailing = failedTitles(mutated);

		if (!setsEqual(actualFailing, EXPECTED_FAILING_TITLES)) {
			console.error(
				"✗ ISSUE344 VACUITY GATE FAILED: mutated run did not fail with exactly the declared set.",
			);
			console.error(`Expected: ${JSON.stringify(EXPECTED_FAILING_TITLES)}`);
			console.error(`Actual:   ${JSON.stringify(actualFailing)}`);
			process.exitCode = 1;
			return;
		}

		console.log(
			"✓ Issue #344 vacuity gate: baseline green, mutation restored the pre-fix D-05 predicate, and exactly the expected two tests failed.",
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

export {
	EXPECTED_FAILING_TITLES,
	FIX_BLOCK,
	PRE_FIX_BLOCK,
	applyMutation,
	failedTitles,
	setsEqual,
};
