import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import ar from "../../../../.resources/locales/ar.json";
import { knownA11y } from "../../story_support/known_a11y";
import type { FileEntry } from "../../contexts/AppContext";
import { OUTCOME_CASES, entryFor } from "../../story_support/process_outcomes";
import { withRealHover } from "../../story_support/real_pointer";
import { useI18n } from "../../hooks/use_i18n";
import { MetadataExpansion } from "./MetadataExpansion";

// MetadataExpansion is the metadata trio's pattern (D-17). FileRow mounts it only for
// a Complete row with both maps (FileRow.tsx, the `MetadataExpansion` call site), and
// passes its own `t` and `locale`; the non-exported `Expansion` wrapper below does the
// same with the real `useI18n()` (no app-state provider, no second dictionary).
//
// C1: a file whose read finds no tags ends as already-clean in FileRow (the
// `beforeTags === 0` early exit, use_process_files.ts, with `removeXattrs` off) and
// never reaches this component. The empty story is therefore built only from the
// computed fields `SourceFile`, `ImageSize` and `Megapixels`, which the diff excludes
// and which a Complete row can still carry.
// C7: there is no click-to-copy story. The copy click only calls the clipboard and
// the parent's `onCopy` toast; it changes no DOM, ARIA or colour inside this subject
// (spike S-8 is dropped and recorded in 72-EVIDENCE.md).
//
// Every play asserts hard-coded literals, never a count computed from the fixture, so
// corrupting a fixture turns the story red instead of agreeing with itself (SC3); the
// renderer test in tests/renderer/metadata_expansion_i18n.test.ts types the same
// strings again.
type ExpansionProps = {
	beforeMetadata: Record<string, unknown>;
	afterMetadata: Record<string, unknown>;
	onCopy: () => void;
};

function Expansion(props: ExpansionProps): React.JSX.Element {
	const { t, locale } = useI18n();
	return <MetadataExpansion {...props} i18nLookup={t} locale={locale} />;
}

const meta = {
	title: "File list/MetadataExpansion",
	// The catalog maps a story to its subject by this identifier (story_index.mjs), so
	// it names the real component; every story renders the wrapper instead.
	component: MetadataExpansion,
	args: { beforeMetadata: {}, afterMetadata: {}, onCopy: fn() },
	render: (args) => <Expansion {...args} />,
} satisfies Meta<typeof MetadataExpansion>;

// Framework-mandated default export (CSF: Storybook reads the story file's default export).
export default meta;

// The stories' args are the three props a story controls; `i18nLookup` and `locale`
// are never args (the wrapper reads them from useI18n()).
type Story = StoryObj<ExpansionProps>;

// The two maps a fixture entry carries (the real reducer wrote them from the case's
// UPDATE_FILE_METADATA dispatch).
function mapsOf(entry: FileEntry): {
	beforeMetadata: Record<string, unknown>;
	afterMetadata: Record<string, unknown>;
} {
	if (entry.beforeMetadata === null || entry.afterMetadata === null) {
		throw new Error(`fixture entry ${entry.id} has no metadata maps`);
	}
	return {
		beforeMetadata: entry.beforeMetadata,
		afterMetadata: entry.afterMetadata,
	};
}

// A camera file as ExifTool reads it (family 2 group names, as the diff expects).
const CAMERA_BEFORE: Record<string, unknown> = {
	"Camera:Make": "Canon",
	"Camera:Model": "Canon EOS R5",
	"GPS:GPSLatitude": "47 deg 36' 22.80\" N",
	"Author:Artist": "Ada Lovelace",
	"Image:Orientation": "Horizontal (normal)",
};
const CAMERA_AFTER: Record<string, unknown> = {
	"Image:Orientation": "Horizontal (normal)",
	"ICC_Profile:ProfileDescription": "sRGB IEC61966-2.1",
};

async function summaryText(canvasElement: HTMLElement): Promise<string> {
	const summary = canvasElement.querySelector(".metadata-expansion__summary");
	await expect(summary).not.toBeNull();
	return summary?.textContent ?? "";
}

