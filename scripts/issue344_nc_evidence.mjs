// D-11 run-log evidence driver for the #344 negative controls.
//
// Context: Phase 47's tests/contracts/negative_control_evidence.test.ts registry does NOT
// exist on this branch (origin/master) -- it lives only on feat/native-webp-pilot and
// arrives via PR #343 (see 48-02-PLAN.md base_architecture_amendment Class 2). Creating it
// here would fork the same file PR #343 also adds, guaranteeing a rebase conflict. This
// standalone driver satisfies D-11's actual requirement -- that CI run-log evidence proves
// the six P48-NC controls EXECUTED, not merely that the suite exited zero -- without
// inventing that cross-PR file conflict.
//
// Five of the six controls (P48-NC-1, 2, 3, 4, 6) are vitest it(...) cases and are checked
// against vitest-report.json, written by `yarn test:ci`. The sixth, P48-NC-5, is not a
// vitest test -- it is the whole-process mutation gate in scripts/issue344_vacuity_gate.mjs
// (a scratch-copy baseline-then-mutate run, structurally unable to appear as a
// vitest-report.json assertionResult). That script writes a small evidence marker on
// success; this driver reads it as P48-NC-5's run-log evidence in place of a report entry.
//
// Fails loudly (never vacuously) if either evidence source is absent.
//
// Deferral (recorded, not a silent omission): once PR #343 merges and
// tests/contracts/negative_control_evidence.test.ts lands on master, these six titles
// should be appended to its EXPECTED_CONTROL_TITLES registry so both phases share one
// evidence source, and this standalone driver can then be retired or narrowed.
//
// Usage:  node scripts/issue344_nc_evidence.mjs
// Exits 0 when all six titles are present and executed; exits 1 otherwise. Always runs --
// no platform skip.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { EVIDENCE_MARKER_PATH } from "./issue344_vacuity_gate.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const REPORT_PATH = path.join(REPO_ROOT, "vitest-report.json");

// Transcribed VERBATIM from the it(...) call sites created in Tasks 1 and 2 -- never
// reconstructed or paraphrased. Full titles as vitest's JSON reporter reports them
// (describe-path + title, joined by a single space; no top-level describe means the title
// alone). The P48-NC-5 entry is the marker title scripts/issue344_vacuity_gate.mjs writes
// on success, not a vitest title -- see module header.
const P48_NC_TITLES = [
	"classifyInspectionDiagnostics P48-NC-1: a non-minor warning stays fatal on display",
	"classifyInspectionDiagnostics P48-NC-2: the same minor-prefixed record is fatal under output-verification",
	"classifyInspectionDiagnostics P48-NC-3: an ExifTool-group Error is fatal in both modes regardless of its value prefix",
	"issue #344 end-to-end: one path only P48-NC-4: a record carrying both a minor and a non-minor warning is fatal on display",
	"P48-NC-5: vacuity gate proves the #344 fix's tests are not vacuous",
	"P48-NC-6: blast radius P48-NC-6: cleaning the issue344 fixture changes exactly one output path and leaves the source byte-identical",
];

const VACUITY_GATE_TITLE = P48_NC_TITLES[4];
const VITEST_CHECKED_TITLES = P48_NC_TITLES.filter(
	(title) => title !== VACUITY_GATE_TITLE,
);

function collectAssertions(report) {
	const byTitle = new Map();
	for (const suite of report.testResults ?? []) {
		for (const assertion of suite.assertionResults ?? []) {
			const fullName = assertion.fullName ?? assertion.title;
			byTitle.set(fullName, assertion);
		}
	}
	return byTitle;
}

function checkVitestTitles() {
	if (!fs.existsSync(REPORT_PATH)) {
		return {
			ok: false,
			reason: `run report not found at ${REPORT_PATH}. Run \`yarn test:ci\` first.`,
			missing: [],
			skipped: [],
		};
	}

	const report = JSON.parse(fs.readFileSync(REPORT_PATH, "utf8"));
	const byTitle = collectAssertions(report);

	const missing = [];
	const skipped = [];

	for (const title of VITEST_CHECKED_TITLES) {
		const assertion = byTitle.get(title);
		if (assertion === undefined) {
			missing.push(title);
			continue;
		}
		if (assertion.status !== "passed") {
			skipped.push({ title, status: assertion.status });
		}
	}

	return { ok: missing.length === 0 && skipped.length === 0, missing, skipped };
}

function checkVacuityGateEvidence() {
	if (!fs.existsSync(EVIDENCE_MARKER_PATH)) {
		return {
			ok: false,
			reason: `evidence marker not found at ${EVIDENCE_MARKER_PATH}. Run \`yarn verify:issue344-vacuity\` first.`,
		};
	}
	const marker = JSON.parse(fs.readFileSync(EVIDENCE_MARKER_PATH, "utf8"));
	if (marker.passed !== true) {
		return {
			ok: false,
			reason: `evidence marker reports passed=${marker.passed}.`,
		};
	}
	return { ok: true };
}

function main() {
	const vitestResult = checkVitestTitles();
	const vacuityResult = checkVacuityGateEvidence();

	if (!vitestResult.ok || !vacuityResult.ok) {
		console.error("✗ ISSUE344 NC EVIDENCE FAILED");
		if (vitestResult.reason !== undefined) {
			console.error(`  ${vitestResult.reason}`);
		}
		for (const title of vitestResult.missing) {
			console.error(`  MISSING: ${title}`);
		}
		for (const { title, status } of vitestResult.skipped) {
			console.error(`  NOT EXECUTED (status=${status}): ${title}`);
		}
		if (!vacuityResult.ok) {
			console.error(`  MISSING (P48-NC-5): ${vacuityResult.reason}`);
		}
		process.exitCode = 1;
		return;
	}

	console.log(
		`✓ Issue #344 NC evidence: all ${P48_NC_TITLES.length} P48-NC controls executed and passed (${VITEST_CHECKED_TITLES.length} from ${path.relative(REPO_ROOT, REPORT_PATH)}, 1 from the vacuity gate's evidence marker).`,
	);
}

const invokedPath = process.argv[1];
if (
	invokedPath !== undefined &&
	fileURLToPath(import.meta.url) === path.resolve(invokedPath)
) {
	main();
}

export { P48_NC_TITLES, VITEST_CHECKED_TITLES };
