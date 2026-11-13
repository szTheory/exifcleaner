import type { Meta, StoryObj } from "@storybook/react-vite";
import { useLayoutEffect, useState } from "react";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import "../../styles/settings_drawer.css";
import { FileProcessingStatus } from "../../../domain";
import type {
	FileEntry,
	FolderDiscoveryStatus,
} from "../../contexts/AppContext";
import { AppProvider, useAppContext } from "../../contexts/AppContext";
import { batch } from "../../story_support/boundary_data";
import { knownA11y } from "../../story_support/known_a11y";
import {
	GENERIC_FAILURE,
	OUTCOME_CASES,
	entryFor,
	fileEntry,
} from "../../story_support/process_outcomes";
import { withRealHover } from "../../story_support/real_pointer";
import { GearIcon } from "../icons/GearIcon";
import { StatusBar } from "../ui/StatusBar";
import { FileTable } from "./FileTable";

// FileTable renders the real table under the real AppProvider, seeded through the real
// reducer (D-08): `Seed` dispatches CLEAR_FILES, then ADD_FILES and one UPDATE_FOLDER_STATE
// per folder, and renders its children only once that has happened. AppContext itself is
// not exported, so dispatch-seeding is the only route without a product edit.
//
// Ordering facts these stories rest on (FileTable.tsx): the sort state starts null and
// sortFiles returns its input unchanged when it is null, so before any header click rows
// appear in insertion order; the first click on a header sorts ascending and a second
// click on the same header descending; after a click the header button's name becomes
// `<label>. <Sorted ascending|descending>`; compareTerminalState ranks Complete and
// NoMetadataFound first, then Pending, Reading and Processing, then Error, before the sort
// key, so the key order only shows among rows of one status and the rank never flips with
// the direction. Every sorting story therefore seeds an insertion order that its asserted
// order differs from, so a sort that did nothing turns it red.
//
// Unreachable or duplicate cells are waivers, never drawn: a table with no rows and no
// folder is never shown (App shows EmptyState instead), the failure, refusal and stale
// rows are FileRow stories, the sizes and counts that stress a cell are FileRow stories
// and the 100-row batch is the App screen. The 2000 ms toast is never asserted (D-13).
// The recorded findings (fa header wrap and alignment, no plural form) are in
// 73-EVIDENCE.md.
function WindowFrame({
	children,
}: {
	children: React.ReactNode;
}): React.JSX.Element {
	return (
		<div
			style={{
				position: "relative",
				width: "580px",
				minHeight: "312px",
				transform: "translateZ(0)",
			}}
		>
			{children}
		</div>
	);
}

type SeedFolder = {
	folder: string;
	status: FolderDiscoveryStatus;
	fileCount: number;
};

function Seed({
	files,
	folders = [],
	children,
}: {
	files: FileEntry[];
	folders?: SeedFolder[];
	children: React.ReactNode;
}): React.JSX.Element | null {
	const { dispatch } = useAppContext();
	const [ready, setReady] = useState(false);
	useLayoutEffect(() => {
		// Clearing first keeps a StrictMode double effect at exactly the seeded rows.
		dispatch({ type: "CLEAR_FILES" });
		dispatch({ type: "ADD_FILES", files });
		for (const entry of folders) {
			dispatch({
				type: "UPDATE_FOLDER_STATE",
				folder: entry.folder,
				status: entry.status,
				fileCount: entry.fileCount,
			});
		}
		setReady(true);
		// Seeded once per mount: the arguments are constants of the story.
	}, []);
	return ready ? <>{children}</> : null;
}

