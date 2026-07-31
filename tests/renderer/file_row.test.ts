import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FileProcessingStatus } from "../../src/domain";
import { FileRow } from "../../src/renderer/components/file-list/FileRow";
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

		expect(forcedRow.props["aria-label"]).toBe("Complete. Written to a copy.");
	expect(disclosure.props.children).toBe("Written to a copy");
	});

	it("does not disclose copy mode for ordinary completed rows", () => {
		const row = FileRow({
			file: makeCompletedFile({ outputPath: "/photos/sample_cleaned.jpg" }),
			isExpanded: false,
			onToggleExpand: vi.fn(),
			staggerIndex: 0,
			animatedCheckRef: { current: new Set<string>() },
			onCopyToast: vi.fn(),
		});

		expect(() => findElementByClass(row, "file-table__copy-disclosure")).toThrow();
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
