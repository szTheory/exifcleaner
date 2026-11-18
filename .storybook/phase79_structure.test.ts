import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { expect, test } from "vitest";
import assetPathsData from "./phase79_asset_paths.json";
import expectedData from "./phase79_structure_expected.json";

type AssetPath = { file: string; specifier: string; identifier: string };
type StructureData = {
	schemaVersion: number;
	signatures: Record<string, string>;
};
type AssetPathData = {
	schemaVersion: number;
	paths: AssetPath[];
	hooks: Array<{ name: string; command: string }>;
};

const ROOT = path.resolve(process.cwd());
const COMPONENTS = [
	"src/renderer/components/settings/ToggleSwitch.tsx",
	"src/renderer/components/settings/SegmentedControl.tsx",
	"src/renderer/components/settings/LanguageDropdown.tsx",
	"src/renderer/components/settings/SettingsDrawer.tsx",
	"src/renderer/components/ui/DropZone.tsx",
	"src/renderer/components/ui/EmptyState.tsx",
	"src/renderer/components/ui/Toast.tsx",
	"src/renderer/components/ui/StatusBar.tsx",
	"src/renderer/components/ui/ErrorBoundary.tsx",
] as const;
const IMAGE_EXTENSION = /\.(?:svg|png|jpe?g|webp|gif|avif|ico)$/i;
const EXPECTED = expectedData as StructureData;
const ASSETS = assetPathsData as AssetPathData;

function readSource(file: string): ts.SourceFile {
	const fullPath = path.join(ROOT, file);
	return ts.createSourceFile(
		fullPath,
		fs.readFileSync(fullPath, "utf8"),
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.TSX,
	);
}

function tagName(
	node: ts.JsxTagNameExpression | ts.JsxOpeningLikeElement,
): string {
	const expression =
		ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)
			? node.tagName
			: node;
	if (ts.isIdentifier(expression)) return expression.text;
	if (ts.isPropertyAccessExpression(expression))
		return `${expression.expression.getText()}.${expression.name.text}`;
	if (ts.isJsxNamespacedName(expression))
		return `${expression.namespace.text}:${expression.name.text}`;
	return expression.getText();
}

function attribute(
	node: ts.JsxOpeningLikeElement,
	name: string,
): ts.JsxAttribute | undefined {
	return node.attributes.properties.find(
		(property): property is ts.JsxAttribute =>
			ts.isJsxAttribute(property) && property.name.getText() === name,
	);
}

function literalAttribute(
	node: ts.JsxOpeningLikeElement,
	name: string,
): string | undefined {
	const value = attribute(node, name)?.initializer;
	return value !== undefined && ts.isStringLiteral(value)
		? value.text
		: undefined;
}

function expressionIdentifier(
	node: ts.JsxOpeningLikeElement,
	name: string,
): string | undefined {
	const value = attribute(node, name)?.initializer;
	if (
		value === undefined ||
		!ts.isJsxExpression(value) ||
		value.expression === undefined
	)
		return undefined;
	return ts.isIdentifier(value.expression) ? value.expression.text : undefined;
}

function approvedImagePair(sourceFile: ts.SourceFile): Map<string, string> {
	const rows = ASSETS.paths.filter(
		(row) => row.file === path.relative(ROOT, sourceFile.fileName),
	);
	if (rows.length === 0) return new Map();
	if (
		rows.length !== 2 ||
		!rows.some((row) => row.identifier === "symbolLight") ||
		!rows.some((row) => row.identifier === "symbolDark")
	) {
		throw new Error(
			"Phase 79 EmptyState must have exactly the approved light and dark symbol imports",
		);
	}
	return new Map(
		rows.map((row) => [
			row.identifier,
			row.identifier === "symbolLight" ? "light" : "dark",
		]),
	);
}

function jsxRoots(node: ts.Node): ts.JsxChild[] {
	const roots: ts.JsxChild[] = [];
	const visit = (current: ts.Node): void => {
		if (
			ts.isJsxElement(current) ||
			ts.isJsxSelfClosingElement(current) ||
			ts.isJsxFragment(current)
		) {
			roots.push(current);
			return;
		}
		ts.forEachChild(current, visit);
	};
	visit(node);
	return roots;
}

function meaningfulChildren(children: readonly ts.JsxChild[]): ts.JsxChild[] {
	return children.filter(
		(child) => !ts.isJsxText(child) || child.getText().trim().length > 0,
	);
}

function isEmptyStateIconSlot(
	node: ts.JsxElement | ts.JsxSelfClosingElement,
): boolean {
	const opening = ts.isJsxElement(node) ? node.openingElement : node;
	return (
		tagName(opening) === "div" &&
		literalAttribute(opening, "className") === "empty-state__inner"
	);
}

function isPlaceholderSvg(node: ts.JsxChild): boolean {
	return (
		ts.isJsxElement(node) &&
		tagName(node.openingElement) === "svg" &&
		literalAttribute(node.openingElement, "className") === "empty-state__icon"
	);
}

