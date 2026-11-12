// SC3 / D-08 / STY-05: the shared-fixture coupling control.
//
// The claim: src/renderer/story_support/process_outcomes.ts is ONE fixture module that
// the stories and the renderer tests both import, so corrupting one field of it turns a
// story test AND a renderer test red. Without this control the stories and the tests
// could each keep a private copy of the expectation and drift together unnoticed (the
// "check passing while inspecting something adjacent" failure).
//
// How: every case copies the fixture into a realpath'd mkdtemp dir, edits one field of
// one `actions` entry in the copy (a typescript-AST-located edit, never a string
// search), and runs a NESTED vitest whose only difference from the normal run is one
// resolve.alias entry that sends the fixture's import specifier to the copy. The real
// file is never written: its sha256 and `git status --porcelain` are asserted equal
// before and after every case, and so are three whole directories nothing else writes
// (the story_support dir, the ErrorExpansion/MetadataExpansion stories' dir and
// tests/renderer, where a `__screenshots__` dir would appear if a failing browser run
// wrote one; `screenshotFailures` is switched off in the tmp config).
//
// Three mutations (each edits a field inside one case's `actions`, the only part
// `entryFor` folds; `removeResult` alone is never edited, because editing it leaves
// every story and file_row test green, W-9):
//   2. `detail` of the UPDATE_FILE_ERROR action of FAILURE_CASES.cleanup
//      -> a file_row.test.ts cleanup test goes red (renderer side) AND the
//      ErrorExpansion Cleanup story goes red (story side);
//   3. `afterMetadata` of the UPDATE_FILE_METADATA action of OUTCOME_CASES.cleaned
//      gains a `tag2` property (so the removed and still-present counts change; a
//      value-only edit would leave every count literal green)
//      -> the composed Mixed test of metadata_expansion_i18n.test.ts AND the
//      MetadataExpansion Mixed story go red;
//   4. `failureKind` of the UPDATE_FILE_ERROR action of FAILURE_CASES.verification
//      becomes "write" -> the file_row verification summary test goes red.
//
// Documented asymmetry (RESEARCH C3, D-08 as refined): mutation 4 has NO story side.
// `verification` carries no residualPath, so `errorTextFor` and every ErrorExpansion
// story (which takes only a string) stay unchanged: the stories may stay green while
// the renderer test goes red. That is expected, not a vacuous control.
//
// The fixture builds FAILURE_CASES.cleanup and .verification through a helper
// (`failure(kind, detail, residualPath)`), so for those two the edit lands on the call
// argument that the helper copies into the action field; `locateMutation` proves that
// by resolving the helper's action field back to the parameter. The target is always
// the action field `entryFor` folds. The argument also feeds `removeResult`, which
// `entryFor` does not fold, so use_process_files.test.ts (which compares the action the
// hook builds from `removeResult` with the case's own action) may stay green: it is
// not required to go red here.
//
// Route (D-08): STORY_ROUTE is "nested-browser": the story side runs the
// storybook-light project (one theme: the coupling is theme-independent, and one
// theme halves the nested cost) limited to the two story files. S-2 (72-01) proved the
// nested route works and V-answers carries no `no-nested-browser`. Under
// `no-nested-browser` or a failed S-2 the story side would instead run the root config
// filtered with `-t "composed"` through the same redirect (the node-composed story
// tests of 72-03); that fallback is not active and is not coded here.
//
// Why the redirect is a RegExp (B-1): Vite's alias plugin tests a RegExp `find` against
// the raw import specifier, but matches a string key only when the specifier equals it
// or starts with the key plus `/`. An absolute-path key never matches the relative
// specifiers the consumers use, and tsconfig.json has no `paths`/`baseUrl`.
// `specifierProblems` proves FIXTURE_SPECIFIER matches every real consumer and no other
// story_support module, and the string-key rule over the absolute path is the negative
// control (one problem per consumer). The copy cannot keep its own relative imports
// (`../contexts/AppContext` does not resolve from a tmp dir), so `copyFixture` rewrites
// each to the absolute path of its original target; the copy then imports the same
// module ids every other importer gets (one AppContext module instance, one real
// appReducer).
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	realpathSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";
import { describe, expect, test } from "vitest";
import { assertDirEffect, snapshotDir } from "../tests/helpers/dir_effect";
import {
	FAILURE_CASES,
	OUTCOME_CASES,
	entryFor,
} from "../src/renderer/story_support/process_outcomes";
import { repoRoot } from "./catalog/temp_repo";

export const STORY_ROUTE = "nested-browser";

