// CSS and TypeScript custom-property scans for the token map (Phase 74, SPEC-02, D-17).
//
// There is no CSS parser here, and no dependency, by decision (D-17): the scans
// are a comment stripper, a depth-counting brace matcher and three narrow
// patterns, all pure over `(fileName, text)` so a test plants a defect as a
// string. Only `listTokenScanFiles` touches the disk, and it stays under
// src/renderer, which both Storybook path lists cover (Pitfall 6).
//
// Regex discipline (ReDoS, T-74-08): every pattern is one pass with no nested
// quantifiers; comments are cut with indexOf between fixed delimiters; braces
// are matched by a character loop with a stack, not a regex.
import fs from "node:fs";
import path from "node:path";
import { compareCodeUnits, resolveInRoot } from "./closed.mjs";

// The renderer tree the used-set scan reads. Scanning all of `src` adds false
// names (`--open-file`, a Windows launch argument in src/main; RESEARCH R-03).
export const TOKEN_SCAN_ROOT = "src/renderer";

const SCAN_EXTENSIONS = [".css", ".ts", ".tsx"];

// `var(--name` in any file, and a quoted key such as `"--ec-stagger-delay":`
// or `setProperty("--ec-color-accent", ...)` in a script. `--` after a letter
// is not a custom property (a BEM modifier such as `type-pill--${modifier}`).
const VAR_USE = /var\(\s*(--[A-Za-z0-9_-]+)/g;
const QUOTED_KEY = /["'`](--[A-Za-z][A-Za-z0-9_-]*)["'`]/g;
const DYNAMIC_NAME = /["'`(]\s*(--[A-Za-z0-9_-]*)\$\{/g;

/**
 * @param {string} text
 * @returns {string} the same text with every non-newline character replaced by a space
 */
function blank(text) {
	return text.replace(/[^\n]/g, " ");
}

/**
 * Replaces every `/* ... *\/` comment with spaces of equal length, keeping the
 * newlines, so line numbers survive. An unterminated comment runs to the end.
 *
 * @param {string} text
 * @returns {string}
 */
export function stripCssComments(text) {
	let out = "";
	let index = 0;
	while (index < text.length) {
		const start = text.indexOf("/*", index);
		if (start === -1) {
			out += text.slice(index);
			break;
		}
		const end = text.indexOf("*/", start + 2);
		const stop = end === -1 ? text.length : end + 2;
		out += text.slice(index, start) + blank(text.slice(start, stop));
		index = stop;
	}
	return out;
}

/**
 * The index after a string literal that opens at `start`. `"` and `'` strings
 * stop at the end of the line (a JSX text apostrophe must not swallow the next
 * lines); a backtick string runs to its closing backtick. A backslash escapes
 * the next character.
 *
 * @param {string} text
 * @param {number} start
 * @param {string} quote
 * @returns {number}
 */
function skipString(text, start, quote) {
	let index = start + 1;
	while (index < text.length) {
		const char = text[index];
		if (char === "\\") {
			index += 2;
			continue;
		}
		if (char === quote) return index + 1;
		if (char === "\n" && quote !== "`") return index;
		index += 1;
	}
	return text.length;
}

/**
 * Removes `//` line comments and `/* *\/` block comments that sit outside string
 * and template literals, replacing them with spaces and keeping the newlines.
 *
 * @param {string} text
 * @returns {string}
 */
export function stripScriptComments(text) {
	let out = "";
	let copied = 0;
	let index = 0;
	while (index < text.length) {
		const char = text[index];
		if (char === '"' || char === "'" || char === "`") {
			index = skipString(text, index, char);
			continue;
		}
		if (char === "/" && text[index + 1] === "/") {
			const newline = text.indexOf("\n", index);
			const stop = newline === -1 ? text.length : newline;
			out += text.slice(copied, index) + blank(text.slice(index, stop));
			copied = stop;
			index = stop;
			continue;
		}
		if (char === "/" && text[index + 1] === "*") {
			const end = text.indexOf("*/", index + 2);
			const stop = end === -1 ? text.length : end + 2;
			out += text.slice(copied, index) + blank(text.slice(index, stop));
			copied = stop;
			index = stop;
			continue;
		}
		index += 1;
	}
	return out + text.slice(copied);
}

/**
 * @param {string} text
 * @returns {string}
 */
function collapse(text) {
	return text.replace(/\s+/g, " ").trim();
}

/**
 * Every declaration in the comment-stripped CSS, each with the chain of block
 * preludes that enclose it (`["@media (min-width: 1px)", ":root"]`), brace
 * matched with a stack so a block inside `@media` is seen. A declaration is a
 * statement of its own block only; a multi-line value is joined. A semicolon,
 * brace or colon inside a string or a parenthesis does not end a statement.
 *
 * @param {string} css
 * @returns {Array<{ selectors: string[], property: string, value: string, line: number }>}
 */
export function cssDeclarations(css) {
	const text = stripCssComments(css);
	/** @type {Array<{ selectors: string[], property: string, value: string, line: number }>} */
	const declarations = [];
	/** @type {string[]} */
	const preludes = [];
	let buffer = "";
	let bufferLine = 1;
	let line = 1;
	let parens = 0;

	/** @param {string} piece */
	const append = (piece) => {
		if (buffer === "" && piece.trim() === "") return;
		if (buffer === "") bufferLine = line;
		buffer += piece;
	};
	const emit = () => {
		const statement = collapse(buffer);
		const startLine = bufferLine;
		buffer = "";
		const colon = statement.indexOf(":");
		if (colon <= 0) return;
		declarations.push({
			selectors: [...preludes],
			property: statement.slice(0, colon).trim(),
			value: statement.slice(colon + 1).trim(),
			line: startLine,
		});
	};

	let index = 0;
	while (index < text.length) {
		const char = text[index] ?? "";
		if (char === '"' || char === "'") {
			const stop = skipString(text, index, char);
			const piece = text.slice(index, stop);
			append(piece);
			line += piece.split("\n").length - 1;
			index = stop;
			continue;
		}
		if (char === "(") parens += 1;
		else if (char === ")" && parens > 0) parens -= 1;
		if (parens === 0 && char === "{") {
			preludes.push(collapse(buffer));
			buffer = "";
		} else if (parens === 0 && char === ";") {
			emit();
		} else if (parens === 0 && char === "}") {
			emit();
			if (preludes.length > 0) preludes.pop();
		} else {
			append(char);
		}
		if (char === "\n") line += 1;
		index += 1;
	}
	emit();
	return declarations;
}

/**
 * The custom-property declarations: the declarations whose property starts `--`.
 *
 * @param {string} css
 * @returns {Array<{ selectors: string[], property: string, value: string, line: number }>}
 */
export function customPropertyDeclarations(css) {
	return cssDeclarations(css).filter((found) =>
		found.property.startsWith("--"),
	);
}

/**
 * @param {string} fileName
 * @returns {boolean}
 */
function isScript(fileName) {
	return fileName.endsWith(".ts") || fileName.endsWith(".tsx");
}

/**
 * @param {string} fileName
 * @param {string} text
 * @returns {string} the text with this file kind's comments removed
 */
function withoutComments(fileName, text) {
	if (isScript(fileName)) return stripScriptComments(text);
	if (fileName.endsWith(".css")) return stripCssComments(text);
	return text;
}

/**
 * @param {RegExp} pattern a global pattern with one capture group
 * @param {string} text
 * @param {Set<string>} into
 */
function collect(pattern, text, into) {
	for (const match of text.matchAll(pattern)) {
		if (match[1] !== undefined) into.add(match[1]);
	}
}

/**
 * The custom properties a file uses: `var(--x` in any file, plus a quoted key
 * `"--x"` in a `.ts` or `.tsx` file (an inline style key or a `setProperty`
 * name). Comments are removed first. Sorted, unique, no prefix filter.
 *
 * @param {string} fileName
 * @param {string} text
 * @returns {string[]}
 */
export function usedCustomProperties(fileName, text) {
	const source = withoutComments(fileName, text);
	const names = new Set();
	collect(VAR_USE, source, names);
	if (isScript(fileName)) collect(QUOTED_KEY, source, names);
	return [...names].sort(compareCodeUnits);
}

/**
 * A custom-property name built from a template (`` `--ec-${x}` ``), which no
 * static scan can enumerate. Only `.ts` and `.tsx` files, never `*.d.ts` (a
 * template literal type such as `` `--${string}` `` allows any name). A `--`
 * that follows a letter is a BEM modifier, not a custom property.
 *
 * @param {string} fileName
 * @param {string} text
 * @returns {string[]} the name prefixes before each `${`, sorted and unique
 */
export function dynamicCustomPropertyNames(fileName, text) {
	if (!isScript(fileName) || fileName.endsWith(".d.ts")) return [];
	const names = new Set();
	collect(DYNAMIC_NAME, stripScriptComments(text), names);
	return [...names].sort(compareCodeUnits);
}

/**
 * @param {string} directory
 * @param {string[]} out
 */
function walk(directory, out) {
	for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
		if (entry.isSymbolicLink()) continue;
		const absolute = path.join(directory, entry.name);
		if (entry.isDirectory()) {
			walk(absolute, out);
		} else if (
			entry.isFile() &&
			SCAN_EXTENSIONS.some((extension) => entry.name.endsWith(extension)) &&
			!entry.name.endsWith(".d.ts")
		) {
			out.push(absolute);
		}
	}
}

/**
 * The files the used-set scan reads: every `.css`, `.ts` and `.tsx` file under
 * src/renderer except `*.d.ts`, symbolic links skipped, repo-relative POSIX
 * paths in code-unit order, each resolved inside the root (T-74-07).
 *
 * @param {string} root
 * @returns {string[]}
 */
export function listTokenScanFiles(root) {
	const files = [];
	walk(path.join(root, TOKEN_SCAN_ROOT), files);
	return files
		.map((file) => path.relative(root, file).split(path.sep).join("/"))
		.sort(compareCodeUnits)
		.map((relative) => {
			if (resolveInRoot(root, relative) === null) {
				throw new Error(
					`${relative} cannot be scanned for custom properties: its path is not a plain path inside the repository`,
				);
			}
			return relative;
		});
}
