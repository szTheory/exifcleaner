import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";
import { computeMetadataDiff } from "../../../domain";
import type { MetadataDiffField, MetadataDiffGroup } from "../../../domain";
import { useI18n } from "../../hooks/use_i18n";
import { knownA11y } from "../../story_support/known_a11y";
import "../../styles/metadata_expansion.css";
import { MetadataGroup } from "./MetadataGroup";

// MetadataGroup is the middle of the metadata trio (D-17): a header with the group's
// friendly name and the field count, then its field rows. Group data comes from
// computeMetadataDiff, as MetadataExpansion builds it, never from a hand-built group
// (a hand-built group could be a shape the diff never produces). FileRow's real call
// passes the removed (or the still present) fields of a group, so the stories pass
// the diff's own field list. The surface wrapper is copied into this file on purpose
// (D-03), as in MetadataField.stories.tsx.
type GroupProps = {
	group: MetadataDiffGroup;
	fields: readonly MetadataDiffField[];
};

function ExpansionSurface({
	children,
}: {
	children: React.ReactNode;
}): React.JSX.Element {
	return <div className="metadata-expansion">{children}</div>;
}

// The friendly name is derived exactly as MetadataExpansion derives it.
function Group({ group, fields }: GroupProps): React.JSX.Element {
	const { t } = useI18n();
	return (
		<ExpansionSurface>
			<MetadataGroup
				group={group}
				fields={fields}
				friendlyName={t(group.friendlyNameKey) || group.rawGroupName}
				i18nLookup={t}
			/>
		</ExpansionSurface>
	);
}

const meta = {
	title: "File list/MetadataGroup",
	component: MetadataGroup,
	render: (args) => <Group group={args.group} fields={args.fields} />,
} satisfies Meta<typeof MetadataGroup>;

// Framework-mandated default export (CSF: Storybook reads the story file's default export).
export default meta;

type Story = StoryObj<GroupProps>;

function groupFor(
	before: Record<string, unknown>,
	rawGroupName: string,
): GroupProps {
	const group = computeMetadataDiff({ before, after: {} }).find(
		(candidate) => candidate.rawGroupName === rawGroupName,
	);
	if (group === undefined) {
		throw new Error(`computeMetadataDiff produced no ${rawGroupName} group`);
	}
	return { group, fields: group.fields };
}

export const OneField: Story = {
	parameters: { a11y: knownA11y("file-list-metadatagroup--one-field") },
	args: groupFor({ "Camera:Make": "Canon" }, "Camera"),
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await canvas.findByLabelText("Make: removed");
		const header = canvasElement.querySelector(".metadata-group__header");
		await expect(header).toHaveAttribute("title", "Camera");
		await expect(
			header?.querySelector(".metadata-group__name")?.textContent,
		).toBe("Camera");
		await expect(
			header?.querySelector(".metadata-group__count")?.textContent,
		).toBe("(1)");
		await expect(
			canvasElement.querySelectorAll(".metadata-field"),
		).toHaveLength(1);
	},
};

export const ManyFields: Story = {
	parameters: { a11y: knownA11y("file-list-metadatagroup--many-fields") },
	args: groupFor(
		{
			"Camera:Make": "Canon",
			"Camera:Model": "Canon EOS R5",
			"Camera:LensModel": "RF24-70mm F2.8 L IS USM",
			"Camera:SerialNumber": "072021000123",
			"Camera:FocalLength": "50.0 mm",
			"Camera:ExposureTime": "1/250",
		},
		"Camera",
	),
	play: async ({ canvasElement }) => {
		await within(canvasElement).findByLabelText("LensModel: removed");
		const header = canvasElement.querySelector(".metadata-group__header");
		await expect(
			header?.querySelector(".metadata-group__count")?.textContent,
		).toBe("(6)");
		await expect(
			canvasElement.querySelectorAll(".metadata-field"),
		).toHaveLength(6);
	},
};

// An ExifTool group with no friendly key falls back to the metaGroupOther text, and
// the header keeps the raw group name in `title` so the real name is not lost.
export const UnmappedGroup: Story = {
	parameters: { a11y: knownA11y("file-list-metadatagroup--unmapped-group") },
	args: groupFor({ "Audio:Encoder": "Lavf58.76.100" }, "Audio"),
	play: async ({ canvasElement }) => {
		await within(canvasElement).findByLabelText("Encoder: removed");
		const header = canvasElement.querySelector(".metadata-group__header");
		await expect(header).toHaveAttribute("title", "Audio");
		await expect(
			header?.querySelector(".metadata-group__name")?.textContent,
		).toBe("Other");
	},
};
