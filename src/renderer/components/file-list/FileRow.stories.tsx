import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, within } from "storybook/test";
import { useI18n } from "../../hooks/use_i18n";
import { knownA11y } from "../../story_support/known_a11y";
import { FAILURE_CASES, entryFor } from "../../story_support/process_outcomes";
import { rowLabelFixture } from "../../story_support/row_label";
import { FileRow } from "./FileRow";

// This file is the Phase 73 tracer: one real failure story proves the whole area
// pipeline (frame, copy-lint label fixture, scenario row, grid, sealed a11y-p73 kind).
// 73-02 adds the remaining outcome, failure and boundary stories to this file.
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
