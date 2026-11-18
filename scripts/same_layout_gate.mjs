import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import postcss from "postcss";
import ts from "typescript";

export const BASELINE = "b0b566be89886e75929a3da3edeed1497a09a299";
export const TOGGLE_TRANSITION = "left 200ms cubic-bezier(0.34, 1.56, 0.64, 1)";
export const EXCEPTIONS_PATH = "scripts/same_layout_exceptions.json";
export const EXPECTED_EXCEPTIONS = {
	schemaVersion: 1,
	baseline: BASELINE,
	exceptions: [
		{
			id: "D-03",
			helper: "src/renderer/utils/escaped_name.tsx",
			shape: 'bdi.file-table__bidi-escape[dir="ltr"]',
			evidence: ".planning/phases/76-trust-rtl-and-gates-first/76-EVIDENCE.md",
			callSites: [
				{
					source: "src/renderer/components/file-list/FileRow.tsx",
					parent: 'bdi.file-table__name-text[dir="auto"]',
					segments: "shownNameSegments",
				},
				{
					source: "src/renderer/components/file-list/FolderRow.tsx",
					parent: 'bdi.folder-row__label[dir="auto"]',
					segments: "displayLabelSegments",
				},
				{
					source: "src/renderer/components/file-list/ErrorExpansion.tsx",
					parent: "pre.file-table__error-text",
					segments: "displayNameSegments({ name: error })",
				},
			],
		},
		{
			id: "SUR-03",
			source: "src/renderer/components/ui/EmptyState.tsx",
			slot: "div.empty-state__inner > decorative-icon",
			baseline: "svg.empty-state__icon",
			evidence:
				".planning/phases/79-chrome-and-intake-surfaces/79-EVIDENCE.json",
			assets: [
				{
					path: "src/renderer/assets/brand/exifcleaner-symbol-light.svg",
					sha256:
						"1f9f1b9a0ebca99fa5841f8782a409f1131546d49cffa4932a5eeabc9c425def",
					variant: "light",
				},
				{
					path: "src/renderer/assets/brand/exifcleaner-symbol-dark.svg",
					sha256:
						"84e7e40ddb52e3c1047a2dbf3bcc777349ed3f6a403b42c4cabe96f0883f918b",
					variant: "dark",
				},
			],
		},
		{
			id: "VIS-80-REVIEW",
			source: "src/renderer/styles/file_table.css",
			property: "grid-template-columns",
			selectors: [".file-table__header", ".file-table__row"],
			baseline: "24px 1fr 72px 80px 88px 88px",
			candidate:
				"24px minmax(0, 1fr) 76px 128px 56px minmax(72px, max-content)",
			evidence:
				".planning/phases/80-evidence-and-close/80-MAINTAINER-REPLIES.md",
		},
		{
			id: "VIS-80-SPINNER-CLARITY",
			source: "src/renderer/styles/status_icon.css",
			selector: ".status-icon__spinner",
			baseline: [
				[
					["width", "16px"],
					["height", "16px"],
					["border", "2px solid transparent"],
					["border-top-color", "var(--ec-color-muted)"],
					["border-radius", "50%"],
				],
				[["animation", "ec-spin 1s linear infinite"]],
			],
			candidate: [
				[
					["width", "16px"],
					["height", "16px"],
					["border", "2px solid var(--ec-color-border)"],
					["border-top-color", "var(--ec-color-text-secondary)"],
					["border-radius", "50%"],
				],
				[["animation", "ec-spin 1s linear infinite"]],
			],
			evidence:
				".planning/phases/80-evidence-and-close/80-MAINTAINER-REPLIES.md",
		},
		{
			id: "VIS-80-ERROR-SUMMARY",
			source: "src/renderer/styles/file_table.css",
			selector: ".file-table__error-summary",
			baseline: [],
			candidate: [
				[
					["display", "block"],
					["overflow", "hidden"],
					["text-overflow", "ellipsis"],
					["white-space", "nowrap"],
					["color", "var(--ec-color-text-secondary)"],
					["font-size", "var(--ec-font-size-small)"],
					["line-height", "var(--ec-line-height-normal)"],
				],
			],
			evidence:
				".planning/phases/80-evidence-and-close/80-MAINTAINER-REPLIES.md",
		},
		{
			id: "VIS-80-CHEVRON",
			source: "src/renderer/components/icons/ChevronIcon.tsx",
			element: "svg",
			before: { width: "12", height: "12", strokeWidth: "1.5" },
			after: {
				width: "expanded ? 16 : 12",
				height: "expanded ? 16 : 12",
				strokeWidth: "expanded ? 2 : 1.5",
			},
			evidence:
				".planning/phases/80-evidence-and-close/80-MAINTAINER-REPLIES.md",
		},
		{
			id: "COPY-80-REVIEW",
			sourceDirectory: ".resources/locales",
			keys: ["intake.chooseFiles", "intake.chooseFolder"],
			removeTrailing: "…",
			evidence:
				".planning/phases/80-evidence-and-close/80-MAINTAINER-REPLIES.md",
		},
	],
};

