import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import "../../styles/settings_drawer.css";
import ar from "../../../../.resources/locales/ar.json";
import { knownA11y } from "../../story_support/known_a11y";
import { GearIcon } from "../icons/GearIcon";
import { StatusBar } from "./StatusBar";

// StatusBar takes numbers, not the file list: App.tsx sums them (completedCount counts
// only the files whose outcome is "cleaned"), and every story passes literal numbers
// so nothing here re-implements those sums. The gear slot holds a real GearIcon, as
// App.tsx passes, and the gear's own rules live in the settings drawer stylesheet, so
// this file imports it (D-13).
//
// Unreachable combinations, recorded as waivers and never drawn: stats without
// `onCleanMore` (App always passes it when there are files) and `totalCount` 0 with
// stats (the bar hides them for a total of zero). An all-error batch renders exactly
// like NothingRemoved, so it is a duplicate waiver. There is no hover story: the only
// `:hover` rule of the bar underlines the Clear button and changes neither colour nor
// background, which D-10's rule does not count.
// The counts "1 tags removed" has no singular form (a recorded Phase 73 finding), so
// SingleFile never asserts the wording of the tags segment.
const meta = {
	title: "UI/StatusBar",
	component: StatusBar,
	args: { gearIcon: <GearIcon isOpen={false} onClick={fn()} /> },
} satisfies Meta<typeof StatusBar>;

// Framework-mandated default export (CSF: Storybook reads the story file's default export).
export default meta;

type Story = StoryObj<typeof meta>;

function stat(canvasElement: HTMLElement, name: string): HTMLElement {
	const element = canvasElement.querySelector(`[data-stat="${name}"]`);
	if (!(element instanceof HTMLElement)) throw new Error(`no ${name} stat`);
	return element;
}

export const Idle: Story = {
	parameters: { a11y: knownA11y("ui-statusbar--idle") },
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(
			await canvas.findByRole("button", { name: "Open settings" }),
		).toBeInTheDocument();
		await expect(
			canvasElement.querySelector(".status-bar__summary"),
		).toBeNull();
		await expect(canvas.queryByRole("button", { name: "Clear" })).toBeNull();
		// Vacuity guard for the right-to-left story below.
		await expect(document.documentElement.dir).toBe("ltr");
	},
};

export const Running: Story = {
	parameters: { a11y: knownA11y("ui-statusbar--running") },
	args: {
		completedCount: 0,
		totalCount: 3,
		totalTagsRemoved: 0,
		elapsedSeconds: 0,
		onCleanMore: fn(),
	},
	play: async ({ canvasElement }) => {
		await expect(await within(canvasElement).findByText("0 of 3 cleaned")).toBe(
			stat(canvasElement, "cleaned"),
		);
		await expect(stat(canvasElement, "elapsed")).toHaveTextContent("0s");
	},
};

export const MidBatch: Story = {
	parameters: { a11y: knownA11y("ui-statusbar--mid-batch") },
	args: {
		completedCount: 1,
		totalCount: 3,
		totalTagsRemoved: 14,
		elapsedSeconds: 2,
		onCleanMore: fn(),
	},
	play: async ({ canvasElement }) => {
		await expect(await within(canvasElement).findByText("1 of 3 cleaned")).toBe(
			stat(canvasElement, "cleaned"),
		);
		await expect(stat(canvasElement, "tags-removed")).toHaveTextContent(
			"14 tags removed",
		);
		await expect(stat(canvasElement, "elapsed")).toHaveTextContent("2s");
	},
};

export const AllCleaned: Story = {
	parameters: { a11y: knownA11y("ui-statusbar--all-cleaned") },
	args: {
		completedCount: 3,
		totalCount: 3,
		totalTagsRemoved: 47,
		elapsedSeconds: 4,
		onCleanMore: fn(),
	},
	play: async ({ canvasElement }) => {
		await expect(await within(canvasElement).findByText("3 of 3 cleaned")).toBe(
			stat(canvasElement, "cleaned"),
		);
		await expect(stat(canvasElement, "tags-removed")).toHaveTextContent(
			"47 tags removed",
		);
		await expect(stat(canvasElement, "tags-removed")).toHaveAttribute(
			"data-value",
			"47",
		);
		await expect(stat(canvasElement, "elapsed")).toHaveTextContent("4s");
		await expect(
			within(canvasElement).getByRole("button", { name: "Clear" }),
		).toBeInTheDocument();
	},
};

