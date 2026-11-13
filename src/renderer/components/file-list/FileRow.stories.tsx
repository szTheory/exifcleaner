import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { FileProcessingStatus } from "../../../domain";
import type { FileEntry } from "../../contexts/AppContext";
import { useI18n } from "../../hooks/use_i18n";
import {
	ARABIC_DIGITS_NAME,
	GERMAN_COMPOUND_NAME,
	HEBREW_LATIN_NAME,
	JAPANESE_LONG_NAME,
	LONG_UNBROKEN_NAME,
	LRO_PDF_NAME,
	MANY_DOTS_NAME,
	RLO_NAME,
	ZERO_BYTE_NAME,
	ZWJ_FAMILY_NAME,
} from "../../story_support/boundary_data";
import { knownA11y } from "../../story_support/known_a11y";
import {
	FAILURE_CASES,
	FAILURE_WITHOUT_RESIDUAL,
	GENERIC_FAILURE,
	OUTCOME_CASES,
	entryFor,
	fileEntry,
} from "../../story_support/process_outcomes";
import { withRealHover } from "../../story_support/real_pointer";
import { rowLabelFixture } from "../../story_support/row_label";
import { FileRow } from "./FileRow";

// This file started as the Phase 73 tracer (one real failure story proved the whole area
// pipeline: frame, copy-lint label fixture, scenario row, grid, sealed a11y-p73 kind).
// Every failure story below is expanded, because the failureKind coverage check in
// .storybook/failure_kind_union.test.ts counts only expanded stories (D-09); the one
// collapsed error story is ErrorCollapsed. Every play asserts a typed literal, never a
// value computed from the fixture, so a corrupted fixture turns its story red.
//
// WindowFrame is the app's default window width (D-20, DEFAULT_WINDOW_WIDTH in
// src/main/window/window_setup.ts:7) with the default height as a minimum and visible
// overflow, so a row is judged at one real width and nothing hides behind a scroll box.
function WindowFrame({
	children,
}: {
	children: React.ReactNode;
}): React.JSX.Element {
	return (
		<div
			style={{
				position: "relative",
				width: "580px",
				minHeight: "312px",
				transform: "translateZ(0)",
			}}
		>
			{children}
		</div>
	);
}

// A FileRow is one `role="row"` that FileTable renders inside its table, so a bare row
// fails `aria-required-parent` (D-22); TableFrame mirrors FileTable's table and
// rowgroup roles with divs, as FolderRow.stories.tsx does (D-14).
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
	title: "File list/FileRow",
	component: FileRow,
	args: {
		file: entryFor(FAILURE_CASES.verification),
		isExpanded: false,
		onToggleExpand: fn(),
		staggerIndex: 0,
		// Placeholder: render builds a fresh ref per render (D-08), because a ref
		// object as an arg crosses the Storybook channel badly.
		animatedCheckRef: { current: new Set<string>() },
		onCopyToast: fn(),
	},
	render: (args) => (
		<WindowFrame>
			<TableFrame>
				<FileRow {...args} animatedCheckRef={{ current: new Set<string>() }} />
			</TableFrame>
		</WindowFrame>
	),
} satisfies Meta<typeof FileRow>;

// Framework-mandated default export (CSF: Storybook reads the story file's default export).
export default meta;

type Story = StoryObj<typeof meta>;

export const Verification: Story = {
	args: {
		file: entryFor(FAILURE_CASES.verification),
		isExpanded: true,
	},
	parameters: {
		a11y: knownA11y("file-list-filerow--verification"),
		copyLint: {
			fixtureText: [
				...rowLabelFixture("test.jpg", "verificationFailedSummary"),
				"Generated output verification failed",
			],
		},
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		const row = await canvas.findByRole("row");
		await expect(row).toHaveAccessibleName(
			"test.jpg. Couldn’t verify cleaned output. The incomplete copy was removed; your original is unchanged.",
		);
		await expect(row).toHaveAttribute("aria-expanded", "true");
		await expect(
			canvas.getByText("Generated output verification failed"),
		).toBeVisible();
	},
};

