import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import ar from "../../../../.resources/locales/ar.json";
import en from "../../../../.resources/locales/en.json";
import es from "../../../../.resources/locales/es.json";
import { knownA11y } from "../../story_support/known_a11y";
import { ToggleSwitch } from "./ToggleSwitch";

// Reasoned omissions (D-16): there is no `disabled` story because no call site in
// src/renderer passes a disabled input; there is no `:active` rule in
// toggle_switch.css to prove; there is no loading story because the switch is a
// controlled checkbox that renders before its value is read; the slide animation is
// suppressed under reduced motion (D-12), so motion is not asserted; touch hover is
// not a desktop state. The labels and descriptions are the real locale strings, never
// retyped, so a changed translation reaches the story.
const meta = {
	title: "Settings/ToggleSwitch",
	component: ToggleSwitch,
	args: {
		id: "toggle-save-as-copy",
		checked: true,
		onChange: fn(),
		label: en["settings.saveAsCopy.label"],
		description: en["settings.saveAsCopy.description"],
	},
} satisfies Meta<typeof ToggleSwitch>;

// Framework-mandated default export (CSF: Storybook reads the story file's default export).
export default meta;

type Story = StoryObj<typeof meta>;

export const On: Story = {
	parameters: { a11y: knownA11y("settings-toggleswitch--on") },
	play: async ({ canvasElement }) => {
		const toggle = await within(canvasElement).findByRole("switch", {
			name: en["settings.saveAsCopy.label"],
		});
		await expect(toggle).toBeChecked();
		await expect(
			within(canvasElement).getByText(en["settings.saveAsCopy.description"]),
		).toBeInTheDocument();
		// Vacuity guard for the right-to-left story below.
		await expect(document.documentElement.dir).toBe("ltr");
	},
};

export const Off: Story = {
	parameters: { a11y: knownA11y("settings-toggleswitch--off") },
	args: {
		id: "toggle-remove-xattrs",
		checked: false,
		label: en["settings.removeXattrs.label"],
		description: en["settings.removeXattrs.description"],
	},
	play: async ({ canvasElement }) => {
		const toggle = await within(canvasElement).findByRole("switch", {
			name: en["settings.removeXattrs.label"],
		});
		await expect(toggle).not.toBeChecked();
	},
};

// D-10: the focus ring is the `.toggle-switch__input:focus-visible + track` rule in
// toggle_switch.css. Tab reaches the input as a keyboard user does, and the track
// must then carry a real outline, so a deleted rule turns this story red.
export const KeyboardFocus: Story = {
	parameters: { a11y: knownA11y("settings-toggleswitch--keyboard-focus") },
	play: async ({ canvasElement }) => {
		const toggle = await within(canvasElement).findByRole("switch");
		await userEvent.tab();
		await expect(toggle).toHaveFocus();
		await expect(toggle.matches(":focus-visible")).toBe(true);
		const track = canvasElement.querySelector(".toggle-switch__track");
		await expect(track).not.toBeNull();
		if (track === null) return;
		const style = getComputedStyle(track);
		await expect(style.outlineStyle).not.toBe("none");
		await expect(style.outlineWidth).toBe("2px");
	},
};

// The longest label and description among the es, hu, ru and hr translations of the
// six toggles (measured by length: Spanish "preserve modification date").
export const LongLabels: Story = {
	parameters: { a11y: knownA11y("settings-toggleswitch--long-labels") },
	globals: { locale: "es" },
	args: {
		id: "toggle-preserve-timestamps",
		label: es["settings.preserveTimestamps.label"],
		description: es["settings.preserveTimestamps.description"],
	},
	play: async ({ canvasElement }) => {
		await waitFor(() => expect(document.documentElement.lang).toBe("es"));
		const toggle = await within(canvasElement).findByRole("switch", {
			name: es["settings.preserveTimestamps.label"],
		});
		await expect(toggle).toBeInTheDocument();
		await expect(
			within(canvasElement).getByText(
				es["settings.preserveTimestamps.description"],
			),
		).toBeInTheDocument();
	},
};

export const Arabic: Story = {
	globals: { locale: "ar" },
	args: {
		label: ar["settings.saveAsCopy.label"],
		description: ar["settings.saveAsCopy.description"],
	},
	play: async ({ canvasElement }) => {
		await waitFor(() => expect(document.documentElement.dir).toBe("rtl"));
		await expect(document.documentElement.lang).toBe("ar");
		await within(canvasElement).findByRole("switch", {
			name: ar["settings.saveAsCopy.label"],
		});
	},
};
