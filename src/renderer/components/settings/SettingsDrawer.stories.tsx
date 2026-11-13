import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import ar from "../../../../.resources/locales/ar.json";
import de from "../../../../.resources/locales/de.json";
import fa from "../../../../.resources/locales/fa.json";
import hu from "../../../../.resources/locales/hu.json";
import { LANGUAGE_NAMES } from "../../../domain";
import { knownA11y } from "../../story_support/known_a11y";
import { withRealHover } from "../../story_support/real_pointer";
import { SettingsDrawer } from "./SettingsDrawer";

// The real drawer, opened (D-08, D-11): `isOpen` is an arg and the settings it loads come
// from `parameters.mockApi.settings`, the platform from `parameters.mockApi.overrides`,
// so no seam is added. The drawer is `position: fixed` (settings_drawer.css), so the
// frame below is the containing block (`transform`), 580 px wide and 312 px high, and the
// drawer fills it and scrolls. The drawer returns null until its settings resolve, so
// every play starts with `findByRole("dialog")`.
//
// The three theme-mode stories set `settings.themeMode`; the resolved theme still comes
// from the toolbar global, so `dark` selected under a light toolbar is an honest control
// state, not a mistake (D-11). Their names avoid a trailing Light or Dark (the story
// shape gate).
//
// Language and direction come from `globals: { locale }`. English is the default and the
// left-to-right guard; `ar` and `fa` wait for `dir` to become rtl. The drawer's height in
// de, hu and fa is recorded as a finding in 73-EVIDENCE.md (D-21 item 8), not asserted.
// The drawer has its own focus trap (SettingsDrawer.tsx), so the keyboard story asserts
// on the named close button, not on a single Tab.
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
				height: "312px",
				transform: "translateZ(0)",
			}}
		>
			{children}
		</div>
	);
}

const meta = {
	title: "Settings/SettingsDrawer",
	component: SettingsDrawer,
	args: { isOpen: true, onClose: fn() },
	render: (args) => (
		<WindowFrame>
			<SettingsDrawer {...args} />
		</WindowFrame>
	),
} satisfies Meta<typeof SettingsDrawer>;

// Framework-mandated default export (CSF: Storybook reads the story file's default export).
export default meta;

type Story = StoryObj<typeof meta>;

// The six switches in DOM order, with their English labels and the ids the drawer gives
// them; the macOS-only one is last.
const SWITCHES = [
	{ id: "toggle-preserve-orientation", label: "Preserve orientation" },
	{ id: "toggle-preserve-color-profile", label: "Preserve color profile" },
	{ id: "toggle-preserve-resolution", label: "Preserve resolution" },
	{ id: "toggle-save-as-copy", label: "Save as copy" },
	{ id: "toggle-preserve-timestamps", label: "Preserve modification date" },
	{ id: "toggle-remove-xattrs", label: "Remove macOS attributes" },
] as const;

const ALL_ON = {
	preserveOrientation: true,
	preserveColorProfile: true,
	preserveResolution: true,
	saveAsCopy: true,
	preserveTimestamps: true,
	removeXattrs: true,
};

const ALL_OFF = {
	preserveOrientation: false,
	preserveColorProfile: false,
	preserveResolution: false,
	saveAsCopy: false,
	preserveTimestamps: false,
	removeXattrs: false,
};

async function openDialog(canvasElement: HTMLElement): Promise<HTMLElement> {
	return within(canvasElement).findByRole("dialog");
}

async function expectSwitches({
	canvasElement,
	labels,
	checked,
}: {
	canvasElement: HTMLElement;
	labels: readonly string[];
	checked: boolean;
}): Promise<void> {
	const dialog = await openDialog(canvasElement);
	const switches = within(dialog).getAllByRole("switch");
	await expect(
		switches.map((element) => element.getAttribute("aria-label")),
	).toEqual(labels);
	for (const element of switches) {
		if (checked) await expect(element).toBeChecked();
		else await expect(element).not.toBeChecked();
	}
}

export const AllTogglesOn: Story = {
	parameters: {
		a11y: knownA11y("settings-settingsdrawer--all-toggles-on"),
		mockApi: { settings: ALL_ON },
	},
	play: async ({ canvasElement }) => {
		await expectSwitches({
			canvasElement,
			labels: SWITCHES.map(({ label }) => label),
			checked: true,
		});
		// The macOS switch is present by default (the mock reports a Mac).
		await expect(
			canvasElement.querySelector("#toggle-remove-xattrs"),
		).not.toBeNull();
		// Vacuity guard for the right-to-left stories below.
		await expect(document.documentElement.dir).toBe("ltr");
	},
};

export const AllTogglesOff: Story = {
	parameters: {
		a11y: knownA11y("settings-settingsdrawer--all-toggles-off"),
		mockApi: { settings: ALL_OFF },
	},
	play: async ({ canvasElement }) => {
		await expectSwitches({
			canvasElement,
			labels: SWITCHES.map(({ label }) => label),
			checked: false,
		});
	},
};

// SettingsDrawer.tsx reads window.api.platform.isMac once and hides the macOS attributes
// switch without it.
export const NonMacPlatform: Story = {
	parameters: {
		a11y: knownA11y("settings-settingsdrawer--non-mac-platform"),
		mockApi: {
			overrides: { platform: { isMac: false } },
			settings: ALL_ON,
		},
	},
	play: async ({ canvasElement }) => {
		await expectSwitches({
			canvasElement,
			labels: SWITCHES.slice(0, 5).map(({ label }) => label),
			checked: true,
		});
		await expect(
			canvasElement.querySelector("#toggle-remove-xattrs"),
		).toBeNull();
	},
};

