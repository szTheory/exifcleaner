// Known-gap prose enforcement gate — keeps GATE-03 true after the red proof is
// converted into executable expected-failure markers.
//
// Usage: node scripts/known_gap_gate.mjs
// Exits 0 when collected test source contains no locked prose-policy phrase; exits 1
// after reporting every match sorted by repository-relative path and line.

import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

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

function compareRunnerProblems(left, right) {
	const fileOrder = left.file.localeCompare(right.file);
	if (fileOrder !== 0) {
		return fileOrder;
	}
	const lineOrder = left.line - right.line;
	if (lineOrder !== 0) {
		return lineOrder;
	}
	return left.code.localeCompare(right.code);
}

function lineOf(sourceFile, node) {
	return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

function problem(sourceFile, node, code, message) {
	return {
		file: normalizePath(sourceFile.fileName),
		line: lineOf(sourceFile, node),
		code,
		message,
	};
}

function propertyNameText(name) {
	if (ts.isIdentifier(name) || ts.isPrivateIdentifier(name)) {
		return name.text;
	}
	return undefined;
}

function isIdentifier(node, text) {
	return ts.isIdentifier(node) && node.text === text;
}

function propertyChain(expression) {
	const names = [];
	let current = expression;
	while (ts.isPropertyAccessExpression(current)) {
		const name = propertyNameText(current.name);
		if (name === undefined) {
			return [];
		}
		names.unshift(name);
		current = current.expression;
	}
	if (ts.isIdentifier(current)) {
		names.unshift(current.text);
	}
	return names;
}

function isStringLiteralLike(node) {
	return ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node);
}

function markerFromLiteralTitle(title) {
	const match = /^#([1-9][0-9]*)\s+\S/.exec(title);
	if (match === null) {
		return undefined;
	}
	return Number(match[1]);
}

function hasOnlyOrSkipProperty(objectLiteral) {
	return objectLiteral.properties.some((property) => {
		if (!ts.isPropertyAssignment(property)) {
			return false;
		}
		const name = property.name;
		if (!ts.isIdentifier(name) && !ts.isStringLiteral(name)) {
			return false;
		}
		return name.text === "only" || name.text === "skip";
	});
}

function directKnownGapType(chain) {
	if (chain.length !== 2) {
		return undefined;
	}
	const [receiver, modifier] = chain;
	if (receiver === "test" && modifier === "fail") {
		return "test.fail";
	}
	if (receiver === "test" && modifier === "fails") {
		return "test.fails";
	}
	if (receiver === "it" && modifier === "fails") {
		return "it.fails";
	}
	return undefined;
}

function runnerForMarker(type, filename) {
	if (type === "test.fail") {
		return "playwright";
	}
	if (type === "test.fails" || type === "it.fails") {
		return "vitest";
	}
	if (filename.includes("/tests/e2e/") || filename.includes("/tests/smoke/")) {
		return "playwright";
	}
	return "vitest";
}

function inspectKnownGapMarker(sourceFile, node, chain, problems, markers) {
	const type = directKnownGapType(chain);
	if (type === undefined) {
		return false;
	}

	if (node.arguments.length === 0) {
		problems.push(
			problem(
				sourceFile,
				node,
				"suite-marker",
				"Expected-failure markers must be direct test declarations with literal issue-linked titles.",
			),
		);
		return true;
	}

	const [titleArg] = node.arguments;
	if (titleArg === undefined || !isStringLiteralLike(titleArg)) {
		const code =
			titleArg !== undefined && ts.isIdentifier(titleArg)
				? "dynamic-title"
				: "marker-title";
		problems.push(
			problem(
				sourceFile,
				node,
				code,
				"Known-gap marker titles must be string literals beginning with a GitHub issue token.",
			),
		);
		return true;
	}

	const issue = markerFromLiteralTitle(titleArg.text);
	if (issue === undefined) {
		problems.push(
			problem(
				sourceFile,
				node,
				"marker-title",
				"Known-gap marker titles must begin with a positive GitHub issue token.",
			),
		);
		return true;
	}

	markers.push({
		runner: runnerForMarker(type, normalizePath(sourceFile.fileName)),
		type,
		file: normalizePath(sourceFile.fileName),
		title: titleArg.text,
		issue,
	});
	return true;
}

