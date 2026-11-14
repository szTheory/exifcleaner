import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { assertDirEffect, snapshotDir } from "../../tests/helpers/dir_effect";
import { compareCodeUnits } from "./closed.mjs";
import {
	TOKEN_SCAN_ROOT,
	cssDeclarations,
	dynamicCustomPropertyNames,
	listTokenScanFiles,
	stripCssComments,
	stripScriptComments,
	usedCustomProperties,
} from "./css_scan.mjs";
import { makeCatalogRepo, realScript, repoRoot, runNode } from "./temp_repo";
import {
	TOKENS_CSS_PATH,
	TOKEN_MAP_CODES,
	TOKEN_MAP_MD_PATH,
	TOKEN_MAP_PATH,
	declaredTokens,
	loadTokenMapContext,
	renderTokenMap,
	usedTokens,
	validateTokenMap,
	type TokenMapContext,
	type TokenMapDocument,
} from "./token_map.mjs";

const CATALOG = ".storybook/catalog/catalog.mjs";

const ctx: TokenMapContext = loadTokenMapContext(repoRoot);
const real = JSON.parse(
	fs.readFileSync(path.join(repoRoot, TOKEN_MAP_PATH), "utf8"),
) as TokenMapDocument;

// The two token-gap fingerprints the real map cross-references (D-20).
const HOVER_FINDING =
	"token-gap|settings-languagedropdown--item-hover|hover-token-undefined";

// A mutable, loosely typed view of the document: a mutant plants a defect the
// closed types would not let a test write.
type Loose = {
	schemaVersion: unknown;
	brandPin: unknown;
	entries: Array<Record<string, any>>;
	[key: string]: unknown;
};

function clone(): Loose {
	return structuredClone(real) as unknown as Loose;
}

function codes(doc: unknown, context: TokenMapContext = ctx): string[] {
	return validateTokenMap(doc, context).map((found) => found.code);
}

function entryNamed(doc: Loose, name: string): Record<string, any> {
	const found = doc.entries.find((entry) => entry["name"] === name);
	if (found === undefined) throw new Error(`no entry ${name}`);
	return found;
}

// Adds an entry and puts the list back in code-unit order, so the only defect
// a mutant carries is the planted one.
function addEntry(doc: Loose, entry: Record<string, any>): Loose {
	doc.entries.push(entry);
	doc.entries.sort((a, b) => compareCodeUnits(a["name"], b["name"]));
	return doc;
}

function without(doc: Loose, name: string): Loose {
	doc.entries = doc.entries.filter((entry) => entry["name"] !== name);
	return doc;
}

// A planted custom property in both theme blocks of a stylesheet text.
function inBothBlocks(css: string, declaration: string): string {
	return css
		.replace(":root {", `:root {\n\t${declaration}`)
		.replace(
			'[data-theme="dark"] {',
			`[data-theme="dark"] {\n\t${declaration}`,
		);
}

function inRootOnly(css: string, declaration: string): string {
	return css.replace(":root {", `:root {\n\t${declaration}`);
}

function inDarkOnly(css: string, declaration: string): string {
	return css.replace(
		'[data-theme="dark"] {',
		`[data-theme="dark"] {\n\t${declaration}`,
	);
}

function withCss(css: string): TokenMapContext {
	return { ...ctx, tokensCss: css };
}

function withSource(file: string, text: string): TokenMapContext {
	return { ...ctx, sources: { ...ctx.sources, [file]: text } };
}

const PLANTED_ENTRY = {
	name: "--ec-color-planted",
	disposition: "local",
	reason: "a planted custom property",
};

interface Mutant {
	name: string;
	code: string;
	doc?: () => unknown;
	context?: () => TokenMapContext;
}

