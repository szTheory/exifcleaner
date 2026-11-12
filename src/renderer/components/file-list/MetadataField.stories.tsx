import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";
import type { MetadataDiffField } from "../../../domain";
import { useI18n } from "../../hooks/use_i18n";
import { knownA11y } from "../../story_support/known_a11y";
import "../../styles/metadata_expansion.css";
import { MetadataField } from "./MetadataField";

// MetadataField is one row of the metadata trio (D-17). Its colours, the value cut and
// the `.metadata-expansion` surface it sits on live in metadata_expansion.css, which
// only MetadataExpansion imports, so this story imports it and renders inside an
// ExpansionSurface (D-03, D-22): the contrast the row has on the real surface is
// what axe measures, which is why the baselined contrast entries below are real
// defects of the shipped panel and not artefacts of a bare canvas.
// The row cuts a value at 80 characters and puts the full text in `title` (the
// `valueStr.length > 80` test in MetadataField.tsx); the two boundary stories pin
// both sides of that limit with the strings typed out in full.
type FieldProps = { field: MetadataDiffField };

// The real surface class, copied into each trio story file on purpose (D-03): a shared
// wrapper would be a second place the product's markup could drift unseen.
function ExpansionSurface({
	children,
}: {
	children: React.ReactNode;
}): React.JSX.Element {
	return <div className="metadata-expansion">{children}</div>;
}

function Field({ field }: FieldProps): React.JSX.Element {
	const { t } = useI18n();
	return (
		<ExpansionSurface>
			<MetadataField field={field} i18nLookup={t} />
		</ExpansionSurface>
	);
}

const meta = {
	title: "File list/MetadataField",
	component: MetadataField,
	render: (args) => <Field field={args.field} />,
} satisfies Meta<typeof MetadataField>;

// Framework-mandated default export (CSF: Storybook reads the story file's default export).
export default meta;

type Story = StoryObj<FieldProps>;

function valueOf(canvasElement: HTMLElement): HTMLElement {
	const value = canvasElement.querySelector<HTMLElement>(
		".metadata-field__value",
	);
	if (value === null) throw new Error("value cell missing");
	return value;
}

export const Removed: Story = {
	parameters: { a11y: knownA11y("file-list-metadatafield--removed") },
	args: {
		field: { name: "Model", value: "Canon EOS R5", removed: true },
	},
	play: async ({ canvasElement }) => {
		const row = await within(canvasElement).findByLabelText("Model: removed");
		await expect(row).toHaveClass("metadata-field--removed");
		await expect(row.querySelector(".metadata-field__icon")?.textContent).toBe(
			"−",
		);
		await expect(valueOf(canvasElement).textContent).toBe("Canon EOS R5");
	},
};

export const Preserved: Story = {
	parameters: { a11y: knownA11y("file-list-metadatafield--preserved") },
	args: {
		field: {
			name: "Orientation",
			value: "Horizontal (normal)",
			removed: false,
		},
	},
	play: async ({ canvasElement }) => {
		const row = await within(canvasElement).findByLabelText(
			"Orientation: preserved",
		);
		await expect(row).toHaveClass("metadata-field--preserved");
		await expect(row.querySelector(".metadata-field__icon")?.textContent).toBe(
			"✓",
		);
		await expect(valueOf(canvasElement).textContent).toBe(
			"Horizontal (normal)",
		);
	},
};

export const StructuredValue: Story = {
	parameters: { a11y: knownA11y("file-list-metadatafield--structured-value") },
	args: {
		field: {
			name: "GPSCoordinates",
			value: [47.6063, -122.3321],
			removed: true,
		},
	},
	play: async ({ canvasElement }) => {
		await within(canvasElement).findByLabelText("GPSCoordinates: removed");
		await expect(valueOf(canvasElement).textContent).toBe(
			"[47.6063,-122.3321]",
		);
		await expect(valueOf(canvasElement)).not.toHaveAttribute("title");
	},
};

// 81 characters: the cut keeps the first 80 and adds the ellipsis.
export const CutAtLimit: Story = {
	parameters: { a11y: knownA11y("file-list-metadatafield--cut-at-limit") },
	args: {
		field: {
			name: "ImageDescription",
			value:
				"Photographed from the north ridge trail above Leavenworth, Washington at sunrise.",
			removed: true,
		},
	},
	play: async ({ canvasElement }) => {
		await within(canvasElement).findByLabelText("ImageDescription: removed");
		const value = valueOf(canvasElement);
		await expect(value.textContent).toBe(
			"Photographed from the north ridge trail above Leavenworth, Washington at sunrise…",
		);
		await expect(value).toHaveAttribute(
			"title",
			"Photographed from the north ridge trail above Leavenworth, Washington at sunrise.",
		);
	},
};

// 80 characters: exactly the limit, so the value renders whole with no title.
export const ExactlyAtLimit: Story = {
	parameters: { a11y: knownA11y("file-list-metadatafield--exactly-at-limit") },
	args: {
		field: {
			name: "ImageDescription",
			value:
				"Photographed from the north ridge trail above Leavenworth, Washington at sunrise",
			removed: true,
		},
	},
	play: async ({ canvasElement }) => {
		await within(canvasElement).findByLabelText("ImageDescription: removed");
		const value = valueOf(canvasElement);
		await expect(value.textContent).toBe(
			"Photographed from the north ridge trail above Leavenworth, Washington at sunrise",
		);
		await expect(value.textContent?.length).toBe(80);
		await expect(value).not.toHaveAttribute("title");
	},
};

export const BidiValue: Story = {
	parameters: { a11y: knownA11y("file-list-metadatafield--bidi-value") },
	args: {
		field: {
			name: "Location",
			value: "مكتب القاهرة - Cairo Office, Zamalek",
			removed: true,
		},
	},
	play: async ({ canvasElement }) => {
		await within(canvasElement).findByLabelText("Location: removed");
		const value = valueOf(canvasElement);
		await expect(value.tagName).toBe("BDI");
		await expect(value).toHaveAttribute("dir", "auto");
		await expect(value.textContent).toBe(
			"مكتب القاهرة - Cairo Office, Zamalek",
		);
	},
};
