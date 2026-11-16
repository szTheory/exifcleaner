import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect } from "storybook/test";
import { knownA11y } from "../../story_support/known_a11y";
import {
	NEUTRAL,
	TYPE_PILL_FAMILIES,
} from "../../story_support/type_pill_families";
import { TypePill } from "./TypePill";

// These stories preserve the current family-shaped examples and accessible audit
// bindings while checking only the visible labels and the shared badge base.
const meta = {
	title: "UI/TypePill",
	component: TypePill,
	args: { extension: "JPG" },
} satisfies Meta<typeof TypePill>;

// Framework-mandated default export (CSF: Storybook reads the story file's default export).
export default meta;

type Story = StoryObj<typeof meta>;

function Pills({
	extensions,
}: {
	extensions: readonly string[];
}): React.JSX.Element {
	return (
		<div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
			{extensions.map((extension) => (
				<TypePill key={extension} extension={extension.toUpperCase()} />
			))}
		</div>
	);
}

function pillsIn(canvasElement: HTMLElement): HTMLElement[] {
	return [...canvasElement.querySelectorAll<HTMLElement>(".type-pill")];
}

async function expectVisibleExtensions(
	canvasElement: HTMLElement,
	extensions: readonly string[],
): Promise<void> {
	const pills = pillsIn(canvasElement);
	await expect(pills).toHaveLength(extensions.length);
	await expect(pills.map((pill) => pill.innerText.trim())).toEqual(
		extensions.map((extension) => extension.toUpperCase()),
	);
	for (const pill of pills) await expect(pill).toHaveClass("type-pill");
}

export const Jpeg: Story = {
	parameters: { a11y: knownA11y("ui-typepill--jpeg") },
	render: () => <Pills extensions={TYPE_PILL_FAMILIES.jpeg} />,
	play: async ({ canvasElement }) => {
		await expectVisibleExtensions(canvasElement, TYPE_PILL_FAMILIES.jpeg);
	},
};

export const Heic: Story = {
	parameters: { a11y: knownA11y("ui-typepill--heic") },
	render: () => <Pills extensions={TYPE_PILL_FAMILIES.heic} />,
	play: async ({ canvasElement }) => {
		await expectVisibleExtensions(canvasElement, TYPE_PILL_FAMILIES.heic);
	},
};

export const Png: Story = {
	parameters: { a11y: knownA11y("ui-typepill--png") },
	render: () => <Pills extensions={TYPE_PILL_FAMILIES.png} />,
	play: async ({ canvasElement }) => {
		await expectVisibleExtensions(canvasElement, TYPE_PILL_FAMILIES.png);
	},
};

export const Pdf: Story = {
	parameters: { a11y: knownA11y("ui-typepill--pdf") },
	render: () => <Pills extensions={TYPE_PILL_FAMILIES.pdf} />,
	play: async ({ canvasElement }) => {
		await expectVisibleExtensions(canvasElement, TYPE_PILL_FAMILIES.pdf);
	},
};

export const Media: Story = {
	parameters: { a11y: knownA11y("ui-typepill--media") },
	render: () => <Pills extensions={TYPE_PILL_FAMILIES.media} />,
	play: async ({ canvasElement }) => {
		await expectVisibleExtensions(canvasElement, TYPE_PILL_FAMILIES.media);
	},
};

export const Raw: Story = {
	parameters: { a11y: knownA11y("ui-typepill--raw") },
	render: () => <Pills extensions={TYPE_PILL_FAMILIES.raw} />,
	play: async ({ canvasElement }) => {
		await expectVisibleExtensions(canvasElement, TYPE_PILL_FAMILIES.raw);
	},
};

// Keep the neutral example's current input and visible extension contract.
export const Neutral: Story = {
	parameters: { a11y: knownA11y("ui-typepill--neutral") },
	render: () => <Pills extensions={NEUTRAL} />,
	play: async ({ canvasElement }) => {
		await expectVisibleExtensions(canvasElement, NEUTRAL);
	},
};
