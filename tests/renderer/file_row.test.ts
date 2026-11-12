import { composeStories } from "@storybook/react-vite";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FileProcessingStatus } from "../../src/domain";
import { FileRow } from "../../src/renderer/components/file-list/FileRow";
import { ErrorExpansion } from "../../src/renderer/components/file-list/ErrorExpansion";
import * as errorExpansionStories from "../../src/renderer/components/file-list/ErrorExpansion.stories";
import type { FileEntry } from "../../src/renderer/contexts/AppContext";
import type { FailureCase } from "../../src/renderer/story_support/process_outcomes";
import {
	FAILURE_CASES,
	FAILURE_WITHOUT_RESIDUAL,
	GENERIC_FAILURE,
	OUTCOME_CASES,
	entryFor,
	errorTextFor,
} from "../../src/renderer/story_support/process_outcomes";

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
				verificationFailedSummary:
					"Couldn’t verify cleaned output. The incomplete copy was removed; your original is unchanged.",
				cleanupFailedSummary:
					"Couldn’t verify cleaned output, and the incomplete output could not be removed. Your original is unchanged.",
				writeFailedSummary:
					"Couldn’t write the cleaned output. Your original is unchanged.",
				commitFailedSummary:
					"Couldn’t save the cleaned file over the original. Another app, such as a cloud sync client, may have changed or locked it. Your original is unchanged.",
				"reveal.cleanedCopy": "Reveal cleaned copy in file manager",
				"reveal.original": "Reveal in file manager",
			};
			return strings[key] ?? key;
		},
	}),
}));

const showContextMenu = vi.fn();

// D-07: rows are built through the shared fixtures (the real reducer folds each case's
// dispatches), with the same `sample.jpg` identity the assertions below name. A `patch`
// replaces a field AFTER the fold when one test pins a specific detail or path; the
// summaries, aria-labels and per-kind detail literals never change to fit a fixture.
const SAMPLE_ROW = {
	id: "file-304",
	path: "/photos/sample.jpg",
	name: "sample.jpg",
	extension: "jpg",
	size: 1234,
} satisfies Partial<FileEntry>;

function failedRow(
	fixtureCase: FailureCase,
	patch: Partial<FileEntry> = {},
): FileEntry {
	return { ...entryFor(fixtureCase, SAMPLE_ROW), ...patch };
}

function completedRow(patch: Partial<FileEntry> = {}): FileEntry {
	return { ...entryFor(OUTCOME_CASES.cleaned, SAMPLE_ROW), ...patch };
}

function findRevealControl(node: unknown): React.ReactElement {
	if (!React.isValidElement(node)) {
		throw new Error("Reveal control was not rendered");
	}
	const props = node.props as {
		children?: unknown;
		"aria-label"?: string;
	};
	if (
		props["aria-label"] === "Reveal cleaned copy in file manager" ||
		props["aria-label"] === "Reveal in file manager"
	) {
		return node;
	}

	let found: React.ReactElement | undefined;
	React.Children.forEach(props.children, (child) => {
		if (found !== undefined) return;
		try {
			found = findRevealControl(child);
		} catch {
			// Keep traversing siblings until the reveal control is found.
		}
	});
	if (found === undefined) {
		throw new Error("Reveal control was not rendered");
	}
	return found;
}

function findElementByClass(
	node: unknown,
	className: string,
): React.ReactElement {
	if (!React.isValidElement(node)) {
		throw new Error(`Element with ${className} was not rendered`);
	}
	const props = node.props as { children?: unknown; className?: string };
	if (props.className?.split(" ").includes(className)) return node;

	let found: React.ReactElement | undefined;
	React.Children.forEach(props.children, (child) => {
		if (found !== undefined) return;
		try {
			found = findElementByClass(child, className);
		} catch {
			// Keep traversing siblings until the requested element is found.
		}
	});
	if (found === undefined) {
		throw new Error(`Element with ${className} was not rendered`);
	}
	return found;
}

function findElementByType(
	node: unknown,
	type: React.ElementType,
): React.ReactElement {
	if (!React.isValidElement(node)) {
		throw new Error("Requested component was not rendered");
	}
	if (node.type === type) return node;

	const props = node.props as { children?: unknown };
	let found: React.ReactElement | undefined;
	React.Children.forEach(props.children, (child) => {
		if (found !== undefined) return;
		try {
			found = findElementByType(child, type);
		} catch {
			// Keep traversing siblings until the requested component is found.
		}
	});
	if (found === undefined)
		throw new Error("Requested component was not rendered");
	return found;
}

beforeEach(() => {
	showContextMenu.mockReset();
	(globalThis as Record<string, unknown>).window = {
		api: {
			reveal: {
				showContextMenu,
				showInFolder: vi.fn(),
			},
		},
	};
});