const FILE_ROW = "src/renderer/components/file-list/FileRow.tsx";
const ESCAPED_NAME = "src/renderer/utils/escaped_name.tsx";
const EMPTY_STATE = "src/renderer/components/ui/EmptyState.tsx";
const D03_CALLSITES = [
	{
		file: FILE_ROW,
		parentTag: "bdi",
		parentClass: "file-table__name-text",
		parentDir: "auto",
		segments: "shownNameSegments",
	},
	{
		file: "src/renderer/components/file-list/FolderRow.tsx",
		parentTag: "bdi",
		parentClass: "folder-row__label",
		parentDir: "auto",
		segments: "displayLabelSegments",
	},
	{
		file: "src/renderer/components/file-list/ErrorExpansion.tsx",
		parentTag: "pre",
		parentClass: "file-table__error-text",
		segments: "displayNameSegments({ name: error })",
	},
];
const LOCALE_EXCEPTION = EXPECTED_EXCEPTIONS.exceptions.find(
	(exception) => exception.id === "COPY-80-REVIEW",
);
const LOCALE_DIRECTORY = `${LOCALE_EXCEPTION.sourceDirectory}/`;
const FILE_TABLE_CSS = "src/renderer/styles/file_table.css";
const CHEVRON_ICON = "src/renderer/components/icons/ChevronIcon.tsx";
const APPROVED_TABLE_SELECTORS = [".file-table__header", ".file-table__row"];
const APPROVED_TABLE_COLUMNS =
	"24px minmax(0, 1fr) 76px 128px 56px minmax(72px, max-content)";
const BASELINE_TABLE_COLUMNS = "24px 1fr 72px 80px 88px 88px";
const BRAND_ASSETS = new Map([
	[
		"src/renderer/assets/brand/exifcleaner-symbol-light.svg",
		"1f9f1b9a0ebca99fa5841f8782a409f1131546d49cffa4932a5eeabc9c425def",
	],
	[
		"src/renderer/assets/brand/exifcleaner-symbol-dark.svg",
		"84e7e40ddb52e3c1047a2dbf3bcc777349ed3f6a403b42c4cabe96f0883f918b",
	],
]);
const APPROVED_NON_RENDERER_SOURCES = new Set([
	"src/domain/bidi_display_name.ts",
	"src/domain/index.ts",
	"src/domain/path_truncation.ts",
	"src/main/window/window_background.ts",
	"src/main/window/window_setup.ts",
]);
const COLOR_FUNCTIONS = new Set([
	"color",
	"color-mix",
	"device-cmyk",
	"hsl",
	"hsla",
	"hwb",
	"lab",
	"lch",
	"oklab",
	"oklch",
	"rgb",
	"rgba",
]);
const COLOR_KEYWORDS = new Set(
	(
		"aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood " +
		" cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod " +
		" darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon " +
		" darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray " +
		" dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green " +
		" greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon " +
		" lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon " +
		" lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen " +
		" magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue " +
		" mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite " +
		" navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred " +
		" papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown " +
		" salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen " +
		" steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen transparent " +
		" currentcolor canvas canvastext linktext visitedtext activetext buttonface buttontext buttonborder field " +
		" fieldtext highlight highlighttext graytext mark marktext selecteditem selecteditemtext accentcolor accentcolortext"
	)
		.trim()
		.split(/\s+/),
);

function gitBuffer(args, cwd) {
	return execFileSync("git", args, {
		cwd,
		encoding: "buffer",
		maxBuffer: 64 * 1024 * 1024,
	});
}

function gitText(args, cwd) {
	return execFileSync("git", args, {
		cwd,
		encoding: "utf8",
		maxBuffer: 64 * 1024 * 1024,
	});
}

export function readGitSnapshot(ref, cwd = process.cwd()) {
	const paths = gitBuffer(["ls-tree", "-r", "-z", "--name-only", ref], cwd)
		.toString("utf8")
		.split("\0")
		.filter(Boolean)
		.filter(
			(file) =>
				file.startsWith("src/renderer/") ||
				(file.startsWith(LOCALE_DIRECTORY) && file.endsWith(".json")),
		);
	const files = new Map();
	for (const file of paths) {
		if (
			file.endsWith(".tsx") ||
			file.endsWith(".css") ||
			(file.startsWith(LOCALE_DIRECTORY) && file.endsWith(".json")) ||
			BRAND_ASSETS.has(file)
		) {
			files.set(file, gitBuffer(["show", ref + ":" + file], cwd));
		}
	}
	return files;
}

export function changedPaths(base, head, cwd = process.cwd()) {
	return gitText(["diff", "--name-only", "-z", base, head], cwd)
		.split("\0")
		.filter(Boolean);
}

function bytes(files, file) {
	const value = files.get(file);
	return value === undefined
		? undefined
		: Buffer.isBuffer(value)
			? value
			: Buffer.from(String(value), "utf8");
}

function decode(files, file) {
	const value = bytes(files, file);
	return value === undefined ? undefined : value.toString("utf8");
}

function sha256(value) {
	return createHash("sha256").update(value).digest("hex");
}

function isProductionTsx(file) {
	return (
		file.startsWith("src/renderer/") &&
		file.endsWith(".tsx") &&
		!file.endsWith(".stories.tsx") &&
		!file.startsWith("src/renderer/story_support/")
	);
}

function isStyleCss(file) {
	return file.startsWith("src/renderer/styles/") && file.endsWith(".css");
}