export const FIXTURE_REL = "src/renderer/story_support/process_outcomes.ts";
const FIXTURE_ABS = path.join(repoRoot, FIXTURE_REL);

// One RegExp, no flags (a `g` or `y` flag makes `test` stateful). It is the `find` of
// the only resolve.alias entry; Vite replaces the whole matched specifier with the
// entry's `replacement`, the absolute path of the tmp copy.
export const FIXTURE_SPECIFIER =
	/^(?:\.\.?\/)+(?:src\/renderer\/)?story_support\/process_outcomes(?:\.ts)?$/;

// --- consumers and the specifier matcher --------------------------------------

export type Specifier = { importer: string; specifier: string };

function compare(a: string, b: string): number {
	return a < b ? -1 : a > b ? 1 : 0;
}

function walkTs(dir: string): string[] {
	const out: string[] = [];
	for (const name of readdirSync(dir)) {
		const absolute = path.join(dir, name);
		if (statSync(absolute).isDirectory()) {
			out.push(...walkTs(absolute));
			continue;
		}
		if (absolute.endsWith(".ts") || absolute.endsWith(".tsx")) {
			out.push(absolute);
		}
	}
	return out;
}

function specifiersOf(text: string): string[] {
	return [
		...text.matchAll(/\bfrom\s+["']([^"']+)["']/g),
		...text.matchAll(/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g),
		...text.matchAll(/^import\s+["']([^"']+)["']/gm),
	].map((match) => match[1] ?? "");
}

function resolvesTo(importerAbs: string, specifier: string): string | null {
	const base = path.resolve(path.dirname(importerAbs), specifier);
	for (const candidate of [
		base,
		`${base}.ts`,
		`${base}.tsx`,
		path.join(base, "index.ts"),
		path.join(base, "index.tsx"),
	]) {
		if (existsSync(candidate) && statSync(candidate).isFile()) {
			return candidate;
		}
	}
	return null;
}

const SUPPORT_DIR_ABS = path.join(repoRoot, "src/renderer/story_support");

// Every relative import of the fixture (`consumers`) and every relative import of
// another story_support module (`others`) in src/ and tests/.
export function fixtureConsumers(root: string): {
	consumers: Specifier[];
	others: Specifier[];
} {
	const files = [
		...walkTs(path.join(root, "src")),
		...walkTs(path.join(root, "tests")),
	];
	// Anti-vacuity: the walk saw production code and tests.
	if (files.length < 100) {
		throw new Error(`fixtureConsumers walked only ${files.length} files`);
	}
	const fixtureAbs = path.join(root, FIXTURE_REL);
	const supportDirAbs = path.join(root, "src/renderer/story_support");
	const consumers: Specifier[] = [];
	const others: Specifier[] = [];
	for (const absolute of files) {
		const importer = path.relative(root, absolute).split(path.sep).join("/");
		for (const specifier of specifiersOf(readFileSync(absolute, "utf8"))) {
			if (!specifier.startsWith(".")) continue;
			const target = resolvesTo(absolute, specifier);
			if (target === fixtureAbs) {
				consumers.push({ importer, specifier });
			} else if (
				target !== null &&
				target.startsWith(`${supportDirAbs}${path.sep}`)
			) {
				others.push({ importer, specifier });
			}
		}
	}
	return { consumers, others };
}

export function specifierProblems(
	consumers: readonly Specifier[],
	others: readonly Specifier[],
	matches: (specifier: string) => boolean,
): string[] {
	const problems: string[] = [];
	for (const { importer, specifier } of consumers) {
		if (!matches(specifier)) {
			problems.push(
				`consumer ${importer} imports ${specifier}, which the alias does not match`,
			);
		}
	}
	for (const { importer, specifier } of others) {
		if (matches(specifier)) {
			problems.push(
				`${importer} imports ${specifier}, which the alias wrongly matches`,
			);
		}
	}
	return problems.sort(compare);
}

// --- the mutation locator ------------------------------------------------------

export type Mutation = {
	id: string;
	record: "FAILURE_CASES" | "OUTCOME_CASES";
	key: string;
	actionType: string;
	field: string;
	// Replaces the located span (the field's initializer, or the helper-call argument
	// that feeds it). `hint` is the value text of `insert.name` in the sibling field.
	edit: (original: string, hint: string | undefined) => string;
	// When set, the edited field is an object literal that gains `name`, valued as in
	// the same action's `valueField` object.
	insert?: { name: string; valueField: string };
};