describe("FileRow copy reveal context menu", () => {
	it("renders the exact localized verification failure summary with no successful-output affordance", () => {
		const row = FileRow({
			file: failedRow(FAILURE_CASES.verification),
			isExpanded: true,
			onToggleExpand: vi.fn(),
			staggerIndex: 0,
			animatedCheckRef: { current: new Set<string>() },
			onCopyToast: vi.fn(),
		});

		const summary = findElementByClass(row, "file-table__error-summary");
		const errorRow = findElementByClass(row, "file-table__row--error");
		expect((summary.props as { children?: unknown }).children).toBe(
			"Couldn’t verify cleaned output. The incomplete copy was removed; your original is unchanged.",
		);
		expect((errorRow.props as { "aria-label"?: string })["aria-label"]).toBe(
			"sample.jpg. Couldn’t verify cleaned output. The incomplete copy was removed; your original is unchanged.",
		);
		expect(() => findRevealControl(row)).toThrow();
		expect(() => findElementByClass(row, "file-table__after-done")).toThrow();
	});

	it("shows the verification code and leaked tag names in the detail line as a plain string (69-04, T-69-10)", () => {
		const diagnosticDetail =
			"Generated output verification failed (output-metadata-leak): File:YCbCrSubSampling, PNG:<b>x</b>";
		const row = FileRow({
			file: failedRow(FAILURE_CASES.verification, {
				error: diagnosticDetail,
				detail: diagnosticDetail,
			}),
			isExpanded: true,
			onToggleExpand: vi.fn(),
			staggerIndex: 0,
			animatedCheckRef: { current: new Set<string>() },
			onCopyToast: vi.fn(),
		});

		const summary = findElementByClass(row, "file-table__error-summary");
		const detail = findElementByType(row, ErrorExpansion);
		expect((summary.props as { children?: unknown }).children).toBe(
			"Couldn’t verify cleaned output. The incomplete copy was removed; your original is unchanged.",
		);
		expect((detail.props as { error?: string }).error).toBe(diagnosticDetail);
	});

	it("uses distinct cleanup copy and exposes only the main-returned residual path in detail", () => {
		const row = FileRow({
			file: failedRow(FAILURE_CASES.cleanup, {
				error: "Removal failed",
				detail: "Could not remove incomplete output",
				residualPath: "/photos/.sample-incomplete.jpg",
			}),
			isExpanded: true,
			onToggleExpand: vi.fn(),
			staggerIndex: 0,
			animatedCheckRef: { current: new Set<string>() },
			onCopyToast: vi.fn(),
		});

		const summary = findElementByClass(row, "file-table__error-summary");
		const detail = findElementByType(row, ErrorExpansion);
		expect((summary.props as { children?: unknown }).children).toBe(
			"Couldn’t verify cleaned output, and the incomplete output could not be removed. Your original is unchanged.",
		);
		expect((detail.props as { error?: string }).error).toBe(
			"Could not remove incomplete output: /photos/.sample-incomplete.jpg",
		);
	});

	it("renders the exact localized write failure summary with no reveal control", () => {
		const row = FileRow({
			file: failedRow(FAILURE_CASES.write),
			isExpanded: true,
			onToggleExpand: vi.fn(),
			staggerIndex: 0,
			animatedCheckRef: { current: new Set<string>() },
			onCopyToast: vi.fn(),
		});

		const summary = findElementByClass(row, "file-table__error-summary");
		expect((summary.props as { children?: unknown }).children).toBe(
			"Couldn’t write the cleaned output. Your original is unchanged.",
		);
		expect(() => findRevealControl(row)).toThrow();
	});

	it("renders the exact localized commit failure summary with no reveal control (69-13, D-10)", () => {
		const row = FileRow({
			file: failedRow(FAILURE_CASES.commit),
			isExpanded: true,
			onToggleExpand: vi.fn(),
			staggerIndex: 0,
			animatedCheckRef: { current: new Set<string>() },
			onCopyToast: vi.fn(),
		});

		const summary = findElementByClass(row, "file-table__error-summary");
		const errorRow = findElementByClass(row, "file-table__row--error");
		const detail = findElementByType(row, ErrorExpansion);
		expect((summary.props as { children?: unknown }).children).toBe(
			"Couldn’t save the cleaned file over the original. Another app, such as a cloud sync client, may have changed or locked it. Your original is unchanged.",
		);
		expect((errorRow.props as { "aria-label"?: string })["aria-label"]).toBe(
			"sample.jpg. Couldn’t save the cleaned file over the original. Another app, such as a cloud sync client, may have changed or locked it. Your original is unchanged.",
		);
		expect((detail.props as { error?: string }).error).toBe(
			"Generated output commit failed",
		);
		expect(() => findRevealControl(row)).toThrow();
	});

	it("shows the write failure detail with its residual path when one is carried", () => {
		const row = FileRow({
			file: failedRow(FAILURE_CASES.write, {
				error: "Generated output write failed: exceeded the write time limit",
				detail: "Generated output write failed: exceeded the write time limit",
				residualPath: "/photos/.sample.exifcleaner-stage-x.mp4",
			}),
			isExpanded: true,
			onToggleExpand: vi.fn(),
			staggerIndex: 0,
			animatedCheckRef: { current: new Set<string>() },
			onCopyToast: vi.fn(),
		});

		const detail = findElementByType(row, ErrorExpansion);
		expect((detail.props as { error?: string }).error).toBe(
			"Generated output write failed: exceeded the write time limit: /photos/.sample.exifcleaner-stage-x.mp4",
		);
	});

	it("shows the write failure detail alone when no residual path is carried", () => {
		const row = FileRow({
			file: failedRow(FAILURE_WITHOUT_RESIDUAL.write, {
				error: "Generated output write failed: exceeded the write time limit",
				detail: "Generated output write failed: exceeded the write time limit",
			}),
			isExpanded: true,
			onToggleExpand: vi.fn(),
			staggerIndex: 0,
			animatedCheckRef: { current: new Set<string>() },
			onCopyToast: vi.fn(),
		});

		const detail = findElementByType(row, ErrorExpansion);
		expect((detail.props as { error?: string }).error).toBe(
			"Generated output write failed: exceeded the write time limit",
		);
	});

	it("discloses one localized forced-copy result with the 60px row contract", () => {
		const row = FileRow({
			file: completedRow({
				extension: "cr2",
				outputPath: "/photos/sample_cleaned.cr2",
				wasForcedCopy: true,
				// This row pins the aria-label of a completed row with no outcome kind
				// (the plain "Complete" status text), so the fixture's kind is cleared.
				outcomeKind: undefined,
			}),
			isExpanded: false,
			onToggleExpand: vi.fn(),
			staggerIndex: 0,
			animatedCheckRef: { current: new Set<string>() },
			onCopyToast: vi.fn(),
		});
		const forcedRow = findElementByClass(row, "file-table__row--forced-copy");
		const disclosure = findElementByClass(row, "file-table__copy-disclosure");
		const forcedRowProps = forcedRow.props as { "aria-label"?: string };
		const disclosureProps = disclosure.props as { children?: unknown };

		expect(forcedRowProps["aria-label"]).toBe(
			"sample.jpg. Complete. Written to a copy.",
		);
		expect(disclosureProps.children).toBe("Written to a copy");
	});

	it("discloses copy mode for ordinary completed rows", () => {
		const row = FileRow({
			file: completedRow({ outputPath: "/photos/sample_cleaned.jpg" }),
			isExpanded: false,
			onToggleExpand: vi.fn(),
			staggerIndex: 0,
			animatedCheckRef: { current: new Set<string>() },
			onCopyToast: vi.fn(),
		});

		expect(
			findElementByClass(row, "file-table__copy-disclosure"),
		).toBeDefined();
	});

	it("sends the completed row's exact stored copy and submitted original paths on context-menu gesture", () => {
		const row = FileRow({
			file: completedRow({ outputPath: "/photos/sample_cleaned_2.jpg" }),
			isExpanded: false,
			onToggleExpand: vi.fn(),
			staggerIndex: 0,
			animatedCheckRef: { current: new Set<string>() },
			onCopyToast: vi.fn(),
		});
		const revealControl = findRevealControl(row);
		const onContextMenu = (
			revealControl.props as {
				onContextMenu: (event: React.MouseEvent) => void;
			}
		).onContextMenu;
		const event = {
			preventDefault: vi.fn(),
			stopPropagation: vi.fn(),
		} as unknown as React.MouseEvent;

		onContextMenu(event);

		expect(event.preventDefault).toHaveBeenCalledOnce();
		expect(event.stopPropagation).toHaveBeenCalledOnce();
		expect(showContextMenu).toHaveBeenCalledOnce();
		expect(showContextMenu).toHaveBeenCalledWith({
			cleanedPath: "/photos/sample_cleaned_2.jpg",
			originalPath: "/photos/sample.jpg",
		});
	});

	it("does not offer the dual-artifact context menu for an overwrite result", () => {
		const row = FileRow({
			file: completedRow({ outputPath: "/photos/sample.jpg" }),
			isExpanded: false,
			onToggleExpand: vi.fn(),
			staggerIndex: 0,
			animatedCheckRef: { current: new Set<string>() },
			onCopyToast: vi.fn(),
		});
		const revealControl = findRevealControl(row);
		const onContextMenu = (
			revealControl.props as {
				onContextMenu: (event: React.MouseEvent) => void;
			}
		).onContextMenu;

		onContextMenu({
			preventDefault: vi.fn(),
			stopPropagation: vi.fn(),
		} as unknown as React.MouseEvent);

		expect(showContextMenu).not.toHaveBeenCalled();
	});
});

