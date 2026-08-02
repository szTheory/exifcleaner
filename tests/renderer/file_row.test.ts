import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FileProcessingStatus } from "../../src/domain";
import { FileRow } from "../../src/renderer/components/file-list/FileRow";
import { ErrorExpansion } from "../../src/renderer/components/file-list/ErrorExpansion";
import type { FileEntry } from "../../src/renderer/contexts/AppContext";

vi.mock("react", async (importOriginal) => {
	const actual = await importOriginal<typeof import("react")>();
	return {
		...actual,
		useRef: () => ({ current: true }),
	};
});

vi.mock("../../src/renderer/hooks/use_i18n", () => ({
	useI18n: () => ({
		t: (key: string) =>
			key === "complete"
				? "Complete"
				: key === "writtenToCopy"
					? "Written to a copy"
					: key === "verificationFailedSummary"
						? "Couldn’t verify cleaned output. The incomplete copy was removed; your original is unchanged."
						: key === "cleanupFailedSummary"
							? "Couldn’t verify cleaned output, and the incomplete output could not be removed. Your original is unchanged."
							: key,
	}),
}));

const showContextMenu = vi.fn();

function makeCompletedFile(overrides: Partial<FileEntry> = {}): FileEntry {
	return {
		id: "file-304",
		path: "/photos/sample.jpg",
		name: "sample.jpg",
		extension: "jpg",
		size: 1234,
		folder: null,
		status: FileProcessingStatus.Complete,
		beforeTags: 4,
		afterTags: 0,
		beforeMetadata: {},
		afterMetadata: {},
		error: null,
		...overrides,
	};
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
			file: makeCompletedFile({
				status: FileProcessingStatus.Error,
				afterTags: null,
				afterMetadata: null,
				outputPath: undefined,
				failureKind: "verification",
				error: "ExifTool verification failed",
				detail: "ExifTool verification failed",
			}),
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
			"Couldn’t verify cleaned output. The incomplete copy was removed; your original is unchanged.",
		);
		expect(() => findRevealControl(row)).toThrow();
		expect(() => findElementByClass(row, "file-table__after-done")).toThrow();
	});

	it("uses distinct cleanup copy and exposes only the main-returned residual path in detail", () => {
		const row = FileRow({
			file: makeCompletedFile({
				status: FileProcessingStatus.Error,
				afterTags: null,
				afterMetadata: null,
				outputPath: undefined,
				failureKind: "cleanup",
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

	it("discloses one localized forced-copy result with the 60px row contract", () => {
		const row = FileRow({
			file: makeCompletedFile({
				extension: "raf",
				outputPath: "/photos/sample_cleaned.raf",
				wasForcedCopy: true,
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

		expect(forcedRowProps["aria-label"]).toBe("Complete. Written to a copy.");
		expect(disclosureProps.children).toBe("Written to a copy");
	});

	it("discloses copy mode for ordinary completed rows", () => {
		const row = FileRow({
			file: makeCompletedFile({ outputPath: "/photos/sample_cleaned.jpg" }),
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
			file: makeCompletedFile({
				outputPath: "/photos/sample_cleaned_2.jpg",
			}),
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
			file: makeCompletedFile({ outputPath: "/photos/sample.jpg" }),
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