function Scene({
	files,
	folders,
	withStatusBar = false,
}: {
	files: FileEntry[];
	folders?: SeedFolder[];
	withStatusBar?: boolean;
}): React.JSX.Element {
	return (
		<AppProvider>
			<Seed files={files} {...(folders === undefined ? {} : { folders })}>
				<WindowFrame>
					<FileTable />
					{withStatusBar && (
						<StatusBar
							gearIcon={<GearIcon isOpen={false} onClick={fn()} />}
							completedCount={2}
							totalCount={6}
							totalTagsRemoved={4}
							elapsedSeconds={3}
							onCleanMore={fn()}
						/>
					)}
				</WindowFrame>
			</Seed>
		</AppProvider>
	);
}

const meta = {
	title: "File list/FileTable",
	component: FileTable,
} satisfies Meta<typeof FileTable>;

// Framework-mandated default export (CSF: Storybook reads the story file's default export).
export default meta;

type Story = StoryObj<typeof meta>;

// A file cleaned in place: the fold of the cleaned case writes the copy's path as
// outputPath, so the path is put back after the fold (F-04) and no row carries the
// copy-mode disclosure.
function done(name: string, size = 1024): FileEntry {
	const path = `/files/${name}`;
	return {
		...entryFor(OUTCOME_CASES.cleaned, { id: `id-${name}`, path, name, size }),
		outputPath: path,
	};
}

function pending(name: string): FileEntry {
	return fileEntry({
		id: `id-${name}`,
		path: `/files/${name}`,
		name,
		status: FileProcessingStatus.Pending,
	});
}

function failed(name: string): FileEntry {
	return entryFor(GENERIC_FAILURE, {
		id: `id-${name}`,
		path: `/files/${name}`,
		name,
	});
}

function inFolder(entry: FileEntry, folder: string): FileEntry {
	return { ...entry, folder };
}

function names(canvasElement: HTMLElement): string[] {
	return Array.from(
		canvasElement.querySelectorAll(".file-table__body .file-table__name-text"),
	).map((element) => element.textContent ?? "");
}

// The column header cells in order: status (no label), name, type, size, before, after.
const HEADER = { name: 1, size: 3 } as const;

async function headerCell(
	canvasElement: HTMLElement,
	index: number,
): Promise<HTMLElement> {
	const cells = await within(canvasElement).findAllByRole("columnheader");
	const cell = cells[index];
	if (cell === undefined) throw new Error(`no column header ${index}`);
	return cell;
}

async function clickHeader(
	canvasElement: HTMLElement,
	index: number,
): Promise<void> {
	const cell = await headerCell(canvasElement, index);
	await userEvent.click(within(cell).getByRole("button"));
}

async function expectNames(
	canvasElement: HTMLElement,
	expected: string[],
): Promise<void> {
	await waitFor(() => expect(names(canvasElement)).toEqual(expected));
}

export const MixedStatuses: Story = {
	render: () => (
		<Scene files={[failed("err.jpg"), pending("pend.jpg"), done("done.jpg")]} />
	),
	parameters: {
		a11y: knownA11y("file-list-filetable--mixed-statuses"),
		copyLint: {
			fixtureText: [
				"err.jpg. ExifTool crashed unexpectedly. Restart the app to retry.",
				"ExifTool crashed unexpectedly. Restart the app to retry.",
				"pend.jpg. Pending",
				"done.jpg. Metadata removed",
			],
		},
	},
	play: async ({ canvasElement }) => {
		// Unsorted: the seeded order shows, with no click and an Error row first.
		await expectNames(canvasElement, ["err.jpg", "pend.jpg", "done.jpg"]);
		// StrictMode safety: the store was cleared before seeding, so the row count is
		// exactly the seeded count.
		await expect(
			canvasElement.querySelectorAll(".file-table__body .file-table__row"),
		).toHaveLength(3);
		await expect(
			(await headerCell(canvasElement, HEADER.name)).getAttribute("aria-sort"),
		).toBe("none");
		// Vacuity guard for the right-to-left frames below.
		await expect(document.documentElement.dir).toBe("ltr");
	},
};

