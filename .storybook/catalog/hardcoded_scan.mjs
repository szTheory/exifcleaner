// Pure TypeScript-AST scan of hardcoded renderer strings (LANG-01, D-08).
//
// A regex scan missed "Click to copy", the GearIcon ternary and multi-line
// text; the AST scan finds them all. `scanSource` is a pure function over
// (fileName, sourceText); `scanRenderer` walks src/renderer for *.tsx files
// and leaves story files out.
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { compareCodeUnits } from "./closed.mjs";

export const HARDCODED_ATTRIBUTES = Object.freeze([
	"aria-label",
	"title",
	"alt",
	"placeholder",
	"aria-description",
	"aria-valuetext",
	"aria-roledescription",
]);

const LETTERS = /\p{L}{2,}/u;

// A literal gets one kind; t-fallback beats attribute when the literal is the
// right operand of `t(..) ||` (RESEARCH C3), so the pair dedupes correctly.
const KIND_PRECEDENCE = ["t-fallback", "attribute", "jsx-text"];

/**
 * @param {string} fileName
 * @param {string} sourceText
 * @returns {Array<{ path: string, line: number, literal: string, kind: string }>}
 */
export function scanSource(fileName, sourceText) {
	const sf = ts.createSourceFile(
		fileName,
		sourceText,
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.TSX,
	);
	const findings = [];
	const lineOf = (node) =>
		sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
	const add = (node, literal, kind) => {
		findings.push({ path: fileName, line: lineOf(node), literal, kind });
	};
	// String literals under an expression, outside any call (so t("x") args are not hardcoded).
	const strings = (expression) => {
		const visit = (node) => {
			if (ts.isCallExpression(node)) return;
			if (ts.isStringLiteralLike(node) && LETTERS.test(node.text)) {
				add(node, node.text, "attribute");
			}
			ts.forEachChild(node, visit);
		};
		visit(expression);
	};
	const visit = (node) => {
		if (ts.isJsxText(node) && LETTERS.test(node.text)) {
			add(node, node.text.trim().replace(/\s+/g, " "), "jsx-text");
		}
		if (
			ts.isJsxAttribute(node) &&
			HARDCODED_ATTRIBUTES.includes(node.name.getText(sf)) &&
			node.initializer !== undefined
		) {
			if (ts.isStringLiteral(node.initializer)) {
				add(node.initializer, node.initializer.text, "attribute");
			} else if (
				ts.isJsxExpression(node.initializer) &&
				node.initializer.expression !== undefined
			) {
				strings(node.initializer.expression);
			}
		}
		if (
			ts.isBinaryExpression(node) &&
			(node.operatorToken.kind === ts.SyntaxKind.BarBarToken ||
				node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken) &&
			ts.isStringLiteral(node.right) &&
			node.left.getText(sf).startsWith("t(")
		) {
			add(node.right, node.right.text, "t-fallback");
		}
		ts.forEachChild(node, visit);
	};
	visit(sf);
	return findings;
}

function walk(directory, out) {
	for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
		const absolute = path.join(directory, entry.name);
		if (entry.isDirectory()) {
			walk(absolute, out);
		} else if (
			entry.name.endsWith(".tsx") &&
			!entry.name.endsWith(".stories.tsx")
		) {
			out.push(absolute);
		}
	}
}

/**
 * Repo-relative `src/renderer/**` `*.tsx` paths, stories excluded, sorted.
 *
 * @param {string} root
 * @returns {string[]}
 */
export function listRendererSources(root) {
	const files = [];
	walk(path.join(root, "src/renderer"), files);
	return files
		.map((file) => path.relative(root, file).split(path.sep).join("/"))
		.sort(compareCodeUnits);
}

/**
 * @param {string} root
 */
export function scanRenderer(root) {
	return listRendererSources(root).flatMap((relPath) =>
		scanSource(relPath, fs.readFileSync(path.join(root, relPath), "utf8")),
	);
}

/**
 * Unique by path plus literal, sorted, keeping the precedence kind.
 *
 * @param {Array<{ path: string, literal: string, kind: string }>} findings
 * @returns {Array<{ path: string, literal: string, kind: string }>}
 */
export function uniquePairs(findings) {
	const byPair = new Map();
	for (const finding of findings) {
		const key = `${finding.path}\u0000${finding.literal}`;
		const kept = byPair.get(key);
		if (
			kept === undefined ||
			KIND_PRECEDENCE.indexOf(finding.kind) < KIND_PRECEDENCE.indexOf(kept.kind)
		) {
			byPair.set(key, {
				path: finding.path,
				literal: finding.literal,
				kind: finding.kind,
			});
		}
	}
	return [...byPair.values()].sort(
		(a, b) =>
			compareCodeUnits(a.path, b.path) ||
			compareCodeUnits(a.literal, b.literal),
	);
}