const MUTANTS: Mutant[] = [
	{
		name: "a document that is not an object",
		code: "not-object",
		doc: () => [1],
	},
	{
		name: "an entry that is not an object",
		code: "not-object",
		doc: () => {
			const doc = clone();
			doc.entries.push(7 as never);
			return doc;
		},
	},
	{
		name: "schemaVersion 2",
		code: "schema-version",
		doc: () => ({ ...clone(), schemaVersion: 2 }),
	},
	{
		name: "entries an object",
		code: "bad-type",
		doc: () => ({ ...clone(), entries: {} }),
	},
	{
		name: "an extra top-level key",
		code: "unknown-field",
		doc: () => ({ ...clone(), extra: 1 }),
	},
	{
		name: "a brandPin that is not the pin",
		code: "pin-mismatch",
		doc: () => ({ ...clone(), brandPin: "0".repeat(40) }),
	},
	{
		name: "two entries swapped",
		code: "unsorted",
		doc: () => {
			const doc = clone();
			const [first, second] = doc.entries;
			if (first === undefined || second === undefined)
				throw new Error("entries");
			doc.entries[0] = second;
			doc.entries[1] = first;
			return doc;
		},
	},
	{
		name: "an entry duplicated",
		code: "duplicate-entry",
		doc: () => {
			const doc = clone();
			const copy = structuredClone(entryNamed(doc, "--ec-space-1"));
			doc.entries.splice(
				doc.entries.indexOf(entryNamed(doc, "--ec-space-1")),
				0,
				copy,
			);
			return doc;
		},
	},
	{
		name: "a deleted entry",
		code: "unmapped",
		doc: () => without(clone(), "--ec-color-bg"),
	},
	{
		name: "a property added to both blocks without an entry",
		code: "unmapped",
		context: () =>
			withCss(inBothBlocks(ctx.tokensCss, "--ec-color-planted: #123456;")),
	},
	{
		name: "a new unprefixed alias added to both blocks without an entry",
		code: "unmapped",
		context: () =>
			withCss(
				inBothBlocks(ctx.tokensCss, "--color-planted: var(--ec-color-bg);"),
			),
	},
	{
		name: "var(--ec-planted) in a tsx file",
		code: "unmapped",
		context: () =>
			withSource(
				"src/renderer/planted.tsx",
				'export const style = "var(--ec-planted)";\n',
			),
	},
	{
		name: "an inline --ec-planted style key in a tsx file",
		code: "unmapped",
		context: () =>
			withSource(
				"src/renderer/planted.tsx",
				'export const style = { "--ec-planted": "1px" };\n',
			),
	},
	{
		name: "a property only in :root, with an entry",
		code: "theme-parity",
		doc: () => addEntry(clone(), { ...PLANTED_ENTRY }),
		context: () =>
			withCss(inRootOnly(ctx.tokensCss, "--ec-color-planted: #123456;")),
	},
	{
		name: "a property only in the dark block, with an entry",
		code: "theme-parity",
		doc: () => addEntry(clone(), { ...PLANTED_ENTRY }),
		context: () =>
			withCss(inDarkOnly(ctx.tokensCss, "--ec-color-planted: #123456;")),
	},
	{
		name: "a [data-theme=hc] block holding a declaration",
		code: "unknown-block",
		context: () =>
			withCss(
				`${ctx.tokensCss}\n[data-theme="hc"] {\n\t--ec-color-bg: #000000;\n}\n`,
			),
	},
	{
		name: "a declaration inside an @media block",
		code: "unknown-block",
		context: () =>
			withCss(
				`${ctx.tokensCss}\n@media (min-width: 1px) {\n\t:root {\n\t\t--ec-space-1: 4px;\n\t}\n}\n`,
			),
	},
	{
		name: "a template-built name in a tsx file",
		code: "dynamic-token-name",
		context: () =>
			withSource(
				"src/renderer/planted.tsx",
				"export const name = `--ec-${suffix}`;\n",
			),
	},
	{
		name: "an entry that names no token",
		code: "orphan-entry",
		doc: () =>
			addEntry(clone(), {
				name: "--ec-gone",
				disposition: "local",
				reason: "a planted entry",
			}),
	},
	{
		name: "a disposition outside the six",
		code: "bad-disposition",
		doc: () => {
			const doc = clone();
			entryNamed(doc, "--ec-space-1")["disposition"] = "maybe";
			return doc;
		},
	},
	{
		name: "an adopt entry without brand",
		code: "missing-field",
		doc: () => {
			const doc = clone();
			delete entryNamed(doc, "--ec-color-bg")["brand"];
			return doc;
		},
	},
	{
		name: "a derive entry without rule",
		code: "missing-field",
		doc: () => {
			const doc = clone();
			delete entryNamed(doc, "--ec-color-error-bg")["rule"];
			return doc;
		},
	},
	{
		name: "a keep-platform entry carrying finding",
		code: "unknown-field",
		doc: () => {
			const doc = clone();
			entryNamed(doc, "--ec-color-accent")["finding"] = HOVER_FINDING;
			return doc;
		},
	},
	{
		name: "an adopt entry with an extra key",
		code: "unknown-field",
		doc: () => {
			const doc = clone();
			entryNamed(doc, "--ec-color-bg")["note"] = "x";
			return doc;
		},
	},
	{
		name: "a finding that is not a fingerprint",
		code: "unknown-finding",
		doc: () => {
			const doc = clone();
			entryNamed(doc, "--ec-color-hover")["finding"] = "token-gap|x|y";
			return doc;
		},
	},
	{
		name: "a finding that is an empty string",
		code: "bad-type",
		doc: () => {
			const doc = clone();
			entryNamed(doc, "--ec-color-hover")["finding"] = "";
			return doc;
		},
	},
	{
		name: "an empty reason",
		code: "bad-type",
		doc: () => {
			const doc = clone();
			entryNamed(doc, "--ec-color-info")["reason"] = "";
			return doc;
		},
	},
	{
		name: "an empty derive from list",
		code: "bad-type",
		doc: () => {
			const doc = clone();
			entryNamed(doc, "--ec-color-error-bg")["from"] = [];
			return doc;
		},
	},
	{
		name: "an alias entry whose aliasOf is another name",
		code: "alias-mismatch",
		doc: () => {
			const doc = clone();
			entryNamed(doc, "--color-bg")["aliasOf"] = "--ec-color-text";
			return doc;
		},
	},
	{
		name: "an alias entry without aliasOf",
		code: "alias-mismatch",
		doc: () => {
			const doc = clone();
			delete entryNamed(doc, "--color-bg")["aliasOf"];
			return doc;
		},
	},
	{
		name: "a non-alias entry carrying aliasOf",
		code: "alias-mismatch",
		doc: () => {
			const doc = clone();
			entryNamed(doc, "--ec-space-1")["aliasOf"] = "--ec-space-2";
			return doc;
		},
	},
	{
		name: "an adopt hex in lower case",
		code: "bad-hex",
		doc: () => {
			const doc = clone();
			const light = entryNamed(doc, "--ec-color-bg")["brand"]["light"];
			light["hex"] = light["hex"].toLowerCase();
			return doc;
		},
	},
	{
		name: "an adopt hex that is not six digits",
		code: "bad-hex",
		doc: () => {
			const doc = clone();
			entryNamed(doc, "--ec-color-bg")["brand"]["dark"]["hex"] = "#0A2E2";
			return doc;
		},
	},
	{
		name: "an adopt token path outside color.",
		code: "bad-brand-ref",
		doc: () => {
			const doc = clone();
			entryNamed(doc, "--ec-color-bg")["brand"]["light"]["token"] = "font.mono";
			return doc;
		},
	},
	{
		name: "a derive source outside color.",
		code: "bad-brand-ref",
		doc: () => {
			const doc = clone();
			entryNamed(doc, "--ec-color-error-bg")["from"] = ["font.mono"];
			return doc;
		},
	},
	{
		name: "a brand hex changed in the map but not in ui-spec.json",
		code: "brand-hex-inconsistent",
		doc: () => {
			const doc = clone();
			for (const entry of doc.entries) {
				for (const side of ["light", "dark"]) {
					const ref = entry["brand"]?.[side];
					if (ref?.["token"] === "color.light.clean-white")
						ref["hex"] = "#FFFFFE";
				}
			}
			return doc;
		},
	},
	{
		name: "a spec id that does not exist",
		code: "unknown-spec-id",
		doc: () => {
			const doc = clone();
			entryNamed(doc, "--ec-space-1")["spec"] = "type.nope";
			return doc;
		},
	},
	{
		name: "a token-map-gap finding no entry references",
		code: "unreferenced-finding",
		context: () => ({
			...ctx,
			findings: [
				...ctx.findings,
				{
					fingerprint: "token-map-gap|planted--story|planted",
					kind: "token-map-gap",
				},
			],
		}),
	},
	{
		name: "a token-map-gap finding two entries reference",
		code: "unreferenced-finding",
		doc: () => {
			const doc = clone();
			entryNamed(doc, "--ec-color-info")["finding"] =
				"token-map-gap|planted--story|planted";
			entryNamed(doc, "--ec-color-muted")["finding"] =
				"token-map-gap|planted--story|planted";
			return doc;
		},
		context: () => ({
			...ctx,
			findings: [
				...ctx.findings,
				{
					fingerprint: "token-map-gap|planted--story|planted",
					kind: "token-map-gap",
				},
			],
		}),
	},
];

