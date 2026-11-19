import fs from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, test } from "vitest";
import { cssDeclarations } from "../../../.storybook/catalog/css_scan.mjs";
import { assertDirEffect, snapshotDir } from "../../helpers/dir_effect";

// RTL-02 / D-11: no physical-direction declaration may enter the renderer stylesheets or a
// TSX style prop unless it is in a reasoned allow-list. The renderer sets
// `document.documentElement.dir` (rtl for ar and fa), so `left`, `right`, a left or right
// margin, padding or border, `text-align: left|right` and `translateX(` all mean "the
// physical side", which is the wrong side in a right-to-left layout. Logical properties
// (`inset-inline-start`, `margin-inline-start`, `text-align: start|end`) mean "the reading
// side" and are what a contributor should write.
//
// Every hit has exactly one of two dispositions: convert it, or list it in
// physical_direction_allow.json with a reason. A hit is keyed by file, selector chain,
// property and value, never by line number, so an unrelated edit does not move it; an
// allow-list entry that no longer matches a hit is red (stale); the exact entry count is
// pinned below, so growing the list takes a visible edit of this file (T-76-11).
//
// The scan reads the files itself, and the anti-vacuity test compares what it read with an
// independent directory listing, so a scanner that silently skipped a file is red.
// The shorthand tokenizer is a single pass over parenthesis depth (T-76-13).

const REPO = fileURLToPath(new URL("../../..", import.meta.url));
const STYLES_DIR = "src/renderer/styles";
const RENDERER_DIR = "src/renderer";

// `left` and `right` as properties, the margin, padding and border side forms (including
// `border-left-width` and the like), all in kebab case.
const PHYSICAL_PROPERTY =
	/^(?:left|right|(?:margin|padding)-(?:left|right)|border-(?:left|right)(?:-[a-z-]+)?)$/;

// Top-level whitespace tokens of a CSS value: a `var(--a, 8px)` or `calc(1px + 2px)` is
// one token, whatever it contains.
function splitTopLevel(value: string): string[] {
	const tokens: string[] = [];
	let depth = 0;
	let current = "";
	for (const char of value) {
		if (char === "(") depth += 1;
		else if (char === ")" && depth > 0) depth -= 1;
		if (depth === 0 && /\s/.test(char)) {
			if (current !== "") tokens.push(current);
			current = "";
		} else {
			current += char;
		}
	}
	if (current !== "") tokens.push(current);
	return tokens;
}

// A four-value `margin` or `padding` reads top, right, bottom, left: it is physical when
// the right and the left differ (equal sides are the same in both directions).
function hasUnequalSides(property: string, value: string): boolean {
	if (property !== "margin" && property !== "padding") return false;
	const tokens = splitTopLevel(value.replace(/!important\s*$/i, "").trim());
	if (tokens.length !== 4) return false;
	const right = tokens[1] ?? "";
	const left = tokens[3] ?? "";
	const customPropertyNames = (token: string): string[] =>
		Array.from(
			token.matchAll(/var\(\s*(--(?:[^\s,)\\]|\\.)+)/gi),
			(match) => match[1] ?? "",
		);
	const rightCustomProperties = customPropertyNames(right);
	const leftCustomProperties = customPropertyNames(left);
	return (
		right.toLowerCase() !== left.toLowerCase() ||
		rightCustomProperties.some(
			(name, index) => name !== leftCustomProperties[index],
		) ||
		rightCustomProperties.length !== leftCustomProperties.length
	);
}

