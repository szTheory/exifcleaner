import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FileProcessingStatus } from "../../src/domain";
import { ErrorExpansion } from "../../src/renderer/components/file-list/ErrorExpansion";
import { FileRow } from "../../src/renderer/components/file-list/FileRow";
import { FolderRow } from "../../src/renderer/components/file-list/FolderRow";
import type { FileEntry } from "../../src/renderer/contexts/AppContext";
import { fileEntry } from "../../src/renderer/story_support/process_outcomes";

// TRU-01 rendered-text test. The escape is applied at eight view sinks: the FileRow name
// text and row aria-label, the FolderRow label, title and toggle aria-label, the
// ErrorExpansion pre, the error-row title and the aria-label error tail. Each case below
// is red when its displayName call is removed. The mocks are copied from file_row.test.ts
// (vi.mock is per file), with the two folder strings added so the toggle label is not a
// bare key.

vi.mock("react", async (importOriginal) => {
	const actual = await importOriginal<typeof import("react")>();
	return {
		...actual,
		useRef: () => ({ current: true }),
	};
});

vi.mock("../../src/renderer/hooks/use_i18n", () => ({
	useI18n: () => ({
		t: (key: string) => {
			const strings: Record<string, string> = {
				complete: "Complete",
				writtenToCopy: "Written to a copy",
				"folder.expand": "Expand {folder}",
				"folder.collapse": "Collapse {folder}",
				"folder.files": "{count} files",
				"reveal.cleanedCopy": "Reveal cleaned copy in file manager",
				"reveal.original": "Reveal in file manager",
			};
			return strings[key] ?? key;
		},
	}),
}));

// Built from code points, never typed as raw characters.
const NINE_CONTROLS = [
	0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2066, 0x2067, 0x2068, 0x2069,
] as const;
const RLO = String.fromCodePoint(0x202e);
const RAW_CONTROL = /[\u{202A}-\u{202E}\u{2066}-\u{2069}]/u;
const ALL_STATUSES = Object.values(FileProcessingStatus);

function tokenMarkup(codePoint: number): string {
	return `&lt;U+${codePoint.toString(16).toUpperCase().padStart(4, "0")}&gt;`;
}

function renderRow(
	file: FileEntry,
	overrides: { isExpanded?: boolean } = {},
): string {
	return renderToStaticMarkup(
		React.createElement(FileRow, {
			file,
			isExpanded: overrides.isExpanded ?? false,
			onToggleExpand: () => undefined,
			staggerIndex: 0,
			animatedCheckRef: { current: new Set<string>() },
			onCopyToast: () => undefined,
		}),
	);
}

function renderFolder(folder: string): string {
	return renderToStaticMarkup(
		React.createElement(FolderRow, {
			folder,
			fileCount: 3,
			isCollapsed: false,
			onToggle: () => undefined,
			discoveryStatus: "complete",
		}),
	);
}

type AnyProps = { children?: React.ReactNode; [key: string]: unknown };

function findByTag(
	node: unknown,
	tag: string,
): React.ReactElement<AnyProps> | undefined {
	if (!React.isValidElement<AnyProps>(node)) return undefined;
	if (node.type === tag) return node;
	for (const child of React.Children.toArray(node.props.children)) {
		const found = findByTag(child, tag);
		if (found !== undefined) return found;
	}
	return undefined;
}

