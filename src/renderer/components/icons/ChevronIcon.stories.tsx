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

// The apex of the chevron polyline, (1, 0), mapped through the computed transform and
// rounded to three decimals (`+ 0` turns a rounded -0 into 0).
function apexOf(svg: SVGElement): number[] {
	const point = new DOMMatrix(getComputedStyle(svg).transform).transformPoint({
		x: 1,
		y: 0,
	});
	return [point.x, point.y].map((value) => Math.round(value * 1000) / 1000 + 0);
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
		// The left-to-right control for the Arabic story: expanded points down.
		await expect(apexOf(svg)).toEqual([0, 1]);
	},
};

// RTL-01 / D-32: under a right-to-left layout the collapsed chevron points left and the
// expanded one still points down. The apex of the polyline, (1, 0), is mapped through the
// computed transform because a rect cannot show a mirror (the polyline is symmetric
// about the box centre). The play waits for dir=rtl first.
export const Arabic: Story = {
	globals: { locale: "ar" },
	render: () => (
		<>
			<ChevronIcon expanded={false} />
			<ChevronIcon expanded={true} />
		</>
	),
	play: async ({ canvasElement }) => {
		await waitFor(() => expect(document.documentElement.dir).toBe("rtl"));
		await expect(document.documentElement.lang).toBe("ar");
		const [collapsed, expanded] = Array.from(
			canvasElement.querySelectorAll("svg.chevron-icon"),
		);
		if (
			!(collapsed instanceof SVGElement) ||
			!(expanded instanceof SVGElement)
		) {
			throw new Error("expected a collapsed and an expanded chevron");
		}
		await expect(collapsed).toHaveAttribute("aria-hidden", "true");
		await waitFor(() => expect(document.getAnimations()).toHaveLength(0));
		await expect(apexOf(collapsed)).toEqual([-1, 0]);
		await expect(apexOf(expanded)).toEqual([0, 1]);
	},
};
