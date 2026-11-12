import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";
import { FileProcessingStatus } from "../../../domain";
import { StatusIcon } from "./StatusIcon";

// Reasoned omissions and proofs (D-12, D-16): Reading renders the same spinner as
// Processing and NoMetadataFound the same check as Complete, so the Processing and
// Complete stories show both statuses side by side and assert their markup is
// identical (the proofs behind the duplicate waivers). The check animation is
// suppressed under reduced motion, so CompleteAnimated asserts only the prop-to-class
// wiring and the motion itself is not a story. The first-column icon receives Error
// or a non-expandable state, never an expanded one.
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

async function expectIdenticalPair(
	canvasElement: HTMLElement,
	label: string,
): Promise<void> {
	const icons = canvasElement.querySelectorAll(".status-icon");
	await expect(icons).toHaveLength(2);
	await expect(icons[0]?.outerHTML).toBe(icons[1]?.outerHTML);
	await expect(
		await within(canvasElement).findAllByRole("img", { name: label }),
	).toHaveLength(2);
}

export const Pending: Story = {
	play: async ({ canvasElement }) => {
		await expect(
			await within(canvasElement).findByRole("img", { name: "Pending" }),
		).toBeInTheDocument();
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
		await expectIdenticalPair(canvasElement, "Processing");
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
		await expectIdenticalPair(canvasElement, "Complete");
	},
};

export const CompleteAnimated: Story = {
	args: { status: FileProcessingStatus.Complete, shouldAnimate: true },
	play: async ({ canvasElement }) => {
		const check = await within(canvasElement).findByRole("img", {
			name: "Complete",
		});
		await expect(check).toHaveClass("status-icon__check--animate");
	},
};

export const Failed: Story = {
	args: { status: FileProcessingStatus.Error },
	play: async ({ canvasElement }) => {
		await expect(
			await within(canvasElement).findByRole("img", { name: "Error" }),
		).toBeInTheDocument();
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
		await expect(
			await within(canvasElement).findByRole("img", {
				name: "Metadata was removed, but macOS extended attributes could not be cleared.",
			}),
		).toBeInTheDocument();
	},
};
