import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect } from "storybook/test";
import { knownA11y } from "../../story_support/known_a11y";
import {
	NEUTRAL,
	TYPE_PILL_FAMILIES,
} from "../../story_support/type_pill_families";
import { TypePill } from "./TypePill";

// One story per colour family, each rendering the whole family with its aliases as
// the uppercase text the file table shows (D-16). `pillClass` is not exported from
// TypePill.tsx and product code is not edited for a story, so each play asserts the
// class the component renders against the literal table below, and the computed
// colour proves the stylesheet gives every member of a family the same colour. The
// lists themselves are checked against SUPPORTED_EXTENSIONS by
// .storybook/type_pill_families.test.ts.
const meta = {
	title: "UI/TypePill",
	component: TypePill,
	args: { extension: "JPG" },
} satisfies Meta<typeof TypePill>;

// Framework-mandated default export (CSF: Storybook reads the story file's default export).
export default meta;

type Story = StoryObj<typeof meta>;

// The modifier class each extension is expected to render with (aliases folded).
const EXPECTED_CLASS: Readonly<Record<string, string>> = {
	jpg: "jpg",
	jpeg: "jpg",
	heic: "heic",
	heif: "heic",
	png: "png",
	pdf: "pdf",
	mov: "mov",
	mp4: "mp4",
	m4a: "mov",
	m4v: "mov",
	avi: "mov",
	"3gp": "mov",
	wmv: "mov",
	dng: "dng",
	cr2: "dng",
	cr3: "dng",
	nef: "dng",
	arw: "dng",
	orf: "dng",
	rw2: "dng",
	raf: "dng",
	pef: "dng",
	srw: "dng",
	// Neutral extensions have no family: they render their own, unstyled modifier.
	gif: "gif",
	tiff: "tiff",
	tif: "tif",
	webp: "webp",
	avif: "avif",
	bmp: "bmp",
	svg: "svg",
};

// Every modifier a family colours (type_pill.css); a neutral pill must carry none.
const FAMILY_MODIFIERS = new Set([
	"jpg",
	"jpeg",
	"heic",
	"heif",
	"png",
	"pdf",
	"mov",
	"mp4",
	"m4a",
	"m4v",
	"avi",
	"3gp",
	"wmv",
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

// The colour a pill gets from the base `.type-pill` rule alone, read from a bare probe.
function baseColour(canvasElement: HTMLElement): string {
	const probe = document.createElement("span");
	probe.className = "type-pill";
	canvasElement.append(probe);
	const colour = getComputedStyle(probe).color;
	probe.remove();
	return colour;
}

async function expectFamily(
	canvasElement: HTMLElement,
	extensions: readonly string[],
): Promise<void> {
	const pills = pillsIn(canvasElement);
	await expect(pills).toHaveLength(extensions.length);
	const base = baseColour(canvasElement);
	const first = pills[0];
	if (first === undefined) throw new Error("no pill rendered");
	const familyColour = getComputedStyle(first).color;
	// A family colour must differ from the unstyled one, or the check below is vacuous.
	await expect(familyColour).not.toBe(base);
	for (const [index, extension] of extensions.entries()) {
		const pill = pills[index];
		await expect(pill).toHaveTextContent(extension.toUpperCase());
		await expect(pill).toHaveClass(
			"type-pill",
			`type-pill--${EXPECTED_CLASS[extension]}`,
		);
		if (pill !== undefined) {
			await expect(getComputedStyle(pill).color).toBe(familyColour);
		}
	}
}

export const Jpeg: Story = {
	parameters: { a11y: knownA11y("ui-typepill--jpeg") },
	render: () => <Pills extensions={TYPE_PILL_FAMILIES.jpeg} />,
	play: async ({ canvasElement }) => {
		await expectFamily(canvasElement, TYPE_PILL_FAMILIES.jpeg);
	},
};

export const Heic: Story = {
	parameters: { a11y: knownA11y("ui-typepill--heic") },
	render: () => <Pills extensions={TYPE_PILL_FAMILIES.heic} />,
	play: async ({ canvasElement }) => {
		await expectFamily(canvasElement, TYPE_PILL_FAMILIES.heic);
	},
};

export const Png: Story = {
	parameters: { a11y: knownA11y("ui-typepill--png") },
	render: () => <Pills extensions={TYPE_PILL_FAMILIES.png} />,
	play: async ({ canvasElement }) => {
		await expectFamily(canvasElement, TYPE_PILL_FAMILIES.png);
	},
};

export const Pdf: Story = {
	parameters: { a11y: knownA11y("ui-typepill--pdf") },
	render: () => <Pills extensions={TYPE_PILL_FAMILIES.pdf} />,
	play: async ({ canvasElement }) => {
		await expectFamily(canvasElement, TYPE_PILL_FAMILIES.pdf);
	},
};

export const Media: Story = {
	parameters: { a11y: knownA11y("ui-typepill--media") },
	render: () => <Pills extensions={TYPE_PILL_FAMILIES.media} />,
	play: async ({ canvasElement }) => {
		await expectFamily(canvasElement, TYPE_PILL_FAMILIES.media);
	},
};

export const Raw: Story = {
	parameters: { a11y: knownA11y("ui-typepill--raw") },
	render: () => <Pills extensions={TYPE_PILL_FAMILIES.raw} />,
	play: async ({ canvasElement }) => {
		await expectFamily(canvasElement, TYPE_PILL_FAMILIES.raw);
	},
};

// Supported extensions with no family colour: they keep the muted base pill, and no
// family modifier is present.
export const Neutral: Story = {
	parameters: { a11y: knownA11y("ui-typepill--neutral") },
	render: () => <Pills extensions={NEUTRAL} />,
	play: async ({ canvasElement }) => {
		const pills = pillsIn(canvasElement);
		await expect(pills).toHaveLength(NEUTRAL.length);
		const base = baseColour(canvasElement);
		for (const [index, extension] of NEUTRAL.entries()) {
			const pill = pills[index];
			await expect(pill).toHaveTextContent(extension.toUpperCase());
			await expect(pill).toHaveClass(
				"type-pill",
				`type-pill--${EXPECTED_CLASS[extension]}`,
			);
			for (const modifier of FAMILY_MODIFIERS) {
				await expect(pill).not.toHaveClass(`type-pill--${modifier}`);
			}
			if (pill !== undefined) {
				await expect(getComputedStyle(pill).color).toBe(base);
			}
		}
	},
};
