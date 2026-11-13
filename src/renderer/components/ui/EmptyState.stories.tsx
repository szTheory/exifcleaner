import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { knownA11y } from "../../story_support/known_a11y";
import { withRealHover } from "../../story_support/real_pointer";
import { EmptyState } from "./EmptyState";

// EmptyState takes four props and no store: saveAsCopy null means the setting has not
// loaded, so the output-mode line is hidden (aria-hidden, a non-breaking space) and
// true or false name what will happen to files; dragActive swaps which of the two
// instruction paragraphs is exposed (both always render, EmptyState.tsx). Six stories
// cover saveAsCopy null, true and false, each with dragActive false and true.
//
// `.empty-state__button:active` (empty_state.css:100, a scale of 0.96) is omitted: the
// 72 D-12 motion rule has reduced motion cancel it, so a story would prove nothing. This
// corrects 72 D-10, which recorded that the stylesheet has no :active rule.
//
// Unreachable cells are waivers, never drawn: the screen has no count, no limit, no error
// and no policy state of its own (failures show in the table and toasts). The Malayalam
// frame is taller than the 312 px minimum of the frame, a recorded finding that the play
// does not assert, so a later fix does not turn the story red.
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
	title: "UI/EmptyState",
	component: EmptyState,
	args: {
		dragActive: false,
		saveAsCopy: null,
		onChooseFiles: fn(),
		onChooseFolder: fn(),
	},
	render: (args) => (
		<WindowFrame>
			<EmptyState {...args} />
		</WindowFrame>
	),
} satisfies Meta<typeof EmptyState>;

// Framework-mandated default export (CSF: Storybook reads the story file's default export).
export default meta;

type Story = StoryObj<typeof meta>;

const SUBTITLE = "Drop images, videos, or PDFs here, or choose an option.";
const DROP_ACTIVE = "Drop files to clean.";
const COPY_ON = "Cleaned copies will be created — originals stay untouched.";
const COPY_OFF = "Files will be cleaned in place.";

async function expectScreen({
	canvasElement,
	dragActive,
	outputLine,
}: {
	canvasElement: HTMLElement;
	dragActive: boolean;
	outputLine: string | null;
}): Promise<void> {
	const canvas = within(canvasElement);
	await expect(
		await canvas.findByRole("heading", { name: "Add files to clean" }),
	).toBeVisible();
	const idle = canvasElement.querySelector(
		".empty-state__instruction:nth-child(1)",
	);
	const active = canvasElement.querySelector(
		".empty-state__instruction:nth-child(2)",
	);
	await expect(idle?.textContent).toBe(SUBTITLE);
	await expect(active?.textContent).toBe(DROP_ACTIVE);
	await expect(idle).toHaveAttribute("aria-hidden", String(dragActive));
	await expect(active).toHaveAttribute("aria-hidden", String(!dragActive));
	const mode = canvasElement.querySelector(".empty-state__output-mode");
	if (outputLine === null) {
		// saveAsCopy null: the line is hidden from assistive tech and holds a
		// non-breaking space only.
		await expect(mode).toHaveAttribute("aria-hidden", "true");
		await expect(mode?.textContent).toBe(" ");
	} else {
		await expect(mode).toHaveAttribute("aria-hidden", "false");
		await expect(mode?.textContent).toBe(outputLine);
	}
	await expect(
		canvas.getByRole("button", { name: "Choose files…" }),
	).toBeInTheDocument();
	await expect(
		canvas.getByRole("button", { name: "Choose folder…" }),
	).toBeInTheDocument();
}

export const CopyModeUnknown: Story = {
	args: { saveAsCopy: null, dragActive: false },
	parameters: { a11y: knownA11y("ui-emptystate--copy-mode-unknown") },
	play: async ({ canvasElement }) => {
		await expectScreen({ canvasElement, dragActive: false, outputLine: null });
		// Vacuity guard for the right-to-left story below.
		await expect(document.documentElement.dir).toBe("ltr");
	},
};

export const CopyModeUnknownDragging: Story = {
	args: { saveAsCopy: null, dragActive: true },
	parameters: { a11y: knownA11y("ui-emptystate--copy-mode-unknown-dragging") },
	play: async ({ canvasElement }) => {
		await expectScreen({ canvasElement, dragActive: true, outputLine: null });
	},
};

export const CopyModeOn: Story = {
	args: { saveAsCopy: true, dragActive: false },
	parameters: { a11y: knownA11y("ui-emptystate--copy-mode-on") },
	play: async ({ canvasElement }) => {
		await expectScreen({
			canvasElement,
			dragActive: false,
			outputLine: COPY_ON,
		});
	},
};

