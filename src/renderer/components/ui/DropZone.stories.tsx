import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fireEvent, waitFor, within } from "storybook/test";
import { AppProvider } from "../../contexts/AppContext";
import { knownA11y } from "../../story_support/known_a11y";
import { DropZone } from "./DropZone";
import { EmptyState } from "./EmptyState";

// DropZone wraps whatever the app shows in the drop region, so it is drawn the way App
// draws it for an empty session: the real AppProvider and the real EmptyState as its
// child (D-08, D-11), inside a fixed 580 px frame (D-20) so the area has one real width.
//
// DragOver is the first story that uses `fireEvent` (from `storybook/test`): a drag is
// not a pointer the way a hover is, so a dispatched `dragover` event is the real input
// here, and the play waits for the `drop-zone--active` class the component sets. The
// 3000 ms skip toast (SKIP_TOAST_DELAY_MS) is never started by a story: it is waived as
// a duplicate of the Toast skipped scenarios, because a timer-driven state is flaky
// under load (D-13). No drop is simulated either, for the same reason: the intake path
// with real files belongs to the screens and the e2e specs.
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

const meta = {
	title: "UI/DropZone",
	component: DropZone,
	// Placeholder: `render` builds the real children, as ErrorBoundary.stories.tsx does.
	args: { children: () => null },
	render: () => (
		<WindowFrame>
			<AppProvider>
				<DropZone>{(controls) => <EmptyState {...controls} />}</DropZone>
			</AppProvider>
		</WindowFrame>
	),
} satisfies Meta<typeof DropZone>;

// Framework-mandated default export (CSF: Storybook reads the story file's default export).
export default meta;

type Story = StoryObj<typeof meta>;

export const Idle: Story = {
	parameters: { a11y: knownA11y("ui-dropzone--idle") },
	play: async ({ canvasElement }) => {
		const region = await within(canvasElement).findByRole("region", {
			name: "File drop zone",
		});
		await expect(region).not.toHaveClass("drop-zone--active");
	},
};

export const DragOver: Story = {
	parameters: { a11y: knownA11y("ui-dropzone--drag-over") },
	play: async ({ canvasElement }) => {
		const region = await within(canvasElement).findByRole("region", {
			name: "File drop zone",
		});
		await expect(region).not.toHaveClass("drop-zone--active");
		await fireEvent.dragOver(region);
		await waitFor(() => expect(region).toHaveClass("drop-zone--active"));
	},
};
