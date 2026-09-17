// D-27: asserts the nine negative-control titles NC-1 through NC-9 (NC-6 and NC-9 counted
// across their lettered sub-controls) were all EXECUTED in the CI run report — not merely that
// the suite exited zero. A suite that silently stopped running the negative-control block
// would still exit zero; the presence (and non-skipped status) of these exact titles is the
// actual evidence.
//
// GATING NOTE (read before editing): the real-report-reading driver test below is gated behind
// process.env.GSD_NC_EVIDENCE_CHECK. This is NOT the same thing as "skip when the report is
// absent" (that is explicitly forbidden — see the driver test itself, which fails loudly, never
// skips, when gated-on and the report is missing). The gate exists because this file lives
// under tests/contracts/ and is therefore picked up by the ALWAYS-RUN `tests/**/*.test.ts`
// glob — including plain `yarn test`/`yarn test:ci`. `vitest-report.json` is written by
// `test:ci` only at the very END of that run (json reporter), so DURING any test:ci invocation
// on a fresh checkout (every CI run: the file is gitignored and never committed) the file
// cannot yet exist. An ungated driver test would therefore fail unconditionally on every fresh
// CI run and break the always-run suite outright. Gating the real-disk-read behind an explicit
// opt-in, set only by the dedicated `verify:nc-evidence` script (run AFTER `yarn test:ci` has
// completed and written the report), is what makes "yarn test:ci; yarn verify:nc-evidence" a
// coherent two-step reproduction: the pure-function unit tests below (synthetic fixtures, no
// disk access) always run as part of the normal suite; the real-report assertion only runs
// when explicitly asked to verify evidence.

import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";

const REPO_ROOT = path.resolve(__dirname, "../..");
const REPORT_PATH = path.join(REPO_ROOT, "vitest-report.json");
const PRODUCING_SCRIPT = "yarn test:ci";

export interface ReportAssertion {
	readonly title: string;
	readonly status: string;
}

export interface ParsedRunReport {
	readonly assertions: readonly ReportAssertion[];
}

/**
 * Pure parser: flattens vitest's --reporter=json shape (testResults[].assertionResults[])
 * into a flat list of {title, status}. No disk access — takes the already-read JSON string.
 */
