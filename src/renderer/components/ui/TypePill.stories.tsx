import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect } from "storybook/test";
import { knownA11y } from "../../story_support/known_a11y";
import { TypePill } from "./TypePill";

// Keep representative extension examples while checking only visible labels and
// the shared badge base. Every supported extension is covered by the generic twin.
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
	render: () => <Pills extensions={["jpg", "jpeg"]} />,
	play: async ({ canvasElement }) => {
		await expectVisibleExtensions(canvasElement, ["jpg", "jpeg"]);
	},
};

export const Heic: Story = {
	parameters: { a11y: knownA11y("ui-typepill--heic") },
	render: () => <Pills extensions={["heic", "heif"]} />,
	play: async ({ canvasElement }) => {
		await expectVisibleExtensions(canvasElement, ["heic", "heif"]);
	},
};

export const Png: Story = {
	parameters: { a11y: knownA11y("ui-typepill--png") },
	render: () => <Pills extensions={["png"]} />,
	play: async ({ canvasElement }) => {
		await expectVisibleExtensions(canvasElement, ["png"]);
	},
};

export const Pdf: Story = {
	parameters: { a11y: knownA11y("ui-typepill--pdf") },
	render: () => <Pills extensions={["pdf"]} />,
	play: async ({ canvasElement }) => {
		await expectVisibleExtensions(canvasElement, ["pdf"]);
	},
};

export const Media: Story = {
	parameters: { a11y: knownA11y("ui-typepill--media") },
	render: () => (
		<Pills extensions={["mov", "mp4", "m4a", "m4v", "avi", "3gp", "wmv"]} />
	),
	play: async ({ canvasElement }) => {
		await expectVisibleExtensions(canvasElement, [
			"mov",
			"mp4",
			"m4a",
			"m4v",
			"avi",
			"3gp",
			"wmv",
		]);
	},
};

export const Raw: Story = {
	parameters: { a11y: knownA11y("ui-typepill--raw") },
	render: () => (
		<Pills
			extensions={[
				"dng",
				"cr2",
				"cr3",
				"nef",
				"arw",
				"orf",
				"rw2",
				"raf",
				"pef",
				"srw",
			]}
		/>
	),
	play: async ({ canvasElement }) => {
		await expectVisibleExtensions(canvasElement, [
			"dng",
			"cr2",
			"cr3",
			"nef",
			"arw",
			"orf",
			"rw2",
			"raf",
			"pef",
			"srw",
		]);
	},
};

export const Neutral: Story = {
	parameters: { a11y: knownA11y("ui-typepill--neutral") },
	render: () => (
		<Pills extensions={["gif", "tiff", "tif", "webp", "avif", "bmp", "svg"]} />
	),
	play: async ({ canvasElement }) => {
		await expectVisibleExtensions(canvasElement, [
			"gif",
			"tiff",
			"tif",
			"webp",
			"avif",
			"bmp",
			"svg",
		]);
	},
};