export const SortByNameAscending: Story = {
	render: () => (
		<Scene
			files={[done("charlie.jpg"), done("alpha.jpg"), done("bravo.jpg")]}
		/>
	),
	parameters: {
		a11y: knownA11y("file-list-filetable--sort-by-name-ascending"),
		copyLint: {
			fixtureText: [
				"charlie.jpg. Metadata removed",
				"alpha.jpg. Metadata removed",
				"bravo.jpg. Metadata removed",
			],
		},
	},
	play: async ({ canvasElement }) => {
		await expectNames(canvasElement, ["charlie.jpg", "alpha.jpg", "bravo.jpg"]);
		await clickHeader(canvasElement, HEADER.name);
		await expectNames(canvasElement, ["alpha.jpg", "bravo.jpg", "charlie.jpg"]);
		await expect(await headerCell(canvasElement, HEADER.name)).toHaveAttribute(
			"aria-sort",
			"ascending",
		);
	},
};

export const SortByNameDescending: Story = {
	render: () => (
		<Scene
			files={[done("bravo.jpg"), done("alpha.jpg"), done("charlie.jpg")]}
		/>
	),
	parameters: {
		a11y: knownA11y("file-list-filetable--sort-by-name-descending"),
		copyLint: {
			fixtureText: [
				"charlie.jpg. Metadata removed",
				"alpha.jpg. Metadata removed",
				"bravo.jpg. Metadata removed",
			],
		},
	},
	play: async ({ canvasElement }) => {
		await expectNames(canvasElement, ["bravo.jpg", "alpha.jpg", "charlie.jpg"]);
		await clickHeader(canvasElement, HEADER.name);
		await expectNames(canvasElement, ["alpha.jpg", "bravo.jpg", "charlie.jpg"]);
		// The second click on the same header reverses the direction; the button's name
		// is now `Name. Sorted ascending`, so it is found through its column header.
		await clickHeader(canvasElement, HEADER.name);
		await expectNames(canvasElement, ["charlie.jpg", "bravo.jpg", "alpha.jpg"]);
		await expect(await headerCell(canvasElement, HEADER.name)).toHaveAttribute(
			"aria-sort",
			"descending",
		);
	},
};

// Two rows of equal size: sortFiles falls back to the insertion index (FileTable.tsx, the
// `left.index - right.index` tie-break), so the pair keeps its seeded order while the
// smaller row moves ahead of both.
export const SortBySizeWithTie: Story = {
	render: () => (
		<Scene
			files={[
				done("zeta.jpg", 500),
				done("alpha.jpg", 500),
				done("mid.jpg", 100),
			]}
		/>
	),
	parameters: {
		a11y: knownA11y("file-list-filetable--sort-by-size-with-tie"),
		copyLint: {
			fixtureText: [
				"zeta.jpg. Metadata removed",
				"alpha.jpg. Metadata removed",
				"mid.jpg. Metadata removed",
			],
		},
	},
	play: async ({ canvasElement }) => {
		await expectNames(canvasElement, ["zeta.jpg", "alpha.jpg", "mid.jpg"]);
		await clickHeader(canvasElement, HEADER.size);
		await expectNames(canvasElement, ["mid.jpg", "zeta.jpg", "alpha.jpg"]);
		await expect(await headerCell(canvasElement, HEADER.size)).toHaveAttribute(
			"aria-sort",
			"ascending",
		);
	},
};