export function parseRunReport(raw: string): ParsedRunReport {
	const parsed: {
		testResults?: {
			assertionResults?: { title?: unknown; status?: unknown }[];
		}[];
	} = JSON.parse(raw);
	const assertions: ReportAssertion[] = [];
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

/**
 * Nine negative-control titles NC-1 through NC-9 (NC-6 and NC-9 counted across their lettered
 * sub-controls), transcribed VERBATIM from 47-03-SUMMARY.md, 47-04-SUMMARY.md, and this plan's
 * own Task 2 titles — never reconstructed or paraphrased (D-27, hard constraint 7). NC-2 and
 * NC-3 are transcribed as vitest's own it.each title TEMPLATES (containing the literal "%s"
 * and "$code"/"$phase"/"$nativeWrite" tokens exactly as they appear at the it.each() call sites
 * in tests/infrastructure/hybrid_metadata_engine.ts and native_fallback_authority.test.ts) —
 * these are matched below as templates, not exact strings, since vitest resolves them per-case
 * before the run report is ever written.
 */
export const EXPECTED_CONTROL_TITLES: readonly string[] = [
	// NC-1
	"NC-1: a post-write malformed-file error authorizes zero substitute writers, keyed on write state not error code",
	// NC-2 (it.each template, %s resolves to one of 4 admission-shaped codes)
	"NC-2: a proven admission-shaped decline reported as %s falls back to ExifTool exactly once",
	// NC-3 (it.each template, $code/$phase/$nativeWrite resolve across 112 tuples)
	"NC-3: code=$code phase=$phase nativeWrite=$nativeWrite matches the real classifyFallback disposition",
	// NC-4
	"NC-4: redeeming the same grant twice returns false on the second redemption and adds no call",
	"NC-4: two independent failures each receive their own grant, both falling back",
	// NC-5
	"NC-5: a destination-exists decline produces zero fallbacks",
	"NC-5: an aborted request produces zero fallbacks",
	// NC-6 (lettered sub-controls, all three required)
	"NC-6a: a capability table with zero formats routes zero native work",
	"NC-6b: a capability table whose detection literal is not the magic literal routes zero native work",
	"NC-6c: a capability table registering a non-webp format with sanitize and magic detection routes it natively",
	// NC-7 (two independent sites: the routing-predicate copy row, and the whole-directory
	// overwrite-mode row against a real ExifTool oracle)
	"NC-7: an eligible copy request asserts native call count 1",
	"NC-7: an overwrite-mode sanitize modifies exactly one path and adds none, with native call count 0 and ExifTool call count 1",
	// NC-8
	"NC-8: a failed reopen verification unlinks the generated output, reports failure, and leaves the source byte-identical",
	"NC-8: a successful webp copy adds exactly one path and modifies none, with the source unchanged",
	// NC-9 (lettered sub-controls, all three required — this plan's own Task 2 titles)
	"NC-9a: the library is imported only by the native adapter and its live exemptions",
	"NC-9b: hybrid_metadata_engine.ts contains zero occurrences of the nativeCode identifier",
	"NC-9c: the grant brand identifier appears only in native_fallback_authority.ts",
];

/**
 * PURE function: the exact failure message used when the run report is absent. Extracted so
 * the "absent report fails loudly, never skips" behavior (D-27, hard constraint 11) is itself
 * unit-testable without touching the real filesystem.
 */
export function buildMissingReportMessage({
	reportPath,
	producingScript,
}: {
	reportPath: string;
	producingScript: string;
}): string {
	return (
		`Run report not found at ${reportPath}. Run \`${producingScript}\` first to ` +
		"produce it (this is never a skip — an absent report is evidence of nothing)."
	);
}

/**
 * True when `actualTitle` is an EXECUTED (non-skipped) match for `expectedEntry`. A skipped
 * entry never counts as a match, even if its title matches exactly — a skipped control is not
 * an executed control.
 */
function isExecutedMatch(
	actual: ReportAssertion,
	expectedEntry: string,
): boolean {
	if (actual.status === "skipped" || actual.status === "pending") {
		return false;
	}
	if (actual.title === expectedEntry) {
		return true;
	}
	// Template entry (contains vitest's %s or a $word placeholder): build a matcher that
	// treats those tokens as wildcards, everything else as a literal, exact-anchored match.
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

/**
 * PURE function (D-27's core evidence check): given a parsed report and the expected title
 * list, returns the expected entries that have NO executed match in the report. Empty array
 * means every control ran. This is the function both the synthetic-fixture unit tests below
 * and the real-report driver test call — the only difference is where `report` comes from.
 */
export function findMissingControlTitles({
	report,
	expectedTitles,
}: {
	report: ParsedRunReport;
	expectedTitles: readonly string[];
}): string[] {
	return expectedTitles.filter(
		(expectedEntry) =>
			!report.assertions.some((actual) =>
				isExecutedMatch(actual, expectedEntry),
			),
	);
}

// ---------------------------------------------------------------------------------------
// Pure-function unit tests over synthetic fixtures — always run, zero disk access, so this
// coverage runs on every `yarn test`/`yarn test:ci` invocation regardless of whether a real
// run report exists yet.
// ---------------------------------------------------------------------------------------

function makeReport(
	entries: readonly { title: string; status?: string }[],
): ParsedRunReport {
	return {
		assertions: entries.map((entry) => ({
			title: entry.title,
			status: entry.status ?? "passed",
		})),
	};
}

describe("findMissingControlTitles", () => {
	it("reports no missing titles when every expected title is present and executed", () => {
		const report = makeReport(
			EXPECTED_CONTROL_TITLES.map((title) => ({ title })),
		);
		const missing = findMissingControlTitles({
			report,
			expectedTitles: EXPECTED_CONTROL_TITLES,
		});
		expect(missing).toEqual([]);
	});

	it("matches it.each template entries (NC-2/NC-3) against their resolved titles", () => {
		const report = makeReport([
			{
				title:
					"NC-2: a proven admission-shaped decline reported as malformed-file falls back to ExifTool exactly once",
			},
			{
				title:
					"NC-3: code='aborted' phase='request' nativeWrite='not-started' matches the real classifyFallback disposition",
			},
		]);
		const missing = findMissingControlTitles({
			report,
			expectedTitles: [
				"NC-2: a proven admission-shaped decline reported as %s falls back to ExifTool exactly once",
				"NC-3: code=$code phase=$phase nativeWrite=$nativeWrite matches the real classifyFallback disposition",
			],
		});
		expect(missing).toEqual([]);
	});

	it("negative control: reports a missing title when a synthetic report from which one control title is absent is checked", () => {
		const withoutNc4Second = EXPECTED_CONTROL_TITLES.filter(
			(title) =>
				title !==
				"NC-4: two independent failures each receive their own grant, both falling back",
		);
		const report = makeReport(withoutNc4Second.map((title) => ({ title })));
		const missing = findMissingControlTitles({
			report,
			expectedTitles: EXPECTED_CONTROL_TITLES,
		});
		expect(missing).toEqual([
			"NC-4: two independent failures each receive their own grant, both falling back",
		]);
	});

	it("negative control: a report entry that exists but is marked skipped counts as missing, not present", () => {
		const entries = EXPECTED_CONTROL_TITLES.map((title) => ({
			title,
			status:
				title ===
				"NC-1: a post-write malformed-file error authorizes zero substitute writers, keyed on write state not error code"
					? "skipped"
					: "passed",
		}));
		const report = makeReport(entries);
		const missing = findMissingControlTitles({
			report,
			expectedTitles: EXPECTED_CONTROL_TITLES,
		});
		expect(missing).toEqual([
			"NC-1: a post-write malformed-file error authorizes zero substitute writers, keyed on write state not error code",
		]);
	});

	it("negative control: a report entry marked pending/todo also counts as missing", () => {
		const entries = EXPECTED_CONTROL_TITLES.map((title) => ({
			title,
			status:
				title === "NC-5: an aborted request produces zero fallbacks"
					? "pending"
					: "passed",
		}));
		const report = makeReport(entries);
		const missing = findMissingControlTitles({
			report,
			expectedTitles: EXPECTED_CONTROL_TITLES,
		});
		expect(missing).toEqual([
			"NC-5: an aborted request produces zero fallbacks",
		]);
	});
});

describe("missing-report handling (D-27, hard constraint 11)", () => {
	it("missing-report negative control: an absent run report produces a failure message naming the producing script, never a silent skip", () => {
		const message = buildMissingReportMessage({
			reportPath: REPORT_PATH,
			producingScript: PRODUCING_SCRIPT,
		});
		expect(message).toContain(REPORT_PATH);
		expect(message).toContain(PRODUCING_SCRIPT);
		expect(message).toContain("never a skip");
	});
});

describe("parseRunReport", () => {
	it("flattens vitest's --reporter=json testResults/assertionResults shape into a flat title/status list", () => {
		const raw = JSON.stringify({
			testResults: [
				{
					assertionResults: [
						{ title: "a passing test", status: "passed" },
						{ title: "a skipped test", status: "skipped" },
					],
				},
				{
					assertionResults: [
						{ title: "another file's test", status: "passed" },
					],
				},
			],
		});
		const parsed = parseRunReport(raw);
		expect(parsed.assertions).toEqual([
			{ title: "a passing test", status: "passed" },
			{ title: "a skipped test", status: "skipped" },
			{ title: "another file's test", status: "passed" },
		]);
	});
});

// ---------------------------------------------------------------------------------------
// Real-report driver — gated (see the file-level comment). Never skips once gated on: an
// absent report is a hard failure naming the producing script, exactly as D-27 requires.
// ---------------------------------------------------------------------------------------

const evidenceCheckRequested = process.env["GSD_NC_EVIDENCE_CHECK"] === "1";

describe.runIf(evidenceCheckRequested)(
	"Real CI run-log evidence (D-27)",
	() => {
		it(`all nine negative-control titles are present and executed in ${path.relative(REPO_ROOT, REPORT_PATH)}`, () => {
			if (!fs.existsSync(REPORT_PATH)) {
				expect.fail(
					buildMissingReportMessage({
						reportPath: REPORT_PATH,
						producingScript: PRODUCING_SCRIPT,
					}),
				);
				return;
			}
			const raw = fs.readFileSync(REPORT_PATH, "utf8");
			const report = parseRunReport(raw);
			const missing = findMissingControlTitles({
				report,
				expectedTitles: EXPECTED_CONTROL_TITLES,
			});
			expect(missing).toEqual([]);
		});
	},
);