function changedSourcePathProblems(paths) {
	const problems = [];
	for (const file of paths.filter((candidate) =>
		candidate.startsWith("src/"),
	)) {
		if (
			isProductionTsx(file) ||
			isStyleCss(file) ||
			file.endsWith(".stories.tsx") ||
			file.startsWith("src/renderer/story_support/") ||
			APPROVED_NON_RENDERER_SOURCES.has(file) ||
			BRAND_ASSETS.has(file)
		) {
			continue;
		}
		problems.push(
			"changed source path is outside the same-layout inventory: " + file,
		);
	}
	return problems;
}

function sourceFile(file, text) {
	const parsed = ts.createSourceFile(
		file,
		text,
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.TSX,
	);
	if (parsed.parseDiagnostics.length > 0) {
		const first = parsed.parseDiagnostics[0];
		throw new Error(
			"TypeScript parse failed for " +
				file +
				": " +
				ts.flattenDiagnosticMessageText(first.messageText, "\n"),
		);
	}
	return parsed;
}

function jsxRoots(node) {
	const roots = [];
	const visit = (current) => {
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

function meaningfulChildren(children) {
	return children.filter(
		(child) => !ts.isJsxText(child) || child.getText().trim().length > 0,
	);
}

function tagName(opening) {
	const tag = opening.tagName;
	if (ts.isIdentifier(tag)) return tag.text;
	if (ts.isPropertyAccessExpression(tag))
		return tag.expression.getText() + "." + tag.name.text;
	if (ts.isJsxNamespacedName(tag))
		return tag.namespace.text + ":" + tag.name.text;
	return tag.getText();
}

function jsxAttribute(opening, name) {
	return opening.attributes.properties.find(
		(property) =>
			ts.isJsxAttribute(property) && property.name.getText() === name,
	);
}

function literalAttribute(opening, name) {
	const initializer = jsxAttribute(opening, name)?.initializer;
	return initializer !== undefined && ts.isStringLiteral(initializer)
		? initializer.text
		: undefined;
}

function expressionAttribute(opening, name) {
	const initializer = jsxAttribute(opening, name)?.initializer;
	return initializer !== undefined &&
		ts.isJsxExpression(initializer) &&
		initializer.expression !== undefined
		? initializer.expression
		: undefined;
}

function elementOpening(node) {
	return ts.isJsxElement(node) ? node.openingElement : node;
}

function elementChildren(node) {
	return ts.isJsxElement(node) ? meaningfulChildren(node.children) : [];
}

function unwrapParentheses(node) {
	let current = node;
	while (ts.isParenthesizedExpression(current)) current = current.expression;
	return current;
}

function allJsxElements(source) {
	const elements = [];
	const visit = (node) => {
		if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
			elements.push(node);
		}
		ts.forEachChild(node, visit);
	};
	visit(source);
	return elements;
}

function allImports(source) {
	const imports = [];
	for (const statement of source.statements) {
		if (ts.isImportDeclaration(statement)) imports.push(statement);
	}
	return imports;
}

function checkBidiHelper(files, problems) {
	const text = decode(files, ESCAPED_NAME);
	if (text === undefined) {
		problems.push("approved D-03 helper is missing: " + ESCAPED_NAME);
		return;
	}
	let parsed;
	try {
		parsed = sourceFile(ESCAPED_NAME, text);
	} catch (error) {
		problems.push(error.message);
		return;
	}
	const jsx = allJsxElements(parsed);
	const bdi = jsx.filter((node) => tagName(elementOpening(node)) === "bdi");
	if (bdi.length !== 1) {
		problems.push("D-03 helper must contain exactly one bdi element");
		return;
	}
	const node = bdi[0];
	const opening = elementOpening(node);
	const props = opening.attributes.properties;
	const key = jsxAttribute(opening, "key");
	const dir = jsxAttribute(opening, "dir");
	const className = jsxAttribute(opening, "className");
	const keyExpression = key?.initializer;
	const dirValue = dir?.initializer;
	const classValue = className?.initializer;
	const children = elementChildren(node);
	const onlyTextExpression =
		children.length === 1 &&
		ts.isJsxExpression(children[0]) &&
		children[0].expression?.getText() === "segment.text";
	const callback = node.parent.parent;
	const conditional = ts.isConditionalExpression(callback)
		? callback
		: undefined;
	const expectedCondition =
		conditional?.condition.getText() === 'segment.kind === "escape"';
	const expectedFallback =
		conditional !== undefined &&
		unwrapParentheses(conditional.whenFalse).getText() === "segment.text";
	if (
		props.length !== 3 ||
		keyExpression === undefined ||
		!ts.isJsxExpression(keyExpression) ||
		keyExpression.expression?.getText() !== "index" ||
		dirValue === undefined ||
		!ts.isStringLiteral(dirValue) ||
		dirValue.text !== "ltr" ||
		classValue === undefined ||
		!ts.isStringLiteral(classValue) ||
		classValue.text !== "file-table__bidi-escape" ||
		!onlyTextExpression ||
		!expectedCondition ||
		!expectedFallback
	) {
		problems.push(
			"D-03 helper bdi does not match the recorded wrapper contract",
		);
	}
	const nonBdi = jsx.filter(
		(candidate) => tagName(elementOpening(candidate)) !== "bdi",
	);
	if (nonBdi.length > 0) {
		problems.push("D-03 helper contains an unapproved JSX element");
	}
	const imports = allImports(parsed);
	if (
		imports.length !== 1 ||
		imports[0].moduleSpecifier.getText() !== '"../../domain"' ||
		!ts.isImportClause(imports[0].importClause) ||
		imports[0].importClause.name !== undefined ||
		imports[0].importClause.namedBindings === undefined ||
		!ts.isNamedImports(imports[0].importClause.namedBindings) ||
		imports[0].importClause.namedBindings.elements.length !== 1 ||
		imports[0].importClause.namedBindings.elements[0].name.text !==
			"EscapedSegment" ||
		!imports[0].importClause.isTypeOnly
	) {
		problems.push("D-03 helper import does not match the recorded contract");
	}
}

function validateBidiCallsite(files, problems) {
	for (const contract of D03_CALLSITES) {
		const text = decode(files, contract.file);
		if (text === undefined) {
			problems.push("D-03 callsite source is missing: " + contract.file);
			continue;
		}
		let parsed;
		try {
			parsed = sourceFile(contract.file, text);
		} catch (error) {
			problems.push(error.message);
			continue;
		}
		const imports = allImports(parsed).filter(
			(statement) =>
				statement.moduleSpecifier.getText() === '"../../utils/escaped_name"',
		);
		const imported =
			imports.length === 1 &&
			ts.isImportClause(imports[0].importClause) &&
			imports[0].importClause.namedBindings !== undefined &&
			ts.isNamedImports(imports[0].importClause.namedBindings) &&
			imports[0].importClause.namedBindings.elements.length === 1 &&
			imports[0].importClause.namedBindings.elements[0].name.text ===
				"EscapedName";
		const targets = allJsxElements(parsed).filter(
			(node) => tagName(elementOpening(node)) === "EscapedName",
		);
		const node = targets[0];
		const opening = node === undefined ? undefined : elementOpening(node);
		const segmentExpression =
			opening === undefined
				? undefined
				: expressionAttribute(opening, "segments");
		const parent =
			node?.parent !== undefined && ts.isJsxElement(node.parent)
				? node.parent
				: undefined;
		const parentOpening =
			parent === undefined ? undefined : parent.openingElement;
		if (
			!imported ||
			targets.length !== 1 ||
			!ts.isJsxSelfClosingElement(node) ||
			opening.attributes.properties.length !== 1 ||
			segmentExpression?.getText() !== contract.segments ||
			parentOpening === undefined ||
			tagName(parentOpening) !== contract.parentTag ||
			literalAttribute(parentOpening, "className") !== contract.parentClass ||
			(contract.parentDir !== undefined &&
				literalAttribute(parentOpening, "dir") !== contract.parentDir)
		) {
			problems.push(
				"D-03 callsite does not match its source-bound contract: " +
					contract.file,
			);
		}
	}
}

function findIconSlot(source) {
	return allJsxElements(source).filter(
		(node) =>
			tagName(elementOpening(node)) === "div" &&
			literalAttribute(elementOpening(node), "className") ===
				"empty-state__inner",
	);
}

function validateEmptyStateSlot(files, problems) {
	const baselineText = decode(files.baseline, EMPTY_STATE);
	const candidateText = decode(files.candidate, EMPTY_STATE);
	if (baselineText === undefined || candidateText === undefined) {
		problems.push("SUR-03 EmptyState source is missing from a compared tree");
		return;
	}
	let baseline;
	let candidate;
	try {
		baseline = sourceFile(EMPTY_STATE, baselineText);
		candidate = sourceFile(EMPTY_STATE, candidateText);
	} catch (error) {
		problems.push(error.message);
		return;
	}
	const baselineSlots = findIconSlot(baseline);
	const candidateSlots = findIconSlot(candidate);
	const baselineChildren =
		baselineSlots.length === 1 ? elementChildren(baselineSlots[0]) : [];
	const candidateChildren =
		candidateSlots.length === 1 ? elementChildren(candidateSlots[0]) : [];
	const baselineIcon = baselineChildren[0];
	const baselineOpening =
		baselineIcon === undefined ? undefined : elementOpening(baselineIcon);
	const candidateIcons = candidateChildren.slice(0, 2);
	const validBaseline =
		baselineSlots.length === 1 &&
		baselineOpening !== undefined &&
		tagName(baselineOpening) === "svg" &&
		literalAttribute(baselineOpening, "className") === "empty-state__icon";
	const expectedImports = new Map([
		[
			"symbolLight",
			"../../assets/brand/exifcleaner-symbol-light.svg?no-inline",
		],
		["symbolDark", "../../assets/brand/exifcleaner-symbol-dark.svg?no-inline"],
	]);
	const candidateImports = new Map();
	for (const statement of allImports(candidate)) {
		const clause = statement.importClause;
		if (clause?.name !== undefined) {
			candidateImports.set(clause.name.text, statement.moduleSpecifier.text);
		}
	}
	const validImports =
		candidateImports.size === 2 &&
		[...expectedImports].every(
			([name, specifier]) => candidateImports.get(name) === specifier,
		);
	const expectedVariants = [
		["symbolLight", "light"],
		["symbolDark", "dark"],
	];
	const validImages =
		candidateSlots.length === 1 &&
		candidateIcons.length === 2 &&
		expectedVariants.every(([identifier, variant], index) => {
			const node = candidateIcons[index];
			if (node === undefined) return false;
			const opening = elementOpening(node);
			const src = expressionAttribute(opening, "src");
			return (
				tagName(opening) === "img" &&
				opening.attributes.properties.length === 3 &&
				src?.getText() === identifier &&
				literalAttribute(opening, "className") ===
					"empty-state__icon empty-state__icon--" + variant &&
				literalAttribute(opening, "alt") === ""
			);
		});
	const allCandidateImages = allJsxElements(candidate).filter(
		(node) => tagName(elementOpening(node)) === "img",
	);
	if (
		!validBaseline ||
		!validImports ||
		!validImages ||
		allCandidateImages.length !== 2
	) {
		problems.push(
			"SUR-03 EmptyState icon slot does not match the recorded replacement",
		);
	}
	for (const [asset, expectedHash] of BRAND_ASSETS) {
		const value = bytes(files.candidate, asset);
		if (value === undefined || sha256(value) !== expectedHash) {
			problems.push("SUR-03 asset hash mismatch or missing asset: " + asset);
		}
	}
}

function normalizeEscapedName(node, file) {
	if (!D03_CALLSITES.some((contract) => contract.file === file)) return false;
	return (
		tagName(elementOpening(node)) === "EscapedName" &&
		ts.isJsxSelfClosingElement(node)
	);
}

function normalizeEmptyIcon(node, file, version) {
	if (file !== EMPTY_STATE || tagName(elementOpening(node)) !== "div") {
		return undefined;
	}
	const opening = elementOpening(node);
	if (literalAttribute(opening, "className") !== "empty-state__inner") {
		return undefined;
	}
	const children = elementChildren(node);
	if (version === "baseline") {
		return children[0] !== undefined &&
			tagName(elementOpening(children[0])) === "svg"
			? [
					{ kind: "decorative-brand-slot" },
					...children.slice(1).map((child) => renderJsx(child, file, version)),
				]
			: undefined;
	}
	if (
		children.length >= 2 &&
		tagName(elementOpening(children[0])) === "img" &&
		tagName(elementOpening(children[1])) === "img"
	) {
		return [
			{ kind: "decorative-brand-slot" },
			...children.slice(2).map((child) => renderJsx(child, file, version)),
		];
	}
	return undefined;
}

function renderJsx(node, file, version) {
	if (ts.isJsxText(node)) {
		return node.getText().trim() === "" ? null : { kind: "text" };
	}
	if (ts.isJsxExpression(node)) {
		if (node.expression === undefined) return { kind: "empty-expression" };
		const nested = jsxRoots(node.expression).map((root) =>
			renderJsx(root, file, version),
		);
		return nested.length === 0
			? { kind: "expression" }
			: { kind: "expression", jsx: nested };
	}
	if (ts.isJsxFragment(node)) {
		return {
			kind: "fragment",
			children: meaningfulChildren(node.children)
				.map((child) => renderJsx(child, file, version))
				.filter((child) => child !== null),
		};
	}
	if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
		if (normalizeEscapedName(node, file)) return { kind: "expression" };
		const iconChildren = normalizeEmptyIcon(node, file, version);
		if (iconChildren !== undefined) {
			return { kind: "element", tag: "div", children: iconChildren };
		}
		return {
			kind: "element",
			tag: tagName(elementOpening(node)),
			children: elementChildren(node)
				.map((child) => renderJsx(child, file, version))
				.filter((child) => child !== null),
		};
	}
	return { kind: "other" };
}

