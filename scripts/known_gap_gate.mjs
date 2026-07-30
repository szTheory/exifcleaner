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
const MANIFEST_PATH = "docs/known-gaps.json";
const PACKAGE_PATH = "package.json";
const RELEASE_NOTES_PATH = "RELEASE_NOTES.md";
const SOURCE_EXTENSIONS = ["ts", "tsx", "js", "jsx", "mjs", "cjs"];
const SOURCE_SUFFIX = `(?:${SOURCE_EXTENSIONS.join("|")})`;
const REMEDIATION =
	"Move this known gap into a declaration-time expected-failure marker.";
const KNOWN_LIMITATIONS_START =
	"<!-- exifcleaner-known-limitations:start v1 -->";
const KNOWN_LIMITATIONS_END = "<!-- exifcleaner-known-limitations:end -->";
const RELEASE_COUNT_MARKERS = Object.freeze([
	"test.fail(",
	"it.fails(",
	"test.skip(",
	"test.fixme(",
]);
const FORBIDDEN_RUNNER_CONTROL_PROPERTIES = Object.freeze(
	new Set(["skip", "fixme", "todo", "only", "skipIf", "runIf"]),
);
const RUNNER_CONTROL_PROBLEMS = Object.freeze({
	skip: Object.freeze({
		code: "disabled-test",
		message:
			"Disabled runner coverage is forbidden; use executable expected failure for reviewed gaps.",
	}),
	fixme: Object.freeze({
		code: "disabled-test",
		message:
			"Disabled runner coverage is forbidden; use executable expected failure for reviewed gaps.",
	}),
	todo: Object.freeze({
		code: "disabled-test",
		message:
			"Disabled runner coverage is forbidden; use executable expected failure for reviewed gaps.",
	}),
	only: Object.freeze({
		code: "focused-test",
		message: "Focused runner coverage is forbidden.",
	}),
	skipIf: Object.freeze({
		code: "conditional-control",
		message:
			"Conditional runner controls can omit product coverage and are forbidden.",
	}),
	runIf: Object.freeze({
		code: "conditional-control",
		message:
			"Conditional runner controls can omit product coverage and are forbidden.",
	}),
});
const OPTIONS_OBJECT_MARKER_PROBLEM = Object.freeze({
	code: "options-object-marker",
	message:
		"Options-object expected failures are forbidden; use direct test.fails/it.fails declarations so the gate can inventory them.",
});

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
	return (
		sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1
	);
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

function leftmostPropertyReceiver(expression) {
	let current = expression;
	while (ts.isPropertyAccessExpression(current)) {
		current = current.expression;
	}
	return ts.isIdentifier(current) ? current : undefined;
}

function isStringLiteralLike(node) {
	return ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node);
}

function expectedFailurePropertyText(node) {
	if (ts.isIdentifier(node) || isStringLiteralLike(node)) {
		return node.text;
	}
	return undefined;
}

function isExpectedFailureProperty(node) {
	const text = expectedFailurePropertyText(node);
	return text === "fail" || text === "fails";
}

function runnerControlPropertyText(node) {
	const text = expectedFailurePropertyText(node);
	if (text !== undefined && FORBIDDEN_RUNNER_CONTROL_PROPERTIES.has(text)) {
		return text;
	}
	return undefined;
}

function markerFromLiteralTitle(title) {
	const match = /^#([1-9][0-9]*)\s+\S/.exec(title);
	if (match === null) {
		return undefined;
	}
	return Number(match[1]);
}

function booleanLiteralValue(node) {
	if (node.kind === ts.SyntaxKind.TrueKeyword) {
		return true;
	}
	if (node.kind === ts.SyntaxKind.FalseKeyword) {
		return false;
	}
	return undefined;
}

function runnerOptionControl(objectLiteral, runnerIdentity) {
	for (const property of objectLiteral.properties) {
		if (!ts.isPropertyAssignment(property)) {
			continue;
		}
		const name = property.name;
		if (!ts.isIdentifier(name) && !ts.isStringLiteral(name)) {
			continue;
		}
		if (name.text === "only" || name.text === "skip") {
			return {
				code: "options-object-control",
				message: "Runner options objects must not select or omit coverage.",
			};
		}
		if (
			runnerIdentity.runner === "vitest" &&
			name.text === "todo" &&
			booleanLiteralValue(property.initializer) !== false
		) {
			return RUNNER_CONTROL_PROBLEMS.todo;
		}
		if (
			runnerIdentity.runner === "vitest" &&
			name.text === "fails" &&
			booleanLiteralValue(property.initializer) !== false
		) {
			return OPTIONS_OBJECT_MARKER_PROBLEM;
		}
	}
	return undefined;
}

