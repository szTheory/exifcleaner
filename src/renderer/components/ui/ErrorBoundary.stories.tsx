import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, spyOn, userEvent, waitFor, within } from "storybook/test";
import { knownA11y } from "../../story_support/known_a11y";
import { withRealHover } from "../../story_support/real_pointer";
import { ErrorBoundary } from "./ErrorBoundary";

// ErrorBoundary only shows its fallback after a child throws while rendering, so every
// fallback story renders a non-exported Boom child that really throws (D-14), and the
// meta's beforeEach spies on console.error. React and the boundary's own
// componentDidCatch both log through console.error, so a play that asserts the spy was
// called proves the fallback came from the caught path and not from a static copy of
// its markup (non-vacuity). The spy replaces the logger with a no-op, which keeps the
// CI log quiet; storybook/test restores it after each story.
//
// React retries a render that threw once before it reaches the boundary, so a child
// that throws only on its first attempt would never be caught. ThrowsUntilFixed
// therefore throws for as long as `repaired` is false, and TryAgainRecovers flips it
// before it clicks Try again: the click re-renders the child and the child now
// renders, which is what a real recovery looks like (the cause went away).
//
// The fallback strings are hardcoded English in the component (a recorded Phase 73
// finding), so there is no locale story: it is a waiver, not a duplicate of a
// translated state.
let errorSpy: ReturnType<typeof installSpy> | undefined;
let repaired = false;

function Boom({ message }: { message: string }): React.JSX.Element {
	throw new Error(message);
}

function ThrowsUntilFixed(): React.JSX.Element {
	if (!repaired) throw new Error("Cannot read properties of undefined");
	return <p>The list is back.</p>;
}

function installSpy() {
	return spyOn(console, "error").mockImplementation(() => undefined);
}

function loggedErrors(): NonNullable<typeof errorSpy> {
	if (errorSpy === undefined)
		throw new Error("the console.error spy is not set");
	return errorSpy;
}

const meta = {
	title: "UI/ErrorBoundary",
	component: ErrorBoundary,
	args: { children: null },
	beforeEach: () => {
		repaired = false;
		errorSpy = installSpy();
	},
	render: () => (
		<ErrorBoundary>
			<Boom message="Cannot read properties of undefined (reading 'name')" />
		</ErrorBoundary>
	),
} satisfies Meta<typeof ErrorBoundary>;

// Framework-mandated default export (CSF: Storybook reads the story file's default export).
export default meta;

type Story = StoryObj<typeof meta>;

export const Healthy: Story = {
	render: () => (
		<ErrorBoundary>
			<p>All good here.</p>
		</ErrorBoundary>
	),
	play: async ({ canvasElement }) => {
		await expect(
			await within(canvasElement).findByText("All good here."),
		).toBeInTheDocument();
		await expect(within(canvasElement).queryByRole("alert")).toBeNull();
		await expect(loggedErrors()).not.toHaveBeenCalled();
	},
};

export const Fallback: Story = {
	parameters: { a11y: knownA11y("ui-errorboundary--fallback") },
	play: async ({ canvasElement }) => {
		const alert = await within(canvasElement).findByRole("alert");
		await expect(alert).toHaveTextContent("Something went wrong.");
		await expect(alert).toHaveTextContent(
			"Cannot read properties of undefined (reading 'name')",
		);
		await expect(
			within(alert).getByRole("button", { name: "Try again" }),
		).toBeInTheDocument();
		await expect(loggedErrors()).toHaveBeenCalled();
	},
};

const LONG_MESSAGE =
	"Failed to read /Users/maria/Photos/Archive/2026/Summer/Trips/Mountains/Day3/RawExports/IMG_0001_with_a_very_long_unbroken_name_that_keeps_going_and_going_and_going.heic after the reader returned an unexpected structure while walking the file structure";

export const FallbackLongMessage: Story = {
	parameters: { a11y: knownA11y("ui-errorboundary--fallback-long-message") },
	render: () => (
		<ErrorBoundary>
			<Boom message={LONG_MESSAGE} />
		</ErrorBoundary>
	),
	play: async ({ canvasElement }) => {
		const alert = await within(canvasElement).findByRole("alert");
		await expect(alert).toHaveTextContent(LONG_MESSAGE);
		const detail = canvasElement.querySelector(".error-boundary__detail");
		if (!(detail instanceof HTMLElement)) throw new Error("no detail rendered");
		// word-break lets the unbroken path wrap inside the box instead of overflowing.
		await expect(detail.scrollWidth).toBeLessThanOrEqual(detail.clientWidth);
		const box = detail.getBoundingClientRect();
		await expect(box.left).toBeGreaterThanOrEqual(0);
		await expect(box.right).toBeLessThanOrEqual(window.innerWidth);
		// The message is long enough to need more than two lines (the line height is
		// \"normal\", so it is compared with the font size).
		await expect(box.height).toBeGreaterThan(
			parseFloat(getComputedStyle(detail).fontSize) * 2.5,
		);
		await expect(loggedErrors()).toHaveBeenCalled();
	},
};

export const TryAgainRecovers: Story = {
	parameters: { a11y: knownA11y("ui-errorboundary--try-again-recovers") },
	render: () => (
		<ErrorBoundary>
			<ThrowsUntilFixed />
		</ErrorBoundary>
	),
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(await canvas.findByRole("alert")).toHaveTextContent(
			"Cannot read properties of undefined",
		);
		await expect(loggedErrors()).toHaveBeenCalled();
		repaired = true;
		await userEvent.click(canvas.getByRole("button", { name: "Try again" }));
		await expect(
			await canvas.findByText("The list is back."),
		).toBeInTheDocument();
		await expect(canvas.queryByRole("alert")).toBeNull();
	},
};

// D-10: `.error-boundary__button:focus-visible` (error_boundary.css). The fallback has
// one button, so one Tab reaches it.
export const KeyboardFocus: Story = {
	parameters: { a11y: knownA11y("ui-errorboundary--keyboard-focus") },
	play: async ({ canvasElement }) => {
		const button = await within(canvasElement).findByRole("button", {
			name: "Try again",
		});
		await expect(loggedErrors()).toHaveBeenCalled();
		await userEvent.tab();
		await expect(button).toHaveFocus();
		await expect(button.matches(":focus-visible")).toBe(true);
		await expect(getComputedStyle(button).outlineStyle).toBe("solid");
	},
};

// RESEARCH C2: `.error-boundary__button:hover` fills the button (error_boundary.css),
// and a synthetic hover never matches :hover, so withRealHover moves a real pointer
// onto it and throws if :hover did not appear. Last in the file on purpose.
export const ButtonHover: Story = {
	parameters: { a11y: knownA11y("ui-errorboundary--button-hover") },
	play: async ({ canvasElement }) => {
		const button = await within(canvasElement).findByRole("button", {
			name: "Try again",
		});
		await expect(loggedErrors()).toHaveBeenCalled();
		const before = getComputedStyle(button).backgroundColor;
		await withRealHover(button, userEvent, async () => {
			await waitFor(() =>
				expect(getComputedStyle(button).backgroundColor).not.toBe(before),
			);
		});
	},
};