export const MUTATIONS: readonly Mutation[] = [
	{
		id: "detail",
		record: "FAILURE_CASES",
		key: "cleanup",
		actionType: "UPDATE_FILE_ERROR",
		field: "detail",
		edit: (original) =>
			`${original.slice(0, -1)} (mutated)${original.slice(-1)}`,
	},
	{
		id: "afterMetadata",
		record: "OUTCOME_CASES",
		key: "cleaned",
		actionType: "UPDATE_FILE_METADATA",
		field: "afterMetadata",
		insert: { name: "tag2", valueField: "beforeMetadata" },
		edit: (original, hint) =>
			`${original.replace(/\s*\}\s*$/, "")}, tag2: ${hint ?? '"v"'} }`,
	},
	{
		id: "failureKind",
		record: "FAILURE_CASES",
		key: "verification",
		actionType: "UPDATE_FILE_ERROR",
		field: "failureKind",
		edit: () => '"write"',
	},
];

export type Located = {
	start: number;
	end: number;
	original: string;
	// The string value when the located node is a string literal.
	value: string | undefined;
	// The initializer text of insert.name in the sibling object, when insert is set.
	hint: string | undefined;
};

function unwrap(node: ts.Expression): ts.Expression {
	let current = node;
	while (
		ts.isParenthesizedExpression(current) ||
		ts.isAsExpression(current) ||
		ts.isSatisfiesExpression(current)
	) {
		current = current.expression;
	}
	return current;
}

function propName(name: ts.PropertyName): string | undefined {
	if (ts.isIdentifier(name) || ts.isStringLiteral(name)) return name.text;
	return undefined;
}

function property(
	object: ts.ObjectLiteralExpression,
	name: string,
): ts.ObjectLiteralElementLike | undefined {
	return object.properties.find(
		(member) =>
			(ts.isPropertyAssignment(member) ||
				ts.isShorthandPropertyAssignment(member)) &&
			propName(member.name) === name,
	);
}

function stringValue(node: ts.Node | undefined): string | undefined {
	return node !== undefined && ts.isStringLiteral(node) ? node.text : undefined;
}

// The object literals of an `actions` array whose `type` is the string `actionType`.
function actionsWithType(
	actions: ts.Expression | undefined,
	actionType: string,
): ts.ObjectLiteralExpression[] {
	if (actions === undefined) return [];
	const array = unwrap(actions);
	if (!ts.isArrayLiteralExpression(array)) return [];
	const found: ts.ObjectLiteralExpression[] = [];
	for (const element of array.elements) {
		const object = unwrap(element);
		if (!ts.isObjectLiteralExpression(object)) continue;
		const type = property(object, "type");
		if (
			type !== undefined &&
			ts.isPropertyAssignment(type) &&
			stringValue(type.initializer) === actionType
		) {
			found.push(object);
		}
	}
	return found;
}

function topLevelInitializer(
	sf: ts.SourceFile,
	name: string,
): ts.Expression | undefined {
	for (const statement of sf.statements) {
		if (!ts.isVariableStatement(statement)) continue;
		for (const declaration of statement.declarationList.declarations) {
			if (
				ts.isIdentifier(declaration.name) &&
				declaration.name.text === name &&
				declaration.initializer !== undefined
			) {
				return unwrap(declaration.initializer);
			}
		}
	}
	return undefined;
}

function topLevelFunction(
	sf: ts.SourceFile,
	name: string,
): ts.FunctionDeclaration | undefined {
	return sf.statements.find(
		(statement): statement is ts.FunctionDeclaration =>
			ts.isFunctionDeclaration(statement) && statement.name?.text === name,
	);
}

// The object literal a helper function returns.
function returnedObject(
	fn: ts.FunctionDeclaration,
): ts.ObjectLiteralExpression | undefined {
	let found: ts.ObjectLiteralExpression | undefined;
	const visit = (node: ts.Node): void => {
		if (
			ts.isReturnStatement(node) &&
			node.expression !== undefined &&
			found === undefined
		) {
			const expression = unwrap(node.expression);
			if (ts.isObjectLiteralExpression(expression)) found = expression;
		}
		if (!ts.isFunctionLike(node) || node === fn) ts.forEachChild(node, visit);
	};
	visit(fn);
	return found;
}