export function jsxStructure(files, file, version) {
	const text = decode(files, file);
	if (text === undefined) throw new Error("missing JSX file: " + file);
	const parsed = sourceFile(file, text);
	return JSON.stringify(
		jsxRoots(parsed).map((root) => renderJsx(root, file, version)),
	);
}

function compareJsxTrees(baseFiles, candidateFiles, problems) {
	const basePaths = new Set([...baseFiles.keys()].filter(isProductionTsx));
	const candidatePaths = new Set(
		[...candidateFiles.keys()].filter(isProductionTsx),
	);
	if (basePaths.has(ESCAPED_NAME)) {
		problems.push(
			"D-03 helper must be new relative to the fixed v5.0 baseline",
		);
	}
	candidatePaths.delete(ESCAPED_NAME);
	const missing = [...basePaths].filter((file) => !candidatePaths.has(file));
	const added = [...candidatePaths].filter((file) => !basePaths.has(file));
	for (const file of missing) problems.push("production TSX removed: " + file);
	for (const file of added)
		problems.push("unapproved production TSX added: " + file);
	for (const file of basePaths) {
		if (!candidatePaths.has(file)) continue;
		try {
			const baseline = jsxStructure(baseFiles, file, "baseline");
			const candidate = jsxStructure(candidateFiles, file, "candidate");
			if (baseline !== candidate) {
				problems.push("ordered JSX structure changed: " + file);
			}
		} catch (error) {
			problems.push(error.message);
		}
	}
}