function findByType(
	node: unknown,
	type: React.ElementType,
): React.ReactElement<AnyProps> | undefined {
	if (!React.isValidElement<AnyProps>(node)) return undefined;
	if (node.type === type) return node;
	for (const child of React.Children.toArray(node.props.children)) {
		const found = findByType(child, type);
		if (found !== undefined) return found;
	}
	return undefined;
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("FileRow name sinks (all nine controls, all six statuses)", () => {
	it("covers the six FileProcessingStatus values", () => {
		expect(ALL_STATUSES).toHaveLength(6);
	});

	const CASES = ALL_STATUSES.flatMap((status) =>
		NINE_CONTROLS.map((codePoint) => ({
			status,
			codePoint,
			label: `${status} with ${tokenMarkup(codePoint)}`,
		})),
	);

	it.each(CASES)(
		"shows the token and no raw control: $label",
		({ status, codePoint }) => {
			const name = `a${String.fromCodePoint(codePoint)}b.jpg`;
			const markup = renderRow(fileEntry({ status, name }));

			expect(RAW_CONTROL.test(markup)).toBe(false);
			expect(markup).toMatch(
				new RegExp(
					`<bdi[^>]*class="file-table__bidi-escape"[^>]*>${tokenMarkup(codePoint).replace(/\+/g, "\\+")}</bdi>`,
				),
			);
			// Row aria-label starts with the escaped name.
			expect(markup).toContain(`aria-label="a${tokenMarkup(codePoint)}b.jpg. `);
		},
	);

	it("adds no element and no token for an ordinary name", () => {
		const markup = renderRow(fileEntry({ name: "sample.jpg" }));

		expect(markup).not.toContain("file-table__bidi-escape");
		expect(markup).toContain('aria-label="sample.jpg. ');
		expect(markup).toMatch(
			/<bdi class="file-table__name-text" dir="auto">sample\.jpg<\/bdi>/,
		);
	});

	it("does not style literal escape-token text as a control", () => {
		const markup = renderRow(fileEntry({ name: "holiday<U+202E>gnp.jpg" }));

		expect(markup).not.toContain("file-table__bidi-escape");
		expect(markup).toMatch(
			/<bdi class="file-table__name-text" dir="auto">holiday&lt;U\+202E&gt;gnp\.jpg<\/bdi>/,
		);
	});

	it("keeps the raw name in the entry: only the markup is escaped", () => {
		const name = `holiday${RLO}gnp.jpg`;
		const file = fileEntry({ name });
		renderRow(file);

		expect(file.name).toBe(name);
		expect(RAW_CONTROL.test(file.name)).toBe(true);
	});
});

describe("FolderRow sinks", () => {
	const CASES = [
		{
			label: "a control in a middle segment of a short path",
			folder: `/Users/example/photos/${RLO}evil/2024`,
			escaped: "/Users/example/photos/&lt;U+202E&gt;evil/2024",
		},
		{
			label: "a control in the kept last segment of a truncated path",
			folder: `/Users/example/Pictures/2024/Summer holiday in the mountains/RAW${RLO}exports`,
			escaped:
				"/Users/example/Pictures/2024/Summer holiday in the mountains/RAW&lt;U+202E&gt;exports",
		},
		{
			label: "a control in a segment that truncation drops",
			folder: `/Users/example/Pictures/${RLO}2024/Summer holiday in the mountains/RAW exports`,
			escaped:
				"/Users/example/Pictures/&lt;U+202E&gt;2024/Summer holiday in the mountains/RAW exports",
		},
		{
			label: "a control in the first segment of a truncated path",
			folder: `/${RLO}Users/example/Pictures/2024/Summer holiday in the mountains/RAW exports`,
			escaped:
				"/&lt;U+202E&gt;Users/example/Pictures/2024/Summer holiday in the mountains/RAW exports",
		},
	];

	it.each(CASES)(
		"escapes the title and the toggle label and shows no raw control: $label",
		({ folder, escaped }) => {
			const markup = renderFolder(folder);

			expect(RAW_CONTROL.test(markup)).toBe(false);
			// title carries the full escaped path.
			expect(markup).toContain(`title="${escaped}"`);
			// toggle aria-label carries the full escaped path.
			expect(markup).toContain(`aria-label="Collapse ${escaped}"`);
		},
	);

	it.each(CASES)(
		"never splits a token in the truncated label: $label",
		({ folder }) => {
			const markup = renderFolder(folder);
			const labelMatch = markup.match(
				/<bdi class="folder-row__label"[^>]*>(.*?)<\/bdi>/,
			);

			expect(labelMatch).not.toBeNull();
			const label = labelMatch?.[1] ?? "";
			const opened = label.match(/&lt;U\+/g) ?? [];
			const complete = label.match(/&lt;U\+[0-9A-F]{4}&gt;/g) ?? [];
			expect(opened.length).toBe(complete.length);
		},
	);

	it("shows the token inside the label bdi when truncation keeps its segment", () => {
		const markup = renderFolder(CASES[1]?.folder ?? "");

		expect(markup).toMatch(
			/<bdi class="folder-row__label"[^>]*>[^<]*…[^<]*RAW<bdi[^>]*class="file-table__bidi-escape"[^>]*>&lt;U\+202E&gt;<\/bdi>exports<\/bdi>/,
		);
	});

	it("does not interpret a replacement pattern in a folder name", () => {
		const markup = renderFolder("/photos/a$&b");

		expect(markup).toContain('aria-label="Collapse /photos/a$&amp;b"');
	});

	it("adds no element for an ordinary folder", () => {
		const markup = renderFolder("/photos/2024");

		expect(markup).not.toContain("file-table__bidi-escape");
		expect(markup).toContain('title="/photos/2024"');
	});

	it("does not style literal escape-token text as a folder control", () => {
		const markup = renderFolder("/photos/holiday<U+202E>gnp.jpg");

		expect(markup).not.toContain("file-table__bidi-escape");
		expect(markup).toContain("holiday&lt;U+202E&gt;gnp.jpg</bdi>");
	});
});

describe("ErrorExpansion display and copy split", () => {
	const ERROR_TEXT = `write failed: /tmp/holiday${RLO}gnp.jpg`;

	it("does not style literal escape-token text as a control", () => {
		const markup = renderToStaticMarkup(
			React.createElement(ErrorExpansion, {
				error: "write failed: holiday<U+202E>gnp.jpg",
				onCopy: () => undefined,
			}),
		);

		expect(markup).not.toContain("file-table__bidi-escape");
		expect(markup).toContain("holiday&lt;U+202E&gt;gnp.jpg</pre>");
	});

	it("shows the token in the pre and no raw control", () => {
		const markup = renderToStaticMarkup(
			React.createElement(ErrorExpansion, {
				error: ERROR_TEXT,
				onCopy: () => undefined,
			}),
		);

		expect(RAW_CONTROL.test(markup)).toBe(false);
		expect(markup).toMatch(
			/<pre[^>]*>write failed: \/tmp\/holiday<bdi[^>]*class="file-table__bidi-escape"[^>]*>&lt;U\+202E&gt;<\/bdi>gnp\.jpg<\/pre>/,
		);
	});

	it("copies the raw string, control included", () => {
		const writeText = vi.fn().mockResolvedValue(undefined);
		vi.stubGlobal("navigator", { clipboard: { writeText } });
		const onCopy = vi.fn();

		const tree = ErrorExpansion({ error: ERROR_TEXT, onCopy });
		const pre = findByTag(tree, "pre");
		const onClick = pre?.props["onClick"];

		expect(typeof onClick).toBe("function");
		if (typeof onClick !== "function") return;
		onClick();

		expect(writeText).toHaveBeenCalledTimes(1);
		expect(writeText).toHaveBeenCalledWith(ERROR_TEXT);
		expect(RAW_CONTROL.test(writeText.mock.calls[0]?.[0] as string)).toBe(true);
	});

	it("shows an expanded error row's residual path escaped while FileRow hands over the raw detail", () => {
		const file = fileEntry({
			status: FileProcessingStatus.Error,
			error: "Generated output write failed",
			failureKind: "write",
			detail: "Generated output write failed",
			residualPath: `/tmp/holiday${RLO}gnp.jpg`,
		});
		const markup = renderRow(file, { isExpanded: true });

		expect(RAW_CONTROL.test(markup)).toBe(false);
		expect(markup).toContain("&lt;U+202E&gt;");

		const handedOver = findByType(
			FileRow({
				file,
				isExpanded: true,
				onToggleExpand: () => undefined,
				staggerIndex: 0,
				animatedCheckRef: { current: new Set<string>() },
				onCopyToast: () => undefined,
			}),
			ErrorExpansion,
		);
		expect(handedOver?.props["error"]).toBe(
			`Generated output write failed: /tmp/holiday${RLO}gnp.jpg`,
		);
	});
});

describe("error-row title and aria-label error tail", () => {
	const XATTR_ERROR = `xattr failed: Command failed: xattr -c /tmp/holiday${RLO}gnp.jpg`;

	it("escapes the row title for an xattr failure and shows no raw control", () => {
		const markup = renderRow(
			fileEntry({
				status: FileProcessingStatus.Error,
				failureKind: "xattr",
				error: XATTR_ERROR,
			}),
		);

		expect(RAW_CONTROL.test(markup)).toBe(false);
		expect(markup).toContain(
			'title="xattr failed: Command failed: xattr -c /tmp/holiday&lt;U+202E&gt;gnp.jpg"',
		);
	});

	it("escapes the aria-label error tail of a row with no failure summary", () => {
		const markup = renderRow(
			fileEntry({
				status: FileProcessingStatus.Error,
				name: "sample.jpg",
				error: XATTR_ERROR,
			}),
		);

		expect(RAW_CONTROL.test(markup)).toBe(false);
		expect(markup).toContain(
			'aria-label="sample.jpg. xattr failed: Command failed: xattr -c /tmp/holiday&lt;U+202E&gt;gnp.jpg"',
		);
	});

	it("leaves a control-free error title and tail byte-identical", () => {
		const markup = renderRow(
			fileEntry({
				status: FileProcessingStatus.Error,
				name: "sample.jpg",
				error: "ExifTool crashed unexpectedly.",
			}),
		);

		expect(markup).toContain('title="ExifTool crashed unexpectedly."');
		expect(markup).toContain(
			'aria-label="sample.jpg. ExifTool crashed unexpectedly."',
		);
	});
});