async function expectErrorRow({
	canvasElement,
	name,
	detail,
}: {
	canvasElement: HTMLElement;
	name: string;
	detail: string;
}): Promise<void> {
	const canvas = within(canvasElement);
	const row = await canvas.findByRole("row");
	await expect(row).toHaveAccessibleName(name);
	await expect(row).toHaveAttribute("aria-expanded", "true");
	const pre = canvasElement.querySelector("pre");
	await expect(pre).not.toBeNull();
	await expect(pre?.textContent).toBe(detail);
	await expect(canvas.getByText("Click to copy")).toBeVisible();
}

export const Write: Story = {
	args: { file: entryFor(FAILURE_CASES.write), isExpanded: true },
	parameters: {
		a11y: knownA11y("file-list-filerow--write"),
		copyLint: {
			fixtureText: [
				...rowLabelFixture("test.jpg", "writeFailedSummary"),
				"Generated output write failed",
				"/path/to/incomplete-output.jpg",
			],
		},
	},
	play: async ({ canvasElement }) => {
		await expectErrorRow({
			canvasElement,
			name: "test.jpg. Couldn’t write the cleaned output. Your original is unchanged.",
			detail: "Generated output write failed: /path/to/incomplete-output.jpg",
		});
	},
};

export const WriteWithoutResidual: Story = {
	args: {
		file: entryFor(FAILURE_WITHOUT_RESIDUAL.write),
		isExpanded: true,
	},
	parameters: {
		a11y: knownA11y("file-list-filerow--write-without-residual"),
		copyLint: {
			fixtureText: [
				...rowLabelFixture("test.jpg", "writeFailedSummary"),
				"Generated output write failed",
			],
		},
	},
	play: async ({ canvasElement }) => {
		await expectErrorRow({
			canvasElement,
			name: "test.jpg. Couldn’t write the cleaned output. Your original is unchanged.",
			detail: "Generated output write failed",
		});
	},
};

export const Cleanup: Story = {
	args: { file: entryFor(FAILURE_CASES.cleanup), isExpanded: true },
	parameters: {
		a11y: knownA11y("file-list-filerow--cleanup"),
		copyLint: {
			fixtureText: [
				...rowLabelFixture("test.jpg", "cleanupFailedSummary"),
				"Generated output cleanup failed",
				"/path/to/incomplete-output.jpg",
			],
		},
	},
	play: async ({ canvasElement }) => {
		await expectErrorRow({
			canvasElement,
			name: "test.jpg. Couldn’t verify cleaned output, and the incomplete output could not be removed. Your original is unchanged.",
			detail: "Generated output cleanup failed: /path/to/incomplete-output.jpg",
		});
	},
};

export const CleanupWithoutResidual: Story = {
	args: {
		file: entryFor(FAILURE_WITHOUT_RESIDUAL.cleanup),
		isExpanded: true,
	},
	parameters: {
		a11y: knownA11y("file-list-filerow--cleanup-without-residual"),
		copyLint: {
			fixtureText: [
				...rowLabelFixture("test.jpg", "cleanupFailedSummary"),
				"Generated output cleanup failed",
			],
		},
	},
	play: async ({ canvasElement }) => {
		await expectErrorRow({
			canvasElement,
			name: "test.jpg. Couldn’t verify cleaned output, and the incomplete output could not be removed. Your original is unchanged.",
			detail: "Generated output cleanup failed",
		});
	},
};

export const Commit: Story = {
	args: { file: entryFor(FAILURE_CASES.commit), isExpanded: true },
	parameters: {
		a11y: knownA11y("file-list-filerow--commit"),
		copyLint: {
			fixtureText: [
				...rowLabelFixture("test.jpg", "commitFailedSummary"),
				"Generated output commit failed",
			],
		},
	},
	play: async ({ canvasElement }) => {
		await expectErrorRow({
			canvasElement,
			name: "test.jpg. Couldn’t save the cleaned file over the original. Another app, such as a cloud sync client, may have changed or locked it. Your original is unchanged.",
			detail: "Generated output commit failed",
		});
	},
};

const XATTR_DETAIL =
	"Embedded metadata was removed, but macOS extended attributes could not be cleared: Operation not permitted";