describe("the real token map", () => {
	test("validates to no problems", () => {
		expect(validateTokenMap(real, ctx)).toEqual([]);
	});

	test("anti-vacuity: the scan sees the measured sets and the map holds one entry per name", () => {
		const declared = declaredTokens(ctx.tokensCss);
		expect(declared.root.size).toBe(59);
		expect(declared.dark.size).toBe(39);
		expect(declared.other).toEqual([]);
		expect(
			usedTokens({ ...ctx.sources, [TOKENS_CSS_PATH]: ctx.tokensCss }),
		).toHaveLength(65);
		expect(real.entries).toHaveLength(68);
		expect(Object.keys(real)).toEqual(["schemaVersion", "brandPin", "entries"]);
	});

	test("every disposition is used at least once", () => {
		const used = new Set(real.entries.map((entry) => entry.disposition));
		for (const disposition of [
			"adopt",
			"derive",
			"keep-platform",
			"propose-upstream",
			"retire",
			"local",
		]) {
			expect(used.has(disposition as never), disposition).toBe(true);
		}
	});

	test("entries are in code-unit order: --color-* < --ec-* < --empty-* < --spacing-*", () => {
		const names = real.entries.map((entry) => entry.name);
		expect(names).toEqual([...names].sort(compareCodeUnits));
		expect(names[0]?.startsWith("--color-")).toBe(true);
		expect(names.at(-1)?.startsWith("--spacing-")).toBe(true);
		const empty = names.indexOf("--empty-state-secondary");
		expect(names[empty - 1]?.startsWith("--ec-")).toBe(true);
		expect(names[empty + 1]?.startsWith("--spacing-")).toBe(true);
	});

	test("the generated view has the byte-exact header and a counts line, and renders identically twice", () => {
		const view = renderTokenMap(real);
		expect(view.split("\n")[0]).toBe(
			"<!-- Generated from token_map.json by .storybook/catalog/catalog.mjs. Do not edit: edit token_map.json and run yarn catalog:write. -->",
		);
		expect(view).toContain("\n# Token map\n");
		expect(view).toContain(`Brand pin: \`${ctx.brandPin}\``);
		expect(view).toMatch(
			/\nDispositions: adopt \d+, derive \d+, keep-platform \d+, propose-upstream \d+, retire \d+, local \d+\./,
		);
		expect(view.endsWith("\n")).toBe(true);
		expect(view.endsWith("\n\n")).toBe(false);
		expect(view).not.toContain("\r");
		expect(renderTokenMap(structuredClone(real))).toBe(view);
		expect(
			fs.readFileSync(path.join(repoRoot, TOKEN_MAP_MD_PATH), "utf8"),
		).toBe(view);
	});
});

