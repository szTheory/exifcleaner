import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";
import { FileProcessingStatus } from "../../../domain";
import { StatusIcon } from "./StatusIcon";

// These stories keep independent accessible name and glyph checks for statuses that
// currently share an icon. They deliberately leave markup and styling free to change.
const meta = {
	title: "UI/StatusIcon",
	component: StatusIcon,
	args: { status: FileProcessingStatus.Pending, shouldAnimate: false },
} satisfies Meta<typeof StatusIcon>;

// Framework-mandated default export (CSF: Storybook reads the story file's default export).
export default meta;

type Story = StoryObj<typeof meta>;

function SideBySide({
	first,
	second,
}: {
	first: FileProcessingStatus;
	second: FileProcessingStatus;
}): React.JSX.Element {
	return (
		<div style={{ display: "flex", gap: "16px" }}>
			<StatusIcon status={first} shouldAnimate={false} />
			<StatusIcon status={second} shouldAnimate={false} />
		</div>
	);
}

async function expectIcons(
	canvasElement: HTMLElement,
	label: string,
	glyphSelectors: readonly string[],
	count: number,
): Promise<void> {
	const icons = await within(canvasElement).findAllByRole("img", {
		name: label,
	});
	await expect(icons).toHaveLength(count);
	for (const icon of icons) {
		await expect(icon).toHaveAttribute("aria-label", label);
		for (const glyphSelector of glyphSelectors) {
			const glyph = icon.matches(glyphSelector)
				? icon
				: icon.querySelector(glyphSelector);
			await expect(glyph).not.toBeNull();
		}
	}
}

export const Pending: Story = {
	play: async ({ canvasElement }) => {
		await expectIcons(canvasElement, "Pending", ["circle"], 1);
	},
};

export const Processing: Story = {
	render: () => (
		<SideBySide
			first={FileProcessingStatus.Processing}
			second={FileProcessingStatus.Reading}
		/>
	),
	play: async ({ canvasElement }) => {
		await expectIcons(
			canvasElement,
			"Processing",
			[".status-icon__spinner"],
			2,
		);
		for (const spinner of canvasElement.querySelectorAll<HTMLElement>(
			".status-icon__spinner",
		)) {
			const style = getComputedStyle(spinner);
			await expect(style.borderRadius).toBe("50%");
			await expect(style.boxShadow).not.toBe("none");
			await expect(style.borderTopColor).not.toBe("rgba(0, 0, 0, 0)");
		}
	},
};

export const Complete: Story = {
	render: () => (
		<SideBySide
			first={FileProcessingStatus.Complete}
			second={FileProcessingStatus.NoMetadataFound}
		/>
	),
	play: async ({ canvasElement }) => {
		await expectIcons(canvasElement, "Complete", ["path"], 2);
		for (const icon of await within(canvasElement).findAllByRole("img", {
			name: "Complete",
		})) {
			await expect(icon).not.toHaveClass("status-icon__check--animate");
		}
	},
};

export const CompleteAnimated: Story = {
	args: { status: FileProcessingStatus.Complete, shouldAnimate: true },
	play: async ({ canvasElement }) => {
		await expectIcons(canvasElement, "Complete", ["path"], 1);
		const check = await within(canvasElement).findByRole("img", {
			name: "Complete",
		});
		await expect(check).toHaveClass("status-icon__check--animate");
	},
};

export const Failed: Story = {
	args: { status: FileProcessingStatus.Error },
	play: async ({ canvasElement }) => {
		await expectIcons(canvasElement, "Error", ["circle", "path"], 1);
	},
};

// FileRow hands the failure summary in as the accessible label (FileRow.tsx:155-157);
// this is the real en string for the xattr failure.
export const FailedLabelled: Story = {
	args: {
		status: FileProcessingStatus.Error,
		accessibleLabel:
			"Metadata was removed, but macOS extended attributes could not be cleared.",
	},
	play: async ({ canvasElement }) => {
		await expectIcons(
			canvasElement,
			"Metadata was removed, but macOS extended attributes could not be cleared.",
			["circle", "path"],
			1,
		);
	},
};