function inspectRunnerCall(sourceFile, node, aliases, problems, markers) {
	const expression = node.expression;

	if (ts.isIdentifier(expression) && aliases.has(expression.text)) {
		problems.push(
			problem(
				sourceFile,
				node,
				"alias-marker",
				"Known-gap markers must not be extracted or called through aliases.",
			),
		);
		return;
	}

	if (ts.isIdentifier(expression) && expression.text === "knownGap") {
		problems.push(
			problem(
				sourceFile,
				node,
				"wrapper-marker",
				"Known-gap wrappers hide the runner/type/path/title inventory.",
			),
		);
		return;
	}

	if (ts.isElementAccessExpression(expression)) {
		const receiver = expression.expression;
		const argument = expression.argumentExpression;
		if (
			(isIdentifier(receiver, "test") || isIdentifier(receiver, "it")) &&
			argument !== undefined &&
			isStringLiteralLike(argument) &&
			(argument.text === "fail" || argument.text === "fails")
		) {
			problems.push(
				problem(
					sourceFile,
					node,
					"computed-marker",
					"Computed expected-failure marker property access is forbidden.",
				),
			);
		}
		return;
	}

	if (!ts.isPropertyAccessExpression(expression)) {
		if (
			(ts.isIdentifier(expression) &&
				(expression.text === "test" || expression.text === "it")) ||
			ts.isIdentifier(expression)
		) {
			const optionsArg = node.arguments.find(ts.isObjectLiteralExpression);
			if (optionsArg !== undefined && hasOnlyOrSkipProperty(optionsArg)) {
				problems.push(
					problem(
						sourceFile,
						node,
						"options-object-control",
						"Runner options objects must not select or omit coverage.",
					),
				);
			}
			if (
				ts.isIdentifier(expression) &&
				(expression.text === "test" || expression.text === "it") &&
				node.arguments.length === 1 &&
				node.arguments[0] !== undefined &&
				isStringLiteralLike(node.arguments[0])
			) {
				problems.push(
					problem(
						sourceFile,
						node,
						"disabled-test",
						"No-body test declarations are disabled coverage and are forbidden.",
					),
				);
			}
		}
		return;
	}

	const chain = propertyChain(expression);
	if (chain.length === 0) {
		return;
	}

	if (
		chain.length === 3 &&
		((chain[0] === "test" && (chain[1] === "fail" || chain[1] === "fails")) ||
			(chain[0] === "it" && chain[1] === "fails"))
	) {
		problems.push(
			problem(
				sourceFile,
				node,
				"chained-marker",
				"Expected-failure markers must not be chained with runner controls.",
			),
		);
		return;
	}

	if (inspectKnownGapMarker(sourceFile, node, chain, problems, markers)) {
		const [titleArg] = node.arguments;
		if (titleArg !== undefined && !isStringLiteralLike(titleArg)) {
			const firstText = titleArg.getText(sourceFile);
			if (firstText === "true" || firstText === "false" || firstText.includes("process.")) {
				const last = problems.pop();
				if (last !== undefined) {
					problems.push({
						...last,
						code: "runtime-marker",
						message:
							"Runtime or conditional expected-failure modifiers are forbidden.",
					});
				}
			}
		}
		return;
	}

	const last = chain.at(-1);
	const receiver = chain[0];
	if (
		(receiver === "test" || receiver === "it") &&
		(last === "skip" || last === "fixme" || last === "todo")
	) {
		problems.push(
			problem(
				sourceFile,
				node,
				"disabled-test",
				"Disabled runner coverage is forbidden; use executable expected failure for reviewed gaps.",
			),
		);
		return;
	}

	if ((receiver === "test" || receiver === "it") && last === "only") {
		problems.push(
			problem(
				sourceFile,
				node,
				"focused-test",
				"Focused runner coverage is forbidden.",
			),
		);
		return;
	}

	if (
		(receiver === "test" || receiver === "it") &&
		(last === "skipIf" || last === "runIf")
	) {
		problems.push(
			problem(
				sourceFile,
				node,
				"conditional-control",
				"Conditional runner controls can omit product coverage and are forbidden.",
			),
		);
		return;
	}

	if (last === "skip" && chain.includes("step")) {
		problems.push(
			problem(
				sourceFile,
				node,
				"step-skip",
				"Playwright step skips are disabled coverage and are forbidden.",
			),
		);
	}
}

export function scanRunnerPolicy(source, filename) {
	const normalized = normalizePath(filename);
	if (!isCollectedTestSource(normalized)) {
		return { markers: [], problems: [] };
	}

	const sourceFile = ts.createSourceFile(
		normalized,
		String(source),
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.TSX,
	);
	const aliases = new Set();
	const markers = [];
	const problems = [];

	function visit(node) {
		if (
			ts.isVariableDeclaration(node) &&
			ts.isIdentifier(node.name) &&
			node.initializer !== undefined &&
			ts.isPropertyAccessExpression(node.initializer)
		) {
			const chain = propertyChain(node.initializer);
			if (directKnownGapType(chain) !== undefined) {
				aliases.add(node.name.text);
			}
		}

		if (ts.isCallExpression(node)) {
			inspectRunnerCall(sourceFile, node, aliases, problems, markers);
		}

		ts.forEachChild(node, visit);
	}

	visit(sourceFile);

	return {
		markers,
		problems: problems.sort(compareRunnerProblems),
	};
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

export function scanCollectedRunnerPolicy(rootDir = process.cwd()) {
	const files = collectTestSourceFiles(rootDir);
	const markers = [];
	const problems = [];

	for (const relPath of files) {
		const source = fs.readFileSync(path.join(rootDir, relPath), "utf8");
		const result = scanRunnerPolicy(source, relPath);
		markers.push(...result.markers);
		problems.push(...result.problems);
	}

	return {
		markers: markers.sort((left, right) => {
			const fileOrder = left.file.localeCompare(right.file);
			if (fileOrder !== 0) {
				return fileOrder;
			}
			return left.title.localeCompare(right.title);
		}),
		problems: problems.sort(compareRunnerProblems),
	};
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
	const localDiagnostics = problems.map((entry) =>
		"phrase" in entry
			? formatLocalDiagnostic(entry)
			: `${entry.file}:${entry.line}: ${entry.message}`,
	);
	if (process.env["GITHUB_ACTIONS"] === "true") {
		for (const problem of problems) {
			if ("phrase" in problem) {
				console.error(formatGitHubAnnotation(problem));
			}
		}
	}
	console.error(`\n✗ KNOWN-GAP GATE FAILED:\n${localDiagnostics.join("\n")}\n`);
}

export function main() {
	const files = collectTestSourceFiles(process.cwd());
	const proseProblems = scanCollectedTestSources(process.cwd());
	const runnerPolicy = scanCollectedRunnerPolicy(process.cwd());
	const problems = [...proseProblems, ...runnerPolicy.problems];

	if (problems.length > 0) {
		fail(problems);
		return 1;
	}

	console.log(
		`\n✓ KNOWN-GAP GATE PASSED — ${files.length} collected test source file(s) scanned, ${runnerPolicy.markers.length} expected-failure marker(s) inventoried.\n`,
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
