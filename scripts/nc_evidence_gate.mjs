// D-27 real-report driver for the nine negative-control titles (NC-1 through NC-9, with NC-6
// and NC-9 counted across their lettered sub-controls) registered in
// tests/contracts/negative_control_evidence.test.ts.
//
// This is a standalone script, not a vitest test, and that is deliberate: the previous
// implementation gated a vitest `it(...)` behind `describe.runIf(process.env.GSD_NC_EVIDENCE_CHECK
// === "1")` so the always-run `tests/**/*.test.ts` glob (`yarn test`/`yarn test:ci`) would not
// try to read `vitest-report.json` before that file exists (it is written by `test:ci` itself,
// at the very end of the run, via the json reporter). `describe.runIf` is a conditional runner
// control forbidden by scripts/known_gap_gate.mjs's FORBIDDEN_RUNNER_CONTROL_PROPERTIES — the
// gate treats it as coverage that can be silently omitted. A standalone script has no such
// ambiguity: it is either not invoked (never appears in any test report at all) or invoked and
// always asserts for real. This mirrors the existing scripts/issue344_nc_evidence.mjs pattern.
//
// The pure-function logic below (parseRunReport / isExecutedMatch / findMissingControlTitles /
// EXPECTED_CONTROL_TITLES) is transcribed from tests/contracts/negative_control_evidence.test.ts
// rather than imported — that file is TypeScript collected by vitest, this is a plain ESM
// script invoked directly by `node`, and issue344_nc_evidence.mjs already establishes the
// reimplement-rather-than-cross-import precedent for exactly this boundary.
//
// Usage:  node scripts/nc_evidence_gate.mjs
// Exits 0 when all nine titles are present and executed in vitest-report.json; exits 1
// otherwise (including when the report is absent — never a skip, always a loud failure).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const REPORT_PATH = path.join(REPO_ROOT, "vitest-report.json");
const PRODUCING_SCRIPT = "yarn test:ci";

// Transcribed VERBATIM from tests/contracts/negative_control_evidence.test.ts's
// EXPECTED_CONTROL_TITLES — see that file for provenance (47-03-SUMMARY.md, 47-04-SUMMARY.md,
// and this project's own D-27 hard constraint 7: never reconstructed or paraphrased).
const EXPECTED_CONTROL_TITLES = [
	"NC-1: a post-write malformed-file error authorizes zero substitute writers, keyed on write state not error code",
	"NC-2: a proven admission-shaped decline reported as %s falls back to ExifTool exactly once",
	"NC-3: code=$code phase=$phase nativeWrite=$nativeWrite matches the real classifyFallback disposition",
	"NC-4: redeeming the same grant twice returns false on the second redemption and adds no call",
	"NC-4: two independent failures each receive their own grant, both falling back",
	"NC-5: a destination-exists decline produces zero fallbacks",
	"NC-5: an aborted request produces zero fallbacks",
	"NC-6a: a capability table with zero formats routes zero native work",
	"NC-6b: a capability table whose detection literal is not the magic literal routes zero native work",
	"NC-6c: a capability table registering a non-webp format with sanitize and magic detection routes it natively",
	"NC-7: an eligible copy request asserts native call count 1",
	"NC-7: an overwrite-mode sanitize modifies exactly one path and adds none, with native call count 0 and ExifTool call count 1",
	"NC-8: a failed reopen verification unlinks the generated output, reports failure, and leaves the source byte-identical",
	"NC-8: a successful webp copy adds exactly one path and modifies none, with the source unchanged",
	"NC-9a: the library is imported only by the native adapter and its live exemptions",
	"NC-9b: hybrid_metadata_engine.ts contains zero occurrences of the nativeCode identifier",
	"NC-9c: the grant brand identifier appears only in native_fallback_authority.ts",
];

function parseRunReport(raw) {
	const parsed = JSON.parse(raw);
	const assertions = [];
	for (const testResult of parsed.testResults ?? []) {
		for (const assertion of testResult.assertionResults ?? []) {
			if (
				typeof assertion.title === "string" &&
				typeof assertion.status === "string"
			) {
				assertions.push({ title: assertion.title, status: assertion.status });
			}
		}
	}
	return { assertions };
}

function isExecutedMatch(actual, expectedEntry) {
	if (actual.status === "skipped" || actual.status === "pending") {
		return false;
	}
	if (actual.title === expectedEntry) {
		return true;
	}
	const isTemplate =
		expectedEntry.includes("%s") || /\$[A-Za-z]+/.test(expectedEntry);
	if (!isTemplate) {
		return false;
	}
	const escaped = expectedEntry.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const withWildcards = escaped
		.replace(/%s/g, ".+?")
		.replace(/\\\$[A-Za-z]+/g, ".+?");
	const matcher = new RegExp(`^${withWildcards}$`);
	return matcher.test(actual.title);
}

function findMissingControlTitles({ report, expectedTitles }) {
	return expectedTitles.filter(
		(expectedEntry) =>
			!report.assertions.some((actual) =>
				isExecutedMatch(actual, expectedEntry),
			),
	);
}

function main() {
	if (!fs.existsSync(REPORT_PATH)) {
		console.error(
			`✗ NC EVIDENCE GATE FAILED: run report not found at ${REPORT_PATH}. Run \`${PRODUCING_SCRIPT}\` first to produce it (this is never a skip — an absent report is evidence of nothing).`,
		);
		process.exitCode = 1;
		return;
	}

	const raw = fs.readFileSync(REPORT_PATH, "utf8");
	const report = parseRunReport(raw);
	const missing = findMissingControlTitles({
		report,
		expectedTitles: EXPECTED_CONTROL_TITLES,
	});

	if (missing.length > 0) {
		console.error("✗ NC EVIDENCE GATE FAILED:");
		for (const title of missing) {
			console.error(`  MISSING or NOT EXECUTED: ${title}`);
		}
		process.exitCode = 1;
		return;
	}

	console.log(
		`✓ NC evidence: all ${EXPECTED_CONTROL_TITLES.length} negative-control titles present and executed in ${path.relative(REPO_ROOT, REPORT_PATH)}.`,
	);
}

const invokedPath = process.argv[1];
if (
	invokedPath !== undefined &&
	fileURLToPath(import.meta.url) === path.resolve(invokedPath)
) {
	main();
}

export { EXPECTED_CONTROL_TITLES, findMissingControlTitles, parseRunReport };
