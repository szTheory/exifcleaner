import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import ar from "../../../../.resources/locales/ar.json";
import fa from "../../../../.resources/locales/fa.json";
import { LANGUAGE_NAMES } from "../../../domain";
import { LanguageDropdown } from "./LanguageDropdown";
import { knownA11y } from "../../story_support/known_a11y";
import { withRealHover } from "../../story_support/real_pointer";

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

// Phase 72 additions (D-17): the stories above are the Phase 70 stories and are not
// edited. The list is rendered inline (not in a portal) under `isOpen`, 280px high
// against System plus every entry of LANGUAGE_NAMES (the "25" in the component's own
// comment is stale), so it scrolls and carries `scrollable-region-focusable`, a
// measured component defect with a baseline entry per story that opens it (D-22).
// Item hover is conflated with keyboard focus: onMouseEnter sets the same `--focused`
// class the arrow keys set, a recorded Phase 73 finding, and the list has no
// aria-activedescendant, so the stories read the class.
// WR-04 (D-19): counts and names come from LANGUAGE_NAMES and the locale files, never
// from a literal, so adding a language or editing a translation cannot turn these
// stories red on its own. The list is System plus one option per language.
const OPTION_COUNT = LANGUAGE_NAMES.length + 1;

function languageAt(index: number): (typeof LANGUAGE_NAMES)[number] {
	const entry = LANGUAGE_NAMES[index];
	if (entry === undefined) throw new Error(`no language at index ${index}`);
	return entry;
}

function languageByCode(code: string): (typeof LANGUAGE_NAMES)[number] {
	const entry = LANGUAGE_NAMES.find((candidate) => candidate.code === code);
	if (entry === undefined) throw new Error(`no language ${code}`);
	return entry;
}

async function openList(canvasElement: HTMLElement): Promise<HTMLElement> {
	const canvas = within(canvasElement);
	await userEvent.click(await canvas.findByRole("button"));
	return canvas.findByRole("listbox");
}

export const Open: Story = {
	parameters: { a11y: knownA11y("settings-languagedropdown--open") },
	play: async ({ canvasElement }) => {
		const list = await openList(canvasElement);
		await expect(list).toBeVisible();
		await expect(within(list).getAllByRole("option")).toHaveLength(
			OPTION_COUNT,
		);
		await expect(within(canvasElement).getByRole("button")).toHaveAttribute(
			"aria-expanded",
			"true",
		);
	},
};

export const OpenSelected: Story = {
	parameters: { a11y: knownA11y("settings-languagedropdown--open-selected") },
	args: { currentLanguage: "de" },
	play: async ({ canvasElement }) => {
		const de = languageByCode("de");
		await expect(within(canvasElement).getByRole("button")).toHaveTextContent(
			`${de.nativeName} (${de.englishName})`,
		);
		const list = await openList(canvasElement);
		const selected = within(list)
			.getAllByRole("option")
			.filter((option) => option.getAttribute("aria-selected") === "true");
		await expect(selected).toHaveLength(1);
		await expect(selected[0]).toHaveTextContent(de.nativeName);
		await expect(selected[0]).toHaveClass("language-dropdown__item--selected");
		await expect(selected[0]?.querySelector("svg")).not.toBeNull();
	},
};

// The last option is the last language (index LANGUAGE_NAMES.length). End moves the focus there and the focused
// item is scrolled into view, so the list has scrolled.
export const KeyboardEnd: Story = {
	parameters: { a11y: knownA11y("settings-languagedropdown--keyboard-end") },
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await userEvent.tab();
		await expect(await canvas.findByRole("button")).toHaveFocus();
		await userEvent.keyboard("{ArrowDown}");
		const list = await canvas.findByRole("listbox");
		await expect(list.scrollTop).toBe(0);
		await userEvent.keyboard("{End}");
		const options = within(list).getAllByRole("option");
		await expect(options).toHaveLength(OPTION_COUNT);
		const last = languageAt(LANGUAGE_NAMES.length - 1);
		await waitFor(() =>
			expect(options[LANGUAGE_NAMES.length]).toHaveClass(
				"language-dropdown__item--focused",
			),
		);
		await expect(options[LANGUAGE_NAMES.length]).toHaveTextContent(
			last.nativeName,
		);
		await waitFor(() => expect(list.scrollTop).toBeGreaterThan(0));
	},
};