// F-05: toggling a header twice reverses the key order inside a rank and never the rank
// order. A broken rank rule would leave the Error row first and turn this red.
export const SortTwiceKeepsRank: Story = {
	render: () => (
		<Scene
			files={[
				failed("err.jpg"),
				done("zulu.jpg"),
				pending("pend.jpg"),
				done("alpha.jpg"),
			]}
		/>
	),
	parameters: {
		a11y: knownA11y("file-list-filetable--sort-twice-keeps-rank"),
		copyLint: {
			fixtureText: [
				"err.jpg. ExifTool crashed unexpectedly. Restart the app to retry.",
				"ExifTool crashed unexpectedly. Restart the app to retry.",
				"zulu.jpg. Metadata removed",
				"pend.jpg. Pending",
				"alpha.jpg. Metadata removed",
			],
		},
	},
	play: async ({ canvasElement }) => {
		await expectNames(canvasElement, [
			"err.jpg",
			"zulu.jpg",
			"pend.jpg",
			"alpha.jpg",
		]);
		await clickHeader(canvasElement, HEADER.name);
		await expectNames(canvasElement, [
			"alpha.jpg",
			"zulu.jpg",
			"pend.jpg",
			"err.jpg",
		]);
		await clickHeader(canvasElement, HEADER.name);
		await expectNames(canvasElement, [
			"zulu.jpg",
			"alpha.jpg",
			"pend.jpg",
			"err.jpg",
		]);
	},
};

const TRIP = "Trip 2026/";

function countOf(canvasElement: HTMLElement): HTMLElement {
	const count = canvasElement.querySelector(".folder-row__count");
	if (!(count instanceof HTMLElement)) throw new Error("no folder count");
	return count;
}

export const FolderScanning: Story = {
	render: () => (
		<Scene
			files={[]}
			folders={[{ folder: TRIP, status: "scanning", fileCount: 0 }]}
		/>
	),
	parameters: { a11y: knownA11y("file-list-filetable--folder-scanning") },
	play: async ({ canvasElement }) => {
		await within(canvasElement).findByRole("button", {
			name: `Collapse ${TRIP}`,
		});
		await expect(countOf(canvasElement)).toHaveTextContent("Scanning…");
		await expect(names(canvasElement)).toEqual([]);
	},
};

export const FolderEmpty: Story = {
	render: () => (
		<Scene
			files={[]}
			folders={[{ folder: TRIP, status: "empty", fileCount: 0 }]}
		/>
	),
	parameters: { a11y: knownA11y("file-list-filetable--folder-empty") },
	play: async ({ canvasElement }) => {
		await within(canvasElement).findByRole("button", {
			name: `Collapse ${TRIP}`,
		});
		await expect(countOf(canvasElement)).toHaveTextContent("0 supported files");
		await expect(names(canvasElement)).toEqual([]);
	},
};

export const FolderComplete: Story = {
	render: () => (
		<Scene
			files={[inFolder(done("one.jpg"), TRIP), inFolder(done("two.jpg"), TRIP)]}
			folders={[{ folder: TRIP, status: "complete", fileCount: 2 }]}
		/>
	),
	parameters: {
		a11y: knownA11y("file-list-filetable--folder-complete"),
		copyLint: {
			fixtureText: ["one.jpg. Metadata removed", "two.jpg. Metadata removed"],
		},
	},
	play: async ({ canvasElement }) => {
		await within(canvasElement).findByRole("button", {
			name: `Collapse ${TRIP}`,
		});
		await expect(countOf(canvasElement)).toHaveTextContent("2 files");
		await expectNames(canvasElement, ["one.jpg", "two.jpg"]);
	},
};

// Locale frames (D-18): the same six rows in a table and a status bar at the default
// window width. The plays assert the row count, the document's lang and dir and that the
// cells are not empty; they never assert a row's name or any translated word, and the
// rows are fixtures, so nothing here is a finding about a file.
async function expectBatchFrame({
	canvasElement,
	lang,
	dir,
}: {
	canvasElement: HTMLElement;
	lang: string;
	dir: "ltr" | "rtl";
}): Promise<void> {
	await waitFor(() => expect(document.documentElement.dir).toBe(dir));
	await expect(document.documentElement.lang).toBe(lang);
	await waitFor(() =>
		expect(
			canvasElement.querySelectorAll(".file-table__body .file-table__row"),
		).toHaveLength(6),
	);
	for (const row of Array.from(
		canvasElement.querySelectorAll(".file-table__body .file-table__row"),
	)) {
		for (const selector of [
			".file-table__cell--name",
			".file-table__cell--size",
		]) {
			await expect(row.querySelector(selector)?.textContent).not.toBe("");
		}
	}
	await expect(
		canvasElement.querySelector(".status-bar__summary")?.textContent,
	).not.toBe("");
}

