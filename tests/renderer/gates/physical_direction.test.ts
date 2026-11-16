import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, test } from "vitest";
import { cssDeclarations } from "../../../.storybook/catalog/css_scan.mjs";

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
	return (
		tokens.length === 4 && tokens[1]?.toLowerCase() !== tokens[3]?.toLowerCase()
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
	// A computed or numeric key cannot be named as a CSS property here.
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

// TSX style objects, read from the AST (never a regex over the text, so a comparator whose
// parameters are named `left` and `right` is not a hit): the object literal of a JSX
// `style` attribute, and an object literal assigned to a variable typed `...CSSProperties`
// (FileRow's `progressStyle` is passed as `style={progressStyle}`).
function physicalStyleHits({
	file,
	tsx,
}: {
	file: string;
	tsx: string;
}): string[] {
	const source = ts.createSourceFile(
		file,
		tsx,
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.TSX,
	);
	const keys: string[] = [];
	const collect = (object: ts.ObjectLiteralExpression, owner: string): void => {
		for (const member of object.properties) {
			if (ts.isSpreadAssignment(member)) continue;
			const raw = propertyKey(member.name);
			if (raw === null || raw.startsWith("--")) continue;
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
				continue;
			}
			if (isPhysical(property, value)) {
				keys.push(`${file}|${owner}|${property}|${value}`);
			}
		}
	};
	const visit = (node: ts.Node): void => {
		if (
			ts.isJsxAttribute(node) &&
			node.name.getText(source) === "style" &&
			node.initializer !== undefined &&
			ts.isJsxExpression(node.initializer) &&
			node.initializer.expression !== undefined &&
			ts.isObjectLiteralExpression(node.initializer.expression)
		) {
			collect(node.initializer.expression, `jsx:${tagNameOf(node)}`);
		}
		if (
			ts.isVariableDeclaration(node) &&
			node.type !== undefined &&
			/CSSProperties$/.test(node.type.getText(source)) &&
			node.initializer !== undefined &&
			ts.isObjectLiteralExpression(node.initializer)
		) {
			collect(node.initializer, `css:${node.name.getText(source)}`);
		}
		ts.forEachChild(node, visit);
	};
	visit(source);
	return keys;
}

function walk(directory: string, extension: string): string[] {
	const found: string[] = [];
	for (const entry of fs.readdirSync(path.join(REPO, directory), {
		withFileTypes: true,
	})) {
		const relative = `${directory}/${entry.name}`;
		if (entry.isDirectory()) found.push(...walk(relative, extension));
		else if (entry.name.endsWith(extension)) found.push(relative);
	}
	return found.sort();
}

function scanTree(): {
	cssFiles: string[];
	tsxFiles: string[];
	keys: string[];
} {
	const cssFiles = fs
		.readdirSync(path.join(REPO, STYLES_DIR))
		.filter((name) => name.endsWith(".css"))
		.map((name) => `${STYLES_DIR}/${name}`)
		.sort();
	const tsxFiles = walk(RENDERER_DIR, ".tsx");
	const keys = [
		...cssFiles.flatMap((file) =>
			physicalHits({
				file,
				css: fs.readFileSync(path.join(REPO, file), "utf8"),
			}),
		),
		...tsxFiles.flatMap((file) =>
			physicalStyleHits({
				file,
				tsx: fs.readFileSync(path.join(REPO, file), "utf8"),
			}),
		),
	];
	return { cssFiles, tsxFiles, keys: [...new Set(keys)].sort() };
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
	const { cssFiles, tsxFiles, keys } = scanTree();
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

	test("anti-vacuity: the scan read every stylesheet and every TSX file", () => {
		const styleListing = fs
			.readdirSync(path.join(REPO, STYLES_DIR))
			.filter((name) => name.endsWith(".css"))
			.map((name) => `${STYLES_DIR}/${name}`)
			.sort();
		expect(cssFiles).toEqual(styleListing);
		expect(cssFiles.length).toBeGreaterThan(0);
		// A second, independent listing: Node's own recursive readdir.
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
});