function imageVariant(
	node: ts.JsxChild,
	approved: Map<string, string>,
): string | undefined {
	if (!ts.isJsxSelfClosingElement(node) && !ts.isJsxElement(node))
		return undefined;
	const opening = ts.isJsxElement(node) ? node.openingElement : node;
	if (tagName(opening) !== "img") return undefined;
	const identifier = expressionIdentifier(opening, "src");
	const variant =
		identifier === undefined ? undefined : approved.get(identifier);
	if (variant === undefined) return undefined;
	const expectedClass = `empty-state__icon empty-state__icon--${variant}`;
	return literalAttribute(opening, "className") === expectedClass
		? variant
		: undefined;
}

function renderJsx(
	node: ts.JsxChild,
	sourceFile: ts.SourceFile,
	approved: Map<string, string>,
): unknown {
	if (ts.isJsxText(node))
		return node.getText().trim() === "" ? null : { kind: "text" };
	if (ts.isJsxExpression(node)) {
		if (node.expression === undefined) return { kind: "empty-expression" };
		const nested = jsxRoots(node.expression).map((root) =>
			renderJsx(root, sourceFile, approved),
		);
		return nested.length === 0
			? { kind: "expression" }
			: { kind: "expression", jsx: nested };
	}
	if (ts.isJsxFragment(node)) {
		return {
			kind: "fragment",
			children: meaningfulChildren(node.children)
				.map((child) => renderJsx(child, sourceFile, approved))
				.filter((child) => child !== null),
		};
	}
	if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
		const opening = ts.isJsxElement(node) ? node.openingElement : node;
		const isEmptyState =
			path.relative(ROOT, sourceFile.fileName) ===
			"src/renderer/components/ui/EmptyState.tsx";
		if (isEmptyState && isEmptyStateIconSlot(node)) {
			const children = ts.isJsxElement(node)
				? meaningfulChildren(node.children)
				: [];
			if (
				approved.size === 0 &&
				children.length > 0 &&
				isPlaceholderSvg(children[0]!)
			) {
				return {
					kind: "element",
					tag: "div",
					children: [{ kind: "brand-symbol-slot" }],
				};
			}
			if (
				children.length > 1 &&
				imageVariant(children[0]!, approved) === "light" &&
				imageVariant(children[1]!, approved) === "dark"
			) {
				return {
					kind: "element",
					tag: "div",
					children: [{ kind: "brand-symbol-slot" }],
				};
			}
		}
		const children = ts.isJsxElement(node)
			? meaningfulChildren(node.children)
			: [];
		return {
			kind: "element",
			tag: tagName(opening),
			children: children
				.map((child) => renderJsx(child, sourceFile, approved))
				.filter((child) => child !== null),
		};
	}
	return { kind: "other" };
}

function sourceSignature(file: string, suppliedSource?: ts.SourceFile): string {
	const sourceFile = suppliedSource ?? readSource(file);
	const approved =
		file === "src/renderer/components/ui/EmptyState.tsx"
			? approvedImagePair(sourceFile)
			: new Map<string, string>();
	const roots = jsxRoots(sourceFile).map((root) =>
		renderJsx(root, sourceFile, approved),
	);
	return JSON.stringify(roots);
}

function importPaths(): AssetPath[] {
	const rows: AssetPath[] = [];
	const rendererRoot = path.join(ROOT, "src/renderer");
	const visitFile = (file: string): void => {
		if (!/\.(?:ts|tsx)$/.test(file)) return;
		const sourceFile = ts.createSourceFile(
			file,
			fs.readFileSync(file, "utf8"),
			ts.ScriptTarget.Latest,
			true,
			file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
		);
		for (const statement of sourceFile.statements) {
			if (
				!ts.isImportDeclaration(statement) ||
				!ts.isStringLiteral(statement.moduleSpecifier)
			)
				continue;
			const specifier = statement.moduleSpecifier.text;
			if (!isImageSpecifier(specifier)) continue;
			const bindings = statement.importClause?.namedBindings;
			if (statement.importClause?.name !== undefined)
				rows.push({
					file: path.relative(ROOT, file),
					specifier,
					identifier: statement.importClause.name.text,
				});
			if (bindings !== undefined && ts.isNamespaceImport(bindings))
				rows.push({
					file: path.relative(ROOT, file),
					specifier,
					identifier: bindings.name.text,
				});
			if (bindings !== undefined && ts.isNamedImports(bindings)) {
				for (const item of bindings.elements)
					rows.push({
						file: path.relative(ROOT, file),
						specifier,
						identifier: item.name.text,
					});
			}
		}
	};
	const walk = (directory: string): void => {
		for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
			const file = path.join(directory, entry.name);
			if (entry.isDirectory()) walk(file);
			else visitFile(file);
		}
	};
	walk(rendererRoot);
	return rows.sort((left, right) =>
		`${left.file}\0${left.specifier}\0${left.identifier}`.localeCompare(
			`${right.file}\0${right.specifier}\0${right.identifier}`,
		),
	);
}