export const SingleFile: Story = {
	parameters: { a11y: knownA11y("ui-statusbar--single-file") },
	args: {
		completedCount: 1,
		totalCount: 1,
		totalTagsRemoved: 1,
		elapsedSeconds: 1,
		onCleanMore: fn(),
	},
	play: async ({ canvasElement }) => {
		await expect(await within(canvasElement).findByText("1 of 1 cleaned")).toBe(
			stat(canvasElement, "cleaned"),
		);
		// The tags wording has no singular form, so only the machine value is asserted.
		await expect(stat(canvasElement, "tags-removed")).toHaveAttribute(
			"data-value",
			"1",
		);
	},
};

// The distrust case of issues #207 and #361: a count of 0 is shown as 0, beside the
// total, with a tags count of 0 and a way to start over, so someone can tell "nothing
// was removed" from "nothing was shown".
export const NothingRemoved: Story = {
	parameters: { a11y: knownA11y("ui-statusbar--nothing-removed") },
	args: {
		completedCount: 0,
		totalCount: 12,
		totalTagsRemoved: 0,
		elapsedSeconds: 3,
		onCleanMore: fn(),
	},
	play: async ({ canvasElement }) => {
		await expect(
			await within(canvasElement).findByText("0 of 12 cleaned"),
		).toBe(stat(canvasElement, "cleaned"));
		await expect(stat(canvasElement, "tags-removed")).toHaveAttribute(
			"data-value",
			"0",
		);
		await expect(stat(canvasElement, "tags-removed")).toHaveTextContent(
			"0 tags removed",
		);
		await expect(
			within(canvasElement).getByRole("button", { name: "Clear" }),
		).toBeInTheDocument();
	},
};

export const Arabic: Story = {
	parameters: { a11y: knownA11y("ui-statusbar--arabic") },
	globals: { locale: "ar" },
	args: {
		completedCount: 3,
		totalCount: 3,
		totalTagsRemoved: 47,
		elapsedSeconds: 4,
		onCleanMore: fn(),
	},
	play: async ({ canvasElement }) => {
		await waitFor(() => expect(document.documentElement.dir).toBe("rtl"));
		await expect(document.documentElement.lang).toBe("ar");
		await expect(
			await within(canvasElement).findByText(
				ar["statusBar.xOfYCleaned"]
					.replace("{completed}", "3")
					.replace("{total}", "3"),
			),
		).toBe(stat(canvasElement, "cleaned"));
		await expect(
			within(canvasElement).getByRole("button", {
				name: ar["statusBar.clear"],
			}),
		).toBeInTheDocument();
	},
};

// D-10: `.status-bar__button:focus-visible` (status_bar.css). The gear button in the
// left slot precedes the Clear button in tab order (StatusBar.tsx, the left slot
// before the summary and button), so the play tabs twice and asserts each stop; a
// reorder fails by name instead of on the outline.
export const KeyboardFocus: Story = {
	parameters: { a11y: knownA11y("ui-statusbar--keyboard-focus") },
	args: {
		completedCount: 3,
		totalCount: 3,
		totalTagsRemoved: 47,
		elapsedSeconds: 4,
		onCleanMore: fn(),
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		const gear = await canvas.findByRole("button", { name: "Open settings" });
		const clear = await canvas.findByRole("button", { name: "Clear" });
		await userEvent.tab();
		await expect(gear).toHaveFocus();
		await userEvent.tab();
		await expect(clear).toHaveFocus();
		await expect(clear.matches(":focus-visible")).toBe(true);
		const style = getComputedStyle(clear);
		await expect(style.outlineStyle).not.toBe("none");
		await expect(style.outlineStyle).toBe("solid");
	},
};
