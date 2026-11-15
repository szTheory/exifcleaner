// PLN-01 spike (76-01), S1: how many of the 208 colour findings does the palette clear?
//
// Runs the repo's two own ratchets over the scratch palette (s1_palette.mjs already rewrote
// tokens.css) and counts what THEY report, so the number is the ratchets' verdict and not a
// hand tally:
//   * tests/renderer/contrast/contrast.test.ts: the `contrast-gap` entries whose pair now
//     passes ("these contrast-gap entries now pass; remove the entry: ..."),
//   * .storybook/a11y_p72_recheck.test.tsx (storybook-a11y-gate project): one
//     `fixed, remove the entry <fingerprint>` line per axe `color-contrast` entry that no
//     longer reproduces.
// Cleared = those fingerprints, and only those that are listed colour entries of
// docs/evidence/known-findings.json (142 axe color-contrast + 66 contrast-gap = 208, the
// denominator). Any other failing test, and any pair that newly fails with the palette, is
// collected separately as unrelated and is NOT counted as cleared. The failing set is
// asserted equal to the cleared carriers plus nothing else, and a mismatch is printed.
//
// Exit codes: 0 when the measurement ran (even with a mismatch, which is recorded), 1 when
// it could not run (no test output, or the denominator is not 208).
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
	compareBaseline,
	evaluate,
	failingFingerprints,
} from "../tests/renderer/contrast/contrast_model.mjs";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "spike-out");
fs.mkdirSync(OUT, { recursive: true });
const DENOMINATOR = 208;

function run(label, args) {
	const jsonFile = path.join(OUT, `s1_${label}.json`);
	const result = spawnSync(
		"yarn",
		["vitest", "run", ...args, "--reporter=default", "--reporter=json", `--outputFile.json=${jsonFile}`],
		{
			cwd: ROOT,
			encoding: "utf8",
			maxBuffer: 1024 * 1024 * 1024,
			env: { ...process.env, CI: "true", FORCE_COLOR: "0", STORYBOOK_DISABLE_TELEMETRY: "true" },
		},
	);
	const log = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
	fs.writeFileSync(path.join(OUT, `s1_${label}.log`), log);
	let json = null;
	try {
		json = JSON.parse(fs.readFileSync(jsonFile, "utf8"));
	} catch {
		// reported below
	}
	console.log(`s1 ${label}: exit ${result.status}, ${log.length} bytes of output, json ${json === null ? "missing" : "ok"}`);
	return { status: result.status, log, json };
}

function failures(json) {
	const out = [];
	for (const file of json?.testResults ?? []) {
		if (file.status === "failed" && (file.assertionResults ?? []).length === 0) {
			out.push({ name: `suite ${path.relative(ROOT, file.name)}`, message: String(file.message ?? "") });
		}
		for (const test of file.assertionResults ?? []) {
			if (test.status === "failed") {
				out.push({ name: test.fullName, message: (test.failureMessages ?? []).join("\n") });
			}
		}
	}
	return out;
}

const contrast = run("contrast", ["tests/renderer/contrast/contrast.test.ts"]);
const a11y = run("a11y", [
	"--config",
	"vitest.storybook.config.ts",
	"--project",
	"storybook-a11y-gate",
	".storybook/a11y_p72_recheck.test.tsx",
]);
if (contrast.log.trim() === "" || a11y.log.trim() === "") {
	console.error("S1 count FAILED: a test run produced no output");
	process.exit(1);
}

const baseline = JSON.parse(fs.readFileSync(path.join(ROOT, "docs/evidence/known-findings.json"), "utf8"));
const colourEntries = baseline.entries.filter(
	(entry) =>
		(String(entry.kind).startsWith("a11y") && entry.rule === "color-contrast") ||
		entry.kind === "contrast-gap",
);
const listed = new Map(colourEntries.map((entry) => [entry.fingerprint, entry]));
if (listed.size !== DENOMINATOR) {
	console.error(`S1 count FAILED: ${listed.size} listed colour entries, expected ${DENOMINATOR}`);
	process.exit(1);
}

const contrastFailures = failures(contrast.json);
const a11yFailures = failures(a11y.json);
const contrastText = `${contrast.log}\n${contrastFailures.map((f) => f.message).join("\n")}`;
const a11yText = `${a11y.log}\n${a11yFailures.map((f) => f.message).join("\n")}`;