export function locateMutation(
	sourceText: string,
	mutation: Mutation,
): Located {
	const sf = ts.createSourceFile(
		"process_outcomes.ts",
		sourceText,
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.TS,
	);
	const notFound = `mutation target ${mutation.id} not found`;
	const record = topLevelInitializer(sf, mutation.record);
	if (record === undefined || !ts.isObjectLiteralExpression(record)) {
		throw new Error(notFound);
	}
	const entry = property(record, mutation.key);
	if (entry === undefined || !ts.isPropertyAssignment(entry)) {
		throw new Error(notFound);
	}
	const init = unwrap(entry.initializer);

	// The nodes that carry the edited field, one per matching action.
	const targets: { node: ts.Node; sibling: ts.ObjectLiteralExpression }[] = [];
	if (ts.isObjectLiteralExpression(init)) {
		// A case written out as an object literal: the field of the action itself.
		const actions = property(init, "actions");
		const list =
			actions !== undefined && ts.isPropertyAssignment(actions)
				? actionsWithType(actions.initializer, mutation.actionType)
				: [];
		for (const action of list) {
			const field = property(action, mutation.field);
			if (field !== undefined && ts.isPropertyAssignment(field)) {
				targets.push({ node: field.initializer, sibling: action });
			}
		}
	} else if (ts.isCallExpression(init) && ts.isIdentifier(init.expression)) {
		// A case built by a helper: resolve the helper's action field back to the
		// parameter it copies, and edit the call argument at that parameter's index.
		const helper = topLevelFunction(sf, init.expression.text);
		const returned = helper === undefined ? undefined : returnedObject(helper);
		const actions =
			returned === undefined ? undefined : property(returned, "actions");
		const list =
			actions !== undefined && ts.isPropertyAssignment(actions)
				? actionsWithType(actions.initializer, mutation.actionType)
				: [];
		for (const action of list) {
			const field = property(action, mutation.field);
			let identifier: string | undefined;
			if (field !== undefined && ts.isShorthandPropertyAssignment(field)) {
				identifier = field.name.text;
			} else if (
				field !== undefined &&
				ts.isPropertyAssignment(field) &&
				ts.isIdentifier(field.initializer)
			) {
				identifier = field.initializer.text;
			}
			if (identifier === undefined || helper === undefined) continue;
			const index = helper.parameters.findIndex(
				(parameter) =>
					ts.isIdentifier(parameter.name) && parameter.name.text === identifier,
			);
			const argument = index < 0 ? undefined : init.arguments[index];
			if (argument !== undefined) {
				targets.push({ node: argument, sibling: action });
			}
		}
	}
	if (targets.length === 0) throw new Error(notFound);
	if (targets.length > 1) {
		throw new Error(`mutation target ${mutation.id} ambiguous`);
	}
	const target = targets[0];
	if (target === undefined) throw new Error(notFound);

	let hint: string | undefined;
	if (mutation.insert !== undefined) {
		const sibling = property(target.sibling, mutation.insert.valueField);
		const object =
			sibling !== undefined && ts.isPropertyAssignment(sibling)
				? unwrap(sibling.initializer)
				: undefined;
		const value =
			object !== undefined && ts.isObjectLiteralExpression(object)
				? property(object, mutation.insert.name)
				: undefined;
		if (value === undefined || !ts.isPropertyAssignment(value)) {
			throw new Error(notFound);
		}
		hint = value.initializer.getText(sf);
		const field = unwrap(target.node as ts.Expression);
		if (!ts.isObjectLiteralExpression(field)) throw new Error(notFound);
	}
	return {
		start: target.node.getStart(sf),
		end: target.node.getEnd(),
		original: target.node.getText(sf),
		value: stringValue(target.node),
		hint,
	};
}

// --- the tmp copy --------------------------------------------------------------

// Rewrites every relative specifier of the fixture (static import/export, dynamic
// import) to the absolute path of its original target and refuses a bare value
// import (it would resolve from the tmp dir).
export function rewriteRelativeImports(
	sourceText: string,
	fixturePath: string = FIXTURE_ABS,
): string {
	const sf = ts.createSourceFile(
		path.basename(fixturePath),
		sourceText,
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.TS,
	);
	const spans: { start: number; end: number; text: string }[] = [];
	const consider = (literal: ts.StringLiteral, typeOnly: boolean): void => {
		const specifier = literal.text;
		if (specifier.startsWith(".")) {
			const absolute = path.resolve(path.dirname(fixturePath), specifier);
			spans.push({
				start: literal.getStart(sf),
				end: literal.getEnd(),
				text: JSON.stringify(absolute),
			});
		} else if (!typeOnly) {
			throw new Error(
				`the fixture has a bare value import (${specifier}) that would resolve from the tmp dir`,
			);
		}
	};
	const visit = (node: ts.Node): void => {
		if (
			ts.isImportDeclaration(node) &&
			ts.isStringLiteral(node.moduleSpecifier)
		) {
			consider(node.moduleSpecifier, node.importClause?.isTypeOnly === true);
		} else if (
			ts.isExportDeclaration(node) &&
			node.moduleSpecifier !== undefined &&
			ts.isStringLiteral(node.moduleSpecifier)
		) {
			consider(node.moduleSpecifier, node.isTypeOnly);
		} else if (
			ts.isCallExpression(node) &&
			node.expression.kind === ts.SyntaxKind.ImportKeyword &&
			node.arguments[0] !== undefined &&
			ts.isStringLiteral(node.arguments[0])
		) {
			consider(node.arguments[0], false);
		}
		ts.forEachChild(node, visit);
	};
	visit(sf);
	let rewritten = sourceText;
	for (const span of spans.sort((a, b) => b.start - a.start)) {
		rewritten = `${rewritten.slice(0, span.start)}${span.text}${rewritten.slice(span.end)}`;
	}
	if (rewritten === sourceText) {
		throw new Error("the fixture has no relative import to rewrite");
	}
	// Nothing relative may remain.
	const left = specifiersOf(rewritten).filter((s) => s.startsWith("."));
	if (left.length > 0) {
		throw new Error(`relative specifiers remain: ${left.join(", ")}`);
	}
	return rewritten;
}