export const Xattr: Story = {
	args: { file: entryFor(FAILURE_CASES.xattr), isExpanded: true },
	parameters: {
		a11y: knownA11y("file-list-filerow--xattr"),
		copyLint: {
			fixtureText: [
				...rowLabelFixture("test.jpg", "xattrFailedSummary"),
				XATTR_DETAIL,
			],
		},
	},
	play: async ({ canvasElement }) => {
		await expectErrorRow({
			canvasElement,
			name: "test.jpg. Metadata was removed, but macOS extended attributes could not be cleared.",
			detail:
				"Embedded metadata was removed, but macOS extended attributes could not be cleared: Operation not permitted: /path/to/cleaned.jpg",
		});
	},
};

export const XattrWithoutResidual: Story = {
	args: {
		file: entryFor(FAILURE_WITHOUT_RESIDUAL.xattr),
		isExpanded: true,
	},
	parameters: {
		a11y: knownA11y("file-list-filerow--xattr-without-residual"),
		copyLint: {
			fixtureText: [
				...rowLabelFixture("test.jpg", "xattrFailedSummary"),
				XATTR_DETAIL,
			],
		},
	},
	play: async ({ canvasElement }) => {
		await expectErrorRow({
			canvasElement,
			name: "test.jpg. Metadata was removed, but macOS extended attributes could not be cleared.",
			detail:
				"Embedded metadata was removed, but macOS extended attributes could not be cleared: Operation not permitted",
		});
	},
};

export const Refused: Story = {
	args: { file: entryFor(FAILURE_CASES.refused), isExpanded: true },
	parameters: {
		a11y: knownA11y("file-list-filerow--refused"),
		copyLint: {
			fixtureText: rowLabelFixture("test.jpg", "outcome.refusedRaf"),
		},
	},
	play: async ({ canvasElement }) => {
		await expectErrorRow({
			canvasElement,
			name: "test.jpg. RAF cleaning is not currently safe; the original was left unchanged",
			detail:
				"RAF metadata removal is disabled because writing this format can damage the original. The file was left unchanged.",
		});
	},
};

// The `{ success: false, error }` branch: no failureKind, so FileRow has no summary and
// the row name falls back to the engine's own message (FileRow.tsx, the aria-label).
export const GenericFailure: Story = {
	args: { file: entryFor(GENERIC_FAILURE), isExpanded: true },
	parameters: {
		a11y: knownA11y("file-list-filerow--generic-failure"),
		copyLint: {
			fixtureText: [
				"test.jpg. ExifTool crashed unexpectedly. Restart the app to retry.",
				"ExifTool crashed unexpectedly. Restart the app to retry.",
			],
		},
	},
	play: async ({ canvasElement }) => {
		await expectErrorRow({
			canvasElement,
			name: "test.jpg. ExifTool crashed unexpectedly. Restart the app to retry.",
			detail: "ExifTool crashed unexpectedly. Restart the app to retry.",
		});
	},
};

export const ErrorCollapsed: Story = {
	args: { file: entryFor(FAILURE_CASES.write), isExpanded: false },
	parameters: {
		a11y: knownA11y("file-list-filerow--error-collapsed"),
		copyLint: {
			fixtureText: [
				...rowLabelFixture("test.jpg", "writeFailedSummary"),
				"Generated output write failed",
			],
		},
	},
	play: async ({ canvasElement }) => {
		const row = await within(canvasElement).findByRole("row");
		await expect(row).toHaveAccessibleName(
			"test.jpg. Couldn’t write the cleaned output. Your original is unchanged.",
		);
		await expect(row).toHaveAttribute("aria-expanded", "false");
		await expect(canvasElement.querySelector("pre")).toBeNull();
	},
};

// Helpers for the stories below (kept ahead of them so a story block holds only its own play).
const SOURCE_PATH = "/path/to/test.jpg";

function cleanedInPlace(overrides: Partial<FileEntry> = {}): FileEntry {
	return {
		...entryFor(OUTCOME_CASES.cleaned),
		outputPath: SOURCE_PATH,
		...overrides,
	};
}

