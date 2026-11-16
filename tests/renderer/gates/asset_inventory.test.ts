import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

// GAT-04 / D-16: every image-bearing construct in the shipped renderer sources is pinned to an
// exact (file, kind, count) allow-list. A new inline svg, an img element, a `url(` in a
// stylesheet, an `image-set(`, a `data:image` string or an image import is a row the allow-list
// lacks, so the test is red until a reviewer lists it on purpose. A row that no longer matches
// (an asset removed, or its count lowered) is red too, so the list can never excuse a thing
// that is gone.
//
// Kinds: svg, img, image, use (each an opening tag, so `<user` and `<imagery` are not hits),
// url (`url(`), image-set (`image-set(` and `-webkit-image-set(`), data-image (`data:image`)
// and image-import (an import or dynamic import of a png, jpg, jpeg, gif, webp, avif, svg or
// ico path).
//
// Interpretation of REQUIREMENTS GAT-04 "in src/renderer": the scan covers the shipped sources
// (every .ts, .tsx and .css file) and excludes `*.stories.tsx` (and `*.stories.ts`) and
// `src/renderer/story_support/**`, which are test support and never packaged
// (`story_support_imports.test.ts` enforces that). The exclusion is asserted below, against a
// recursive listing, so a scanner that quietly skipped more than that is red.
//
// The allow-list is generated from this scanner, never typed from a prose count:
//   ASSET_INVENTORY_WRITE=1 yarn vitest run tests/renderer/gates/asset_inventory.test.ts
// rewrites it from the scan (refused when CI is set), and the diff is reviewed like any data.

const REPO = fileURLToPath(new URL("../../..", import.meta.url));
const RENDERER_DIR = "src/renderer";
const ALLOW_PATH = "tests/renderer/gates/asset_inventory_allow.json";
const SCANNED_EXTENSIONS = [".ts", ".tsx", ".css"];

type AssetKind =
	| "data-image"
	| "image"
	| "image-import"
	| "image-set"
	| "img"
	| "svg"
	| "url"
	| "use";

type AssetRow = { file: string; kind: AssetKind; count: number };

// A tag name counts only when the next character ends the name: whitespace, `>` or `/`.
const TAG_END = "(?=[\\s>/])";
const IMAGE_EXTENSIONS = "png|jpe?g|gif|webp|avif|svg|ico";