export function copyFixture(
	sourceText: string,
	mutation: Mutation | null,
	fixturePath: string = FIXTURE_ABS,
): string {
	const rewritten = rewriteRelativeImports(sourceText, fixturePath);
	if (mutation === null) return rewritten;
	const located = locateMutation(rewritten, mutation);
	const mutated = `${rewritten.slice(0, located.start)}${mutation.edit(located.original, located.hint)}${rewritten.slice(located.end)}`;
	if (mutated === rewritten) {
		throw new Error(`mutation ${mutation.id} did not change the fixture`);
	}
	return mutated;
}

// --- the nested run ------------------------------------------------------------

export type Side = "renderer" | "story";

const RENDERER_FILES = [
	"tests/renderer/file_row.test.ts",
	"tests/renderer/metadata_expansion_i18n.test.ts",
	"tests/renderer/use_process_files.test.ts",
];
const STORY_FILES = [
	"src/renderer/components/file-list/ErrorExpansion.stories.tsx",
	"src/renderer/components/file-list/MetadataExpansion.stories.tsx",
];
const TIMEOUT_MS = 100_000;

type Assertion = {
	fullName: string;
	title: string;
	status: string;
	file: string;
};
export type CaseResult = {
	status: number | null;
	total: number;
	failed: Assertion[];
	stderr: string;
	seconds: number;
};

function tmpConfigText(side: Side, copyPath: string, tmp: string): string {
	const alias = `[{ find: new RegExp(${JSON.stringify(FIXTURE_SPECIFIER.source)}), replacement: ${JSON.stringify(copyPath)} }]`;
	const common = `root: ${JSON.stringify(repoRoot)},
	cacheDir: ${JSON.stringify(path.join(tmp, "vite-cache"))},
	server: { fs: { allow: [${JSON.stringify(repoRoot)}, ${JSON.stringify(tmp)}] } },
	resolve: { alias: ${alias} },`;
	if (side === "renderer") {
		return `import base from ${JSON.stringify(path.join(repoRoot, "vitest.config.ts"))};
export default {
	...base,
	${common}
	test: { ...base.test, root: ${JSON.stringify(repoRoot)}, globalSetup: [] },
};
`;
	}
	return `import base from ${JSON.stringify(path.join(repoRoot, "vitest.storybook.config.ts"))};
const project = base.test.projects.find((p) => p.test.name === "storybook-light");
if (project === undefined) throw new Error("storybook-light project not found");
export default {
	...project,
	${common}
	test: {
		...project.test,
		root: ${JSON.stringify(repoRoot)},
		browser: { ...project.test.browser, screenshotFailures: false },
	},
};
`;
}

