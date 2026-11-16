import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import ar from "../../../../.resources/locales/ar.json";
import en from "../../../../.resources/locales/en.json";
import ru from "../../../../.resources/locales/ru.json";
import { knownA11y } from "../../story_support/known_a11y";
import { SegmentedControl } from "./SegmentedControl";

// The three 14px icons are private to SettingsDrawer.tsx and are not exported from
// product code, so they are copied here unexported (PATTERNS H1). The options are
// always light, system, dark in that order, as SettingsDrawer passes them.
function SunIcon(): React.JSX.Element {
	return (
		<svg
			width="14"
			height="14"
			viewBox="0 0 16 16"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.5"
			strokeLinecap="round"
			strokeLinejoin="round"
		>
			<circle cx="8" cy="8" r="3" />
			<line x1="8" y1="1" x2="8" y2="3" />
			<line x1="8" y1="13" x2="8" y2="15" />
			<line x1="1" y1="8" x2="3" y2="8" />
			<line x1="13" y1="8" x2="15" y2="8" />
			<line x1="3.05" y1="3.05" x2="4.46" y2="4.46" />
			<line x1="11.54" y1="11.54" x2="12.95" y2="12.95" />
			<line x1="3.05" y1="12.95" x2="4.46" y2="11.54" />
			<line x1="11.54" y1="4.46" x2="12.95" y2="3.05" />
		</svg>
	);
}

function AutoIcon(): React.JSX.Element {
	return (
		<svg
			width="14"
			height="14"
			viewBox="0 0 16 16"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.5"
			strokeLinecap="round"
			strokeLinejoin="round"
		>
			<rect x="2" y="3" width="12" height="10" rx="1" />
			<line x1="5" y1="14" x2="11" y2="14" />
		</svg>
	);
}

function MoonIcon(): React.JSX.Element {
	return (
		<svg
			width="14"
			height="14"
			viewBox="0 0 16 16"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.5"
			strokeLinecap="round"
			strokeLinejoin="round"
		>
			<path d="M14 9.35A6 6 0 1 1 6.65 2 4.5 4.5 0 0 0 14 9.35Z" />
		</svg>
	);
}

type ThemeMode = "light" | "system" | "dark";

function optionsFor(labels: {
	themeLight: string;
	themeAuto: string;
	themeDark: string;
}): Array<{ value: ThemeMode; label: string; icon: React.JSX.Element }> {
	return [
		{ value: "light", label: labels.themeLight, icon: <SunIcon /> },
		{ value: "system", label: labels.themeAuto, icon: <AutoIcon /> },
		{ value: "dark", label: labels.themeDark, icon: <MoonIcon /> },
	];
}

const meta = {
	title: "Settings/SegmentedControl",
	component: SegmentedControl,
	args: {
		options: optionsFor(en),
		value: "system",
		onChange: fn(),
		label: en.appearance,
	},
} satisfies Meta<typeof SegmentedControl>;

// Framework-mandated default export (CSF: Storybook reads the story file's default export).
export default meta;

type Story = StoryObj<typeof meta>;

// The active segment is the only one in the tab order (tabIndex 0); the others are
// reached by arrow keys, as a radio group is.
async function expectActive(
	canvasElement: HTMLElement,
	active: ThemeMode,
): Promise<void> {
	const radios = await within(canvasElement).findAllByRole("radio");
	await expect(radios).toHaveLength(3);
	const order: ThemeMode[] = ["light", "system", "dark"];
	for (const [index, radio] of radios.entries()) {
		const isActive = order[index] === active;
		await expect(radio).toHaveAttribute("aria-checked", String(isActive));
		await expect(radio).toHaveAttribute("tabindex", isActive ? "0" : "-1");
	}
}

// RTL-01 / D-32: the indicator must sit on the active segment, measured as its left edge
// and width against the active radio, within 1 px. Under a right-to-left layout index 1
// is correct by coincidence (the indicator sits in the middle either way), so a scene
// that holds a right-to-left claim must measure index 0 and index 2 too. The same
// relation is held for the Persian locale by .storybook/segmented_rtl_gate.test.tsx.
function indicatorViolation(group: HTMLElement, scene: string): string | null {
	const radios = within(group).getAllByRole("radio");
	const index = radios.findIndex(
		(radio) => radio.getAttribute("aria-checked") === "true",
	);
	const active = radios[index];
	const indicator = group.querySelector(".segmented-control__indicator");
	if (active === undefined || indicator === null) {
		throw new Error(`${scene}: no active segment or no indicator`);
	}
	const segment = active.getBoundingClientRect();
	const box = indicator.getBoundingClientRect();
	const leftDelta = box.left - segment.left;
	const widthDelta = box.width - segment.width;
	if (Math.abs(leftDelta) <= 1 && Math.abs(widthDelta) <= 1) return null;
	return `${scene}: index ${index}, indicator minus active segment: left ${leftDelta.toFixed(2)} px, width ${widthDelta.toFixed(2)} px`;
}

// Every violation in one assertion, so a red run names all three indexes at once.
async function expectIndicatorsOnActive(
	groups: Array<{ group: HTMLElement; scene: string }>,
): Promise<void> {
	const violations = groups.flatMap(({ group, scene }) => {
		const violation = indicatorViolation(group, scene);
		return violation === null ? [] : [violation];
	});
	await expect(violations).toEqual([]);
}