export const GermanBatch: Story = {
	globals: { locale: "de" },
	render: () => <Scene files={batch(6)} withStatusBar />,
	parameters: { a11y: knownA11y("file-list-filetable--german-batch") },
	play: async ({ canvasElement }) => {
		await expectBatchFrame({ canvasElement, lang: "de", dir: "ltr" });
	},
};

export const HungarianBatch: Story = {
	globals: { locale: "hu" },
	render: () => <Scene files={batch(6)} withStatusBar />,
	parameters: { a11y: knownA11y("file-list-filetable--hungarian-batch") },
	play: async ({ canvasElement }) => {
		await expectBatchFrame({ canvasElement, lang: "hu", dir: "ltr" });
	},
};

export const ArabicBatch: Story = {
	globals: { locale: "ar" },
	render: () => <Scene files={batch(6)} withStatusBar />,
	parameters: { a11y: knownA11y("file-list-filetable--arabic-batch") },
	play: async ({ canvasElement }) => {
		await expectBatchFrame({ canvasElement, lang: "ar", dir: "rtl" });
	},
};

export const PersianBatch: Story = {
	globals: { locale: "fa" },
	render: () => <Scene files={batch(6)} withStatusBar />,
	parameters: { a11y: knownA11y("file-list-filetable--persian-batch") },
	play: async ({ canvasElement }) => {
		await expectBatchFrame({ canvasElement, lang: "fa", dir: "rtl" });
	},
};

export const JapaneseBatch: Story = {
	globals: { locale: "ja" },
	render: () => <Scene files={batch(6)} withStatusBar />,
	parameters: { a11y: knownA11y("file-list-filetable--japanese-batch") },
	play: async ({ canvasElement }) => {
		await expectBatchFrame({ canvasElement, lang: "ja", dir: "ltr" });
	},
};

// D-10: `.file-table__sort-button:focus-visible` (file_table.css). The sort buttons are
// the first focusable elements of the table, so one Tab reaches the Name button.
export const SortButtonKeyboardFocus: Story = {
	render: () => <Scene files={[done("alpha.jpg"), done("bravo.jpg")]} />,
	parameters: {
		a11y: knownA11y("file-list-filetable--sort-button-keyboard-focus"),
		copyLint: {
			fixtureText: [
				"alpha.jpg. Metadata removed",
				"bravo.jpg. Metadata removed",
			],
		},
	},
	play: async ({ canvasElement }) => {
		const cell = await headerCell(canvasElement, HEADER.name);
		const button = within(cell).getByRole("button");
		await userEvent.tab();
		await expect(button).toHaveFocus();
		await expect(button.matches(":focus-visible")).toBe(true);
		await expect(getComputedStyle(button).outlineStyle).toBe("solid");
	},
};

// `.file-table__sort-button:hover` changes the colour (file_table.css), and a synthetic
// hover never matches :hover, so withRealHover moves a real pointer onto the button.
// Last in the file on purpose. The row's own hover rule is the FileRow RowHover story.
export const HeaderHover: Story = {
	render: () => <Scene files={[done("alpha.jpg"), done("bravo.jpg")]} />,
	parameters: {
		a11y: knownA11y("file-list-filetable--header-hover"),
		copyLint: {
			fixtureText: [
				"alpha.jpg. Metadata removed",
				"bravo.jpg. Metadata removed",
			],
		},
	},
	play: async ({ canvasElement }) => {
		const cell = await headerCell(canvasElement, HEADER.name);
		const button = within(cell).getByRole("button");
		const before = getComputedStyle(button).color;
		await withRealHover(button, userEvent, async () => {
			await waitFor(() =>
				expect(getComputedStyle(button).color).not.toBe(before),
			);
		});
	},
};