const clearedA11y = new Set(
	[...a11yText.matchAll(/fixed, remove the entry ([^\s"',]+)/g)].map((m) => m[1]),
);
const clearedGap = new Set();
for (const match of contrastText.matchAll(/these contrast-gap entries now pass; remove the entry: ([^\n]+)/g)) {
	for (const fingerprint of match[1].split(", ")) {
		if (fingerprint.trim() !== "") clearedGap.add(fingerprint.trim());
	}
}
const newGapFailures = new Set();
for (const match of contrastText.matchAll(/a failing pair has no contrast-gap entry;[^\n]*?: ([^\n]+)/g)) {
	for (const fingerprint of match[1].split(", ")) {
		if (fingerprint.trim() !== "") newGapFailures.add(fingerprint.trim());
	}
}
// The contrast test asserts newFailures before fixedStillListed, and an expect throws on its
// first failure, so a palette that also introduces new failing pairs hides the fixed list from
// the test output. The same two lists are therefore also taken from the test's own comparison
// functions (contrast_model.mjs: evaluate, failingFingerprints, compareBaseline) over the
// scratch tokens.css; the parsed test output is kept as a cross-check, never as the only source.
const pairsDoc = JSON.parse(
	fs.readFileSync(path.join(ROOT, "tests/renderer/contrast/contrast_pairs.json"), "utf8"),
);
const scratchCss = fs.readFileSync(path.join(ROOT, "src/renderer/styles/tokens.css"), "utf8");
const compared = compareBaseline(
	failingFingerprints(evaluate(pairsDoc, scratchCss)),
	baseline.entries,
);
const parsedGap = clearedGap.size;
for (const fingerprint of compared.fixedStillListed) clearedGap.add(fingerprint);
for (const fingerprint of compared.newFailures) newGapFailures.add(fingerprint);
// Vacuity guard: the unmodified tokens.css at HEAD must compare clean (today's baseline).
let control = "unavailable";
try {
	const headCss = execFileSync("git", ["show", "HEAD:src/renderer/styles/tokens.css"], {
		cwd: ROOT,
		encoding: "utf8",
	});
	const head = compareBaseline(failingFingerprints(evaluate(pairsDoc, headCss)), baseline.entries);
	control = head.newFailures.length === 0 && head.fixedStillListed.length === 0 ? "clean" : "NOT-CLEAN";
} catch {
	// no git history in this checkout: recorded as unavailable
}

const reported = new Set([...clearedA11y, ...clearedGap]);
const cleared = [...reported].filter((fingerprint) => listed.has(fingerprint)).sort();
const notColourEntries = [...reported].filter((fingerprint) => !listed.has(fingerprint)).sort();
const clearedSet = new Set(cleared);
const clearedAxe = cleared.filter((fingerprint) => listed.get(fingerprint).kind !== "contrast-gap").length;
const clearedContrastGap = cleared.length - clearedAxe;

// The residual: listed colour entries the palette did not clear, grouped by the foreground
// token (axe entries carry it in the reason; contrast-gap fingerprints name it before `-on-`).
function tokenOf(entry) {
	if (entry.kind === "contrast-gap") return String(entry.fingerprint).split("|")[2].split("-on-")[0];
	const named = /foreground #[0-9a-fA-F]+ \((--[a-z0-9-]+)\)/.exec(entry.reason ?? "");
	if (named) return named[1];
	const measured = /\(#[0-9a-fA-F]{6,8} (--[a-z0-9-]+) on /.exec(entry.reason ?? "");
	if (measured) return measured[1];
	const hex = /foreground (#[0-9a-fA-F]+)/.exec(entry.reason ?? "");
	return hex ? `hex ${hex[1].toLowerCase()}` : "unparsed";
}
const residualEntries = colourEntries.filter((entry) => !clearedSet.has(entry.fingerprint));
const residualByToken = {};
for (const entry of residualEntries) {
	const token = tokenOf(entry);
	(residualByToken[token] ??= []).push(entry.fingerprint);
}

// Residuals a named CSS-property rewrite would address (named here, NOT applied: the palette
// credits values and alias merges only). Each is named in token_map.json's own reasons.
const NAMED_REWRITES = [
	{
		id: "accent-as-text",
		source: "token_map.json --color-accent reason (D-04: the accent is never text)",
		match: (entry) =>
			tokenOf(entry) === "--ec-color-accent" ||
			/^accent-text$/.test(tokenOf(entry)),
	},
	{
		id: "error-as-text",
		source: "token_map.json --color-error-text reason (D-04: error text is never platform red)",
		match: (entry) => tokenOf(entry) === "--ec-color-error" || tokenOf(entry) === "error-text",
	},
	{
		id: "selection-on-accent",
		source: "known-findings.json selection-on-accent reason (::selection pair, fixed against the UI-SPEC palette)",
		match: (entry) => tokenOf(entry) === "selection",
	},
];
const namedRewrites = NAMED_REWRITES.map((rewrite) => ({
	id: rewrite.id,
	source: rewrite.source,
	fingerprints: residualEntries.filter(rewrite.match).map((entry) => entry.fingerprint).sort(),
}));
const namedCount = new Set(namedRewrites.flatMap((rewrite) => rewrite.fingerprints)).size;

// The failing set must equal the carriers of the cleared entries and nothing else.
const CARRIERS = [
	/a new failure is red and a fixed pair still listed is red/,
	/every entry still reproduces with its rule re-enabled/,
];
const allFailures = [
	...contrastFailures.map((f) => ({ ...f, file: "contrast.test.ts" })),
	...a11yFailures.map((f) => ({ ...f, file: "a11y_p72_recheck.test.tsx" })),
];
const unrelated = allFailures
	.filter((failure) => !CARRIERS.some((pattern) => pattern.test(failure.name)))
	.map((failure) => ({ file: failure.file, test: failure.name, message: failure.message.slice(0, 400) }));
const carrierFailures = allFailures.filter((failure) => CARRIERS.some((pattern) => pattern.test(failure.name)));
const mismatches = [];
if (unrelated.length > 0) mismatches.push(`${unrelated.length} failing test(s) are not carriers of cleared entries`);
if (newGapFailures.size > 0) mismatches.push(`${newGapFailures.size} pair(s) newly fail with the palette (not counted as cleared)`);
if (notColourEntries.length > 0) mismatches.push(`${notColourEntries.length} reported fingerprint(s) are not listed colour entries`);
if (cleared.length > 0 && carrierFailures.length === 0) mismatches.push("entries cleared but no carrier test failed");
if (cleared.length === 0 && carrierFailures.length > 0) mismatches.push("a carrier test failed but no cleared entry was parsed (parser miss)");

const result = {
	denominator: DENOMINATOR,
	cleared: cleared.length,
	cleared_axe_color_contrast: clearedAxe,
	cleared_contrast_gap: clearedContrastGap,
	percent_floor: Math.floor((cleared.length * 100) / DENOMINATOR),
	percent_with_named_rewrites: Math.floor(((cleared.length + namedCount) * 100) / DENOMINATOR),
	residual: residualEntries.length,
	residual_by_token: Object.fromEntries(
		Object.entries(residualByToken)
			.sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
			.map(([token, fingerprints]) => [token, fingerprints.length]),
	),
	residual_fingerprints_by_token: residualByToken,
	named_rewrites: namedRewrites.map((rewrite) => ({ ...rewrite, count: rewrite.fingerprints.length })),
	named_rewrite_residual_count: namedCount,
	unrelated_failures: unrelated,
	new_pair_failures_not_counted: [...newGapFailures].sort(),
	reported_but_not_colour_entries: notColourEntries,
	failing_set_matches_cleared_plus_residual: mismatches.length === 0,
	mismatches,
	carrier_failures: carrierFailures.map((failure) => failure.name),
	contrast_gap_cleared_parsed_from_test_output: parsedGap,
	harness_control_head_tokens_compare: control,
	runs: {
		contrast: { exit: contrast.status, failed_tests: contrastFailures.length },
		a11y: { exit: a11y.status, failed_tests: a11yFailures.length },
	},
	cleared_fingerprints: cleared,
};
fs.writeFileSync(path.join(OUT, "s1.json"), `${JSON.stringify(result, null, "\t")}\n`);
console.log(
	`S1: cleared ${result.cleared}/${DENOMINATOR} (${result.percent_floor}% floor; axe ${clearedAxe}, contrast-gap ${clearedContrastGap}); with named rewrites ${result.percent_with_named_rewrites}%; residual ${result.residual}; unrelated failures ${unrelated.length}`,
);
if (mismatches.length > 0) console.log(`S1 mismatches: ${mismatches.join("; ")}`);