function cssPaths(files) {
	return [...files.keys()].filter(isStyleCss).sort();
}

function parseCss(file, value) {
	try {
		return postcss.parse(value, { from: file });
	} catch (error) {
		throw new Error("CSS parse failed for " + file + ": " + error.message);
	}
}

function ancestors(node) {
	const chain = [];
	for (let current = node.parent; current; current = current.parent) {
		chain.unshift(current);
	}
	return chain;
}

function ruleContext(node) {
	return ancestors(node)
		.map((parent) => {
			if (parent.type === "atrule")
				return "@" + parent.name + " " + parent.params;
			if (parent.type === "rule") return parent.selector;
			return parent.type;
		})
		.join(" > ");
}

function collectMotion(files) {
	const declarations = [];
	const keyframes = [];
	let hasToggleTransition = false;
	const allPaths = cssPaths(files);
	for (const file of allPaths) {
		const text = decode(files, file);
		if (text === undefined) continue;
		const root = parseCss(file, text);
		root.walkDecls((decl) => {
			const property = decl.prop.toLowerCase();
			if (
				property === "transition" ||
				property.startsWith("transition-") ||
				property === "animation" ||
				property.startsWith("animation-")
			) {
				declarations.push({
					file,
					context: ruleContext(decl),
					property,
					value: decl.value,
					important: decl.important,
				});
			}
			if (
				property === "transition" &&
				decl.value === TOGGLE_TRANSITION &&
				ancestors(decl).some(
					(parent) =>
						parent.type === "rule" &&
						parent.selector === ".toggle-switch__thumb",
				) &&
				ancestors(decl).some(
					(parent) =>
						parent.type === "atrule" &&
						parent.name === "media" &&
						parent.params === "(prefers-reduced-motion: no-preference)",
				)
			) {
				hasToggleTransition = true;
			}
		});
		root.walkAtRules(/(?:-webkit-)?keyframes/i, (rule) => {
			keyframes.push({
				file,
				name: rule.name.toLowerCase(),
				params: rule.params,
				children: serializeKeyframeNodes(rule.nodes ?? []),
			});
		});
	}
	return { declarations, keyframes, hasToggleTransition };
}