function isPhysical(propertyName: string, rawValue: string): boolean {
	const property = propertyName.trim().toLowerCase();
	const value = rawValue
		.replace(/!important\s*$/i, "")
		.trim()
		.toLowerCase();
	if (PHYSICAL_PROPERTY.test(property)) return true;
	if (property === "text-align" && (value === "left" || value === "right")) {
		return true;
	}
	if (/translatex\s*\(/i.test(rawValue)) return true;
	return hasUnequalSides(property, rawValue);
}

function physicalHits({ file, css }: { file: string; css: string }): string[] {
	return cssDeclarations(css)
		.filter((declaration) =>
			isPhysical(declaration.property, declaration.value),
		)
		.map(
			(declaration) =>
				`${file}|${declaration.selectors.join(" ")}|${declaration.property}|${declaration.value}`,
		);
}

function kebab(name: string): string {
	return name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

function propertyKey(name: ts.PropertyName): string | null {
	if (
		ts.isIdentifier(name) ||
		ts.isStringLiteral(name) ||
		ts.isNoSubstitutionTemplateLiteral(name)
	) {
		return name.text;
	}
	if (
		ts.isComputedPropertyName(name) &&
		ts.isStringLiteralLike(name.expression)
	) {
		return name.expression.text;
	}
	// A dynamic computed or numeric key cannot be named as a CSS property here.
	return null;
}

function tagNameOf(node: ts.Node): string {
	let current: ts.Node | undefined = node.parent;
	while (current !== undefined) {
		if (
			ts.isJsxOpeningElement(current) ||
			ts.isJsxSelfClosingElement(current)
		) {
			return current.tagName.getText();
		}
		current = current.parent;
	}
	return "?";
}

// TS/TSX style objects, read from the AST (never a regex over the text, so comparator
// parameters named left and right are not hits). The checker follows a JSX style reference
// to its object initializer, including an imported initializer in a shared .ts style module;
// CSSProperties-typed objects remain scanned without a JSX reference.
type StyleSource = { file: string; text: string };

function physicalStyleHitsInSources(sources: StyleSource[]): string[] {
	const sourceByPath = new Map<string, ts.SourceFile>();
	for (const { file, text } of sources) {
		const absolute = path.resolve(REPO, file);
		const scriptKind = file.endsWith(".tsx")
			? ts.ScriptKind.TSX
			: ts.ScriptKind.TS;
		sourceByPath.set(
			absolute,
			ts.createSourceFile(
				absolute,
				text,
				ts.ScriptTarget.Latest,
				true,
				scriptKind,
			),
		);
	}

	const options: ts.CompilerOptions = {
		jsx: ts.JsxEmit.Preserve,
		module: ts.ModuleKind.ESNext,
		moduleResolution: ts.ModuleResolutionKind.NodeJs,
		target: ts.ScriptTarget.Latest,
		noEmit: true,
		noLib: true,
		types: [],
	};
	const host = ts.createCompilerHost(options);
	const originalGetSourceFile = host.getSourceFile.bind(host);
	const originalFileExists = host.fileExists.bind(host);
	const originalReadFile = host.readFile.bind(host);
	host.getSourceFile = (
		fileName,
		languageVersion,
		onError,
		shouldCreateNewSourceFile,
	) =>
		sourceByPath.get(path.resolve(fileName)) ??
		originalGetSourceFile(
			fileName,
			languageVersion,
			onError,
			shouldCreateNewSourceFile,
		);
	host.fileExists = (fileName) =>
		sourceByPath.has(path.resolve(fileName)) || originalFileExists(fileName);
	host.readFile = (fileName) =>
		sourceByPath.get(path.resolve(fileName))?.text ??
		originalReadFile(fileName);
	host.resolveModuleNames = (moduleNames, containingFile) =>
		moduleNames.map((moduleName) => {
			const base = moduleName.startsWith(".")
				? path.resolve(path.dirname(containingFile), moduleName)
				: path.resolve(REPO, "src/renderer", moduleName);
			const candidates = [
				base,
				base + ".ts",
				base + ".tsx",
				base + ".d.ts",
				path.join(base, "index.ts"),
				path.join(base, "index.tsx"),
			];
			const resolved = candidates.find((candidate) =>
				sourceByPath.has(candidate),
			);
			if (resolved === undefined) return undefined;
			const extension = resolved.endsWith(".tsx")
				? ts.Extension.Tsx
				: resolved.endsWith(".d.ts")
					? ts.Extension.Dts
					: ts.Extension.Ts;
			return { resolvedFileName: resolved, extension };
		});

	const program = ts.createProgram({
		rootNames: [...sourceByPath.keys()],
		options,
		host,
	});
	const checker = program.getTypeChecker();
	const keys: string[] = [];
	const unwrap = (expression: ts.Expression): ts.Expression => {
		while (
			ts.isParenthesizedExpression(expression) ||
			ts.isAsExpression(expression) ||
			ts.isTypeAssertionExpression(expression) ||
			ts.isNonNullExpression(expression) ||
			ts.isSatisfiesExpression(expression)
		) {
			expression = expression.expression;
		}
		return expression;
	};
	const referencedStyleExpression = (
		expression: ts.Expression,
	): { expression: ts.Expression; owner: string; symbol: ts.Symbol } | null => {
		const target = unwrap(expression);
		const symbolNode = ts.isPropertyAccessExpression(target)
			? target.name
			: target;
		let symbol = checker.getSymbolAtLocation(symbolNode);
		if (symbol && (symbol.flags & ts.SymbolFlags.Alias) !== 0) {
			symbol = checker.getAliasedSymbol(symbol);
		}
		if (symbol === undefined) return null;
		for (const declaration of symbol.declarations ?? []) {
			if (
				ts.isVariableDeclaration(declaration) &&
				declaration.initializer !== undefined
			) {
				return {
					expression: unwrap(declaration.initializer),
					owner: "css:" + declaration.name.getText(declaration.getSourceFile()),
					symbol,
				};
			}
			if (ts.isPropertyAssignment(declaration)) {
				return {
					expression: unwrap(declaration.initializer),
					owner: "css:" + declaration.name.getText(declaration.getSourceFile()),
					symbol,
				};
			}
		}
		return null;
	};
	const collectStyleExpression = (
		expression: ts.Expression,
		owner: string,
		source: ts.SourceFile,
		objectAncestors = new Set<ts.ObjectLiteralExpression>(),
		symbolAncestors = new Set<ts.Symbol>(),
		unresolvedKind: "style-expression" | "style-spread" = "style-expression",
	): void => {
		const target = unwrap(expression);
		if (ts.isObjectLiteralExpression(target)) {
			collect(target, owner, objectAncestors);
			return;
		}
		if (ts.isConditionalExpression(target)) {
			collectStyleExpression(
				target.whenTrue,
				owner,
				target.getSourceFile(),
				objectAncestors,
				symbolAncestors,
				unresolvedKind,
			);
			collectStyleExpression(
				target.whenFalse,
				owner,
				target.getSourceFile(),
				objectAncestors,
				symbolAncestors,
				unresolvedKind,
			);
			return;
		}
		if (ts.isBinaryExpression(target)) {
			const operator = target.operatorToken.kind;
			if (operator === ts.SyntaxKind.AmpersandAmpersandToken) {
				collectStyleExpression(
					target.right,
					owner,
					target.getSourceFile(),
					objectAncestors,
					symbolAncestors,
					unresolvedKind,
				);
				return;
			}
			if (
				operator === ts.SyntaxKind.BarBarToken ||
				operator === ts.SyntaxKind.QuestionQuestionToken
			) {
				collectStyleExpression(
					target.left,
					owner,
					target.getSourceFile(),
					objectAncestors,
					symbolAncestors,
					unresolvedKind,
				);
				collectStyleExpression(
					target.right,
					owner,
					target.getSourceFile(),
					objectAncestors,
					symbolAncestors,
					unresolvedKind,
				);
				return;
			}
		}
		if (
			target.kind === ts.SyntaxKind.NullKeyword ||
			target.kind === ts.SyntaxKind.FalseKeyword ||
			(ts.isIdentifier(target) && target.text === "undefined")
		) {
			return;
		}
		const referenced = referencedStyleExpression(target);
		if (referenced !== null) {
			if (symbolAncestors.has(referenced.symbol)) {
				const file = path
					.relative(REPO, target.getSourceFile().fileName)
					.split(path.sep)
					.join("/");
				keys.push(
					`${file}|${owner}|<cyclic-style-expression>|${target.getText(target.getSourceFile())}`,
				);
				return;
			}
			const nestedSymbols = new Set(symbolAncestors);
			nestedSymbols.add(referenced.symbol);
			collectStyleExpression(
				referenced.expression,
				referenced.owner,
				referenced.expression.getSourceFile(),
				objectAncestors,
				nestedSymbols,
				unresolvedKind,
			);
			return;
		}
		const targetSource = target.getSourceFile() ?? source;
		const file = path
			.relative(REPO, targetSource.fileName)
			.split(path.sep)
			.join("/");
		const expressionText = target.getText(targetSource).replace(/\s+/g, " ");
		keys.push(
			`${file}|${owner}|<unresolved-${unresolvedKind}>|${expressionText}`,
		);
	};
	const collect = (
		object: ts.ObjectLiteralExpression,
		owner: string,
		ancestors = new Set<ts.ObjectLiteralExpression>(),
	): void => {
		const source = object.getSourceFile();
		const file = path.relative(REPO, source.fileName).split(path.sep).join("/");
		if (ancestors.has(object)) {
			keys.push(
				`${file}|${owner}|<cyclic-style-spread>|${object.getText(source)}`,
			);
			return;
		}
		const nestedAncestors = new Set(ancestors);
		nestedAncestors.add(object);
		for (const member of object.properties) {
			if (ts.isSpreadAssignment(member)) {
				collectStyleExpression(
					member.expression,
					owner,
					source,
					nestedAncestors,
					new Set(),
					"style-spread",
				);
				continue;
			}
			const raw = propertyKey(member.name);
			if (raw === null) {
				const unresolvedProperty = ts.isComputedPropertyName(member.name)
					? member.name.expression.getText(source)
					: member.name.getText(source);
				keys.push(
					`${file}|${owner}|<unresolved-style-property>|${unresolvedProperty}`,
				);
				continue;
			}
			if (raw.startsWith("--")) continue;
			const property = kebab(raw);
			let value: string;
			if (ts.isShorthandPropertyAssignment(member)) {
				value = member.name.text;
			} else if (ts.isPropertyAssignment(member)) {
				const initializer = member.initializer;
				value = ts.isStringLiteralLike(initializer)
					? initializer.text
					: initializer.getText(source).replace(/\s+/g, " ");
			} else {
				keys.push(
					`${file}|${owner}|<unresolved-style-property>|${member.name.getText(source)}`,
				);
				continue;
			}
			if (isPhysical(property, value)) {
				keys.push(file + "|" + owner + "|" + property + "|" + value);
			}
		}
	};

	const visit = (node: ts.Node, source: ts.SourceFile): void => {
		if (
			ts.isJsxAttribute(node) &&
			node.name.getText(source) === "style" &&
			node.initializer !== undefined &&
			ts.isJsxExpression(node.initializer) &&
			node.initializer.expression !== undefined
		) {
			collectStyleExpression(
				node.initializer.expression,
				"jsx:" + tagNameOf(node),
				source,
			);
		}
		if (
			ts.isVariableDeclaration(node) &&
			node.type !== undefined &&
			/CSSProperties$/.test(node.type.getText(source)) &&
			node.initializer !== undefined
		) {
			const initializer = unwrap(node.initializer);
			collectStyleExpression(
				initializer,
				"css:" + node.name.getText(source),
				source,
			);
		}
		ts.forEachChild(node, (child) => visit(child, source));
	};
	for (const source of sourceByPath.values()) visit(source, source);
	return [...new Set(keys)];
}

function physicalStyleHits({
	file,
	tsx,
}: {
	file: string;
	tsx: string;
}): string[] {
	return physicalStyleHitsInSources([{ file, text: tsx }]);
}
function walkFrom(
	absoluteDirectory: string,
	displayDirectory: string,
	extension: string,
): string[] {
	const found: string[] = [];
	for (const entry of fs.readdirSync(absoluteDirectory, {
		withFileTypes: true,
	})) {
		const absolute = path.join(absoluteDirectory, entry.name);
		const relative = `${displayDirectory}/${entry.name}`;
		if (entry.isDirectory()) {
			found.push(...walkFrom(absolute, relative, extension));
		} else if (entry.name.endsWith(extension)) {
			found.push(relative);
		}
	}
	return found.sort();
}

function walk(directory: string, extension: string): string[] {
	return walkFrom(path.join(REPO, directory), directory, extension);
}

function scanTree(): {
	cssFiles: string[];
	tsFiles: string[];
	tsxFiles: string[];
	keys: string[];
} {
	const cssFiles = walk(STYLES_DIR, ".css");
	const tsFiles = walk(RENDERER_DIR, ".ts");
	const tsxFiles = walk(RENDERER_DIR, ".tsx");
	const styleSources = [...tsFiles, ...tsxFiles].map((file) => ({
		file,
		text: fs.readFileSync(path.join(REPO, file), "utf8"),
	}));
	const keys = [
		...cssFiles.flatMap((file) =>
			physicalHits({
				file,
				css: fs.readFileSync(path.join(REPO, file), "utf8"),
			}),
		),
		...physicalStyleHitsInSources(styleSources),
	];
	return { cssFiles, tsFiles, tsxFiles, keys: [...new Set(keys)].sort() };
}

type AllowEntry = { key: string; reason: string };

function readAllowList(): AllowEntry[] {
	const document = JSON.parse(
		fs.readFileSync(
			path.join(REPO, "tests/renderer/gates/physical_direction_allow.json"),
			"utf8",
		),
	) as { entries: AllowEntry[] };
	return document.entries;
}

function unlisted(keys: string[], allowed: Set<string>): string[] {
	return keys.filter((key) => !allowed.has(key));
}

describe("RTL-02 physical-direction scan: the real tree", () => {
	const { cssFiles, tsFiles, tsxFiles, keys } = scanTree();
	const entries = readAllowList();
	const allowed = new Set(entries.map((entry) => entry.key));

	test("every hit is in the allow-list (convert it to a logical property or add a reasoned entry)", () => {
		expect(
			unlisted(keys, allowed),
			"unlisted physical-direction hits: write the logical property (inset-inline-start, margin-inline-start, text-align: start or end) or add a reasoned entry to tests/renderer/gates/physical_direction_allow.json",
		).toEqual([]);
	});

	test("no allow-list entry is stale (each still matches a hit)", () => {
		const hits = new Set(keys);
		expect(
			entries.map((entry) => entry.key).filter((key) => !hits.has(key)),
			"stale allow-list entries: the declaration was converted or removed, so delete the entry",
		).toEqual([]);
	});

	test("every entry has a reason, keys are unique and sorted", () => {
		for (const entry of entries) {
			expect(entry.reason.trim().length, entry.key).toBeGreaterThanOrEqual(20);
		}
		const names = entries.map((entry) => entry.key);
		expect(new Set(names).size).toBe(names.length);
		expect(names).toEqual([...names].sort());
	});

	test("the allow-list holds exactly the pinned number of reasoned entries (T-76-11)", () => {
		// A new entry needs a visible edit of this number and a reason in the data file.
		expect(entries).toHaveLength(11);
	});

	test("anti-vacuity: the scan read every stylesheet and every TS/TSX file", () => {
		const styleListing = (
			fs.readdirSync(path.join(REPO, STYLES_DIR), {
				recursive: true,
			}) as string[]
		)
			.filter((name) => name.endsWith(".css"))
			.map((name) => `${STYLES_DIR}/${name}`)
			.sort();
		expect(cssFiles).toEqual(styleListing);
		expect(cssFiles.length).toBeGreaterThan(0);
		// A second, independent listing: Node's own recursive readdir.
		const tsListing = (
			fs.readdirSync(path.join(REPO, RENDERER_DIR), {
				recursive: true,
			}) as string[]
		)
			.filter((name) => name.endsWith(".ts"))
			.map((name) => `${RENDERER_DIR}/${name}`)
			.sort();
		expect(tsFiles).toEqual(tsListing);
		expect(tsFiles.length).toBeGreaterThan(0);
		const tsxListing = (
			fs.readdirSync(path.join(REPO, RENDERER_DIR), {
				recursive: true,
			}) as string[]
		)
			.filter((name) => name.endsWith(".tsx"))
			.map((name) => `${RENDERER_DIR}/${name}`)
			.sort();
		expect(tsxFiles).toEqual(tsxListing);
		expect(tsxFiles.length).toBeGreaterThan(0);
	});
});

describe("RTL-02 physical-direction scan: planted controls", () => {
	test("a planted `left: 0` is reported as an unlisted hit", () => {
		const hits = physicalHits({ file: "planted.css", css: ".x { left: 0; }" });
		expect(hits).toEqual(["planted.css|.x|left|0"]);
		expect(unlisted(hits, new Set())).toEqual(hits);
	});

	test("a quoted comment opener cannot hide a later physical declaration", () => {
		const hits = physicalHits({
			file: "planted.css",
			css: '.x::before { content: "/*"; left: 0; }',
		});
		expect(hits).toEqual(["planted.css|.x::before|left|0"]);
	});

	test.each([
		[".x { right: 4px; }", 1],
		[".x { margin-left: 4px; }", 1],
		[".x { padding-right: 4px; }", 1],
		[".x { border-left: 1px solid red; }", 1],
		[".x { border-right-width: 1px; }", 1],
		[".x { text-align: left; }", 1],
		[".x { text-align: right !important; }", 1],
		[".x { transform: translateX(10px); }", 1],
		[".x { transform: TranslateX(calc(var(--i) * 100%)); }", 1],
		[".x { margin: 0 4px 0 8px; }", 1],
		[".x { padding: 1px var(--a, 2px) 3px var(--b, 4px); }", 1],
		[".x { margin: 0 var(--Gap) 0 var(--gap); }", 1],
		["@media (min-width: 1px) { .x { left: 0; } }", 1],
	])("flags %s", (css, count) => {
		expect(physicalHits({ file: "planted.css", css })).toHaveLength(count);
	});

	test.each([
		".x { padding: var(--a, 8px) var(--b, 16px); }",
		".x { margin: 0 4px 0 4px; }",
		".x { margin: 0 4px 8px; }",
		".x { margin: 1px var(--a, 2px) 3px var(--a, 2px); }",
		".x { margin: 0 0 var(--ec-space-2) 0; }",
		".x { text-align: start; }",
		".x { text-align: end; }",
		".x { text-align: center; }",
		".x { inset-inline-start: 2px; margin-inline-start: 4px; }",
		".x { transform: translateY(2px) scaleX(-1); }",
		".x { transition: left 1s; }",
		"/* .x { left: 0; } */ .y { top: 0; }",
	])("does not flag %s", (css) => {
		expect(physicalHits({ file: "planted.css", css })).toEqual([]);
	});

	test("the key carries the selector chain and never a line number", () => {
		const hits = physicalHits({
			file: "planted.css",
			css: "@media (min-width: 1px) {\n\n.a .b {\n\tleft: 0;\n}\n}",
		});
		expect(hits).toEqual(["planted.css|@media (min-width: 1px) .a .b|left|0"]);
	});

	test("a planted TSX style prop `left: 0` is a hit", () => {
		expect(
			physicalStyleHits({
				file: "planted.tsx",
				tsx: "export const A = () => <div style={{ left: 0 }} />;",
			}),
		).toEqual(["planted.tsx|jsx:div|left|0"]);
	});

	test("a statically computed physical style key is a hit", () => {
		expect(
			physicalStyleHits({
				file: "planted.tsx",
				tsx: 'export const A = () => <div style={{ ["marginLeft"]: 4 }} />;',
			}),
		).toEqual(["planted.tsx|jsx:div|margin-left|4"]);
	});

	test("a dynamic computed style key fails closed", () => {
		const hits = physicalStyleHits({
			file: "planted.tsx",
			tsx: 'const key = "marginLeft"; export const A = () => <div style={{ [key]: 4 }} />;',
		});
		expect(hits).toContain(
			"planted.tsx|jsx:div|<unresolved-style-property>|key",
		);
	});

	test("a statically resolvable style spread is scanned", () => {
		expect(
			physicalStyleHits({
				file: "planted.tsx",
				tsx: "const shared = { marginLeft: 4 }; export const A = () => <div style={{ ...shared }} />;",
			}),
		).toEqual(["planted.tsx|css:shared|margin-left|4"]);
	});

	test("an unresolved dynamic style spread fails closed", () => {
		const hits = physicalStyleHits({
			file: "planted.tsx",
			tsx: "const dynamicStyles = makeStyles(); export const A = () => <div style={{ ...dynamicStyles }} />;",
		});
		expect(hits).toContain(
			"planted.tsx|css:dynamicStyles|<unresolved-style-spread>|makeStyles()",
		);
	});

	test("an unresolved JSX style expression fails closed", () => {
		const hits = physicalStyleHits({
			file: "planted.tsx",
			tsx: "export const A = () => <div style={makeStyles()} />;",
		});
		expect(hits).toContain(
			"planted.tsx|jsx:div|<unresolved-style-expression>|makeStyles()",
		);
	});

	test("a cyclic style reference fails closed", () => {
		const hits = physicalStyleHits({
			file: "planted.tsx",
			tsx: "const first = second; const second = first; export const A = () => <div style={first} />;",
		});
		expect(hits.some((hit) => hit.includes("<cyclic-style-expression>"))).toBe(
			true,
		);
		expect(unlisted(hits, new Set())).toEqual(hits);
	});

	test("a cyclic style spread fails closed", () => {
		const hits = physicalStyleHits({
			file: "planted.tsx",
			tsx: "const first = { ...second }; const second = { ...first }; export const A = () => <div style={first} />;",
		});
		expect(hits.some((hit) => hit.includes("<cyclic-style-spread>"))).toBe(
			true,
		);
		expect(unlisted(hits, new Set())).toEqual(hits);
	});

	test("both statically known branches of a conditional JSX style are scanned", () => {
		expect(
			physicalStyleHits({
				file: "planted.tsx",
				tsx: "export const A = () => <div style={ready ? { marginLeft: 4 } : undefined} />;",
			}),
		).toEqual(["planted.tsx|jsx:div|margin-left|4"]);
	});

	test("an inferred shared style object referenced by JSX is scanned", () => {
		expect(
			physicalStyleHits({
				file: "planted.tsx",
				tsx: "const styles = { marginLeft: 4 }; export const A = () => <div style={styles} />;",
			}),
		).toEqual(["planted.tsx|css:styles|margin-left|4"]);
	});

	test("an inferred style object imported from a shared .ts module is scanned", () => {
		expect(
			physicalStyleHitsInSources([
				{
					file: "planted/Component.tsx",
					text: 'import { styles } from "./styles"; export const A = () => <div style={styles} />;',
				},
				{
					file: "planted/styles.ts",
					text: "export const styles = { marginLeft: 4 };",
				},
			]),
		).toEqual(["planted/styles.ts|css:styles|margin-left|4"]);
	});

	test("a physical declaration in an imported style spread is scanned", () => {
		expect(
			physicalStyleHitsInSources([
				{
					file: "planted/Component.tsx",
					text: 'import { styles } from "./styles"; export const A = () => <div style={{ ...styles }} />;',
				},
				{
					file: "planted/styles.ts",
					text: "export const styles = { marginLeft: 4 };",
				},
			]),
		).toEqual(["planted/styles.ts|css:styles|margin-left|4"]);
	});

	test.each([
		["<p style={{ marginLeft: 4 }} />", "planted.tsx|jsx:p|margin-left|4"],
		[
			'<p style={{ textAlign: "left" }} />',
			"planted.tsx|jsx:p|text-align|left",
		],
		[
			"<p style={{ transform: `translateX(${n}%)` }} />",
			"planted.tsx|jsx:p|transform|`translateX(${n}%)`",
		],
		[
			'<p style={{ margin: "0 4px 0 8px" }} />',
			"planted.tsx|jsx:p|margin|0 4px 0 8px",
		],
	])("TSX style prop %s is a hit", (jsx, key) => {
		expect(
			physicalStyleHits({
				file: "planted.tsx",
				tsx: `export const A = () => ${jsx};`,
			}),
		).toEqual([key]);
	});

	test("a style object typed CSSProperties is scanned too", () => {
		expect(
			physicalStyleHits({
				file: "planted.tsx",
				tsx: "const s: React.CSSProperties = { right: 0, color: 'red' };",
			}),
		).toEqual(["planted.tsx|css:s|right|0"]);
	});

	test("comparator parameters named left and right are not style props", () => {
		expect(
			physicalStyleHits({
				file: "planted.tsx",
				tsx: "export const sorted = items.sort((left, right) => left.name.localeCompare(right.name));\nfunction cmp(left: A, right: A): number { return left.id - right.id; }",
			}),
		).toEqual([]);
	});

	test("custom properties and logical style props are not hits", () => {
		expect(
			physicalStyleHits({
				file: "planted.tsx",
				tsx: 'export const A = () => <div style={{ "--ec-segment-index": 2, insetInlineStart: 2, textAlign: "start" }} />;',
			}),
		).toEqual([]);
	});

	test("the tokenizer keeps a var() fallback as one token", () => {
		expect(
			physicalHits({
				file: "planted.css",
				css: ".x { padding: var(--ec-space-2, 8px) var(--ec-space-4, 16px); }",
			}),
		).toEqual([]);
	});

	test("recursive stylesheet inventory includes nested CSS files", () => {
		const root = fs.mkdtempSync(path.join(tmpdir(), "rtl-style-inventory-"));
		const before = snapshotDir(root);
		const nested = path.join(root, "nested");
		fs.mkdirSync(nested);
		fs.writeFileSync(path.join(nested, "fixture.css"), ".x { left: 0; }");
		try {
			expect(walkFrom(root, "fixture-styles", ".css")).toEqual([
				"fixture-styles/nested/fixture.css",
			]);
			const after = snapshotDir(root);
			expect(() =>
				assertDirEffect(before, after, {
					added: ["nested", "nested/fixture.css"],
				}),
			).not.toThrow();
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});
});