// D-07: the detail text FileRow hands to ErrorExpansion for every fixture failure, checked
// against errorTextFor (the fixture helper) AND a literal typed out here, so a fixture
// edit that moves both together is still caught by the literal.
const FAILURE_DETAIL_ROWS: ReadonlyArray<
	readonly [string, FailureCase, string]
> = [
	[
		"write",
		FAILURE_CASES.write,
		"Generated output write failed: /path/to/incomplete-output.jpg",
	],
	[
		"write without a residual path",
		FAILURE_WITHOUT_RESIDUAL.write,
		"Generated output write failed",
	],
	[
		"verification",
		FAILURE_CASES.verification,
		"Generated output verification failed",
	],
	[
		"cleanup",
		FAILURE_CASES.cleanup,
		"Generated output cleanup failed: /path/to/incomplete-output.jpg",
	],
	[
		"cleanup without a residual path",
		FAILURE_WITHOUT_RESIDUAL.cleanup,
		"Generated output cleanup failed",
	],
	["commit", FAILURE_CASES.commit, "Generated output commit failed"],
	[
		"xattr",
		FAILURE_CASES.xattr,
		"Embedded metadata was removed, but macOS extended attributes could not be cleared: Operation not permitted: /path/to/cleaned.jpg",
	],
	[
		"xattr without a residual path",
		FAILURE_WITHOUT_RESIDUAL.xattr,
		"Embedded metadata was removed, but macOS extended attributes could not be cleared: Operation not permitted",
	],
	[
		"refused",
		FAILURE_CASES.refused,
		"RAF metadata removal is disabled because writing this format can damage the original. The file was left unchanged.",
	],
	[
		"generic",
		GENERIC_FAILURE,
		"ExifTool crashed unexpectedly. Restart the app to retry.",
	],
];