function serializeKeyframeNodes(nodes) {
	return nodes.map((node) => {
		if (node.type === "rule") {
			return {
				kind: "frame",
				selector: node.selector,
				children: serializeKeyframeNodes(node.nodes ?? []),
			};
		}
		if (node.type === "decl") {
			return {
				kind: "declaration",
				property: node.prop,
				value: normalizeColorTokens(node.value),
				important: node.important,
			};
		}
		if (node.type === "atrule") {
			return {
				kind: "atrule",
				name: node.name,
				params: node.params,
				children: serializeKeyframeNodes(node.nodes ?? []),
			};
		}
		return { kind: node.type };
	});
}

function normalizeColorTokens(value) {
	let output = "";
	for (let index = 0; index < value.length;) {
		const character = value[index];
		if (character === "#" && /[0-9a-f]/i.test(value[index + 1] ?? "")) {
			let end = index + 1;
			while (/[0-9a-f]/i.test(value[end] ?? "")) end += 1;
			const length = end - index - 1;
			if ([3, 4, 6, 8].includes(length)) {
				output += "<color>";
				index = end;
				continue;
			}
		}
		if (/[a-z_-]/i.test(character)) {
			let end = index + 1;
			while (/[a-z0-9_-]/i.test(value[end] ?? "")) end += 1;
			const identifier = value.slice(index, end);
			const lower = identifier.toLowerCase();
			let afterWhitespace = end;
			while (/\s/.test(value[afterWhitespace] ?? "")) afterWhitespace += 1;
			if (COLOR_FUNCTIONS.has(lower) && value[afterWhitespace] === "(") {
				let depth = 0;
				let cursor = afterWhitespace;
				let quote;
				for (; cursor < value.length; cursor += 1) {
					const current = value[cursor];
					if (quote !== undefined) {
						if (current === "\\") cursor += 1;
						else if (current === quote) quote = undefined;
						continue;
					}
					if (current === '"' || current === "'") {
						quote = current;
						continue;
					}
					if (current === "(") depth += 1;
					else if (current === ")") {
						depth -= 1;
						if (depth === 0) {
							cursor += 1;
							break;
						}
					}
				}
				if (depth === 0) {
					output += "<color>";
					index = cursor;
					continue;
				}
			}
			if (COLOR_KEYWORDS.has(lower)) {
				output += "<color>";
			} else {
				output += identifier;
			}
			index = end;
			continue;
		}
		output += character;
		index += 1;
	}
	return output;
}

export function motionSignature(files) {
	const { declarations, keyframes } = collectMotion(files);
	return { declarations, keyframes };
}

function compareMotion(baseFiles, candidateFiles, problems) {
	let baseline;
	let candidate;
	try {
		baseline = collectMotion(baseFiles);
		candidate = collectMotion(candidateFiles);
	} catch (error) {
		problems.push(error.message);
		return;
	}
	if (
		JSON.stringify(baseline.declarations) !==
		JSON.stringify(candidate.declarations)
	) {
		problems.push("transition or animation declarations changed");
	}
	if (
		JSON.stringify(baseline.keyframes) !== JSON.stringify(candidate.keyframes)
	) {
		problems.push(
			"keyframe structure, selector, timing, or non-color value changed",
		);
	}
	if (!candidate.hasToggleTransition) {
		problems.push("required toggle thumb transition is missing");
	}
}

