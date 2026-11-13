import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import "../../styles/metadata_expansion.css";
import { useI18n } from "../../hooks/use_i18n";
import { knownA11y } from "../../story_support/known_a11y";
import { withRealHover } from "../../story_support/real_pointer";
import { FolderRow } from "./FolderRow";

// FolderRow is one `role="row"` that FileTable renders inside its table (FileTable.tsx,
// the `FolderRow` call site), so a bare row fails `aria-required-parent` in both themes
// (D-22). TableFrame mirrors FileTable's table and rowgroup roles with divs: FileTable's
// own section element with the table role fails `aria-allowed-role`, so it is not
// copied (D-14).
// ChevronIcon's rotation rule lives in the metadata expansion stylesheet, which only
// MetadataExpansion imports, so this file imports it itself (D-13); CompleteExpanded
// asserts the computed rotation, which turns a missing import red.
//
// FolderRow has no `discovering` story: the status is never dispatched (DropZone.tsx
// dispatches only scanning, empty and complete), so it is a recorded Phase 73 finding
// and Scanning covers the loading cell. SingleFile never asserts the count wording
// (it has no singular form, also a recorded finding), so a later fix does not turn the
// story red. A backslash path never reaches this component (D-14).
// DropZone and FileTable name a folder by a relative label that ends in a slash
// (the base name, or the path below the dropped folder), never an absolute path.
const FOLDER = "Trip 2026/";

function TableFrame({
	children,
}: {
	children: React.ReactNode;
}): React.JSX.Element {
	const { t } = useI18n();
	return (
		<div role="table" aria-label={t("table.label")}>
			<div role="rowgroup">{children}</div>
		</div>
	);
}

const meta = {
	title: "File list/FolderRow",
	component: FolderRow,
	args: { onToggle: fn() },
	render: (args) => (
		<TableFrame>
			<FolderRow {...args} />
		</TableFrame>
	),
} satisfies Meta<typeof FolderRow>;

// Framework-mandated default export (CSF: Storybook reads the story file's default export).
export default meta;

type Story = StoryObj<typeof meta>;

function chevronIn(canvasElement: HTMLElement): SVGElement {
	const svg = canvasElement.querySelector("svg.chevron-icon");
	if (!(svg instanceof SVGElement)) throw new Error("no chevron rendered");
	return svg;
}

function countIn(canvasElement: HTMLElement): HTMLElement {
	const count = canvasElement.querySelector(".folder-row__count");
	if (!(count instanceof HTMLElement)) throw new Error("no count rendered");
	return count;
}

export const Scanning: Story = {
	parameters: { a11y: knownA11y("file-list-folderrow--scanning") },
	args: {
		folder: FOLDER,
		fileCount: 0,
		isCollapsed: false,
		discoveryStatus: "scanning",
	},
	play: async ({ canvasElement }) => {
		const count = countIn(canvasElement);
		await expect(count).toHaveTextContent("Scanning…");
		await expect(count).toHaveClass("folder-row__count--scanning");
		await expect(count).toHaveAttribute("aria-live", "polite");
		// Vacuity guard for the right-to-left story below.
		await expect(document.documentElement.dir).toBe("ltr");
	},
};

export const CompleteExpanded: Story = {
	parameters: { a11y: knownA11y("file-list-folderrow--complete-expanded") },
	args: {
		folder: FOLDER,
		fileCount: 12,
		isCollapsed: false,
		discoveryStatus: "complete",
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(await canvas.findByRole("table")).toHaveAccessibleName(
			"File results",
		);
		await expect(
			canvas.getByRole("button", { name: `Collapse ${FOLDER}` }),
		).toBeInTheDocument();
		await expect(countIn(canvasElement)).toHaveTextContent("12 files");
		await expect(countIn(canvasElement)).not.toHaveClass(
			"folder-row__count--scanning",
		);
		const svg = chevronIn(canvasElement);
		await expect(svg).toHaveClass("chevron-icon--expanded");
		const matrix = new DOMMatrix(getComputedStyle(svg).transform);
		// rotate(90deg) is matrix(0, 1, -1, 0, 0, 0) up to float rounding; the identity
		// matrix here means the stylesheet import is missing.
		await expect(matrix.b).toBeCloseTo(1, 5);
		await expect(matrix.c).toBeCloseTo(-1, 5);
	},
};

export const CompleteCollapsed: Story = {
	parameters: { a11y: knownA11y("file-list-folderrow--complete-collapsed") },
	args: {
		folder: FOLDER,
		fileCount: 12,
		isCollapsed: true,
		discoveryStatus: "complete",
	},
	play: async ({ canvasElement }) => {
		await expect(
			await within(canvasElement).findByRole("button", {
				name: `Expand ${FOLDER}`,
			}),
		).toBeInTheDocument();
		const svg = chevronIn(canvasElement);
		await expect(svg).not.toHaveClass("chevron-icon--expanded");
		// The expanded story's computed transform is a 90 degree rotation; this one is
		// the identity, so the two differ.
		await expect(getComputedStyle(svg).transform).toBe("none");
		await expect(countIn(canvasElement)).toHaveTextContent("12 files");
	},
};