// ArrowDown opens the list on System, two more ArrowDown presses reach the second
// language, and Enter picks it.
export const KeyboardPick: Story = {
	parameters: { a11y: knownA11y("settings-languagedropdown--keyboard-pick") },
	play: async ({ canvasElement, args }) => {
		const canvas = within(canvasElement);
		await userEvent.tab();
		await expect(await canvas.findByRole("button")).toHaveFocus();
		await userEvent.keyboard("{ArrowDown}");
		await canvas.findByRole("listbox");
		await userEvent.keyboard("{ArrowDown}{ArrowDown}");
		await userEvent.keyboard("{Enter}");
		await expect(args.onLanguageChange).toHaveBeenCalledTimes(1);
		await expect(args.onLanguageChange).toHaveBeenCalledWith(
			languageAt(1).code,
		);
		await waitFor(() => expect(canvas.queryByRole("listbox")).toBeNull());
	},
};

// A saved code the list does not know (an old or hand-edited setting) shows as the
// raw code on the trigger instead of a name.
export const UnknownCode: Story = {
	parameters: { a11y: knownA11y("settings-languagedropdown--unknown-code") },
	args: { currentLanguage: "xx-unknown" },
	play: async ({ canvasElement }) => {
		await expect(
			await within(canvasElement).findByRole("button"),
		).toHaveTextContent("xx-unknown");
	},
};

export const OpenArabic: Story = {
	parameters: { a11y: knownA11y("settings-languagedropdown--open-arabic") },
	globals: { locale: "ar" },
	play: async ({ canvasElement }) => {
		await waitFor(() => expect(document.documentElement.dir).toBe("rtl"));
		const list = await openList(canvasElement);
		await expect(list).toBeVisible();
		await expect(list).toHaveAccessibleName(ar["language"]);
		await expect(within(list).getAllByRole("option")).toHaveLength(
			OPTION_COUNT,
		);
	},
};

// D-10: `.language-dropdown__trigger:focus-visible` (language_dropdown.css:29), with
// the list closed so the scan sees the focused trigger alone.
export const KeyboardFocus: Story = {
	parameters: { a11y: knownA11y("settings-languagedropdown--keyboard-focus") },
	play: async ({ canvasElement }) => {
		const trigger = await within(canvasElement).findByRole("button");
		await userEvent.tab();
		await expect(trigger).toHaveFocus();
		await expect(trigger.matches(":focus-visible")).toBe(true);
		await expect(getComputedStyle(trigger).outlineStyle).toBe("solid");
		await expect(trigger).toHaveAttribute("aria-expanded", "false");
	},
};

// RESEARCH C2: `.language-dropdown__trigger:hover` changes the border colour, and a
// synthetic hover never matches :hover, so withRealHover moves a real pointer onto
// the trigger and throws if :hover did not appear.
export const TriggerHover: Story = {
	parameters: { a11y: knownA11y("settings-languagedropdown--trigger-hover") },
	play: async ({ canvasElement }) => {
		const trigger = await within(canvasElement).findByRole("button");
		const before = getComputedStyle(trigger).borderColor;
		await withRealHover(trigger, userEvent, async () => {
			await waitFor(() =>
				expect(getComputedStyle(trigger).borderColor).not.toBe(before),
			);
		});
	},
};

// Item hover sets the `--focused` class through onMouseEnter, which a synthetic hover
// does dispatch, so no real pointer is needed (RESEARCH). Last in the file on purpose.
export const ItemHover: Story = {
	parameters: { a11y: knownA11y("settings-languagedropdown--item-hover") },
	play: async ({ canvasElement }) => {
		const list = await openList(canvasElement);
		const options = within(list).getAllByRole("option");
		const target = options[5];
		if (target === undefined) throw new Error("the list has no sixth option");
		await expect(target).not.toHaveClass("language-dropdown__item--focused");
		await userEvent.hover(target);
		await waitFor(() =>
			expect(target).toHaveClass("language-dropdown__item--focused"),
		);
		// The System option held the focused class on open; the hover moved it.
		await expect(options[0]).not.toHaveClass(
			"language-dropdown__item--focused",
		);
	},
};
