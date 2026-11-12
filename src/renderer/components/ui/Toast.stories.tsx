import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, waitFor, within } from "storybook/test";
import ar from "../../../../.resources/locales/ar.json";
import da from "../../../../.resources/locales/da.json";
import en from "../../../../.resources/locales/en.json";
import { Toast } from "./Toast";

// Toast is a static `{ message, visible }` component: the timers that show and hide
// it live in FileTable and DropZone, so these stories are static and use no timers or
// fake clock (D-14). The strings are the real locale strings; the skipped template's
// `{count}` is filled the way DropZone fills it.
const meta = {
	title: "UI/Toast",
	component: Toast,
	args: { message: en["toast.copied"], visible: true },
} satisfies Meta<typeof Toast>;

// Framework-mandated default export (CSF: Storybook reads the story file's default export).
export default meta;

type Story = StoryObj<typeof meta>;

function skipped(template: string, count: number): string {
	return template.replace("{count}", String(count));
}

// A hidden toast is an opacity-0 fixed element, which proves nothing on its own, so
// the hidden stories assert the class that sets it.
export const Hidden: Story = {
	args: { message: "", visible: false },
	play: async ({ canvasElement }) => {
		const toast = await within(canvasElement).findByRole("status");
		await expect(toast).toHaveClass("toast--hidden");
		await expect(toast).not.toHaveClass("toast--visible");
		await expect(toast).toHaveTextContent("");
	},
};

export const Copied: Story = {
	play: async ({ canvasElement }) => {
		const toast = await within(canvasElement).findByRole("status");
		await expect(toast).toHaveClass("toast--visible");
		await expect(toast).toHaveTextContent("Copied to clipboard");
		// Vacuity guard for the right-to-left story below.
		await expect(document.documentElement.dir).toBe("ltr");
	},
};

export const SkippedMany: Story = {
	args: { message: skipped(en["intake.unsupportedSkipped"], 3) },
	play: async ({ canvasElement }) => {
		const toast = await within(canvasElement).findByRole("status");
		await expect(toast).toHaveClass("toast--visible");
		await expect(toast).toHaveTextContent("3 unsupported files skipped");
	},
};

// The wording for a count of one has no singular form ("1 unsupported files
// skipped") and two e2e specs pin that exact text (error-handling.spec.ts:168 and
// folder-recursion.spec.ts:95), so this story never asserts its text; it shows the
// toast and asserts only that it is visible. The wording is recorded for Phase 73.
export const SkippedOne: Story = {
	args: { message: skipped(en["intake.unsupportedSkipped"], 1) },
	play: async ({ canvasElement }) => {
		const toast = await within(canvasElement).findByRole("status");
		await expect(toast).toHaveClass("toast--visible");
	},
};

// Revealing a file that was moved or deleted after its row was shown (the string is
// the main process's reveal handler error, src/main/reveal_handlers.ts).
export const RevealFailed: Story = {
	args: { message: "File no longer exists" },
	play: async ({ canvasElement }) => {
		const toast = await within(canvasElement).findByRole("status");
		await expect(toast).toHaveClass("toast--visible");
		await expect(toast).toHaveTextContent("File no longer exists");
	},
};

// The state after the timer has run out: the message is still set and the toast is
// faded out.
export const FadedOut: Story = {
	args: { visible: false },
	play: async ({ canvasElement }) => {
		const toast = await within(canvasElement).findByRole("status");
		await expect(toast).toHaveClass("toast--hidden");
		await expect(toast).toHaveTextContent("Copied to clipboard");
	},
};

// The Toast is `position: fixed` and centred on the viewport, so it is laid out
// inside a 580px frame (the app's default window width, window_setup.ts) made the
// containing block with `transform`, and the longest translation of the skipped
// template (Danish) must wrap inside it instead of running past the frame.
function NarrowWindow({ children }: { children: React.ReactNode }) {
	return (
		<div
			style={{
				position: "relative",
				width: "580px",
				height: "200px",
				transform: "translateZ(0)",
			}}
		>
			{children}
		</div>
	);
}

export const LongMessage: Story = {
	args: { message: skipped(da["intake.unsupportedSkipped"], 12) },
	render: (args) => (
		<NarrowWindow>
			<Toast {...args} />
		</NarrowWindow>
	),
	play: async ({ canvasElement }) => {
		const toast = await within(canvasElement).findByRole("status");
		const frame = toast.parentElement;
		await expect(frame).not.toBeNull();
		const frameBox = frame?.getBoundingClientRect();
		const box = toast.getBoundingClientRect();
		await expect(box.width).toBeLessThanOrEqual(580);
		// Inside the frame, not the viewport: the transform made the frame the
		// containing block, so the toast sits within its edges.
		await expect(box.left).toBeGreaterThanOrEqual(frameBox?.left ?? 0);
		await expect(box.right).toBeLessThanOrEqual(frameBox?.right ?? 0);
		// More than one line box: the text wrapped instead of running on one line.
		const range = document.createRange();
		range.selectNodeContents(toast);
		await expect(range.getClientRects().length).toBeGreaterThan(1);
	},
};

export const Arabic: Story = {
	globals: { locale: "ar" },
	args: { message: ar["toast.copied"] },
	play: async ({ canvasElement }) => {
		await waitFor(() => expect(document.documentElement.dir).toBe("rtl"));
		await expect(document.documentElement.lang).toBe("ar");
		const toast = await within(canvasElement).findByRole("status");
		await expect(toast).toHaveTextContent(ar["toast.copied"]);
	},
};
