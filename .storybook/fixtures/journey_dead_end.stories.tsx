import type { Meta, StoryObj } from "@storybook/react-vite";

// Planted dead ends for the browser controls of .storybook/journey_gate.test.tsx
// (73-03, D-24). They live outside every stories glob (main.ts reads src/renderer
// only), so they never appear in the catalog, the story projects or the grid. Each
// story offers a control named Clear that a journey step asks for, and fails the
// dead-end check in exactly one way:
//
//   DisabledButton      a disabled button: present and named, not usable
//   RolelessClickable   a div with a click handler and no role: there is no control
//                       an assistive technology could find, so it is missing
//   UnreachableButton   an enabled button with tabIndex -1: the keyboard never
//                       reaches it
//   PlayRejects         the story's own play throws: the story did not run, which
//                       must read as a failed run and never as a missing control
const meta = {
	title: "Fixtures/JourneyDeadEnd",
} satisfies Meta;

// Framework-mandated default export (CSF: Storybook reads the story file's default export).
export default meta;

type Story = StoryObj<typeof meta>;

export const DisabledButton: Story = {
	render: () => (
		<button type="button" disabled>
			Clear
		</button>
	),
};

export const RolelessClickable: Story = {
	render: () => <div onClick={() => undefined}>Clear</div>,
};

export const UnreachableButton: Story = {
	render: () => (
		<button type="button" tabIndex={-1}>
			Clear
		</button>
	),
};

export const PlayRejects: Story = {
	render: () => <button type="button">Clear</button>,
	play: async () => {
		throw new Error("planted play failure");
	},
};