function compareLocales(baseFiles, candidateFiles, problems) {
	const baselinePaths = [...baseFiles.keys()]
		.filter(
			(file) => file.startsWith(LOCALE_DIRECTORY) && file.endsWith(".json"),
		)
		.sort();
	const candidatePaths = [...candidateFiles.keys()]
		.filter(
			(file) => file.startsWith(LOCALE_DIRECTORY) && file.endsWith(".json"),
		)
		.sort();
	if (baselinePaths.length === 0) {
		problems.push("fixed v5.0 snapshot has no locale catalogs");
		return;
	}
	if (JSON.stringify(baselinePaths) !== JSON.stringify(candidatePaths)) {
		problems.push("locale catalog file set changed");
		return;
	}
	const exception = LOCALE_EXCEPTION;
	for (const file of baselinePaths) {
		const before = bytes(baseFiles, file);
		const after = bytes(candidateFiles, file);
		if (before === undefined || after === undefined) {
			problems.push(
				"locale catalog missing from baseline or candidate: " + file,
			);
			continue;
		}
		let baselineLabels;
		let candidateLabels;
		try {
			baselineLabels = JSON.parse(before.toString("utf8"));
			candidateLabels = JSON.parse(after.toString("utf8"));
		} catch {
			problems.push("locale catalog is invalid JSON: " + file);
			continue;
		}
		let normalized = after.toString("utf8");
		let valid = true;
		for (const key of exception.keys) {
			const baselineValue = baselineLabels[key];
			const candidateValue = candidateLabels[key];
			if (
				typeof baselineValue !== "string" ||
				!baselineValue.endsWith(exception.removeTrailing) ||
				typeof candidateValue !== "string" ||
				candidateValue !==
					baselineValue.slice(0, -exception.removeTrailing.length)
			) {
				valid = false;
				break;
			}
			const baselineLine = `${JSON.stringify(key)}: ${JSON.stringify(baselineValue)},`;
			const candidateLine = `${JSON.stringify(key)}: ${JSON.stringify(candidateValue)},`;
			if (
				countOccurrences(before.toString("utf8"), baselineLine) !== 1 ||
				countOccurrences(normalized, candidateLine) !== 1
			) {
				valid = false;
				break;
			}
			normalized = normalized.replace(candidateLine, baselineLine);
		}
		if (!valid || !Buffer.from(normalized, "utf8").equals(before)) {
			problems.push(
				"locale catalog differs outside the two approved intake labels: " +
					file,
			);
		}
	}
}

function countOccurrences(value, needle) {
	return value.split(needle).length - 1;
}

function tableGridDeclarations(files, selector) {
	const css = decode(files, FILE_TABLE_CSS);
	if (css === undefined) {
		throw new Error("file table stylesheet is missing");
	}
	const root = postcss.parse(css, { from: FILE_TABLE_CSS });
	const declarations = [];
	root.walkRules((rule) => {
		if (rule.selector !== selector) return;
		rule.walkDecls("grid-template-columns", (declaration) => {
			declarations.push(declaration.value.trim());
		});
	});
	return declarations;
}

function compareTableGrid(baseFiles, candidateFiles, problems) {
	for (const selector of APPROVED_TABLE_SELECTORS) {
		let baseline;
		let candidate;
		try {
			baseline = tableGridDeclarations(baseFiles, selector);
			candidate = tableGridDeclarations(candidateFiles, selector);
		} catch (error) {
			problems.push(error.message);
			return;
		}
		if (baseline.length !== 1 || baseline[0] !== BASELINE_TABLE_COLUMNS) {
			problems.push(
				"fixed v5.0 table grid does not match the approved baseline",
			);
		}
		if (candidate.length !== 1 || candidate[0] !== APPROVED_TABLE_COLUMNS) {
			problems.push("approved table grid declaration changed");
		}
	}
}

function exactRuleDeclarations(files, file, selector) {
	const css = decode(files, file);
	if (css === undefined) {
		throw new Error("approved stylesheet is missing: " + file);
	}
	const root = postcss.parse(css, { from: file });
	const declarations = [];
	root.walkRules((rule) => {
		if (rule.selector !== selector) return;
		declarations.push(
			rule.nodes
				.filter((node) => node.type === "decl")
				.map((node) => [node.prop, node.value.trim()]),
		);
	});
	return declarations;
}

function comparePresentationExceptions(baseFiles, candidateFiles, problems) {
	const exceptions = EXPECTED_EXCEPTIONS.exceptions.filter(
		(exception) => exception.selector !== undefined,
	);
	for (const exception of exceptions) {
		let baseline;
		let candidate;
		try {
			baseline = exactRuleDeclarations(
				baseFiles,
				exception.source,
				exception.selector,
			);
			candidate = exactRuleDeclarations(
				candidateFiles,
				exception.source,
				exception.selector,
			);
		} catch (error) {
			problems.push(error.message);
			continue;
		}
		if (JSON.stringify(baseline) !== JSON.stringify(exception.baseline)) {
			problems.push("fixed v5.0 presentation rule changed: " + exception.id);
		}
		if (JSON.stringify(candidate) !== JSON.stringify(exception.candidate)) {
			problems.push("approved presentation rule changed: " + exception.id);
		}
	}
}