describe("every rule code is shown red by its own mutant", () => {
	test.each(MUTANTS)("shown red: $name -> $code", ({ code, doc, context }) => {
		const found = codes(
			doc === undefined ? clone() : doc(),
			context?.() ?? ctx,
		);
		expect(found).toEqual([code]);
	});

	test("the mutant codes are exactly TOKEN_MAP_CODES (21)", () => {
		expect([...new Set(MUTANTS.map((mutant) => mutant.code))].sort()).toEqual([
			...TOKEN_MAP_CODES,
		]);
		expect(TOKEN_MAP_CODES).toHaveLength(21);
		expect(Object.isFrozen(TOKEN_MAP_CODES)).toBe(true);
	});
});

describe("positive controls: these are not defects", () => {
	test("a theme-invariant property only in :root, with a propose-upstream entry", () => {
		const doc = addEntry(clone(), {
			name: "--ec-space-99",
			disposition: "propose-upstream",
			owner: "exifcleaner-brand",
			decision: "a planted spacing step",
		});
		const context = withCss(inRootOnly(ctx.tokensCss, "--ec-space-99: 96px;"));
		expect(codes(doc, context)).toEqual([]);
	});

	test("a property named only inside a CSS comment or a // comment yields no problem", () => {
		const css = inRootOnly(
			ctx.tokensCss,
			"/* --ec-color-planted: 1px; and var(--ec-color-planted) */",
		);
		const text =
			'// --ec-color-planted and var(--ec-color-planted)\n/* "--ec-color-planted" */\nexport const x = 1;\n';
		const context = {
			...withCss(`${css}\n/* --ec-color-planted: #123456; */\n`),
			sources: { ...ctx.sources, "src/renderer/planted.tsx": text },
		};
		expect(codes(real, context)).toEqual([]);
	});

	test("a BEM modifier built from a template is not a custom-property name", () => {
		const context = withSource(
			"src/renderer/planted.tsx",
			"export const cls = `type-pill--${modifier}`;\n",
		);
		expect(codes(real, context)).toEqual([]);
	});

	test("env.d.ts holds a template literal type and is not a dynamic name (the file is not in the scan set)", () => {
		const envText = fs.readFileSync(
			path.join(repoRoot, "src/renderer/env.d.ts"),
			"utf8",
		);
		expect(envText).toContain("`--${string}`");
		expect(listTokenScanFiles(repoRoot)).not.toContain("src/renderer/env.d.ts");
		expect(
			dynamicCustomPropertyNames("src/renderer/env.d.ts", envText),
		).toEqual([]);
		expect(codes(real, withSource("src/renderer/env.d.ts", envText))).toEqual(
			[],
		);
	});
});