export const NoMetadata: Story = {
	parameters: { a11y: knownA11y("file-list-metadataexpansion--no-metadata") },
	args: {
		beforeMetadata: {
			SourceFile: "/path/to/test.jpg",
			"Composite:ImageSize": "4000x3000",
			"Composite:Megapixels": 12,
		},
		afterMetadata: {
			SourceFile: "/path/to/test.jpg",
			"Composite:ImageSize": "4000x3000",
			"Composite:Megapixels": 12,
		},
	},
	play: async ({ canvasElement }) => {
		await expect(
			await within(canvasElement).findByText("No metadata found"),
		).toBeInTheDocument();
		await expect(canvasElement.querySelector("details")).toBeNull();
		await expect(canvasElement.querySelector("button")).toBeNull();
	},
};

export const AllRemoved: Story = {
	parameters: { a11y: knownA11y("file-list-metadataexpansion--all-removed") },
	args: { beforeMetadata: CAMERA_BEFORE, afterMetadata: {} },
	play: async ({ canvasElement }) => {
		await within(canvasElement).findByText("Copy all");
		await expect(await summaryText(canvasElement)).toBe(
			"5 fields removed · 0 fields still present",
		);
		await expect(canvasElement.querySelector("details")).toBeNull();
	},
};

export const Mixed: Story = {
	parameters: { a11y: knownA11y("file-list-metadataexpansion--mixed") },
	args: mapsOf(entryFor(OUTCOME_CASES.cleaned)),
	play: async ({ canvasElement }) => {
		await within(canvasElement).findByText("Copy all");
		await expect(await summaryText(canvasElement)).toBe(
			"2 fields removed · 1 field still present",
		);
		await expect(
			canvasElement.querySelector(".metadata-expansion__present summary")
				?.textContent,
		).toBe("1 field still present");
		await expect(
			within(canvasElement).getAllByLabelText("tag2: removed"),
		).toHaveLength(1);
	},
};

export const PresentDetailsOpen: Story = {
	parameters: {
		a11y: knownA11y("file-list-metadataexpansion--present-details-open"),
	},
	args: { beforeMetadata: CAMERA_BEFORE, afterMetadata: CAMERA_AFTER },
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await canvas.findByText("Copy all");
		await expect(await summaryText(canvasElement)).toBe(
			"4 fields removed · 2 fields still present",
		);
		const details = canvasElement.querySelector("details");
		await expect(details).not.toBeNull();
		await expect(details).not.toHaveAttribute("open");
		await expect(canvas.getByText("ProfileDescription")).not.toBeVisible();
		const summary = canvasElement.querySelector(
			".metadata-expansion__present summary",
		);
		await expect(summary?.textContent).toBe("2 fields still present");
		if (summary === null) throw new Error("present summary missing");
		await userEvent.click(summary);
		await expect(details).toHaveAttribute("open");
		await expect(canvas.getByText("ProfileDescription")).toBeVisible();
		await expect(
			canvas.getByLabelText("ProfileDescription: preserved"),
		).toBeVisible();
	},
};

export const Unchanged: Story = {
	parameters: { a11y: knownA11y("file-list-metadataexpansion--unchanged") },
	args: mapsOf(entryFor(OUTCOME_CASES.unchanged)),
	play: async ({ canvasElement }) => {
		await within(canvasElement).findByText("Copy all");
		await expect(await summaryText(canvasElement)).toBe(
			"0 fields removed · 1 field still present",
		);
		await expect(
			canvasElement.querySelector(
				".metadata-expansion__content > .metadata-group",
			),
		).toBeNull();
		await expect(canvasElement.querySelector("details")).not.toBeNull();
	},
};

export const OneRemoved: Story = {
	parameters: { a11y: knownA11y("file-list-metadataexpansion--one-removed") },
	args: {
		beforeMetadata: {
			"Camera:Make": "Canon",
			"Image:Orientation": "Horizontal (normal)",
		},
		afterMetadata: { "Image:Orientation": "Horizontal (normal)" },
	},
	play: async ({ canvasElement }) => {
		await within(canvasElement).findByText("Copy all");
		await expect(await summaryText(canvasElement)).toBe(
			"1 field removed · 1 field still present",
		);
	},
};