export const CopyModeOnDragging: Story = {
	args: { saveAsCopy: true, dragActive: true },
	parameters: { a11y: knownA11y("ui-emptystate--copy-mode-on-dragging") },
	play: async ({ canvasElement }) => {
		await expectScreen({
			canvasElement,
			dragActive: true,
			outputLine: COPY_ON,
		});
	},
};

export const CopyModeOff: Story = {
	args: { saveAsCopy: false, dragActive: false },
	parameters: { a11y: knownA11y("ui-emptystate--copy-mode-off") },
	play: async ({ canvasElement }) => {
		await expectScreen({
			canvasElement,
			dragActive: false,
			outputLine: COPY_OFF,
		});
	},
};

export const CopyModeOffDragging: Story = {
	args: { saveAsCopy: false, dragActive: true },
	parameters: { a11y: knownA11y("ui-emptystate--copy-mode-off-dragging") },
	play: async ({ canvasElement }) => {
		await expectScreen({
			canvasElement,
			dragActive: true,
			outputLine: COPY_OFF,
		});
	},
};

// Locale stress (D-18): the plays assert lang, dir and that the title and both buttons
// are not empty, never a translated word, and never the frame's height.
async function expectLocale({
	canvasElement,
	lang,
	dir,
}: {
	canvasElement: HTMLElement;
	lang: string;
	dir: "ltr" | "rtl";
}): Promise<void> {
	await waitFor(() => expect(document.documentElement.dir).toBe(dir));
	await expect(document.documentElement.lang).toBe(lang);
	await expect(
		(await within(canvasElement).findByRole("heading")).textContent,
	).not.toBe("");
	const buttons = within(canvasElement).getAllByRole("button");
	await expect(buttons).toHaveLength(2);
	for (const button of buttons) {
		await expect(button.textContent).not.toBe("");
	}
}

export const GermanEmpty: Story = {
	globals: { locale: "de" },
	args: { saveAsCopy: true, dragActive: false },
	parameters: { a11y: knownA11y("ui-emptystate--german-empty") },
	play: async ({ canvasElement }) => {
		await expectLocale({ canvasElement, lang: "de", dir: "ltr" });
	},
};

export const MalayalamEmpty: Story = {
	globals: { locale: "ml" },
	args: { saveAsCopy: true, dragActive: false },
	parameters: { a11y: knownA11y("ui-emptystate--malayalam-empty") },
	play: async ({ canvasElement }) => {
		await expectLocale({ canvasElement, lang: "ml", dir: "ltr" });
	},
};

export const PersianEmpty: Story = {
	globals: { locale: "fa" },
	args: { saveAsCopy: true, dragActive: false },
	parameters: { a11y: knownA11y("ui-emptystate--persian-empty") },
	play: async ({ canvasElement }) => {
		await expectLocale({ canvasElement, lang: "fa", dir: "rtl" });
	},
};

// D-10: `.empty-state__button:focus-visible` (empty_state.css). The Choose files button
// is the first focusable element, so one Tab reaches it.
export const ButtonKeyboardFocus: Story = {
	args: { saveAsCopy: false, dragActive: false },
	parameters: { a11y: knownA11y("ui-emptystate--button-keyboard-focus") },
	play: async ({ canvasElement }) => {
		const button = await within(canvasElement).findByRole("button", {
			name: "Choose files…",
		});
		await userEvent.tab();
		await expect(button).toHaveFocus();
		await expect(button.matches(":focus-visible")).toBe(true);
		await expect(getComputedStyle(button).outlineStyle).toBe("solid");
	},
};

// D-11: `.empty-state__button--primary:hover` changes the background and
// `.empty-state__button--secondary:hover` the border colour (empty_state.css:85, 96). A
// synthetic hover never matches :hover, so withRealHover moves a real pointer onto the
// button. Both stories stay last in the file on purpose.
export const ButtonHover: Story = {
	args: { saveAsCopy: false, dragActive: false },
	parameters: { a11y: knownA11y("ui-emptystate--button-hover") },
	play: async ({ canvasElement }) => {
		const button = await within(canvasElement).findByRole("button", {
			name: "Choose files…",
		});
		const before = getComputedStyle(button).backgroundColor;
		await withRealHover(button, userEvent, async () => {
			await waitFor(() =>
				expect(getComputedStyle(button).backgroundColor).not.toBe(before),
			);
		});
	},
};

export const SecondaryButtonHover: Story = {
	args: { saveAsCopy: false, dragActive: false },
	parameters: { a11y: knownA11y("ui-emptystate--secondary-button-hover") },
	play: async ({ canvasElement }) => {
		const button = await within(canvasElement).findByRole("button", {
			name: "Choose folder…",
		});
		const before = getComputedStyle(button).borderColor;
		await withRealHover(button, userEvent, async () => {
			await waitFor(() =>
				expect(getComputedStyle(button).borderColor).not.toBe(before),
			);
		});
	},
};