async function expectThemeMode(
	canvasElement: HTMLElement,
	selected: "Light" | "Auto" | "Dark",
): Promise<void> {
	const dialog = await openDialog(canvasElement);
	const radios = within(dialog).getAllByRole("radio");
	await expect(radios.map((radio) => radio.textContent)).toEqual([
		"Light",
		"Auto",
		"Dark",
	]);
	for (const radio of radios) {
		await expect(radio).toHaveAttribute(
			"aria-checked",
			String(radio.textContent === selected),
		);
	}
}

export const ThemeModeLightSelected: Story = {
	parameters: {
		a11y: knownA11y("settings-settingsdrawer--theme-mode-light-selected"),
		mockApi: { settings: { themeMode: "light" } },
	},
	play: async ({ canvasElement }) => {
		await expectThemeMode(canvasElement, "Light");
	},
};

export const ThemeModeSystemSelected: Story = {
	parameters: {
		a11y: knownA11y("settings-settingsdrawer--theme-mode-system-selected"),
		mockApi: { settings: { themeMode: "system" } },
	},
	play: async ({ canvasElement }) => {
		await expectThemeMode(canvasElement, "Auto");
	},
};

export const ThemeModeDarkSelected: Story = {
	parameters: {
		a11y: knownA11y("settings-settingsdrawer--theme-mode-dark-selected"),
		mockApi: { settings: { themeMode: "dark" } },
	},
	play: async ({ canvasElement }) => {
		await expectThemeMode(canvasElement, "Dark");
	},
};

// The list is System plus one option per language, counted from the domain list, never a
// literal (WR-04).
export const LanguageListOpen: Story = {
	parameters: {
		a11y: knownA11y("settings-settingsdrawer--language-list-open"),
	},
	play: async ({ canvasElement }) => {
		const dialog = await openDialog(canvasElement);
		await userEvent.click(
			within(dialog).getByRole("button", { name: "System" }),
		);
		const list = await within(dialog).findByRole("listbox");
		await expect(within(list).getAllByRole("option")).toHaveLength(
			LANGUAGE_NAMES.length + 1,
		);
	},
};

async function expectLocale({
	canvasElement,
	dictionary,
	code,
	dir,
}: {
	canvasElement: HTMLElement;
	dictionary: { "menu.app.settings": string };
	code: string;
	dir: "ltr" | "rtl";
}): Promise<void> {
	await waitFor(() => expect(document.documentElement.dir).toBe(dir));
	await expect(document.documentElement.lang).toBe(code);
	await expect(await openDialog(canvasElement)).toHaveAccessibleName(
		dictionary["menu.app.settings"],
	);
}

export const ArabicDrawer: Story = {
	parameters: { a11y: knownA11y("settings-settingsdrawer--arabic-drawer") },
	globals: { locale: "ar" },
	play: async ({ canvasElement }) => {
		await expectLocale({
			canvasElement,
			dictionary: ar,
			code: "ar",
			dir: "rtl",
		});
	},
};

export const GermanDrawer: Story = {
	parameters: { a11y: knownA11y("settings-settingsdrawer--german-drawer") },
	globals: { locale: "de" },
	play: async ({ canvasElement }) => {
		await expectLocale({
			canvasElement,
			dictionary: de,
			code: "de",
			dir: "ltr",
		});
	},
};

export const HungarianDrawer: Story = {
	parameters: { a11y: knownA11y("settings-settingsdrawer--hungarian-drawer") },
	globals: { locale: "hu" },
	play: async ({ canvasElement }) => {
		await expectLocale({
			canvasElement,
			dictionary: hu,
			code: "hu",
			dir: "ltr",
		});
	},
};

export const PersianDrawer: Story = {
	parameters: { a11y: knownA11y("settings-settingsdrawer--persian-drawer") },
	globals: { locale: "fa" },
	play: async ({ canvasElement }) => {
		await expectLocale({
			canvasElement,
			dictionary: fa,
			code: "fa",
			dir: "rtl",
		});
	},
};

// D-10: `.settings-drawer__close:focus-visible` (settings_drawer.css). The drawer's focus
// trap puts the focus on its first control, the close button, when it opens; Tab and then
// Shift+Tab bring the focus back to it by keyboard, so :focus-visible is the keyboard's.
export const CloseButtonKeyboardFocus: Story = {
	parameters: {
		a11y: knownA11y("settings-settingsdrawer--close-button-keyboard-focus"),
	},
	play: async ({ canvasElement }) => {
		const dialog = await openDialog(canvasElement);
		const close = within(dialog).getByRole("button", {
			name: "Close settings",
		});
		await waitFor(() => expect(close).toHaveFocus());
		await userEvent.tab();
		await expect(close).not.toHaveFocus();
		await userEvent.tab({ shift: true });
		await expect(close).toHaveFocus();
		await expect(close.matches(":focus-visible")).toBe(true);
		await expect(getComputedStyle(close).outlineStyle).toBe("solid");
	},
};

// settings_drawer.css: `.settings-drawer__close:hover` changes the colour, and a synthetic
// hover never matches :hover, so withRealHover moves a real pointer onto the button.
// Last in the file on purpose.
export const CloseButtonHover: Story = {
	parameters: {
		a11y: knownA11y("settings-settingsdrawer--close-button-hover"),
	},
	play: async ({ canvasElement }) => {
		const dialog = await openDialog(canvasElement);
		const close = within(dialog).getByRole("button", {
			name: "Close settings",
		});
		const before = getComputedStyle(close).color;
		await withRealHover(close, userEvent, async () => {
			await waitFor(() =>
				expect(getComputedStyle(close).color).not.toBe(before),
			);
		});
	},
};
