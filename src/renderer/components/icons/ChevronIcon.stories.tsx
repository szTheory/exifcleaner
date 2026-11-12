import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, waitFor } from "storybook/test";
import "../../styles/metadata_expansion.css";
import { ChevronIcon } from "./ChevronIcon";

// ChevronIcon's rotation rule lives in the metadata expansion stylesheet, which only
// MetadataExpansion imports, so this story imports it itself (D-13): without the
// sheet the expanded and collapsed glyphs look identical. The Expanded play asserts
// the computed transform, so a missing import turns it red.
const meta = {
	title: "Icons/ChevronIcon",
	component: ChevronIcon,
	args: { expanded: false },
} satisfies Meta<typeof ChevronIcon>;

// Framework-mandated default export (CSF: Storybook reads the story file's default export).
export default meta;

type Story = StoryObj<typeof meta>;

function chevronIn(canvasElement: HTMLElement): SVGElement {
	const svg = canvasElement.querySelector("svg.chevron-icon");
	if (!(svg instanceof SVGElement)) throw new Error("no chevron rendered");
	return svg;
}

export const Collapsed: Story = {
	play: async ({ canvasElement }) => {
		const svg = chevronIn(canvasElement);
		await expect(svg).not.toHaveClass("chevron-icon--expanded");
		await expect(getComputedStyle(svg).transform).toBe("none");
		// Vacuity guard for the right-to-left story below.
		await expect(document.documentElement.dir).toBe("ltr");
	},
};

export const Expanded: Story = {
	args: { expanded: true },
	play: async ({ canvasElement }) => {
		const svg = chevronIn(canvasElement);
		await expect(svg).toHaveClass("chevron-icon--expanded");
		const matrix = new DOMMatrix(getComputedStyle(svg).transform);
		// rotate(90deg) is matrix(0, 1, -1, 0, 0, 0) up to float rounding.
		await expect(matrix.a).toBeCloseTo(0, 5);
		await expect(matrix.b).toBeCloseTo(1, 5);
		await expect(matrix.c).toBeCloseTo(-1, 5);
		await expect(matrix.d).toBeCloseTo(0, 5);
	},
};

// The glyph is not mirrored in a right-to-left layout (a recorded Phase 73 finding),
// so this story shows the locale takes effect and does not assert the direction.
export const Arabic: Story = {
	globals: { locale: "ar" },
	play: async ({ canvasElement }) => {
		await waitFor(() => expect(document.documentElement.dir).toBe("rtl"));
		await expect(document.documentElement.lang).toBe("ar");
		await expect(chevronIn(canvasElement)).toHaveAttribute(
			"aria-hidden",
			"true",
		);
	},
};