// Thirty removed fields in one group are far taller than the 300px cap in
// metadata_expansion.css, so the surface itself becomes the scroller.
const MANY_BEFORE: Record<string, unknown> = Object.fromEntries(
	Array.from({ length: 30 }, (_, index) => [
		`MakerNotes:ShotSetting${index + 1}`,
		`Setting value ${index + 1}`,
	]),
);

export const ScrollsAtMaxHeight: Story = {
	parameters: {
		a11y: knownA11y("file-list-metadataexpansion--scrolls-at-max-height"),
	},
	args: { beforeMetadata: MANY_BEFORE, afterMetadata: {} },
	play: async ({ canvasElement }) => {
		await within(canvasElement).findByText("Copy all");
		await expect(await summaryText(canvasElement)).toBe(
			"30 fields removed · 0 fields still present",
		);
		const scroller = canvasElement.querySelector<HTMLElement>(
			".metadata-expansion",
		);
		await expect(scroller).not.toBeNull();
		if (scroller === null) throw new Error("scroller missing");
		await expect(getComputedStyle(scroller).maxHeight).toBe("300px");
		await expect(scroller.clientHeight).toBeLessThanOrEqual(300);
		await expect(scroller.scrollHeight).toBeGreaterThan(scroller.clientHeight);
	},
};

export const ArabicPlural: Story = {
	globals: { locale: "ar" },
	parameters: { a11y: knownA11y("file-list-metadataexpansion--arabic-plural") },
	args: {
		beforeMetadata: {
			"Camera:Make": "Canon",
			"GPS:GPSLatitude": "47 deg 36' 22.80\" N",
			"Image:Orientation": "Horizontal (normal)",
		},
		afterMetadata: { "Image:Orientation": "Horizontal (normal)" },
	},
	play: async ({ canvasElement }) => {
		await waitFor(() => expect(document.documentElement.dir).toBe("rtl"));
		await within(canvasElement).findByText(ar["copyAll"]);
		// Dual first because Arabic has the plural category two (72 hand-off); the general
		// plural is the fallback until ar.json carries one (formatMetadataCount's own).
		const arLookup: Readonly<Record<string, string | undefined>> = ar;
		const removed =
			arLookup["metadata.removed.two"] ?? ar["metadata.removed.other"];
		await expect(await summaryText(canvasElement)).toBe(
			`${removed.replace("{count}", "2")} · ${ar["metadata.present.one"].replace("{count}", "1")}`,
		);
	},
};

// D-10: `.metadata-expansion__copy-btn:focus-visible` (metadata_expansion.css line 43).
export const KeyboardFocus: Story = {
	parameters: {
		a11y: knownA11y("file-list-metadataexpansion--keyboard-focus"),
	},
	args: { beforeMetadata: CAMERA_BEFORE, afterMetadata: CAMERA_AFTER },
	play: async ({ canvasElement }) => {
		const button = await within(canvasElement).findByRole("button", {
			name: "Copy all",
		});
		await userEvent.tab();
		await expect(button).toHaveFocus();
		await expect(button.matches(":focus-visible")).toBe(true);
		await expect(getComputedStyle(button).outlineStyle).toBe("solid");
		await expect(getComputedStyle(button).outlineWidth).toBe("2px");
	},
};

// RESEARCH C2: `.metadata-expansion__copy-btn:hover` swaps the transparent background
// for `--ec-color-bg` (line 38), and a synthetic hover never matches :hover. Last in
// the file on purpose.
export const CopyHover: Story = {
	parameters: { a11y: knownA11y("file-list-metadataexpansion--copy-hover") },
	args: { beforeMetadata: CAMERA_BEFORE, afterMetadata: CAMERA_AFTER },
	play: async ({ canvasElement }) => {
		const button = await within(canvasElement).findByRole("button", {
			name: "Copy all",
		});
		const before = getComputedStyle(button).backgroundColor;
		await withRealHover(button, userEvent, async () => {
			await waitFor(() =>
				expect(getComputedStyle(button).backgroundColor).not.toBe(before),
			);
		});
	},
};
