import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, within } from "storybook/test";
import { useI18n } from "../../hooks/use_i18n";
import { knownA11y } from "../../story_support/known_a11y";
import {
	FAILURE_CASES,
	FAILURE_WITHOUT_RESIDUAL,
	GENERIC_FAILURE,
	entryFor,
} from "../../story_support/process_outcomes";
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