export function runCase({
	mutation,
	side,
}: {
	mutation: Mutation | null;
	side: Side;
}): CaseResult {
	const tmp = realpathSync(
		mkdtempSync(path.join(os.tmpdir(), "fixture-control-")),
	);
	try {
		const copyPath = path.join(tmp, "process_outcomes.ts");
		writeFileSync(
			copyPath,
			copyFixture(readFileSync(FIXTURE_ABS, "utf8"), mutation),
		);
		const configPath = path.join(tmp, "vitest.tmp.config.mjs");
		writeFileSync(configPath, tmpConfigText(side, copyPath, tmp));
		const reportPath = path.join(tmp, "report.json");
		const started = Date.now();
		const result = spawnSync(
			process.execPath,
			[
				path.join(repoRoot, "node_modules/vitest/vitest.mjs"),
				"run",
				"--config",
				configPath,
				"--reporter=json",
				`--outputFile=${reportPath}`,
				...(side === "renderer" ? RENDERER_FILES : STORY_FILES),
			],
			{
				cwd: repoRoot,
				encoding: "utf8",
				timeout: TIMEOUT_MS,
				env: {
					PATH: process.env["PATH"] ?? "",
					HOME: process.env["HOME"] ?? "",
					CI: "true",
					STORYBOOK_DISABLE_TELEMETRY: "true",
					NODE_OPTIONS: `--import=${pathToFileURL(path.join(repoRoot, ".storybook/network_guard.mjs")).href}`,
				},
			},
		);
		const seconds = Math.round((Date.now() - started) / 100) / 10;
		if (!existsSync(reportPath)) {
			throw new Error(
				`no vitest report (status ${result.status}): ${result.stderr.slice(-2000)}`,
			);
		}
		const report = JSON.parse(readFileSync(reportPath, "utf8")) as {
			numTotalTests: number;
			testResults: {
				name: string;
				assertionResults: {
					fullName: string;
					title: string;
					status: string;
				}[];
			}[];
		};
		const failed: Assertion[] = [];
		for (const file of report.testResults) {
			for (const assertion of file.assertionResults) {
				if (assertion.status === "failed") {
					failed.push({
						fullName: assertion.fullName,
						title: assertion.title,
						status: assertion.status,
						file: path.relative(repoRoot, file.name).split(path.sep).join("/"),
					});
				}
			}
		}
		return {
			status: result.status,
			total: report.numTotalTests,
			failed,
			stderr: result.stderr,
			seconds,
		};
	} finally {
		rmSync(tmp, { recursive: true, force: true });
	}
}

// --- the tests -----------------------------------------------------------------

