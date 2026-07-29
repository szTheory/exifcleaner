// Known-gap prose enforcement gate — keeps GATE-03 true after the red proof is
// converted into executable expected-failure markers.
//
// Usage: node scripts/known_gap_gate.mjs
// Exits 0 when collected test source contains no locked prose-policy phrase; exits 1
// after reporting every match sorted by repository-relative path and line.

import fs from "node:fs";
import path from "node:path";

const TESTS_DIR = "tests";
const SOURCE_EXTENSIONS = ["ts", "tsx", "js", "jsx", "mjs", "cjs"];
const SOURCE_SUFFIX = `(?:${SOURCE_EXTENSIONS.join("|")})`;
const REMEDIATION =
	"Move this known gap into a declaration-time expected-failure marker.";

export const BANNED_PROSE_PHRASES = Object.freeze([
	"deferred",
	"pre-existing gap",
	"doesn't currently",
	"not currently",
	"for now",
	"TODO",
	"FIXME",
]);

const VITEST_TEST_PATH = new RegExp(
	`(?:^|/)tests/.*\\.test\\.${SOURCE_SUFFIX}$`,
);
const PLAYWRIGHT_SPEC_PATH = new RegExp(
	`(?:^|/)tests/e2e/.*\\.spec\\.${SOURCE_SUFFIX}$`,
);
const SMOKE_TEST_PATH = new RegExp(
	`(?:^|/)tests/smoke/.*\\.smoke\\.${SOURCE_SUFFIX}$`,
);

function normalizePath(filename) {
	return String(filename).replace(/\\/g, "/");
}

function isUnderExcludedSourceDirectory(filename) {
	const normalized = normalizePath(filename);
	return (
		normalized.includes("/helpers/") ||
		normalized.includes("/fixtures/") ||
		normalized.includes("/__snapshots__/") ||
		normalized.includes("/test-results/") ||
		normalized.includes("/playwright-report/") ||
		normalized.includes("/dist/") ||
		normalized.includes("/out/") ||
		normalized.includes("/build/")
	);
}

function isCollectedTestSource(filename) {
	const normalized = normalizePath(filename);
	if (isUnderExcludedSourceDirectory(normalized)) {
		return false;
	}
	return (
		VITEST_TEST_PATH.test(normalized) ||
		PLAYWRIGHT_SPEC_PATH.test(normalized) ||
		SMOKE_TEST_PATH.test(normalized)
	);
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

function toRelativePosix(rootDir, absolute) {
	return path.relative(rootDir, absolute).split(path.sep).join("/");
}

function compareProblems(left, right) {
	const fileOrder = left.file.localeCompare(right.file);
	if (fileOrder !== 0) {
		return fileOrder;
	}
	const lineOrder = left.line - right.line;
	if (lineOrder !== 0) {
		return lineOrder;
	}
	return left.phrase.localeCompare(right.phrase);
}

export function collectTestSourceFiles(rootDir = process.cwd()) {
	const testsDir = path.join(rootDir, TESTS_DIR);
	if (!fs.existsSync(testsDir)) {
		return [];
	}
	return walk(testsDir, [])
		.map((absolute) => toRelativePosix(rootDir, absolute))
		.filter((relPath) => isCollectedTestSource(relPath))
		.sort((left, right) => left.localeCompare(right));
}

export function scanBannedProse(source, filename) {
	const normalized = normalizePath(filename);
	if (!isCollectedTestSource(normalized)) {
		return [];
	}

	const phrases = BANNED_PROSE_PHRASES.map((phrase) => ({
		phrase,
		needle: phrase.toLocaleLowerCase("en-US"),
	}));
	const problems = [];
	const lines = String(source).split(/\r?\n/);

	lines.forEach((line, index) => {
		const lowerLine = line.toLocaleLowerCase("en-US");
		for (const { phrase, needle } of phrases) {
			if (!lowerLine.includes(needle)) {
				continue;
			}
			problems.push({
				file: normalized,
				line: index + 1,
				phrase,
				message: REMEDIATION,
			});
		}
	});

	return problems.sort(compareProblems);
}

export function scanCollectedTestSources(rootDir = process.cwd()) {
	const files = collectTestSourceFiles(rootDir);
	const problems = [];

	for (const relPath of files) {
		const source = fs.readFileSync(path.join(rootDir, relPath), "utf8");
		problems.push(...scanBannedProse(source, relPath));
	}

	return problems.sort(compareProblems);
}

function escapeMessage(value) {
	return String(value)
		.replaceAll("%", "%25")
		.replaceAll("\r", "%0D")
		.replaceAll("\n", "%0A");
}

function escapeProperty(value) {
	return escapeMessage(value).replaceAll(":", "%3A").replaceAll(",", "%2C");
}

export function formatLocalDiagnostic(problem) {
	return `${problem.file}:${problem.line}: known-gap prose phrase "${problem.phrase}" is not machine-readable. ${problem.message}`;
}

export function formatGitHubAnnotation(problem) {
	const message = `known-gap prose phrase "${problem.phrase}" is not machine-readable. ${problem.message}`;
	return `::error file=${escapeProperty(problem.file)},line=${problem.line}::${escapeMessage(message)}`;
}

function fail(problems) {
	const localDiagnostics = problems.map(formatLocalDiagnostic);
	if (process.env["GITHUB_ACTIONS"] === "true") {
		for (const problem of problems) {
			console.error(formatGitHubAnnotation(problem));
		}
	}
	console.error(`\n✗ KNOWN-GAP GATE FAILED:\n${localDiagnostics.join("\n")}\n`);
}

export function main() {
	const files = collectTestSourceFiles(process.cwd());
	const problems = scanCollectedTestSources(process.cwd());

	if (problems.length > 0) {
		fail(problems.sort(compareProblems));
		return 1;
	}

	console.log(
		`\n✓ KNOWN-GAP GATE PASSED — ${files.length} collected test source file(s) scanned.\n`,
	);
	return 0;
}

// Only run when invoked directly, so the module can be imported by tests.
if (
	process.argv[1] !== undefined &&
	import.meta.url.endsWith(path.basename(process.argv[1]))
) {
	process.exitCode = main();
}
