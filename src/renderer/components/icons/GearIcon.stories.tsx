import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import "../../styles/settings_drawer.css";
import { withRealHover } from "../../story_support/real_pointer";
import { GearIcon } from "./GearIcon";

// GearIcon's size, colour, :hover and :focus-visible rules live in the settings
// drawer stylesheet, which only SettingsDrawer imports, so this story imports it
// itself (D-13). The aria-label is hardcoded English in the component (already a
// baselined copy finding), so the label assertions are literals.
const meta = {
	title: "Icons/GearIcon",
	component: GearIcon,
	args: { isOpen: false, onClick: fn() },
} satisfies Meta<typeof GearIcon>;

// Framework-mandated default export (CSF: Storybook reads the story file's default export).
export default meta;

type Story = StoryObj<typeof meta>;

export const Closed: Story = {
	play: async ({ canvasElement }) => {
		await expect(
			await within(canvasElement).findByRole("button", {
				name: "Open settings",
			}),
		).toBeInTheDocument();
	},
};

export const Open: Story = {
	args: { isOpen: true },
	play: async ({ canvasElement }) => {
		await expect(
			await within(canvasElement).findByRole("button", {
				name: "Close settings",
			}),
		).toBeInTheDocument();
	},
};

// D-10: `.gear-icon:focus-visible` (line 21 of that stylesheet). The solid outline also
// proves the stylesheet import: without it the button has no outline rule.
export const KeyboardFocus: Story = {
	play: async ({ canvasElement }) => {
		const button = await within(canvasElement).findByRole("button");
		await userEvent.tab();
		await expect(button).toHaveFocus();
		await expect(button.matches(":focus-visible")).toBe(true);
		await expect(getComputedStyle(button).outlineStyle).toBe("solid");
	},
};

// RESEARCH C2: `.gear-icon:hover` changes the colour (line 16 of that stylesheet), and a
// synthetic hover never matches :hover, so withRealHover moves a real pointer onto
// the button and throws if :hover did not appear. Last in the file on purpose.
export const Hover: Story = {
	play: async ({ canvasElement }) => {
		const button = await within(canvasElement).findByRole("button");
		const before = getComputedStyle(button).color;
		await withRealHover(button, userEvent, async () => {
			await waitFor(() =>
				expect(getComputedStyle(button).color).not.toBe(before),
			);
		});
	},
};