function sha256(file: string): string {
	return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function gitStatus(): string {
	const result = spawnSync("git", ["status", "--porcelain"], {
		cwd: repoRoot,
		encoding: "utf8",
		env: { PATH: process.env["PATH"] ?? "", HOME: process.env["HOME"] ?? "" },
	});
	if (result.status !== 0) throw new Error(result.stderr);
	return result.stdout;
}

// The directories nothing else writes during a run: a nested run that wrote a
// screenshot, a cache or a fixture copy beside them would show up here.
const WATCHED_DIRS = [
	"src/renderer/story_support",
	"src/renderer/components/file-list",
	"tests/renderer",
];

// Whole-repository blast radius around one case.
function untouched<T>(run: () => T): T {
	const hashBefore = sha256(FIXTURE_ABS);
	const statusBefore = gitStatus();
	const dirsBefore = WATCHED_DIRS.map((dir) =>
		snapshotDir(path.join(repoRoot, dir)),
	);
	const result = run();
	expect(sha256(FIXTURE_ABS)).toBe(hashBefore);
	expect(gitStatus()).toBe(statusBefore);
	WATCHED_DIRS.forEach((dir, index) => {
		const before = dirsBefore[index];
		if (before === undefined) throw new Error(`no snapshot for ${dir}`);
		assertDirEffect(before, snapshotDir(path.join(repoRoot, dir)), {});
	});
	return result;
}

function failedIn(result: CaseResult, file: string, pattern: RegExp): string[] {
	return result.failed
		.filter((a) => a.file === file && pattern.test(a.fullName))
		.map((a) => a.fullName);
}

function expectRan(result: CaseResult): void {
	// A "no tests found" exit never counts.
	expect(result.total, result.stderr.slice(-1500)).toBeGreaterThan(0);
}

const FILE_ROW = "tests/renderer/file_row.test.ts";
const EXPANSION_TEST = "tests/renderer/metadata_expansion_i18n.test.ts";
const ERROR_STORIES =
	"src/renderer/components/file-list/ErrorExpansion.stories.tsx";
const METADATA_STORIES =
	"src/renderer/components/file-list/MetadataExpansion.stories.tsx";

function mutation(id: string): Mutation {
	const found = MUTATIONS.find((m) => m.id === id);
	if (found === undefined) throw new Error(`no mutation ${id}`);
	return found;
}

describe("fixture alias matcher (B-1)", () => {
	const real = fixtureConsumers(repoRoot);

	test("FIXTURE_SPECIFIER matches every real consumer specifier and no other story_support module", () => {
		expect(real.consumers.length).toBeGreaterThanOrEqual(4);
		const importers = real.consumers.map((c) => c.importer);
		for (const expected of [
			"src/renderer/components/file-list/ErrorExpansion.stories.tsx",
			"src/renderer/components/file-list/MetadataExpansion.stories.tsx",
			"tests/renderer/file_row.test.ts",
			"tests/renderer/use_process_files.test.ts",
		]) {
			expect(importers).toContain(expected);
		}
		expect(FIXTURE_SPECIFIER.flags).toBe("");
		expect(
			specifierProblems(real.consumers, real.others, (s) =>
				FIXTURE_SPECIFIER.test(s),
			),
		).toEqual([]);
		// Recorded as the Fixture alias line in 72-EVIDENCE.md.
		console.info(
			`Fixture alias (72-05): FIXTURE_SPECIFIER matched ${real.consumers.length} consumer specifiers`,
		);
	});

	test("the string-key rule over the absolute path matches no real consumer (negative control)", () => {
		const abs = FIXTURE_ABS.replace(/\.ts$/, "");
		const stringKey = (s: string): boolean =>
			s === abs || s.startsWith(`${abs}/`);
		const problems = specifierProblems(real.consumers, real.others, stringKey);
		expect(problems).toEqual(
			real.consumers
				.map(
					(c) =>
						`consumer ${c.importer} imports ${c.specifier}, which the alias does not match`,
				)
				.sort(compare),
		);
		console.info(
			`Fixture alias (72-05): string-key control ${problems.length} problems`,
		);
	});

	test("a planted sibling story_support import is not matched, and a too-wide matcher is reported", () => {
		expect(FIXTURE_SPECIFIER.test("../story_support/known_a11y")).toBe(false);
		expect(FIXTURE_SPECIFIER.test("../story_support/process_outcomes")).toBe(
			true,
		);
		expect(FIXTURE_SPECIFIER.test("./process_outcomes")).toBe(false);
		const planted = [
			{ importer: "x.stories.tsx", specifier: "../story_support/known_a11y" },
		];
		expect(
			specifierProblems([], planted, (s) => FIXTURE_SPECIFIER.test(s)),
		).toEqual([]);
		expect(
			specifierProblems([], planted, (s) => s.includes("story_support")),
		).toEqual([
			"x.stories.tsx imports ../story_support/known_a11y, which the alias wrongly matches",
		]);
	});
});

describe("mutation locator (W-9)", () => {
	const source = readFileSync(FIXTURE_ABS, "utf8");

	test("each mutation resolves to the action field entryFor folds (fold pre-check)", () => {
		const detail = locateMutation(source, mutation("detail"));
		expect(detail.value).toBe(entryFor(FAILURE_CASES.cleanup).detail);
		expect(entryFor(FAILURE_CASES.verification).failureKind).toBe(
			"verification",
		);
		expect(locateMutation(source, mutation("failureKind")).value).toBe(
			"verification",
		);
		expect(
			Object.keys(entryFor(OUTCOME_CASES.cleaned).afterMetadata ?? {}),
		).not.toContain("tag2");
		const after = locateMutation(source, mutation("afterMetadata"));
		expect(after.original).toContain("tag1");
		expect(after.hint).toBe('"v"');
	});

	test("every mutation changes the rewritten copy, and a planted removeResult path is not found", () => {
		for (const m of MUTATIONS) {
			const copy = copyFixture(source, m);
			expect(copy, m.id).not.toBe(copyFixture(source, null));
		}
		const messages: string[] = [];
		for (const planted of [
			{
				...mutation("detail"),
				id: "removeResult-field",
				field: "removeResult",
			},
			{
				...mutation("detail"),
				id: "removeResult-type",
				actionType: "removeResult",
			},
			{ ...mutation("detail"), id: "missing-key", key: "nope" },
		]) {
			try {
				locateMutation(source, planted);
			} catch (error) {
				messages.push((error as Error).message);
			}
		}
		expect(messages).toEqual([
			"mutation target removeResult-field not found",
			"mutation target removeResult-type not found",
			"mutation target missing-key not found",
		]);
	});

	test("two matching actions are ambiguous, an object-literal case resolves directly", () => {
		const two = `export const FAILURE_CASES = { a: { actions: [
			{ type: "X", detail: "one" },
			{ type: "X", detail: "two" },
		] } };`;
		const m: Mutation = {
			id: "planted",
			record: "FAILURE_CASES",
			key: "a",
			actionType: "X",
			field: "detail",
			edit: (o) => o,
		};
		expect(() => locateMutation(two, m)).toThrow(
			"mutation target planted ambiguous",
		);
		const one = `export const FAILURE_CASES = { a: { actions: [
			{ type: "X", detail: "one" },
			{ type: "Y", detail: "other" },
		] } };`;
		expect(locateMutation(one, m).value).toBe("one");
	});
});

describe("fixture copy (B-1)", () => {
	test("the copy has no relative import and keeps every original target", () => {
		const copy = copyFixture(readFileSync(FIXTURE_ABS, "utf8"), null);
		expect(specifiersOf(copy).filter((s) => s.startsWith("."))).toEqual([]);
		expect(copy).toContain(
			JSON.stringify(path.join(repoRoot, "src/renderer/contexts/AppContext")),
		);
		expect(copy).toContain(JSON.stringify(path.join(repoRoot, "src/domain")));
	});

	test("a bare value import is refused", () => {
		expect(() =>
			rewriteRelativeImports(
				'import x from "left-pad";\nexport { x };',
				FIXTURE_ABS,
			),
		).toThrow("bare value import");
		expect(() => rewriteRelativeImports("export const a = 1;")).toThrow(
			"no relative import",
		);
	});
});

describe("shared-fixture coupling (SC3, D-08)", () => {
	test("unmutated, renderer side: exit 0 and every test passes (anti-vacuity)", () => {
		const result = untouched(() =>
			runCase({ mutation: null, side: "renderer" }),
		);
		expectRan(result);
		expect(result.failed.map((f) => f.fullName)).toEqual([]);
		expect(result.status).toBe(0);
		console.info(`Fixture control: unmutated renderer ${result.seconds}s`);
	});

	test("unmutated, story side: exit 0 and every story passes (anti-vacuity)", () => {
		const result = untouched(() => runCase({ mutation: null, side: "story" }));
		expectRan(result);
		expect(result.failed.map((f) => f.fullName)).toEqual([]);
		expect(result.status).toBe(0);
		console.info(`Fixture control: unmutated story ${result.seconds}s`);
	});

	test("detail of the cleanup UPDATE_FILE_ERROR action: a file_row cleanup test goes red", () => {
		const result = untouched(() =>
			runCase({ mutation: mutation("detail"), side: "renderer" }),
		);
		expectRan(result);
		expect(result.status).not.toBe(0);
		expect(failedIn(result, FILE_ROW, /cleanup/i).length).toBeGreaterThan(0);
		console.info(
			`Fixture control: detail renderer red: ${JSON.stringify(result.failed.map((f) => `${f.file}: ${f.fullName}`))}`,
		);
	});

	test("detail of the cleanup UPDATE_FILE_ERROR action: the ErrorExpansion Cleanup story goes red", () => {
		const result = untouched(() =>
			runCase({ mutation: mutation("detail"), side: "story" }),
		);
		expectRan(result);
		expect(result.status).not.toBe(0);
		expect(failedIn(result, ERROR_STORIES, /Cleanup/).length).toBeGreaterThan(
			0,
		);
		console.info(
			`Fixture control: detail story red: ${JSON.stringify(result.failed.map((f) => `${f.file}: ${f.fullName}`))}`,
		);
	});

	test("afterMetadata of the cleaned UPDATE_FILE_METADATA action: the composed Mixed test goes red", () => {
		const result = untouched(() =>
			runCase({ mutation: mutation("afterMetadata"), side: "renderer" }),
		);
		expectRan(result);
		expect(result.status).not.toBe(0);
		expect(failedIn(result, EXPANSION_TEST, /Mixed/).length).toBeGreaterThan(0);
		console.info(
			`Fixture control: afterMetadata renderer red: ${JSON.stringify(result.failed.map((f) => `${f.file}: ${f.fullName}`))}`,
		);
	});

	test("afterMetadata of the cleaned UPDATE_FILE_METADATA action: the MetadataExpansion Mixed story goes red", () => {
		const result = untouched(() =>
			runCase({ mutation: mutation("afterMetadata"), side: "story" }),
		);
		expectRan(result);
		expect(result.status).not.toBe(0);
		expect(failedIn(result, METADATA_STORIES, /Mixed/).length).toBeGreaterThan(
			0,
		);
		console.info(
			`Fixture control: afterMetadata story red: ${JSON.stringify(result.failed.map((f) => `${f.file}: ${f.fullName}`))}`,
		);
	});

	test("failureKind of the verification UPDATE_FILE_ERROR action: the file_row verification summary test goes red (no story side: C3)", () => {
		const result = untouched(() =>
			runCase({ mutation: mutation("failureKind"), side: "renderer" }),
		);
		expectRan(result);
		expect(result.status).not.toBe(0);
		expect(
			failedIn(result, FILE_ROW, /verification failure summary/).length,
		).toBeGreaterThan(0);
		console.info(
			`Fixture control: failureKind renderer red: ${JSON.stringify(result.failed.map((f) => `${f.file}: ${f.fullName}`))}`,
		);
	});
});
