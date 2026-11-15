// PLN-01 spike (76-01), S1: the honest palette projection (D-22).
//
// Reads `adopt` and `derive` rows of .storybook/catalog/token_map.json and resolves every
// brand key against the pinned brand cache's tokens.json with the repo's own
// resolveTokenPath (own-property walk, null on any miss). A null resolution, a hex that
// disagrees with the hex the token map records, or a missing cache is a hard failure
// (exit 1): the palette is never guessed. Only values and the declared alias merge of a
// `derive` row are applied; CSS-property work (accent-as-text and the like) is not
// applied and so earns no credit. The values are written into the working tree's
// src/renderer/styles/tokens.css for both themes. That edit is scratch: it lives only in
// the CI job's working tree and is never committed (the base gate would reject it).
//
// Prints a `name (theme) -> hex -> source path` table to stdout and spike-out/s1_palette.txt.
import fs from "node:fs";
import path from "node:path";
import { resolveTokenPath } from "../.storybook/catalog/brand_quote_check.mjs";

const ROOT = process.cwd();
const TOKEN_MAP = path.join(ROOT, ".storybook/catalog/token_map.json");
const BRAND_TOKENS =
	process.env.S1_BRAND_TOKENS ??
	path.join(ROOT, ".brand-cache/unpacked/exifcleaner-brand/tokens.json");
const TOKENS_CSS = path.join(ROOT, "src/renderer/styles/tokens.css");
const OUT = path.join(ROOT, "spike-out");
const THEMES = ["light", "dark"];

function fail(message) {
	console.error(`S1 palette FAILED: ${message}`);
	process.exit(1);
}

if (!fs.existsSync(BRAND_TOKENS)) {
	fail(`brand cache missing: ${BRAND_TOKENS} (run yarn brand:fetch)`);
}
const brand = JSON.parse(fs.readFileSync(BRAND_TOKENS, "utf8"));
const map = JSON.parse(fs.readFileSync(TOKEN_MAP, "utf8"));
if (!Array.isArray(map.entries)) fail("token_map.json has no entries array");

// name, theme, hex (as the brand book writes it), source path
const applied = [];

function resolveOrFail(name, theme, tokenPath) {
	const hex = resolveTokenPath(brand, tokenPath);
	if (hex === null) fail(`${name} (${theme}): ${tokenPath} does not resolve in tokens.json`);
	return hex;
}

for (const entry of map.entries) {
	if (entry.disposition === "adopt") {
		for (const theme of THEMES) {
			const side = entry.brand?.[theme];
			if (side?.token === undefined || side?.hex === undefined) {
				fail(`${entry.name}: adopt row has no brand.${theme}.token/hex`);
			}
			const hex = resolveOrFail(entry.name, theme, side.token);
			if (hex.toLowerCase() !== String(side.hex).toLowerCase()) {
				fail(`${entry.name} (${theme}): tokens.json ${side.token} is ${hex} but token_map.json says ${side.hex}`);
			}
			applied.push({ name: entry.name, theme, hex, source: side.token, kind: "adopt" });
		}
	} else if (entry.disposition === "derive") {
		// The declared alias merge: `from` lists the brand keys the derived token takes its
		// light and dark values from, in that order.
		if (!Array.isArray(entry.from) || entry.from.length !== 2) {
			fail(`${entry.name}: derive row has no two-element from`);
		}
		THEMES.forEach((theme, index) => {
			const source = entry.from[index];
			const hex = resolveOrFail(entry.name, theme, source);
			applied.push({ name: entry.name, theme, hex, source, kind: "derive" });
		});
	}
}
if (applied.length < 8) fail(`only ${applied.length} palette rows resolved (expected at least 8)`);

// Rewrite one custom-property value inside the block that opens with `selector`.
let css = fs.readFileSync(TOKENS_CSS, "utf8");
function blockBounds(selectorLine) {
	const start = css.indexOf(selectorLine);
	if (start < 0) fail(`tokens.css has no ${selectorLine}`);
	const end = css.indexOf("\n}", start);
	if (end < 0) fail(`tokens.css block ${selectorLine} is not closed`);
	return [start, end];
}
for (const row of applied) {
	const selector = row.theme === "light" ? ":root {" : '[data-theme="dark"] {';
	const [start, end] = blockBounds(selector);
	const block = css.slice(start, end);
	const pattern = new RegExp(`(\\n\\s*${row.name.replace(/[-]/g, "\\-")}:\\s*)([^;]+)(;)`);
	if (!pattern.test(block)) fail(`${row.name} is not declared in the ${row.theme} block of tokens.css`);
	css = css.slice(0, start) + block.replace(pattern, `$1${row.hex}$3`) + css.slice(end);
}
fs.writeFileSync(TOKENS_CSS, css);

const lines = applied.map(
	(row) =>
		`${row.name} (${row.theme}) -> ${row.hex} -> ${row.source}${row.kind === "derive" ? " (derive alias)" : ""}`,
);
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, "s1_palette.txt"), `${lines.join("\n")}\n`);
console.log(lines.join("\n"));
console.log(`S1 palette: ${applied.length} values applied to ${path.relative(ROOT, TOKENS_CSS)} (scratch, never committed)`);