// DropZone dispatches an empty status for a folder with no supported file and then
// collapses it (DropZone.tsx, the auto-collapse after the empty dispatch), so the
// collapsed form is the one a person normally sees and the expanded form is the
// state between the two dispatches.
export const EmptyExpanded: Story = {
	parameters: { a11y: knownA11y("file-list-folderrow--empty-expanded") },
	args: {
		folder: FOLDER,
		fileCount: 0,
		isCollapsed: false,
		discoveryStatus: "empty",
	},
	play: async ({ canvasElement }) => {
		await expect(countIn(canvasElement)).toHaveTextContent("0 supported files");
		await expect(chevronIn(canvasElement)).toHaveClass(
			"chevron-icon--expanded",
		);
	},
};

export const EmptyCollapsed: Story = {
	parameters: { a11y: knownA11y("file-list-folderrow--empty-collapsed") },
	args: {
		folder: FOLDER,
		fileCount: 0,
		isCollapsed: true,
		discoveryStatus: "empty",
	},
	play: async ({ canvasElement }) => {
		await expect(countIn(canvasElement)).toHaveTextContent("0 supported files");
		await expect(chevronIn(canvasElement)).not.toHaveClass(
			"chevron-icon--expanded",
		);
		await expect(
			await within(canvasElement).findByRole("button", {
				name: `Expand ${FOLDER}`,
			}),
		).toBeInTheDocument();
	},
};

// A count of one has no singular form (a recorded Phase 73 finding), so this story
// shows the state without asserting the count text.
export const SingleFile: Story = {
	parameters: { a11y: knownA11y("file-list-folderrow--single-file") },
	args: {
		folder: FOLDER,
		fileCount: 1,
		isCollapsed: false,
		discoveryStatus: "complete",
	},
	play: async ({ canvasElement }) => {
		await expect(countIn(canvasElement)).toHaveTextContent("1");
		await expect(countIn(canvasElement)).not.toHaveClass(
			"folder-row__count--scanning",
		);
	},
};

const DEEP_PATH =
	"Photos/Archive/2026/Summer/Trips/Mountains/Day 3/Raw exports/";

export const LongPath: Story = {
	parameters: { a11y: knownA11y("file-list-folderrow--long-path") },
	args: {
		folder: DEEP_PATH,
		fileCount: 48,
		isCollapsed: false,
		discoveryStatus: "complete",
	},
	play: async ({ canvasElement }) => {
		const label = canvasElement.querySelector(".folder-row__label");
		if (!(label instanceof HTMLElement)) throw new Error("no label rendered");
		const shown = label.textContent ?? "";
		await expect(shown.length).toBeLessThanOrEqual(40);
		await expect(shown).toContain("…");
		await expect(shown.length).toBeLessThan(DEEP_PATH.length);
		// The full path stays available as the tooltip and in the toggle's name.
		await expect(label).toHaveAttribute("title", DEEP_PATH);
		await expect(
			await within(canvasElement).findByRole("button", {
				name: `Collapse ${DEEP_PATH}`,
			}),
		).toBeInTheDocument();
	},
};

const ARABIC_FOLDER = "صور السفر 2026/";

export const BidiName: Story = {
	parameters: { a11y: knownA11y("file-list-folderrow--bidi-name") },
	globals: { locale: "ar" },
	args: {
		folder: ARABIC_FOLDER,
		fileCount: 12,
		isCollapsed: false,
		discoveryStatus: "complete",
	},
	play: async ({ canvasElement }) => {
		await waitFor(() => expect(document.documentElement.dir).toBe("rtl"));
		await expect(document.documentElement.lang).toBe("ar");
		const label = canvasElement.querySelector(".folder-row__label");
		if (!(label instanceof HTMLElement)) throw new Error("no label rendered");
		await expect(label.tagName).toBe("BDI");
		await expect(label).toHaveAttribute("dir", "auto");
		await expect(label).toHaveTextContent(ARABIC_FOLDER);
		await expect(label).toHaveAttribute("title", ARABIC_FOLDER);
	},
};

// D-10: `.folder-row__toggle:focus-visible` (folder_row.css). The toggle is the only
// focusable element of the story (TableFrame adds none), so one Tab reaches it.
export const KeyboardFocus: Story = {
	parameters: { a11y: knownA11y("file-list-folderrow--keyboard-focus") },
	args: {
		folder: FOLDER,
		fileCount: 12,
		isCollapsed: false,
		discoveryStatus: "complete",
	},
	play: async ({ canvasElement }) => {
		const toggle = await within(canvasElement).findByRole("button");
		await userEvent.tab();
		await expect(toggle).toHaveFocus();
		await expect(toggle.matches(":focus-visible")).toBe(true);
		await expect(getComputedStyle(toggle).outlineStyle).toBe("solid");
	},
};

// RESEARCH C2: `.folder-row__toggle:hover` changes the colour to the accent, and a
// synthetic hover never matches :hover, so withRealHover moves a real pointer onto the
// toggle and throws if :hover did not appear. Last in the file on purpose.
export const ToggleHover: Story = {
	parameters: { a11y: knownA11y("file-list-folderrow--toggle-hover") },
	args: {
		folder: FOLDER,
		fileCount: 12,
		isCollapsed: false,
		discoveryStatus: "complete",
	},
	play: async ({ canvasElement }) => {
		const toggle = await within(canvasElement).findByRole("button");
		const before = getComputedStyle(toggle).color;
		await withRealHover(toggle, userEvent, async () => {
			await waitFor(() =>
				expect(getComputedStyle(toggle).color).not.toBe(before),
			);
		});
	},
};