describe("the CSS and TypeScript scans", () => {
	test("stripCssComments keeps length and newlines, and an unterminated comment runs to the end", () => {
		const css = "a { /* one\ntwo */ --x: 1; } /* open\nend";
		const stripped = stripCssComments(css);
		expect(stripped).toHaveLength(css.length);
		expect(stripped.split("\n")).toHaveLength(css.split("\n").length);
		expect(stripped).toContain("--x: 1;");
		expect(stripped).not.toContain("one");
		expect(stripped).not.toContain("open");
	});

	test("cssDeclarations returns each declaration with its block chain, joined values and first line", () => {
		const css = [
			":root {",
			"\t--a: system-ui,",
			'\t\t"Segoe UI";',
			"\t--b: url(data:image/png;base64,AAA);",
			"\t--c: 1px",
			"}",
			'@media (min-width: 1px) { [data-theme="dark"] { --d: 2px; } }',
			"/* --e: 3px; */",
		].join("\n");
		expect(
			cssDeclarations(css).map(({ selectors, property, value, line }) => [
				selectors.join(" > "),
				property,
				value,
				line,
			]),
		).toEqual([
			[":root", "--a", 'system-ui, "Segoe UI"', 2],
			[":root", "--b", "url(data:image/png;base64,AAA)", 4],
			[":root", "--c", "1px", 5],
			['@media (min-width: 1px) > [data-theme="dark"]', "--d", "2px", 7],
		]);
	});

	test("usedCustomProperties finds var() and quoted script keys, and ignores comments and BEM names", () => {
		expect(
			usedCustomProperties("a.css", "a { color: var( --b ); /* var(--c) */ }"),
		).toEqual(["--b"]);
		expect(
			usedCustomProperties(
				"a.tsx",
				'const s = { "--d": 1, \'--e\': 2 }; el.style.setProperty("--f", x);\n// "--g"\nconst cls = "type-pill--h";\n',
			),
		).toEqual(["--d", "--e", "--f"]);
		expect(usedCustomProperties("a.css", '.x { content: "--i"; }')).toEqual([]);
	});

	test("stripScriptComments keeps a // inside a string or a template and removes real comments", () => {
		const text =
			'const u = "https://x.test"; // gone\nconst t = `a // b`; /* gone\ntoo */ const v = 1;\n';
		const stripped = stripScriptComments(text);
		expect(stripped).toHaveLength(text.length);
		expect(stripped).toContain('"https://x.test"');
		expect(stripped).toContain("`a // b`");
		expect(stripped).not.toContain("gone");
		expect(stripped).toContain("const v = 1;");
	});

	test("the scan lists files in code-unit order, never a .d.ts, and finds the files the map depends on", () => {
		const files = listTokenScanFiles(repoRoot);
		expect(files).toEqual([...files].sort(compareCodeUnits));
		expect(files.some((file) => file.endsWith(".d.ts"))).toBe(false);
		for (const expected of [
			"src/renderer/styles/tokens.css",
			"src/renderer/components/file-list/FileRow.tsx",
			"src/renderer/contexts/ThemeContext.tsx",
		]) {
			expect(files, expected).toContain(expected);
		}
	});

	test("the scan root is inside both Storybook path lists, so an edit it reads starts the job (Pitfall 6)", () => {
		const workflow = fs.readFileSync(
			path.join(repoRoot, ".github/workflows/storybook.yml"),
			"utf8",
		);
		expect(TOKEN_SCAN_ROOT).toBe("src/renderer");
		expect(workflow.split('      - "src/renderer/**"\n')).toHaveLength(3);
	});

	test("shown red: a symbolic link under src/renderer is never followed", () => {
		const repo = makeCatalogRepo();
		try {
			fs.mkdirSync(path.join(repo, "outside"));
			fs.writeFileSync(
				path.join(repo, "outside/evil.css"),
				".x { color: var(--ec-evil); }\n",
			);
			fs.symlinkSync(
				path.join(repo, "outside/evil.css"),
				path.join(repo, "src/renderer/linked.css"),
			);
			fs.symlinkSync(
				path.join(repo, "outside"),
				path.join(repo, "src/renderer/linked-dir"),
			);
			const before = snapshotDir(repo);
			expect(listTokenScanFiles(repo)).toEqual(listTokenScanFiles(repoRoot));
			expect(Object.keys(loadTokenMapContext(repo).sources)).toEqual(
				Object.keys(ctx.sources),
			);
			assertDirEffect(before, snapshotDir(repo), {});
		} finally {
			fs.rmSync(repo, { recursive: true, force: true });
		}
	});

	test("ReDoS guard: 200 KB of repeated declarations, an unterminated comment and 5,000 nested braces return within 1 second", () => {
		const repeated = ":root { --a: var(--b); }\n".repeat(8_000);
		const input = `${repeated}${"{".repeat(5_000)}\nvar(--ec-a) "--ec-b" \`--ec-\${x}\`\n/* never closed ${"x ".repeat(5_000)}`;
		expect(input.length).toBeGreaterThan(200_000);
		for (const [label, run] of [
			["cssDeclarations", () => cssDeclarations(input)],
			["usedCustomProperties", () => usedCustomProperties("a.tsx", input)],
			[
				"dynamicCustomPropertyNames",
				() => dynamicCustomPropertyNames("a.tsx", input),
			],
		] as const) {
			const start = performance.now();
			run();
			expect(performance.now() - start, label).toBeLessThan(1000);
		}
	});
});