describe("FileRow failure detail from the shared fixtures", () => {
	it.each(FAILURE_DETAIL_ROWS)(
		"hands ErrorExpansion the %s detail",
		(_name, fixtureCase, literal) => {
			const entry = entryFor(fixtureCase, SAMPLE_ROW);
			const row = FileRow({
				file: entry,
				isExpanded: true,
				onToggleExpand: vi.fn(),
				staggerIndex: 0,
				animatedCheckRef: { current: new Set<string>() },
				onCopyToast: vi.fn(),
			});

			const error = (
				findElementByType(row, ErrorExpansion).props as {
					error?: string;
				}
			).error;
			expect(error).toBe(errorTextFor(entry));
			expect(error).toBe(literal);
		},
	);
});

// SC3 / D-07 (secondary vehicle): the ErrorExpansion stories are composed WITHOUT the
// project annotations and rendered with renderToStaticMarkup; ErrorExpansion reads no
// i18n or app context, so no provider is needed. No play function or decorator runs in
// this node environment. Every literal is typed out again, never read from the story.
describe("composed ErrorExpansion stories (SC3)", () => {
	const composed = composeStories(errorExpansionStories);

	it.each([
		["Write", "Generated output write failed: /path/to/incomplete-output.jpg"],
		["Verification", "Generated output verification failed"],
		[
			"Cleanup",
			"Generated output cleanup failed: /path/to/incomplete-output.jpg",
		],
		["Commit", "Generated output commit failed"],
		[
			"Xattr",
			"Embedded metadata was removed, but macOS extended attributes could not be cleared: Operation not permitted: /path/to/cleaned.jpg",
		],
		[
			"Refused",
			"RAF metadata removal is disabled because writing this format can damage the original. The file was left unchanged.",
		],
		[
			"GenericFailure",
			"ExifTool crashed unexpectedly. Restart the app to retry.",
		],
		[
			"LongDetail",
			"Generated output cleanup failed: /Users/example/Pictures/2024/Summer holiday in the mountains/RAW exports/very-long-camera-file-name-IMG_2041_final_edit_v3.HEIC.exifcleaner-stage-3f9c1a2e-7b64-4d0a-9c2e-1f5a8d7b6e90.HEIC",
		],
	] as const)(
		"renders the %s story with its literal text and the copy hint",
		(name, literal) => {
			const Story = composed[name];
			const markup = renderToStaticMarkup(React.createElement(Story));

			expect(markup).toContain(literal);
			expect(markup).toContain("Click to copy");
		},
	);
});
