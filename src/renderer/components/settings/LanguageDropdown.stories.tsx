import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, waitFor, within } from "storybook/test";
import fa from "../../../../.resources/locales/fa.json";
import { LanguageDropdown } from "./LanguageDropdown";

const meta = {
	title: "Settings/LanguageDropdown",
	component: LanguageDropdown,
	args: { currentLanguage: null, onLanguageChange: fn() },
} satisfies Meta<typeof LanguageDropdown>;

// Framework-mandated default export (CSF: Storybook reads the story file's default export).
export default meta;

type Story = StoryObj<typeof meta>;

// The real ThemeProvider and I18nProvider write data-theme, lang and dir from
// the mock; these stories only read them.
export const Default: Story = {
	play: async ({ canvasElement, globals }) => {
		const canvas = within(canvasElement);
		await waitFor(() =>
			expect(document.documentElement.dataset["theme"]).toBe(globals["theme"]),
		);
		const trigger = await canvas.findByRole("button");
		await expect(trigger).toHaveTextContent("System");
		// Vacuity guard for the right-to-left stories below.
		await expect(document.documentElement.dir).toBe("ltr");
	},
};

export const Arabic: Story = {
	globals: { locale: "ar" },
	play: async ({ canvasElement }) => {
		await waitFor(() => expect(document.documentElement.dir).toBe("rtl"));
		await expect(document.documentElement.lang).toBe("ar");
		await within(canvasElement).findByRole("button");
	},
};

export const Persian: Story = {
	globals: { locale: "fa" },
	play: async ({ canvasElement }) => {
		await waitFor(() => expect(document.documentElement.dir).toBe("rtl"));
		await expect(document.documentElement.lang).toBe("fa");
		const trigger = await within(canvasElement).findByRole("button");
		await expect(trigger).toHaveTextContent(fa.languageSystem);
	},
};