async function expectRow({
	canvasElement,
	name,
	expanded,
}: {
	canvasElement: HTMLElement;
	name: string;
	expanded: boolean;
}): Promise<HTMLElement> {
	const row = await within(canvasElement).findByRole("row");
	await expect(row).toHaveAccessibleName(name);
	await expect(row).toHaveAttribute("aria-expanded", String(expanded));
	return row;
}

async function expectNameText(
	canvasElement: HTMLElement,
	literal: string,
): Promise<void> {
	await within(canvasElement).findByRole("row");
	const name = canvasElement.querySelector("bdi.file-table__name-text");
	await expect(name).not.toBeNull();
	await expect(name?.textContent).toBe(literal);
}

// Size and count magnitudes (D-21 item 2 and 3): the rendered text is a finding, so the
// plays assert presence only.
async function expectCells(canvasElement: HTMLElement): Promise<void> {
	const row = await within(canvasElement).findByRole("row");
	const cells = within(row).getAllByRole("cell");
	// status, name, type, size, before, after
	await expect(cells).toHaveLength(6);
	for (const index of [3, 4, 5]) {
		await expect(cells[index]?.textContent).not.toBe("");
	}
}

// ---------------------------------------------------------------------------------
// Progress rows (Phase 73-02). A Reading or Processing row has no outcomeKind and no
// failureKind, so FileRow.tsx:61-68 leaves outcomeSummary undefined and the row's
// accessible name takes the fallback at FileRow.tsx:144, while StatusIcon labels the same
// row from its own status. That mismatch is a recorded finding (73-EVIDENCE.md), so the
// Reading and Processing plays never assert the row's name and Reading asserts only that
// its icon has a label (the icon text for Reading is a separate finding, D-31 seed 7).
// ---------------------------------------------------------------------------------

export const Pending: Story = {
	args: { file: fileEntry({ status: FileProcessingStatus.Pending }) },
	parameters: {
		a11y: knownA11y("file-list-filerow--pending"),
		copyLint: { fixtureText: ["test.jpg. Pending"] },
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		const row = await canvas.findByRole("row");
		await expect(row).toHaveAccessibleName("test.jpg. Pending");
		await expect(
			within(row).getByRole("img", { name: "Pending" }),
		).toBeVisible();
	},
};

export const Reading: Story = {
	args: { file: fileEntry({ status: FileProcessingStatus.Reading }) },
	parameters: { a11y: knownA11y("file-list-filerow--reading") },
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(await canvas.findAllByRole("row")).toHaveLength(1);
		const status = canvasElement.querySelector(".file-table__cell--status");
		await expect(status).not.toBeNull();
		const icon = within(status as HTMLElement).getByRole("img");
		await expect(icon).toHaveAccessibleName();
	},
};

export const Processing: Story = {
	args: { file: fileEntry({ status: FileProcessingStatus.Processing }) },
	parameters: { a11y: knownA11y("file-list-filerow--processing") },
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(await canvas.findAllByRole("row")).toHaveLength(1);
		await expect(canvas.getByRole("img", { name: "Processing" })).toBeVisible();
	},
};

// ---------------------------------------------------------------------------------
// Outcome rows. The fold of the cleaned case writes the cleaned copy's path as
// outputPath, which FileRow reads as a copy (FileRow.tsx:43-46); a cleaned-in-place row
// overrides outputPath after the fold with the source path (F-04, `entryFor`'s own
// overrides are applied before the fold).
// ---------------------------------------------------------------------------------

export const Cleaned: Story = {
	args: { file: cleanedInPlace() },
	parameters: {
		a11y: knownA11y("file-list-filerow--cleaned"),
		copyLint: { fixtureText: rowLabelFixture("test.jpg", "outcome.cleaned") },
	},
	play: async ({ canvasElement }) => {
		await expectRow({
			canvasElement,
			name: "test.jpg. Metadata removed",
			expanded: false,
		});
		const canvas = within(canvasElement);
		await expect(canvas.queryByText("Written to a copy")).toBeNull();
		await expect(
			canvas.getByRole("button", { name: "Reveal original in file manager" }),
		).toBeInTheDocument();
	},
};