describe("a custom property added without a map entry (SC2, D-19)", () => {
	function withRepo(body: (repo: string) => void): void {
		const repo = makeCatalogRepo();
		try {
			body(repo);
		} finally {
			fs.rmSync(repo, { recursive: true, force: true });
		}
	}

	function run(repo: string, args: string[]) {
		return runNode(realScript(CATALOG), args, repo);
	}

	test("shown red through the CLI: the same declaration in a temp repo fails --check and changes nothing", () => {
		withRepo((repo) => {
			const file = path.join(repo, TOKENS_CSS_PATH);
			fs.writeFileSync(
				file,
				inBothBlocks(
					fs.readFileSync(file, "utf8"),
					"--ec-color-planted: #123456;",
				),
			);
			const before = snapshotDir(repo);
			const result = run(repo, ["--check", "--base", "main"]);
			expect(result.status).toBe(1);
			expect(result.stderr).toContain("CATALOG CHECK FAILED");
			expect(result.stderr).toContain("unmapped");
			expect(result.stderr).toContain("--ec-color-planted");
			assertDirEffect(before, snapshotDir(repo), {});
		});
	});

	test("shown red: a deleted TOKEN-MAP.md is stale, and --write regenerates the same bytes", () => {
		withRepo((repo) => {
			const view = path.join(repo, TOKEN_MAP_MD_PATH);
			const expected = fs.readFileSync(view, "utf8");
			fs.rmSync(view);
			const before = snapshotDir(repo);
			const stale = run(repo, ["--check", "--base", "main"]);
			expect(stale.status).toBe(1);
			expect(stale.stderr).toContain(
				"TOKEN-MAP.md is stale; run yarn catalog:write",
			);
			assertDirEffect(before, snapshotDir(repo), {});
			const written = run(repo, ["--write"]);
			expect(written.status, written.stderr).toBe(0);
			expect(fs.readFileSync(view, "utf8")).toBe(expected);
			const again = run(repo, ["--check", "--base", "main"]);
			expect(again.status, again.stderr).toBe(0);
			expect(again.stdout).toContain("8 generated files current");
		});
	});
});
