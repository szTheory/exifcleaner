import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, waitFor, within } from "storybook/test";
import { LanguageDropdown } from "./LanguageDropdown";

const meta = {
	title: "Settings/LanguageDropdown",
	component: LanguageDropdown,
	args: { currentLanguage: null, onLanguageChange: fn() },
} satisfies Meta<typeof LanguageDropdown>;

// Framework-mandated default export (CSF: Storybook reads the story file's default export).
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
	play: async ({ canvasElement, globals }) => {
		const canvas = within(canvasElement);
		// The real ThemeProvider writes data-theme from the mock; the story only reads it.
		await waitFor(() =>
			expect(document.documentElement.dataset["theme"]).toBe(globals["theme"]),
		);
		await canvas.findByRole("button");
	},
};