export const CleanedExpanded: Story = {
	args: { file: cleanedInPlace(), isExpanded: true },
	parameters: {
		a11y: knownA11y("file-list-filerow--cleaned-expanded"),
		copyLint: { fixtureText: rowLabelFixture("test.jpg", "outcome.cleaned") },
	},
	play: async ({ canvasElement }) => {
		await expectRow({
			canvasElement,
			name: "test.jpg. Metadata removed",
			expanded: true,
		});
		const summary = canvasElement.querySelector(".metadata-expansion__summary");
		await expect(summary).not.toBeNull();
		await expect(summary?.textContent).toBe(
			"2 fields removed · 1 field still present",
		);
	},
};

// wasForcedCopy true makes FileRow show the copy-mode disclosure and add it to the row
// name (FileRow.tsx:43-46, 138-141).
export const CopyModeDisclosure: Story = {
	args: { file: cleanedInPlace({ wasForcedCopy: true }) },
	parameters: {
		a11y: knownA11y("file-list-filerow--copy-mode-disclosure"),
		copyLint: {
			fixtureText: ["test.jpg. Metadata removed. Written to a copy."],
		},
	},
	play: async ({ canvasElement }) => {
		await expectRow({
			canvasElement,
			name: "test.jpg. Metadata removed. Written to a copy.",
			expanded: false,
		});
		await expect(
			within(canvasElement).getByText("Written to a copy"),
		).toBeVisible();
	},
};

export const Unchanged: Story = {
	args: { file: entryFor(OUTCOME_CASES.unchanged) },
	parameters: {
		a11y: knownA11y("file-list-filerow--unchanged"),
		copyLint: {
			fixtureText: rowLabelFixture("test.jpg", "outcome.unchanged"),
		},
	},
	play: async ({ canvasElement }) => {
		await expectRow({
			canvasElement,
			name: "test.jpg. No measured metadata was removed",
			expanded: false,
		});
		await expect(
			canvasElement.querySelector(".file-table__error-summary")?.textContent,
		).toBe("No measured metadata was removed");
	},
};

export const AlreadyClean: Story = {
	args: { file: entryFor(OUTCOME_CASES["already-clean"]) },
	parameters: {
		a11y: knownA11y("file-list-filerow--already-clean"),
		copyLint: {
			fixtureText: rowLabelFixture("test.jpg", "outcome.alreadyClean"),
		},
	},
	play: async ({ canvasElement }) => {
		await expectRow({
			canvasElement,
			name: "test.jpg. No removable metadata found; the file was not rewritten",
			expanded: false,
		});
	},
};

export const AlreadyCleanExpanded: Story = {
	args: { file: entryFor(OUTCOME_CASES["already-clean"]), isExpanded: true },
	parameters: {
		a11y: knownA11y("file-list-filerow--already-clean-expanded"),
		copyLint: {
			fixtureText: rowLabelFixture("test.jpg", "outcome.alreadyClean"),
		},
	},
	play: async ({ canvasElement }) => {
		await expectRow({
			canvasElement,
			name: "test.jpg. No removable metadata found; the file was not rewritten",
			expanded: true,
		});
		await expect(
			canvasElement.querySelector(".metadata-expansion__empty")?.textContent,
		).toBe("No removable metadata found; the file was not rewritten");
	},
};

// ---------------------------------------------------------------------------------
// Boundary rows (STY-03, D-17, D-18). Each name story asserts the rendered name text
// against a typed literal of the same escapes (exact code units, no normalization). The
// stories that show a defect from the D-21 list assert only what holds both with the
// defect and with its fix: the row is present and the cell is not empty, never the
// clipped or English-only text.
// ---------------------------------------------------------------------------------

export const HebrewLatinName: Story = {
	args: { file: cleanedInPlace({ name: HEBREW_LATIN_NAME }) },
	parameters: { a11y: knownA11y("file-list-filerow--hebrew-latin-name") },
	play: async ({ canvasElement }) => {
		await expectNameText(
			canvasElement,
			"report-\u05E9\u05DC\u05D5\u05DD-final.jpg",
		);
	},
};