const PATTERNS: ReadonlyArray<{ kind: AssetKind; pattern: RegExp }> = [
	{ kind: "svg", pattern: new RegExp(`<svg${TAG_END}`, "gi") },
	{ kind: "img", pattern: new RegExp(`<img${TAG_END}`, "gi") },
	{ kind: "image", pattern: new RegExp(`<image${TAG_END}`, "gi") },
	{ kind: "use", pattern: new RegExp(`<use${TAG_END}`, "gi") },
	// Not `new URL(`, not a method (`.url(`), not the tail of another name (`toURL(`).
	{ kind: "url", pattern: /(?<!new\s)(?<![\w$.-])url\(/gi },
	{ kind: "image-set", pattern: /(?<![\w$.])(?:-webkit-)?image-set\(/gi },
	{ kind: "data-image", pattern: /data:image/gi },
	{
		kind: "image-import",
		pattern: new RegExp(
			`(?:\\bfrom|\\bimport\\s*\\(?)\\s*["'][^"'\\n]*\\.(?:${IMAGE_EXTENSIONS})(?:\\?[^"'\\n]*)?["']`,
			"gi",
		),
	},
];

function compareCodeUnits(a: string, b: string): number {
	return a < b ? -1 : a > b ? 1 : 0;
}

function compareRows(a: AssetRow, b: AssetRow): number {
	return compareCodeUnits(a.file, b.file) || compareCodeUnits(a.kind, b.kind);
}

// Global patterns are used only through String.prototype.match, which returns every match and
// leaves no lastIndex behind (a global `.test` would be stateful).
function assetHits({ file, text }: { file: string; text: string }): AssetRow[] {
	const rows: AssetRow[] = [];
	for (const { kind, pattern } of PATTERNS) {
		const count = text.match(pattern)?.length ?? 0;
		if (count > 0) rows.push({ file, kind, count });
	}
	return rows.sort(compareRows);
}

function isExcluded(relative: string): boolean {
	return (
		/\.stories\.tsx?$/.test(relative) ||
		relative.startsWith(`${RENDERER_DIR}/story_support/`)
	);
}

function walk(directory: string): string[] {
	const found: string[] = [];
	for (const entry of fs.readdirSync(path.join(REPO, directory), {
		withFileTypes: true,
	})) {
		const relative = `${directory}/${entry.name}`;
		if (entry.isDirectory()) found.push(...walk(relative));
		else if (SCANNED_EXTENSIONS.some((ext) => entry.name.endsWith(ext))) {
			found.push(relative);
		}
	}
	return found.sort(compareCodeUnits);
}

function scanTree(): { files: string[]; rows: AssetRow[] } {
	const files = walk(RENDERER_DIR).filter((file) => !isExcluded(file));
	const rows = files
		.flatMap((file) =>
			assetHits({
				file,
				text: fs.readFileSync(path.join(REPO, file), "utf8"),
			}),
		)
		.sort(compareRows);
	return { files, rows };
}

function serialize(rows: AssetRow[]): string {
	return `${JSON.stringify({ rows }, null, "\t")}\n`;
}

// Both directions: an unlisted row, a stale row and a changed count are each a problem.
function inventoryProblems({
	scanned,
	allowed,
}: {
	scanned: AssetRow[];
	allowed: AssetRow[];
}): string[] {
	const key = (row: AssetRow): string => `${row.file}|${row.kind}`;
	const allowedByKey = new Map(allowed.map((row) => [key(row), row.count]));
	const scannedByKey = new Map(scanned.map((row) => [key(row), row.count]));
	const problems: string[] = [];
	for (const row of scanned) {
		const listed = allowedByKey.get(key(row));
		if (listed === undefined) {
			problems.push(`unlisted: ${key(row)} x${row.count}`);
		} else if (listed !== row.count) {
			problems.push(`count: ${key(row)} found ${row.count}, listed ${listed}`);
		}
	}
	for (const row of allowed) {
		if (!scannedByKey.has(key(row))) problems.push(`stale: ${key(row)}`);
	}
	return problems.sort();
}

if (process.env["ASSET_INVENTORY_WRITE"] === "1") {
	if (process.env["CI"] !== undefined) {
		throw new Error(
			"ASSET_INVENTORY_WRITE rewrites the allow-list and must never run in CI",
		);
	}
	fs.writeFileSync(path.join(REPO, ALLOW_PATH), serialize(scanTree().rows));
}

function readAllowText(): string {
	return fs.readFileSync(path.join(REPO, ALLOW_PATH), "utf8");
}

describe("GAT-04 asset inventory: the real tree", () => {
	const { files, rows } = scanTree();
	const allowText = readAllowText();
	const allowed = (JSON.parse(allowText) as { rows: AssetRow[] }).rows;

	test("the inventory equals the allow-list exactly (file, kind, count)", () => {
		expect(
			inventoryProblems({ scanned: rows, allowed }),
			"unlisted, stale or changed asset rows: remove the asset, or regenerate tests/renderer/gates/asset_inventory_allow.json with ASSET_INVENTORY_WRITE=1 and review the diff",
		).toEqual([]);
		expect(rows).toEqual(allowed);
	});

	test("the allow-list is non-empty, sorted, unique and serialised tab-indented", () => {
		expect(allowed.length).toBeGreaterThan(0);
		expect(allowed.some((row) => row.kind === "svg")).toBe(true);
		expect(allowText).toBe(serialize(allowed));
		const keys = allowed.map((row) => `${row.file}|${row.kind}`);
		expect(new Set(keys).size).toBe(keys.length);
		expect(keys).toEqual([...keys].sort(compareCodeUnits));
		for (const row of allowed) {
			expect(Number.isInteger(row.count) && row.count > 0, row.file).toBe(true);
			expect(
				/\.stories\.tsx?$|story_support/.test(row.file),
				`${row.file} is excluded from the scan and cannot be listed`,
			).toBe(false);
		}
	});

	test("anti-vacuity: the stories and story_support exist on disk and none of them is scanned", () => {
		const listing = (
			fs.readdirSync(path.join(REPO, RENDERER_DIR), {
				recursive: true,
			}) as string[]
		)
			.map((name) => `${RENDERER_DIR}/${name.split(path.sep).join("/")}`)
			.filter((name) => SCANNED_EXTENSIONS.some((ext) => name.endsWith(ext)));
		const excludedOnDisk = listing.filter(
			(name) =>
				name.includes(".stories.") ||
				name.startsWith(`${RENDERER_DIR}/story_support/`),
		);
		// The exclusion is asserted, not assumed: such files exist, and none is in the scan.
		expect(excludedOnDisk.some((name) => name.endsWith(".stories.tsx"))).toBe(
			true,
		);
		expect(
			excludedOnDisk.some((name) =>
				name.startsWith(`${RENDERER_DIR}/story_support/`),
			),
		).toBe(true);
		expect(files.filter((file) => file.includes(".stories."))).toEqual([]);
		expect(
			files.filter((file) => file.startsWith(`${RENDERER_DIR}/story_support/`)),
		).toEqual([]);
		// The scanned count is the listing minus exactly the excluded files.
		expect(files.length).toBe(listing.length - excludedOnDisk.length);
		expect(files.length).toBeGreaterThan(0);
		expect([...files].sort(compareCodeUnits)).toEqual(
			listing
				.filter((name) => !excludedOnDisk.includes(name))
				.sort(compareCodeUnits),
		);
	});
});

describe("GAT-04 asset inventory: planted controls", () => {
	test("a stray inline svg string is an unlisted `svg` row", () => {
		const planted = assetHits({
			file: "src/renderer/Planted.tsx",
			text: 'const x = <svg viewBox="0 0 1 1" />;',
		});
		expect(planted).toEqual([
			{ file: "src/renderer/Planted.tsx", kind: "svg", count: 1 },
		]);
		expect(inventoryProblems({ scanned: planted, allowed: [] })).toEqual([
			"unlisted: src/renderer/Planted.tsx|svg x1",
		]);
		// Against the real allow-list too: the real scan plus the plant is red.
		const real = scanTree().rows;
		const allowed = (JSON.parse(readAllowText()) as { rows: AssetRow[] }).rows;
		expect(
			inventoryProblems({ scanned: [...real, ...planted], allowed }),
		).toEqual(["unlisted: src/renderer/Planted.tsx|svg x1"]);
	});

	test("a raised count, a stale row and a removed row are each reported", () => {
		const allowed: AssetRow[] = [
			{ file: "a.tsx", kind: "svg", count: 2 },
			{ file: "b.css", kind: "url", count: 1 },
		];
		expect(
			inventoryProblems({
				scanned: [{ file: "a.tsx", kind: "svg", count: 3 }],
				allowed,
			}),
		).toEqual(["count: a.tsx|svg found 3, listed 2", "stale: b.css|url"]);
	});

	test("two svg openings are a count of 2", () => {
		expect(
			assetHits({ file: "a.tsx", text: "<svg><svg viewBox='0 0 1 1'>" }),
		).toEqual([{ file: "a.tsx", kind: "svg", count: 2 }]);
	});

	test.each([
		"<user>",
		"<usernames />",
		"<useless/>",
		"<imagery />",
		"<imageSet>",
		"<imgx />",
		"<svgs />",
	])("the tag lookahead does not count %j", (text) => {
		expect(assetHits({ file: "a.tsx", text })).toEqual([]);
	});

	test.each([
		['<use href="#a" />', "use"],
		['<image href="x.png" />', "image"],
		["<use\n\thref='#a'/>", "use"],
		["<img\n", "img"],
		["<svg>", "svg"],
		["<img/>", "img"],
	])("the tag lookahead counts %j as a `%s`", (text, kind) => {
		expect(assetHits({ file: "a.tsx", text })).toEqual([
			{ file: "a.tsx", kind, count: 1 },
		]);
	});

	test.each([
		[".a { background: url(x.png); }", "url"],
		[".a { background: URL(x.png); }", "url"],
		[".a { background: image-set(url(a.png) 1x); }", "image-set"],
		[".a { background: -webkit-image-set(a 1x); }", "image-set"],
		['const a = "data:image/png;base64,AAAA";', "data-image"],
		['import logo from "./logo.png";', "image-import"],
		["import logo from './logo.svg?url';", "image-import"],
		['import "./sprite.ico";', "image-import"],
		['const m = await import("./pic.webp");', "image-import"],
		['export { x } from "./a.avif";', "image-import"],
	])("flags %s as `%s`", (text, kind) => {
		const kinds = assetHits({ file: "a.css", text }).map((row) => row.kind);
		expect(kinds).toContain(kind);
	});

	test.each([
		'const u = new URL("https://example.invalid/x", base);',
		"const p = fileURLToPath(import.meta.url);",
		"const f = toURL(value);",
		"client.url(value);",
		'import { x } from "./icon_names";',
		'import data from "./data.json";',
		'const note = "a picture of data";',
	])("does not flag %s", (text) => {
		expect(assetHits({ file: "a.ts", text })).toEqual([]);
	});
});