function directKnownGapType(chain, runnerIdentity) {
	if (chain.length !== 2) {
		return undefined;
	}
	const [, modifier] = chain;
	if (
		runnerIdentity.direct &&
		runnerIdentity.runner === "playwright" &&
		runnerIdentity.canonical === "test" &&
		modifier === "fail"
	) {
		return "test.fail";
	}
	if (
		runnerIdentity.direct &&
		runnerIdentity.runner === "vitest" &&
		runnerIdentity.canonical === "test" &&
		modifier === "fails"
	) {
		return "test.fails";
	}
	if (
		runnerIdentity.direct &&
		runnerIdentity.runner === "vitest" &&
		runnerIdentity.canonical === "it" &&
		modifier === "fails"
	) {
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

function isInlineExecutableBody(node) {
	return (
		node !== undefined &&
		(ts.isArrowFunction(node) || ts.isFunctionExpression(node))
	);
}

function markerBodyArgument(type, args) {
	if (type === "test.fail") {
		return [args[1], args[2]].find(isInlineExecutableBody);
	}
	return isInlineExecutableBody(args[1]) ? args[1] : undefined;
}

function hasIssueShapedLiteralTitle(node) {
	const [titleArg] = node.arguments;
	return (
		titleArg !== undefined &&
		isStringLiteralLike(titleArg) &&
		markerFromLiteralTitle(titleArg.text) !== undefined
	);
}

function isCanonicalExpectedFailureChain(chain) {
	if (chain.length !== 2) {
		return false;
	}
	const [receiver, modifier] = chain;
	return (
		((receiver === "test" || receiver === "it") &&
			(modifier === "fail" || modifier === "fails")) ||
		false
	);
}

function inspectKnownGapMarker(
	sourceFile,
	node,
	chain,
	runnerIdentity,
	problems,
	markers,
) {
	const type =
		runnerIdentity === undefined
			? undefined
			: directKnownGapType(chain, runnerIdentity);
	if (type === undefined) {
		if (
			isCanonicalExpectedFailureChain(chain) &&
			hasIssueShapedLiteralTitle(node)
		) {
			problems.push(
				problem(
					sourceFile,
					node,
					"untrusted-marker-receiver",
					"Expected-failure marker receivers must resolve to unshadowed Playwright/Vitest named imports with runner-compatible spelling.",
				),
			);
			return true;
		}
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

	if (markerBodyArgument(type, node.arguments) === undefined) {
		problems.push(
			problem(
				sourceFile,
				node,
				"marker-body",
				type === "test.fail"
					? "Playwright known-gap markers must include an inline executable function body as the second or third argument."
					: "Vitest known-gap markers must include an inline executable function body as the second argument.",
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

function addAliasEdge(aliasEdges, localName, sourceName) {
	const sources = aliasEdges.get(localName) ?? new Set();
	sources.add(sourceName);
	aliasEdges.set(localName, sources);
}

function resolveRunnerAliases(sourceFile) {
	const aliasEdges = new Map();
	const runnerSeeds = new Map();

	function seedRunner(localName, canonical, runner, direct, bindingStart) {
		if (runnerSeeds.has(localName)) {
			return;
		}
		runnerSeeds.set(localName, {
			canonical,
			runner,
			direct,
			bindingStart,
		});
	}

	function visit(node) {
		if (
			ts.isImportDeclaration(node) &&
			isStringLiteralLike(node.moduleSpecifier) &&
			(node.moduleSpecifier.text === "@playwright/test" ||
				node.moduleSpecifier.text === "vitest") &&
			node.importClause?.namedBindings !== undefined &&
			ts.isNamedImports(node.importClause.namedBindings)
		) {
			const runner =
				node.moduleSpecifier.text === "@playwright/test"
					? "playwright"
					: "vitest";
			for (const element of node.importClause.namedBindings.elements) {
				const importedName = element.propertyName?.text ?? element.name.text;
				if (importedName === "test" || importedName === "it") {
					seedRunner(
						element.name.text,
						importedName,
						runner,
						element.name.text === importedName,
						element.name.getStart(sourceFile),
					);
				}
			}
		}

		if (
			ts.isVariableDeclaration(node) &&
			ts.isIdentifier(node.name) &&
			node.initializer !== undefined &&
			ts.isIdentifier(node.initializer)
		) {
			addAliasEdge(aliasEdges, node.name.text, node.initializer.text);
		}

		if (
			ts.isBinaryExpression(node) &&
			node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
			ts.isIdentifier(node.left) &&
			ts.isIdentifier(node.right)
		) {
			addAliasEdge(aliasEdges, node.left.text, node.right.text);
		}

		ts.forEachChild(node, visit);
	}

	visit(sourceFile);

	const runnerAliases = new Map();
	function resolve(name, seen = new Set()) {
		const seeded = runnerSeeds.get(name);
		if (seeded !== undefined) {
			return seeded;
		}
		if (seen.has(name)) {
			return undefined;
		}
		seen.add(name);

		const sources = aliasEdges.get(name) ?? [];
		for (const source of sources) {
			const resolved = resolve(source, seen);
			if (resolved !== undefined) {
				return resolved;
			}
		}
		return undefined;
	}

	for (const name of new Set([...runnerSeeds.keys(), ...aliasEdges.keys()])) {
		const resolved = resolve(name);
		if (resolved !== undefined) {
			const seed = runnerSeeds.get(name);
			runnerAliases.set(name, {
				...resolved,
				direct: seed?.direct ?? false,
				bindingStart:
					seed?.bindingStart ?? bindingStartForName(sourceFile, name),
			});
		}
	}

	return runnerAliases;
}

function bindingStartForName(sourceFile, name) {
	let bindingStart;

	function visit(node) {
		if (
			bindingStart === undefined &&
			ts.isVariableDeclaration(node) &&
			ts.isIdentifier(node.name) &&
			node.name.text === name
		) {
			bindingStart = node.name.getStart(sourceFile);
			return;
		}
		ts.forEachChild(node, visit);
	}

	visit(sourceFile);
	return bindingStart ?? -1;
}

function extractBindingNames(name, out = []) {
	if (ts.isIdentifier(name)) {
		out.push(name);
		return out;
	}
	if (ts.isObjectBindingPattern(name) || ts.isArrayBindingPattern(name)) {
		for (const element of name.elements) {
			if (ts.isBindingElement(element)) {
				extractBindingNames(element.name, out);
			}
		}
	}
	return out;
}

function nearestScope(node, blockScoped) {
	let current = node.parent;
	while (current !== undefined) {
		if (
			blockScoped &&
			(ts.isBlock(current) ||
				ts.isSourceFile(current) ||
				ts.isCaseBlock(current) ||
				ts.isModuleBlock(current))
		) {
			return current;
		}
		if (
			!blockScoped &&
			(ts.isFunctionLike(current) || ts.isSourceFile(current))
		) {
			return current;
		}
		current = current.parent;
	}
	return node.getSourceFile();
}

function addLocalBinding(localBindings, sourceFile, identifier, scope) {
	const entries = localBindings.get(identifier.text) ?? [];
	entries.push({
		start: identifier.getStart(sourceFile),
		end: scope.getEnd(),
	});
	localBindings.set(identifier.text, entries);
}

function collectLocalBindings(sourceFile) {
	const localBindings = new Map();

	function addName(name, scope) {
		for (const identifier of extractBindingNames(name)) {
			addLocalBinding(localBindings, sourceFile, identifier, scope);
		}
	}

	function visit(node) {
		if (ts.isImportDeclaration(node)) {
			const namedBindings = node.importClause?.namedBindings;
			if (namedBindings !== undefined && ts.isNamedImports(namedBindings)) {
				for (const element of namedBindings.elements) {
					addLocalBinding(localBindings, sourceFile, element.name, sourceFile);
				}
			}
		}

		if (ts.isVariableDeclaration(node)) {
			const declarationList = node.parent;
			const blockScoped =
				ts.isVariableDeclarationList(declarationList) &&
				(declarationList.flags & ts.NodeFlags.BlockScoped) !== 0;
			addName(node.name, nearestScope(node, blockScoped));
		}

		if (ts.isParameter(node)) {
			const scope = ts.isFunctionLike(node.parent) ? node.parent : sourceFile;
			addName(node.name, scope);
		}

		if (
			(ts.isFunctionDeclaration(node) ||
				ts.isClassDeclaration(node) ||
				ts.isCatchClause(node)) &&
			node.name !== undefined
		) {
			addLocalBinding(
				localBindings,
				sourceFile,
				node.name,
				nearestScope(node, true),
			);
		}

		if (ts.isCatchClause(node)) {
			const name = node.variableDeclaration?.name;
			if (name !== undefined) {
				addName(name, node.block);
			}
		}

		ts.forEachChild(node, visit);
	}

	visit(sourceFile);
	for (const entries of localBindings.values()) {
		entries.sort((left, right) => right.start - left.start);
	}
	return localBindings;
}

function nearestVisibleBinding(expression, localBindings) {
	if (!ts.isIdentifier(expression)) {
		return undefined;
	}
	const useStart = expression.getStart(expression.getSourceFile());
	return (localBindings.get(expression.text) ?? []).find(
		(binding) => binding.start <= useStart && useStart <= binding.end,
	);
}

function runnerIdentityForReceiver(expression, runnerAliases, localBindings) {
	if (expression === undefined || !ts.isIdentifier(expression)) {
		return undefined;
	}
	const identity = runnerAliases.get(expression.text);
	if (identity === undefined) {
		return undefined;
	}
	const binding = nearestVisibleBinding(expression, localBindings);
	if (binding === undefined || binding.start !== identity.bindingStart) {
		return undefined;
	}
	return identity;
}

function isTrustedRunnerReceiver(expression, runnerAliases, localBindings) {
	return (
		runnerIdentityForReceiver(expression, runnerAliases, localBindings) !==
		undefined
	);
}

function runnerControlFromReceiverCall(
	expression,
	runnerAliases,
	localBindings,
) {
	if (ts.isPropertyAccessExpression(expression)) {
		const receiver = expression.expression;
		const control = runnerControlPropertyText(expression.name);
		if (
			control !== undefined &&
			isTrustedRunnerReceiver(receiver, runnerAliases, localBindings)
		) {
			return control;
		}
	}

	if (ts.isElementAccessExpression(expression)) {
		const receiver = expression.expression;
		const argument = expression.argumentExpression;
		const control =
			argument === undefined ? undefined : runnerControlPropertyText(argument);
		if (
			control !== undefined &&
			isTrustedRunnerReceiver(receiver, runnerAliases, localBindings)
		) {
			return control;
		}
	}

	return undefined;
}

function addControlAliasEdge(aliasEdges, localName, sourceName) {
	const sources = aliasEdges.get(localName) ?? new Set();
	sources.add(sourceName);
	aliasEdges.set(localName, sources);
}

function resolveRunnerControlAliases(sourceFile, runnerAliases, localBindings) {
	const aliasEdges = new Map();
	const controlSeeds = new Map();

	function seedAlias(localName, control) {
		if (controlSeeds.has(localName)) {
			return;
		}
		controlSeeds.set(localName, control);
	}

	function visit(node) {
		if (
			ts.isVariableDeclaration(node) &&
			ts.isIdentifier(node.name) &&
			node.initializer !== undefined
		) {
			const control = runnerControlFromReceiverCall(
				node.initializer,
				runnerAliases,
				localBindings,
			);
			if (control !== undefined) {
				seedAlias(node.name.text, control);
			}

			if (ts.isIdentifier(node.initializer)) {
				addControlAliasEdge(aliasEdges, node.name.text, node.initializer.text);
			}
		}

		if (
			ts.isVariableDeclaration(node) &&
			ts.isObjectBindingPattern(node.name) &&
			node.initializer !== undefined &&
			isTrustedRunnerReceiver(node.initializer, runnerAliases, localBindings)
		) {
			for (const element of node.name.elements) {
				const extractedProperty = element.propertyName ?? element.name;
				const control = runnerControlPropertyText(extractedProperty);
				if (control !== undefined && ts.isIdentifier(element.name)) {
					seedAlias(element.name.text, control);
				}
			}
		}

		if (
			ts.isBinaryExpression(node) &&
			node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
			ts.isIdentifier(node.left) &&
			ts.isIdentifier(node.right)
		) {
			addControlAliasEdge(aliasEdges, node.left.text, node.right.text);
		}

		ts.forEachChild(node, visit);
	}

	visit(sourceFile);

	const aliases = new Map();
	function resolve(name, seen = new Set()) {
		const seeded = controlSeeds.get(name);
		if (seeded !== undefined) {
			return seeded;
		}
		if (seen.has(name)) {
			return undefined;
		}
		seen.add(name);

		const sources = aliasEdges.get(name) ?? [];
		for (const source of sources) {
			const resolved = resolve(source, seen);
			if (resolved !== undefined) {
				return resolved;
			}
		}
		return undefined;
	}

	for (const name of new Set([...controlSeeds.keys(), ...aliasEdges.keys()])) {
		const control = resolve(name);
		if (control !== undefined) {
			aliases.set(name, control);
		}
	}

	return aliases;
}

function isAliasedExpectedFailureReceiver(
	expression,
	runnerAliases,
	localBindings,
) {
	if (ts.isPropertyAccessExpression(expression)) {
		const receiver = expression.expression;
		const identity = runnerIdentityForReceiver(
			receiver,
			runnerAliases,
			localBindings,
		);
		return (
			identity !== undefined &&
			!identity.direct &&
			isExpectedFailureProperty(expression.name)
		);
	}

	if (ts.isElementAccessExpression(expression)) {
		const receiver = expression.expression;
		const argument = expression.argumentExpression;
		const identity = runnerIdentityForReceiver(
			receiver,
			runnerAliases,
			localBindings,
		);
		return (
			identity !== undefined &&
			!identity.direct &&
			argument !== undefined &&
			isExpectedFailureProperty(argument)
		);
	}

	return false;
}

function inspectRunnerCall(
	sourceFile,
	node,
	aliases,
	runnerAliases,
	localBindings,
	runnerControlAliases,
	problems,
	markers,
) {
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

	if (
		ts.isIdentifier(expression) &&
		runnerControlAliases.has(expression.text)
	) {
		const control = runnerControlAliases.get(expression.text);
		const diagnostic = RUNNER_CONTROL_PROBLEMS[control];
		problems.push(
			problem(sourceFile, node, diagnostic.code, diagnostic.message),
		);
		return;
	}

	const receiverControl = runnerControlFromReceiverCall(
		expression,
		runnerAliases,
		localBindings,
	);
	if (receiverControl !== undefined) {
		const diagnostic = RUNNER_CONTROL_PROBLEMS[receiverControl];
		problems.push(
			problem(sourceFile, node, diagnostic.code, diagnostic.message),
		);
		return;
	}

	if (
		isAliasedExpectedFailureReceiver(expression, runnerAliases, localBindings)
	) {
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
		const runnerIdentity = runnerIdentityForReceiver(
			expression,
			runnerAliases,
			localBindings,
		);
		if (runnerIdentity !== undefined) {
			const optionsArg = node.arguments.find(ts.isObjectLiteralExpression);
			const diagnostic =
				optionsArg === undefined
					? undefined
					: runnerOptionControl(optionsArg, runnerIdentity);
			if (diagnostic !== undefined) {
				problems.push(
					problem(sourceFile, node, diagnostic.code, diagnostic.message),
				);
			}
			if (
				runnerIdentity.direct &&
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

	const runnerIdentity = ts.isPropertyAccessExpression(expression)
		? runnerIdentityForReceiver(
				leftmostPropertyReceiver(expression),
				runnerAliases,
				localBindings,
			)
		: undefined;

	if (
		inspectKnownGapMarker(
			sourceFile,
			node,
			chain,
			runnerIdentity,
			problems,
			markers,
		)
	) {
		const [titleArg] = node.arguments;
		if (titleArg !== undefined && !isStringLiteralLike(titleArg)) {
			const firstText = titleArg.getText(sourceFile);
			if (
				firstText === "true" ||
				firstText === "false" ||
				firstText.includes("process.")
			) {
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
	const trustedReceiver = runnerIdentity !== undefined;
	if (
		trustedReceiver &&
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

	if (
		trustedReceiver &&
		(receiver === "test" || receiver === "it") &&
		last === "only"
	) {
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
		trustedReceiver &&
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
	const runnerAliases = resolveRunnerAliases(sourceFile);
	const localBindings = collectLocalBindings(sourceFile);
	const runnerControlAliases = resolveRunnerControlAliases(
		sourceFile,
		runnerAliases,
		localBindings,
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
			const runnerIdentity = runnerIdentityForReceiver(
				node.initializer.expression,
				runnerAliases,
				localBindings,
			);
			if (
				runnerIdentity !== undefined &&
				directKnownGapType(chain, runnerIdentity) !== undefined
			) {
				aliases.add(node.name.text);
			}
		}

		if (
			ts.isVariableDeclaration(node) &&
			ts.isObjectBindingPattern(node.name) &&
			node.initializer !== undefined &&
			isTrustedRunnerReceiver(node.initializer, runnerAliases, localBindings)
		) {
			for (const element of node.name.elements) {
				const extractedProperty = element.propertyName ?? element.name;
				if (
					isExpectedFailureProperty(extractedProperty) &&
					ts.isIdentifier(element.name)
				) {
					aliases.add(element.name.text);
				}
			}
		}

		if (
			ts.isVariableDeclaration(node) &&
			ts.isIdentifier(node.name) &&
			node.initializer !== undefined &&
			ts.isElementAccessExpression(node.initializer)
		) {
			const receiver = node.initializer.expression;
			const argument = node.initializer.argumentExpression;
			if (
				isTrustedRunnerReceiver(receiver, runnerAliases, localBindings) &&
				argument !== undefined &&
				isExpectedFailureProperty(argument)
			) {
				aliases.add(node.name.text);
			}
		}

		if (ts.isCallExpression(node)) {
			inspectRunnerCall(
				sourceFile,
				node,
				aliases,
				runnerAliases,
				localBindings,
				runnerControlAliases,
				problems,
				markers,
			);
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

const MANIFEST_TOP_LEVEL_KEYS = new Set([
	"schemaVersion",
	"targetVersion",
	"records",
]);
const MANIFEST_RECORD_KEYS = new Set([
	"id",
	"issue",
	"runner",
	"type",
	"path",
	"title",
	"affectedScope",
	"releasePolicy",
	"impact",
	"workaround",
	"targetFixVersion",
]);
const VALID_RUNNERS = new Set(["playwright", "vitest"]);
const VALID_MARKER_TYPES = new Set(["test.fail", "test.fails", "it.fails"]);
const VALID_POLICIES = new Set(["block", "allow"]);
const MANDATORY_BLOCK_PATTERNS = [
	/data loss/i,
	/false privacy claim/i,
	/injection/i,
	/\brce\b/i,
	/remote code execution/i,
	/target-release regression/i,
	/non-executing coverage/i,
];

function isPlainObject(value) {
	return (
		typeof value === "object" &&
		value !== null &&
		!Array.isArray(value) &&
		Object.getPrototypeOf(value) === Object.prototype
	);
}

function validationProblem(code, message) {
	return { code, message };
}

function identityForMarker(marker) {
	return [
		marker.runner,
		marker.type,
		normalizePath(marker.file ?? marker.path),
		marker.title,
		String(marker.issue),
	].join("\u0000");
}

function identityForRecord(record) {
	return [
		record.runner,
		record.type,
		normalizePath(record.path),
		record.title,
		String(record.issue),
	].join("\u0000");
}

function expectedStableId(record) {
	if (
		record.issue === 304 &&
		record.title ===
			"#304 save-as-copy on: original survives, a cleaned copy appears"
	) {
		return "KG-304-save-as-copy";
	}
	const title = String(record.title).replace(/^#[1-9][0-9]*\s+/, "");
	const slug = title
		.toLocaleLowerCase("en-US")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.split("-")
		.slice(0, 4)
		.join("-");
	return `KG-${record.issue}-${slug}`;
}

function hasInvalidPathSyntax(value) {
	return (
		typeof value !== "string" ||
		value.length === 0 ||
		value.startsWith("/") ||
		value.includes("\\") ||
		value.includes("..") ||
		value.includes("*") ||
		value.includes("?") ||
		value.includes("[") ||
		value.includes("]") ||
		value.includes("{") ||
		value.includes("}") ||
		value.includes(":")
	);
}

function validateRecordShape(rawRecord, index, problems) {
	if (!isPlainObject(rawRecord)) {
		problems.push(
			validationProblem(
				"record-shape",
				`records[${index}] must be a strict object.`,
			),
		);
		return undefined;
	}

	for (const key of Object.keys(rawRecord)) {
		if (!MANIFEST_RECORD_KEYS.has(key)) {
			problems.push(
				validationProblem(
					"unknown-field",
					`records[${index}] contains unknown field "${key}".`,
				),
			);
		}
	}

	const record = rawRecord;
	if (typeof record.id !== "string" || record.id.length === 0) {
		problems.push(
			validationProblem("record-shape", `records[${index}].id is invalid.`),
		);
	}
	if (!Number.isInteger(record.issue) || record.issue <= 0) {
		problems.push(
			validationProblem("record-shape", `records[${index}].issue is invalid.`),
		);
	}
	if (!VALID_RUNNERS.has(record.runner)) {
		problems.push(
			validationProblem("record-shape", `records[${index}].runner is invalid.`),
		);
	}
	if (!VALID_MARKER_TYPES.has(record.type)) {
		problems.push(
			validationProblem(
				"record-shape",
				`records[${index}].type is not a canonical marker type.`,
			),
		);
	}
	if (hasInvalidPathSyntax(record.path)) {
		problems.push(
			validationProblem(
				"invalid-path",
				`records[${index}].path must be one normalized repository-relative file path.`,
			),
		);
	}
	if (
		typeof record.title !== "string" ||
		markerFromLiteralTitle(record.title) === undefined
	) {
		problems.push(
			validationProblem(
				"record-shape",
				`records[${index}].title must be a literal issue-linked title.`,
			),
		);
	}
	if (
		typeof record.affectedScope !== "string" ||
		record.affectedScope.length === 0
	) {
		problems.push(
			validationProblem(
				"record-shape",
				`records[${index}].affectedScope is required.`,
			),
		);
	}
	if (!VALID_POLICIES.has(record.releasePolicy)) {
		problems.push(
			validationProblem(
				"record-shape",
				`records[${index}].releasePolicy is invalid.`,
			),
		);
	}
	if (record.releasePolicy === "allow") {
		if (
			typeof record.impact !== "string" ||
			record.impact.length === 0 ||
			typeof record.workaround !== "string" ||
			record.workaround.length === 0 ||
			typeof record.targetFixVersion !== "string" ||
			!/^[0-9]+\.[0-9]+\.[0-9]+$/.test(record.targetFixVersion)
		) {
			problems.push(
				validationProblem(
					"allow-disclosure",
					`records[${index}] allow policy requires impact, workaround, and three-part targetFixVersion.`,
				),
			);
		}
		const publicText = [
			record.title,
			record.affectedScope,
			record.impact,
			record.workaround,
		].join("\n");
		if (MANDATORY_BLOCK_PATTERNS.some((pattern) => pattern.test(publicText))) {
			problems.push(
				validationProblem(
					"blocked-category",
					`records[${index}] describes a mandatory block category and cannot be allow.`,
				),
			);
		}
	}

	return record;
}

export function validateKnownGapsManifest(manifest, inventory, options) {
	const problems = [];
	const records = [];

	if (!isPlainObject(manifest)) {
		return {
			records,
			problems: [
				validationProblem(
					"manifest-shape",
					"Manifest must be a strict object.",
				),
			],
		};
	}

	for (const key of Object.keys(manifest)) {
		if (!MANIFEST_TOP_LEVEL_KEYS.has(key)) {
			problems.push(
				validationProblem(
					"unknown-field",
					`Manifest contains unknown field "${key}".`,
				),
			);
		}
	}

	if (manifest.schemaVersion !== 1) {
		problems.push(
			validationProblem("schema-version", "Manifest schemaVersion must be 1."),
		);
	}
	if (
		typeof manifest.targetVersion !== "string" ||
		!/^[0-9]+\.[0-9]+\.[0-9]+$/.test(manifest.targetVersion)
	) {
		problems.push(
			validationProblem(
				"target-version",
				"Manifest targetVersion must be a three-part version.",
			),
		);
	}
	if (!Array.isArray(manifest.records)) {
		problems.push(
			validationProblem("manifest-shape", "Manifest records must be an array."),
		);
	}

	const rawRecords = Array.isArray(manifest.records) ? manifest.records : [];
	for (const [index, rawRecord] of rawRecords.entries()) {
		const record = validateRecordShape(rawRecord, index, problems);
		if (record !== undefined) {
			records.push(record);
		}
	}

	const ids = new Set();
	const identities = new Set();
	const inventoryIdentities = new Set(inventory.map(identityForMarker));
	const inventoryIssueTitleKeys = new Set(
		inventory.map((marker) => `${marker.issue}\u0000${marker.title}`),
	);
	for (const record of records) {
		if (ids.has(record.id)) {
			problems.push(
				validationProblem(
					"duplicate-id",
					`Duplicate known-gap ID "${record.id}".`,
				),
			);
		}
		ids.add(record.id);

		const identity = identityForRecord(record);
		if (identities.has(identity)) {
			problems.push(
				validationProblem(
					"duplicate-identity",
					`Duplicate known-gap identity for ${record.path}.`,
				),
			);
		}
		identities.add(identity);

		if (
			inventoryIssueTitleKeys.has(`${record.issue}\u0000${record.title}`) &&
			record.id !== expectedStableId(record)
		) {
			problems.push(
				validationProblem(
					"stable-id",
					`Known-gap record ${record.path} must keep stable ID ${expectedStableId(record)}.`,
				),
			);
		}

		if (record.issue === 304 && record.releasePolicy !== "block") {
			problems.push(
				validationProblem(
					"policy-downgrade",
					"#304 is data-loss user-facing coverage and must stay block until fixed.",
				),
			);
		}
	}

	for (const record of records) {
		if (!inventoryIdentities.has(identityForRecord(record))) {
			problems.push(
				validationProblem(
					"stale-manifest-record",
					`${record.path} ${record.type} "${record.title}" no longer matches source inventory.`,
				),
			);
		}
	}
	for (const marker of inventory) {
		if (!identities.has(identityForMarker(marker))) {
			problems.push(
				validationProblem(
					"missing-source-marker",
					`${marker.file} ${marker.type} "${marker.title}" is not present in docs/known-gaps.json.`,
				),
			);
		}
	}

	if (options.release === true) {
		if (manifest.targetVersion !== options.packageVersion) {
			problems.push(
				validationProblem(
					"target-version",
					`Manifest targetVersion ${manifest.targetVersion} must equal package.json version ${options.packageVersion}.`,
				),
			);
		}
		for (const record of records) {
			if (record.releasePolicy === "block") {
				problems.push(
					validationProblem(
						"release-block",
						`#${record.issue} ${record.id} blocks release ${options.packageVersion}.`,
					),
				);
			}
		}
	}

	return {
		records,
		problems,
	};
}

function readJsonFile(relPath) {
	return JSON.parse(fs.readFileSync(path.join(process.cwd(), relPath), "utf8"));
}

function allowedRecords(records) {
	return records
		.filter((record) => record.releasePolicy === "allow")
		.sort((left, right) => {
			const issueOrder = left.issue - right.issue;
			if (issueOrder !== 0) {
				return issueOrder;
			}
			return left.id.localeCompare(right.id);
		});
}

function requireDisclosureField(record, key) {
	const value = record[key];
	if (typeof value !== "string" || value.length === 0) {
		throw new Error(`allow record ${record.id} is missing ${key}`);
	}
	return value;
}

export function buildKnownLimitationsBlock(records, version) {
	const lines = [
		KNOWN_LIMITATIONS_START,
		`## Known limitations in ${version}`,
		"",
	];
	const allowed = allowedRecords(records);

	if (allowed.length === 0) {
		lines.push("No known limitations are approved for this release.");
	} else {
		for (const record of allowed) {
			lines.push(
				`- Impact: ${requireDisclosureField(record, "impact")}`,
				`  Scope: ${record.affectedScope}`,
				`  Workaround: ${requireDisclosureField(record, "workaround")}`,
				`  Target fix: ${requireDisclosureField(record, "targetFixVersion")}.`,
				`  Issue: https://github.com/szTheory/exifcleaner/issues/${record.issue}`,
			);
		}
	}

	lines.push(KNOWN_LIMITATIONS_END, "");
	return lines.join("\n");
}

function replaceKnownLimitationsBlock(source, block) {
	const start = source.indexOf(KNOWN_LIMITATIONS_START);
	const end = source.indexOf(KNOWN_LIMITATIONS_END);
	if (start === -1 || end === -1 || end < start) {
		return `${block}\n${source}`;
	}
	const afterEnd = end + KNOWN_LIMITATIONS_END.length;
	const suffix = source.slice(afterEnd).replace(/^\r?\n/, "");
	return `${source.slice(0, start)}${block}\n${suffix}`;
}

function readManifestAndPackage(release, inventory) {
	if (!fs.existsSync(MANIFEST_PATH)) {
		return {
			packageVersion: "",
			records: [],
			problems: [
				validationProblem(
					"manifest-missing",
					`${MANIFEST_PATH} is required for exact known-gap inventory validation.`,
				),
			],
		};
	}

	const manifest = readJsonFile(MANIFEST_PATH);
	const packageJson = readJsonFile(PACKAGE_PATH);
	const packageVersion =
		typeof packageJson.version === "string" ? packageJson.version : "";
	const manifestResult = validateKnownGapsManifest(manifest, inventory, {
		packageVersion,
		release,
	});

	return {
		packageVersion,
		records: manifestResult.records,
		problems: manifestResult.problems,
	};
}

export function validateKnownLimitationsBlock(source, records, version) {
	const expected = buildKnownLimitationsBlock(records, version);
	const start = source.indexOf(KNOWN_LIMITATIONS_START);
	const end = source.indexOf(KNOWN_LIMITATIONS_END);
	if (start === -1 || end === -1 || end < start) {
		return [
			validationProblem(
				"release-notes-missing",
				"RELEASE_NOTES.md known limitations block is missing. Run yarn known-gaps:write.",
			),
		];
	}
	const actual = source.slice(start, end + KNOWN_LIMITATIONS_END.length);
	if (actual !== expected.trimEnd()) {
		return [
			validationProblem(
				"release-notes-drift",
				"RELEASE_NOTES.md known limitations block is not current. Run yarn known-gaps:write.",
			),
		];
	}
	return [];
}

export function getLiteralMarkerCounts(sources) {
	const counts = Object.fromEntries(
		RELEASE_COUNT_MARKERS.map((marker) => [marker, 0]),
	);
	for (const source of sources) {
		for (const marker of RELEASE_COUNT_MARKERS) {
			counts[marker] += String(source).split(marker).length - 1;
		}
	}
	return counts;
}

export function formatLiteralMarkerCounts(counts) {
	return RELEASE_COUNT_MARKERS.map(
		(marker) => `${marker}: ${counts[marker] ?? 0}`,
	);
}

function getCollectedSourceTexts(files) {
	return files.map((relPath) =>
		fs.readFileSync(path.join(process.cwd(), relPath), "utf8"),
	);
}

function printReleaseCounts(files) {
	console.log("Known-gap marker count evidence:");
	for (const line of formatLiteralMarkerCounts(
		getLiteralMarkerCounts(getCollectedSourceTexts(files)),
	)) {
		console.log(line);
	}
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
			: "file" in entry && "line" in entry
				? `${entry.file}:${entry.line}: ${entry.message}`
				: entry.message,
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
	const args = process.argv.slice(2);
	const release = args.includes("--release");
	const writeReleaseNotes = args.includes("--write-release-notes");
	const checkReleaseNotes = args.includes("--check-release-notes");
	const files = collectTestSourceFiles(process.cwd());
	const proseProblems = scanCollectedTestSources(process.cwd());
	const runnerPolicy = scanCollectedRunnerPolicy(process.cwd());
	const problems = [...proseProblems, ...runnerPolicy.problems];
	const manifestState = readManifestAndPackage(release, runnerPolicy.markers);
	problems.push(...manifestState.problems);

	if (writeReleaseNotes || checkReleaseNotes) {
		const releaseNotes = fs.existsSync(RELEASE_NOTES_PATH)
			? fs.readFileSync(RELEASE_NOTES_PATH, "utf8")
			: "";
		if (writeReleaseNotes) {
			const block = buildKnownLimitationsBlock(
				manifestState.records,
				manifestState.packageVersion,
			);
			fs.writeFileSync(
				RELEASE_NOTES_PATH,
				replaceKnownLimitationsBlock(releaseNotes, block),
			);
		} else {
			problems.push(
				...validateKnownLimitationsBlock(
					releaseNotes,
					manifestState.records,
					manifestState.packageVersion,
				),
			);
		}
	}

	if (release) {
		printReleaseCounts(files);
	}

	if (problems.length > 0) {
		fail(problems);
		return 1;
	}

	console.log(
		`\n✓ KNOWN-GAP GATE PASSED — ${files.length} collected test source file(s) scanned, ${runnerPolicy.markers.length} expected-failure marker(s) inventoried.\n`,
	);
	if (writeReleaseNotes) {
		console.log(`✓ RELEASE_NOTES.md known limitations block written.`);
	}
	if (checkReleaseNotes) {
		console.log(`✓ RELEASE_NOTES.md known limitations block is current.`);
	}
	return 0;
}

// Only run when invoked directly, so the module can be imported by tests.
if (
	process.argv[1] !== undefined &&
	import.meta.url.endsWith(path.basename(process.argv[1]))
) {
	process.exitCode = main();
}