export const ArabicDigitsName: Story = {
	args: {
		file: cleanedInPlace({ name: ARABIC_DIGITS_NAME, extension: "PNG" }),
	},
	parameters: { a11y: knownA11y("file-list-filerow--arabic-digits-name") },
	play: async ({ canvasElement }) => {
		await expectNameText(
			canvasElement,
			"\u062A\u0642\u0631\u064A\u0631-photo-\u0661\u0662\u0663-\u0627\u0644\u0646\u0647\u0627\u064A\u0629.png",
		);
	},
};

export const RloName: Story = {
	args: { file: cleanedInPlace({ name: RLO_NAME }) },
	parameters: { a11y: knownA11y("file-list-filerow--rlo-name") },
	play: async ({ canvasElement }) => {
		await expectNameText(canvasElement, "holiday\u202Egnp.jpg");
	},
};

export const LroPdfName: Story = {
	args: { file: cleanedInPlace({ name: LRO_PDF_NAME, extension: "PNG" }) },
	parameters: { a11y: knownA11y("file-list-filerow--lro-pdf-name") },
	play: async ({ canvasElement }) => {
		await expectNameText(
			canvasElement,
			"scan-\u202Dabc\u202C-\u202Edef\u202C.png",
		);
	},
};

export const LongUnbrokenName: Story = {
	args: { file: cleanedInPlace({ name: LONG_UNBROKEN_NAME }) },
	parameters: { a11y: knownA11y("file-list-filerow--long-unbroken-name") },
	play: async ({ canvasElement }) => {
		// 180 code units in the fixture and in the rendered text, so a builder change
		// cannot shorten the stress silently.
		await expect(LONG_UNBROKEN_NAME).toHaveLength(180);
		await expectNameText(canvasElement, "a".repeat(176) + ".jpg");
		await expect(
			canvasElement.querySelector("bdi.file-table__name-text")?.textContent,
		).toHaveLength(180);
	},
};

export const ZwjFamilyName: Story = {
	args: { file: cleanedInPlace({ name: ZWJ_FAMILY_NAME, extension: "PNG" }) },
	parameters: { a11y: knownA11y("file-list-filerow--zwj-family-name") },
	play: async ({ canvasElement }) => {
		await expectNameText(
			canvasElement,
			"family-\u{1F468}\u200D\u{1F469}\u200D\u{1F467}\u200D\u{1F466}.png",
		);
	},
};

export const ManyDotsName: Story = {
	args: { file: cleanedInPlace({ name: MANY_DOTS_NAME }) },
	parameters: { a11y: knownA11y("file-list-filerow--many-dots-name") },
	play: async ({ canvasElement }) => {
		await expectNameText(canvasElement, "archive................jpg");
	},
};

export const GermanCompoundName: Story = {
	args: { file: cleanedInPlace({ name: GERMAN_COMPOUND_NAME }) },
	parameters: { a11y: knownA11y("file-list-filerow--german-compound-name") },
	play: async ({ canvasElement }) => {
		await expectNameText(
			canvasElement,
			"Donaudampfschifffahrtsgesellschaftskapit\u00E4nsm\u00FCtze-Urlaubsfoto.jpg",
		);
	},
};

export const JapaneseLongName: Story = {
	args: { file: cleanedInPlace({ name: JAPANESE_LONG_NAME }) },
	parameters: { a11y: knownA11y("file-list-filerow--japanese-long-name") },
	play: async ({ canvasElement }) => {
		await expectNameText(
			canvasElement,
			"\u6771\u4EAC\u306E\u5915\u66AE\u308C\u524D\u306B\u64AE\u5F71\u3057\u305F\u5BB6\u65CF\u65C5\u884C\u306E\u5199\u771F\u3068\u52D5\u753B\u3092\u3059\u3079\u3066\u307E\u3068\u3081\u305F\u9577\u3044\u30D5\u30A1\u30A4\u30EB\u540D.jpg",
		);
	},
};