function svgPresentation(files) {
	const text = decode(files, CHEVRON_ICON);
	if (text === undefined) throw new Error("chevron icon source is missing");
	const source = sourceFile(CHEVRON_ICON, text);
	const svgs = [];
	const visit = (node) => {
		if (
			ts.isJsxOpeningElement(node) &&
			node.tagName.getText(source) === "svg"
		) {
			const attributes = Object.fromEntries(
				node.attributes.properties
					.filter(ts.isJsxAttribute)
					.map((attribute) => {
						const initializer = attribute.initializer;
						let value = "";
						if (initializer !== undefined) {
							if (ts.isStringLiteral(initializer)) {
								value = initializer.text;
							} else if (
								ts.isJsxExpression(initializer) &&
								initializer.expression !== undefined
							) {
								value = initializer.expression
									.getText(source)
									.replace(/\s+/g, " ")
									.trim();
							}
						}
						return [attribute.name.getText(source), value];
					}),
			);
			svgs.push({
				width: attributes.width,
				height: attributes.height,
				strokeWidth: attributes.strokeWidth,
			});
		}
		ts.forEachChild(node, visit);
	};
	visit(source);
	return svgs;
}

function compareChevronPresentation(baseFiles, candidateFiles, problems) {
	let baseline;
	let candidate;
	try {
		baseline = svgPresentation(baseFiles);
		candidate = svgPresentation(candidateFiles);
	} catch (error) {
		problems.push(error.message);
		return;
	}
	const expectedBefore = { width: "12", height: "12", strokeWidth: "1.5" };
	const expectedAfter = {
		width: "expanded ? 16 : 12",
		height: "expanded ? 16 : 12",
		strokeWidth: "expanded ? 2 : 1.5",
	};
	if (
		baseline.length !== 1 ||
		JSON.stringify(baseline[0]) !== JSON.stringify(expectedBefore)
	) {
		problems.push(
			"fixed v5.0 disclosure icon does not match the approved baseline",
		);
	}
	if (
		candidate.length !== 1 ||
		JSON.stringify(candidate[0]) !== JSON.stringify(expectedAfter)
	) {
		problems.push("approved chevron presentation changed");
	}
}

function compareAssetContracts(candidateFiles, problems) {
	for (const [file, expectedHash] of BRAND_ASSETS) {
		const value = bytes(candidateFiles, file);
		if (value === undefined || sha256(value) !== expectedHash) {
			problems.push("approved brand asset is missing or changed: " + file);
		}
	}
}

function validateExceptionFile() {
	const filename = new URL("./same_layout_exceptions.json", import.meta.url);
	let parsed;
	try {
		parsed = JSON.parse(fs.readFileSync(filename, "utf8"));
	} catch (error) {
		return ["same-layout exception file is unreadable: " + error.message];
	}
	if (JSON.stringify(parsed) !== JSON.stringify(EXPECTED_EXCEPTIONS)) {
		return [
			"same-layout exception file differs from the approved source-bound records",
		];
	}
	return [];
}

export function compareSnapshots({
	baseFiles,
	candidateFiles,
	paths = [],
	baseRef = BASELINE,
}) {
	const problems = [];
	if (baseRef !== BASELINE) {
		problems.push(
			"comparison baseline must be the fixed v5.0 close commit " + BASELINE,
		);
	}
	problems.push(...validateExceptionFile());
	problems.push(...changedSourcePathProblems(paths));
	compareLocales(baseFiles, candidateFiles, problems);
	compareAssetContracts(candidateFiles, problems);
	checkBidiHelper(candidateFiles, problems);
	validateBidiCallsite(candidateFiles, problems);
	validateEmptyStateSlot(
		{ baseline: baseFiles, candidate: candidateFiles },
		problems,
	);
	compareTableGrid(baseFiles, candidateFiles, problems);
	comparePresentationExceptions(baseFiles, candidateFiles, problems);
	compareChevronPresentation(baseFiles, candidateFiles, problems);
	compareJsxTrees(baseFiles, candidateFiles, problems);
	compareMotion(baseFiles, candidateFiles, problems);
	return problems;
}

function parseArgs(argv) {
	const parsed = { base: BASELINE, head: "HEAD" };
	for (let index = 0; index < argv.length; index += 1) {
		const argument = argv[index];
		if (argument === "--base" || argument === "--head") {
			const value = argv[index + 1];
			if (value === undefined) throw new Error(argument + " requires a commit");
			parsed[argument.slice(2)] = value;
			index += 1;
		} else {
			throw new Error("unknown argument: " + argument);
		}
	}
	return parsed;
}

function main() {
	const { base, head } = parseArgs(process.argv.slice(2));
	const cwd = process.cwd();
	const baseFiles = readGitSnapshot(base, cwd);
	const candidateFiles = readGitSnapshot(head, cwd);
	const problems = compareSnapshots({
		baseFiles,
		candidateFiles,
		paths: changedPaths(base, head, cwd),
		baseRef: base,
	});
	if (problems.length > 0) {
		process.stderr.write(
			"same-layout gate failed:\n" +
				problems.map((problem) => " - " + problem).join("\n") +
				"\n",
		);
		process.exitCode = 1;
		return;
	}
	process.stdout.write(
		"same-layout gate passed: fixed v5.0 baseline " +
			base +
			", candidate " +
			gitText(["rev-parse", head], cwd).trim() +
			", approved DOM, table-grid, and copy exceptions\n",
	);
}

if (
	process.argv[1] &&
	path.resolve(process.argv[1]) ===
		path.resolve(new URL(import.meta.url).pathname)
) {
	try {
		main();
	} catch (error) {
		process.stderr.write("same-layout gate error: " + error.message + "\n");
		process.exitCode = 1;
	}
}