function radiogroup(canvasElement: HTMLElement): HTMLElement {
	const group = canvasElement.querySelector<HTMLElement>('[role="radiogroup"]');
	if (group === null) throw new Error("no segmented control in the canvas");
	return group;
}

export const LightActive: Story = {
	parameters: { a11y: knownA11y("settings-segmentedcontrol--light-active") },
	args: { value: "light" },
	play: async ({ canvasElement }) => {
		await expectActive(canvasElement, "light");
		// Vacuity guard for the right-to-left story below.
		await expect(document.documentElement.dir).toBe("ltr");
		// The left-to-right control for the Arabic story: index 0.
		await expectIndicatorsOnActive([
			{ group: radiogroup(canvasElement), scene: "ltr light" },
		]);
	},
};

export const SystemActive: Story = {
	parameters: { a11y: knownA11y("settings-segmentedcontrol--system-active") },
	args: { value: "system" },
	play: async ({ canvasElement }) => {
		await expectActive(canvasElement, "system");
	},
};

export const DarkActive: Story = {
	parameters: { a11y: knownA11y("settings-segmentedcontrol--dark-active") },
	args: { value: "dark" },
	play: async ({ canvasElement }) => {
		await expectActive(canvasElement, "dark");
		// The left-to-right control for the Arabic story: index 2.
		await expectIndicatorsOnActive([
			{ group: radiogroup(canvasElement), scene: "ltr dark" },
		]);
	},
};

// D-10: `.segmented-control__segment:focus-visible` (segmented_control.css:36). Tab
// reaches the active segment as a keyboard user does and it must carry a solid
// outline, so a deleted focus rule turns this story red.
export const KeyboardFocus: Story = {
	parameters: { a11y: knownA11y("settings-segmentedcontrol--keyboard-focus") },
	args: { value: "system" },
	play: async ({ canvasElement }) => {
		const active = await within(canvasElement).findByRole("radio", {
			name: en.themeAuto,
		});
		await userEvent.tab();
		await expect(active).toHaveFocus();
		await expect(active.matches(":focus-visible")).toBe(true);
		await expect(getComputedStyle(active).outlineStyle).toBe("solid");
	},
};

// Arrow-key wrap: ArrowRight on the last segment (dark) asks for the first (light).
// This proves the wrap, not the focus ring (KeyboardFocus does).
export const KeyboardWrap: Story = {
	parameters: { a11y: knownA11y("settings-segmentedcontrol--keyboard-wrap") },
	args: { value: "dark" },
	play: async ({ canvasElement, args }) => {
		const active = await within(canvasElement).findByRole("radio", {
			name: en.themeDark,
		});
		await userEvent.tab();
		await expect(active).toHaveFocus();
		await userEvent.keyboard("{ArrowRight}");
		await expect(args.onChange).toHaveBeenCalledWith("light");
	},
};

// The longest of the es, hu, ru and hr labels for these three keys is Russian
// ("Автоматически").
export const LongLabels: Story = {
	parameters: { a11y: knownA11y("settings-segmentedcontrol--long-labels") },
	globals: { locale: "ru" },
	args: { options: optionsFor(ru), label: ru.appearance },
	play: async ({ canvasElement }) => {
		await waitFor(() => expect(document.documentElement.lang).toBe("ru"));
		await within(canvasElement).findByRole("radio", { name: ru.themeAuto });
		await expectActive(canvasElement, "system");
	},
};

// RTL-01 / D-32: three controls with the active value at index 0, 1 and 2 (light, system,
// dark), because the indicator is correct by coincidence at index 1 under a
// right-to-left layout. The play waits for dir=rtl first so the measurement cannot run
// against a left-to-right document, then holds the indicator on the active segment.
export const Arabic: Story = {
	parameters: { a11y: knownA11y("settings-segmentedcontrol--arabic") },
	globals: { locale: "ar" },
	args: { options: optionsFor(ar), label: ar.appearance },
	render: (args) => (
		<div style={{ display: "grid", gap: "8px", width: "300px" }}>
			<SegmentedControl {...args} value="light" />
			<SegmentedControl {...args} value="system" />
			<SegmentedControl {...args} value="dark" />
		</div>
	),
	play: async ({ canvasElement }) => {
		await waitFor(() => expect(document.documentElement.dir).toBe("rtl"));
		await expect(document.documentElement.lang).toBe("ar");
		await within(canvasElement).findAllByRole("radio", { name: ar.themeAuto });
		const groups = Array.from(
			canvasElement.querySelectorAll<HTMLElement>('[role="radiogroup"]'),
		);
		await expect(groups).toHaveLength(3);
		const order: ThemeMode[] = ["light", "system", "dark"];
		for (const [index, group] of groups.entries()) {
			const active = order[index];
			if (active === undefined) throw new Error("no active value");
			await expectActive(group, active);
		}
		await expectIndicatorsOnActive(
			groups.map((group, index) => ({
				group,
				scene: `rtl ar ${order[index] ?? "?"}`,
			})),
		);
	},
};