// A zero-byte file the engine cannot read is a catch-path error, and one it reads with no
// tags is an already-clean fold, both states the pipeline produces
// (use_process_files.ts:30-52 for the second); neither is a bare terminal status.
export const ZeroByteError: Story = {
	args: {
		file: entryFor(GENERIC_FAILURE, { size: 0, name: ZERO_BYTE_NAME }),
		isExpanded: true,
	},
	parameters: {
		a11y: knownA11y("file-list-filerow--zero-byte-error"),
		copyLint: {
			fixtureText: [
				"empty.jpg. ExifTool crashed unexpectedly. Restart the app to retry.",
				"ExifTool crashed unexpectedly. Restart the app to retry.",
			],
		},
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(await canvas.findAllByRole("row")).toHaveLength(1);
		await expect(canvas.getByRole("img", { name: "Error" })).toBeVisible();
		const size = canvasElement.querySelector(".file-table__cell--size");
		await expect(size?.textContent).not.toBe("");
	},
};

export const ZeroByteNoMetadata: Story = {
	args: {
		file: entryFor(OUTCOME_CASES["already-clean"], {
			size: 0,
			name: ZERO_BYTE_NAME,
		}),
	},
	parameters: {
		a11y: knownA11y("file-list-filerow--zero-byte-no-metadata"),
		copyLint: {
			fixtureText: rowLabelFixture("empty.jpg", "outcome.alreadyClean"),
		},
	},
	play: async ({ canvasElement }) => {
		await expectRow({
			canvasElement,
			name: "empty.jpg. No removable metadata found; the file was not rewritten",
			expanded: false,
		});
		const size = canvasElement.querySelector(".file-table__cell--size");
		await expect(size?.textContent).not.toBe("");
	},
};

export const HugeSize: Story = {
	args: {
		file: cleanedInPlace({
			size: 1_099_511_627_776,
			outputSize: 1_099_511_627_776,
		}),
	},
	parameters: { a11y: knownA11y("file-list-filerow--huge-size") },
	play: async ({ canvasElement }) => {
		await expectCells(canvasElement);
	},
};

export const JustUnderMegabyte: Story = {
	args: { file: cleanedInPlace({ size: 1_048_575, outputSize: 1_048_575 }) },
	parameters: { a11y: knownA11y("file-list-filerow--just-under-megabyte") },
	play: async ({ canvasElement }) => {
		await expectCells(canvasElement);
	},
};

export const HugeTagCounts: Story = {
	args: { file: cleanedInPlace({ beforeTags: 654_321, afterTags: 123_456 }) },
	parameters: { a11y: knownA11y("file-list-filerow--huge-tag-counts") },
	play: async ({ canvasElement }) => {
		await expectCells(canvasElement);
	},
};

// ---------------------------------------------------------------------------------
// Keyboard focus and hover (72 D-10, D-11): one story each for a CSS rule that exists,
// `.file-table__row:focus-visible` and `.file-table__row:hover` (file_table.css). Hover
// stays last in the file on purpose.
// ---------------------------------------------------------------------------------

export const RowKeyboardFocus: Story = {
	args: { file: cleanedInPlace() },
	parameters: {
		a11y: knownA11y("file-list-filerow--row-keyboard-focus"),
		copyLint: { fixtureText: rowLabelFixture("test.jpg", "outcome.cleaned") },
	},
	play: async ({ canvasElement }) => {
		const row = await within(canvasElement).findByRole("row");
		await userEvent.tab();
		await expect(row).toHaveFocus();
		await expect(row.matches(":focus-visible")).toBe(true);
		await expect(getComputedStyle(row).outlineStyle).toBe("solid");
	},
};

export const RowHover: Story = {
	args: { file: cleanedInPlace() },
	parameters: {
		a11y: knownA11y("file-list-filerow--row-hover"),
		copyLint: { fixtureText: rowLabelFixture("test.jpg", "outcome.cleaned") },
	},
	play: async ({ canvasElement }) => {
		const row = await within(canvasElement).findByRole("row");
		const before = getComputedStyle(row).backgroundColor;
		await withRealHover(row, userEvent, async () => {
			await waitFor(() =>
				expect(getComputedStyle(row).backgroundColor).not.toBe(before),
			);
		});
	},
};