function isImageSpecifier(specifier: string): boolean {
	const imagePath = specifier.split("?")[0] ?? "";
	return IMAGE_EXTENSION.test(imagePath);
}

function sha256(value: string): string {
	return createHash("sha256").update(value).digest("hex");
}

test("scoped TSX structures match the measured master tree; a planted wrapper changes the signature", () => {
	expect(EXPECTED.schemaVersion).toBe(1);
	expect(Object.keys(EXPECTED.signatures).sort()).toEqual(
		[...COMPONENTS].sort(),
	);
	for (const file of COMPONENTS) {
		expect(sha256(sourceSignature(file)), file).toBe(EXPECTED.signatures[file]);
	}

	const fixture = ts.createSourceFile(
		"phase79-wrapper-fixture.tsx",
		"const Fixture = () => <section><h1>Heading</h1></section>;",
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.TSX,
	);
	const original = sourceSignature("phase79-wrapper-fixture.tsx", fixture);
	const transformed = ts.transform(fixture, [
		(context) => {
			const visit: ts.Visitor = (node) => {
				if (ts.isJsxElement(node) && tagName(node.openingElement) === "h1") {
					const f = context.factory;
					const wrapper = f.createJsxOpeningElement(
						f.createIdentifier("div"),
						undefined,
						f.createJsxAttributes([]),
					);
					return f.createJsxElement(
						wrapper,
						[node],
						f.createJsxClosingElement(f.createIdentifier("div")),
					);
				}
				return ts.visitEachChild(node, visit, context);
			};
			return (node) => ts.visitNode(node, visit) as ts.SourceFile;
		},
	]);
	try {
		expect(
			sourceSignature(
				"phase79-wrapper-fixture.tsx",
				transformed.transformed[0],
			),
		).not.toBe(original);
	} finally {
		transformed.dispose();
	}
});

test("renderer image imports and the approved theme-symbol nodes match exact path data", () => {
	expect(ASSETS.schemaVersion).toBe(1);
	const expected = [...ASSETS.paths].sort((left, right) =>
		`${left.file}\0${left.specifier}\0${left.identifier}`.localeCompare(
			`${right.file}\0${right.specifier}\0${right.identifier}`,
		),
	);
	expect(importPaths()).toEqual(expected);
	const packageJson = JSON.parse(
		fs.readFileSync(path.join(ROOT, "package.json"), "utf8"),
	) as {
		scripts: Record<string, string>;
	};
	const hookNames = new Set([
		"prestorybook:build",
		"prestorybook:dev",
		"pretest:storybook",
	]);
	const actualHooks = Object.entries(packageJson.scripts)
		.filter(([name]) => hookNames.has(name))
		.map(([name, command]) => ({ name, command }))
		.sort((left, right) => left.name.localeCompare(right.name));
	const expectedHooks = [...ASSETS.hooks].sort((left, right) =>
		left.name.localeCompare(right.name),
	);
	expect(actualHooks).toEqual(expectedHooks);
	if (ASSETS.paths.length > 0) {
		const emptyState = readSource("src/renderer/components/ui/EmptyState.tsx");
		const approved = approvedImagePair(emptyState);
		expect([...approved.values()].sort()).toEqual(["dark", "light"]);
	}
});

test("image import scanning recognizes Vite query suffixes without normalizing them", () => {
	expect(isImageSpecifier("assets/brand/symbol.svg?no-inline")).toBe(true);
	expect(isImageSpecifier("assets/brand/symbol.svg?inline")).toBe(true);
	expect(isImageSpecifier("assets/brand/symbol.tsx?no-inline")).toBe(false);
});

test("the approved 90/10 mixes and toggle slide transition remain byte-stable", () => {
	const tokens = fs.readFileSync(
		path.join(ROOT, "src/renderer/styles/tokens.css"),
		"utf8",
	);
	expect(
		tokens.match(
			/--ec-toggle-off-track: color-mix\(in srgb, GrayText 90%, CanvasText 10%\);/g,
		),
	).toHaveLength(2);
	expect(tokens).toContain(
		"--ec-color-platform-indicator: color-mix(in srgb, var(--ec-color-accent) 90%, CanvasText 10%);",
	);
	expect(tokens).toContain(
		"--ec-color-platform-indicator: var(--ec-color-accent);",
	);
	const toggleCss = fs.readFileSync(
		path.join(ROOT, "src/renderer/styles/toggle_switch.css"),
		"utf8",
	);
	expect(toggleCss).toMatch(
		/\.toggle-switch__thumb\s*\{\s*transition:\s*left 200ms cubic-bezier\(0\.34, 1\.56, 0\.64, 1\);/,
	);
});
