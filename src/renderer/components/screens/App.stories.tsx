import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, spyOn, userEvent, waitFor, within } from "storybook/test";
import { App } from "../../App";
import { batch } from "../../story_support/boundary_data";
import { knownA11y } from "../../story_support/known_a11y";
import {
	FAILURE_CASES,
	OUTCOME_CASES,
} from "../../story_support/process_outcomes";
import { rowLabelFixture } from "../../story_support/row_label";
import { screenApi } from "../../story_support/screen_api";

// Real-App screens (Phase 73, D-08, D-13, STY-04). Every story renders the real `App`,
// with its own ThemeProvider, I18nProvider, AppProvider and ErrorBoundary, and reaches its
// state the way a person does: `parameters.mockApi.overrides` (built by `screenApi` from the
// shared outcome fixtures) answers the four calls the intake path makes, and the play really
// clicks `Choose files…`, so the real `processFileEntries` runs over the fixtures. No seam is
// added to the product: there is no initialState prop, no copied AppContent and no preview
// change.
//
// Stability rules (D-13): a play waits on DOM state only and never asserts the elapsed
// seconds segment (a 100 ms interval); no story starts the 1500 ms folder auto-collapse or
// the 2000 and 3000 ms toast timers (those belong to the journey and e2e proof); no screen
// clicks a sort header, so the sort state stays null and rows keep the order the paths were
// returned in (FileTable.tsx). Row names are asserted for terminal rows only: a Pending,
// Reading or Processing row is announced as a pending file (FileRow.tsx falls back to the
// pending status key, the 73-02 progress-row-name finding), so those rows are found through
// their status icon label instead. In the status bar only the cleaned and tags-removed
// segments are read, by their data-stat attributes.
//
// Frame (D-20 spike): inside a 580 px frame the App's width follows the frame (measured
// 580 px against 1200 px unframed); its height stays the viewport height, app.css sets
// `height: 100vh`. The recorded findings are in 73-EVIDENCE.md.
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
				transform: "translateZ(0)",
			}}
		>
			{children}
		</div>
	);
}

const meta = {
	title: "Screens/App",
	component: App,
	render: () => (
		<WindowFrame>
			<App />
		</WindowFrame>
	),
} satisfies Meta<typeof App>;

// Framework-mandated default export (CSF: Storybook reads the story file's default export).
export default meta;

type Story = StoryObj<typeof meta>;

// The accessible name of each body row, in DOM order (FileRow puts `${name}. ${summary}`
// in the row's aria-label).
function rowNames(canvasElement: HTMLElement): string[] {
	return Array.from(
		canvasElement.querySelectorAll(".file-table__body .file-table__row"),
	).map((row) => row.getAttribute("aria-label") ?? "");
}

async function chooseFiles(canvasElement: HTMLElement): Promise<void> {
	await userEvent.click(
		await within(canvasElement).findByRole("button", {
			name: "Choose files…",
		}),
	);
}

function statusSegment(canvasElement: HTMLElement, stat: string): string {
	return canvasElement.querySelector(`[data-stat=${stat}]`)?.textContent ?? "";
}

// Three files that all fail, one per failure kind the hook maps: the status bar counts
// only cleaned files, so it reads zero of three and shows no failure count (finding in
// 73-EVIDENCE.md).
export const AllError: Story = {
	parameters: {
		a11y: knownA11y("screens-app--all-error"),
		mockApi: {
			overrides: screenApi({
				files: [
					{
						path: "/files/alpha.jpg",
						size: 2048,
						fixtureCase: FAILURE_CASES.verification,
					},
					{
						path: "/files/bravo.png",
						size: 4096,
						fixtureCase: FAILURE_CASES.write,
					},
					{
						path: "/files/charlie.webp",
						size: 8192,
						fixtureCase: FAILURE_CASES.cleanup,
					},
				],
			}),
		},
		copyLint: {
			fixtureText: [
				...rowLabelFixture("alpha.jpg", "verificationFailedSummary"),
				...rowLabelFixture("bravo.png", "writeFailedSummary"),
				...rowLabelFixture("charlie.webp", "cleanupFailedSummary"),
				// The engine detail FileRow puts in each failed row's title attribute.
				"Generated output verification failed",
				"Generated output write failed",
				"Generated output cleanup failed",
			],
		},
	},
	play: async ({ canvasElement }) => {
		await chooseFiles(canvasElement);
		// Insertion order: no header was clicked and all three rows are one rank (Error).
		await waitFor(() =>
			expect(rowNames(canvasElement)).toEqual([
				"alpha.jpg. Couldn’t verify cleaned output. The incomplete copy was removed; your original is unchanged.",
				"bravo.png. Couldn’t write the cleaned output. Your original is unchanged.",
				"charlie.webp. Couldn’t verify cleaned output, and the incomplete output could not be removed. Your original is unchanged.",
			]),
		);
		await expect(statusSegment(canvasElement, "cleaned")).toBe(
			"0 of 3 cleaned",
		);
		await expect(statusSegment(canvasElement, "tags-removed")).toBe(
			"0 tags removed",
		);
	},
};

// A completed row's label when the fixture reports a copy as the output (the cleaned case):
// FileRow adds the copy disclosure to the row name (FileRow.tsx).
function copyLabel(name: string): string {
	return `${name}. Metadata removed. Written to a copy.`;
}

// The label FileRow gives a row that is still Pending, Reading or Processing: the pending
// status key (FileRow.tsx), which is why such a row is found through its status icon and
// its name appears only here, as copy-lint fixture text.
function pendingLabel(name: string): string {
	return `${name}. Pending`;
}

// Time to wait for a chain of mocked intake calls and dispatches on a starved host. The
// fixtures answer at once, so this only bounds a slow machine, never a timing assertion.
const FLOW = { timeout: 10_000 };

function completeRows(canvasElement: HTMLElement): NodeListOf<Element> {
	return canvasElement.querySelectorAll(".file-table__row--complete");
}

function bodyRows(canvasElement: HTMLElement): Element[] {
	return Array.from(
		canvasElement.querySelectorAll(".file-table__body .file-table__row"),
	);
}

// No file chosen: the empty screen the app opens on, with no row and no Clear button.
export const Empty: Story = {
	parameters: { a11y: knownA11y("screens-app--empty") },
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(
			await canvas.findByRole("heading", { name: "Add files to clean" }),
		).toBeVisible();
		await expect(canvas.queryAllByRole("row")).toHaveLength(0);
		await expect(canvas.queryByRole("button", { name: "Clear" })).toBeNull();
	},
};

// A run under way: the third file never settles, so exactly two rows are complete and the
// third shows Processing for as long as the story is open. The hook processes in order,
// so a held file leaves the rows after it Pending; this one is last. The play waits for the
// two complete rows first, because the first row also passes through Processing, and finds
// the held row through its status icon, never through its name.
const MID_BATCH_FILES = [
	{
		path: "/files/alpha.jpg",
		size: 2048,
		fixtureCase: OUTCOME_CASES.cleaned,
	},
	{
		path: "/files/bravo.png",
		size: 4096,
		fixtureCase: OUTCOME_CASES.unchanged,
	},
	{
		path: "/files/charlie.webp",
		size: 8192,
		fixtureCase: OUTCOME_CASES.cleaned,
	},
];

export const MidBatch: Story = {
	parameters: {
		a11y: knownA11y("screens-app--mid-batch"),
		mockApi: {
			overrides: screenApi({
				files: MID_BATCH_FILES,
				hold: ["/files/charlie.webp"],
			}),
		},
		copyLint: {
			fixtureText: [
				copyLabel("alpha.jpg"),
				...rowLabelFixture("bravo.png", "outcome.unchanged"),
				pendingLabel("charlie.webp"),
			],
		},
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await chooseFiles(canvasElement);
		await waitFor(
			() => expect(completeRows(canvasElement)).toHaveLength(2),
			FLOW,
		);
		const rows = bodyRows(canvasElement);
		await expect(rows).toHaveLength(3);
		// Insertion order, terminal rows only (the held row's name is never asserted).
		await expect(
			rows.slice(0, 2).map((row) => row.getAttribute("aria-label")),
		).toEqual([
			"alpha.jpg. Metadata removed. Written to a copy.",
			"bravo.png. No measured metadata was removed",
		]);
		const held = rows[2];
		if (held === undefined) throw new Error("the third row is missing");
		await expect(
			within(held as HTMLElement).getByRole("img", { name: "Processing" }),
		).toBeVisible();
		await expect(
			canvas.getAllByRole("img", { name: "Processing" }),
		).toHaveLength(1);
		// Clear is offered, and enabled, while a row is still Processing.
		await expect(canvas.getByRole("button", { name: "Clear" })).toBeEnabled();
		await expect(statusSegment(canvasElement, "cleaned")).toBe(
			"1 of 3 cleaned",
		);
		await expect(statusSegment(canvasElement, "tags-removed")).toBe(
			"2 tags removed",
		);
	},
};

// A finished run: a cleaned copy, a file with nothing removed and a file that had no
// metadata, so every row is terminal and the footer holds still (the timer stops).
const ALL_DONE_FILES = [
	{
		path: "/files/alpha.jpg",
		size: 2048,
		fixtureCase: OUTCOME_CASES.cleaned,
	},
	{
		path: "/files/bravo.png",
		size: 4096,
		fixtureCase: OUTCOME_CASES.unchanged,
	},
	{
		path: "/files/charlie.webp",
		size: 8192,
		fixtureCase: OUTCOME_CASES["already-clean"],
	},
];

export const AllDone: Story = {
	parameters: {
		a11y: knownA11y("screens-app--all-done"),
		mockApi: { overrides: screenApi({ files: ALL_DONE_FILES }) },
		copyLint: {
			fixtureText: [
				copyLabel("alpha.jpg"),
				...rowLabelFixture("bravo.png", "outcome.unchanged"),
				...rowLabelFixture("charlie.webp", "outcome.alreadyClean"),
			],
		},
	},
	play: async ({ canvasElement }) => {
		await chooseFiles(canvasElement);
		await waitFor(
			() =>
				expect(rowNames(canvasElement)).toEqual([
					"alpha.jpg. Metadata removed. Written to a copy.",
					"bravo.png. No measured metadata was removed",
					"charlie.webp. No removable metadata found; the file was not rewritten",
				]),
			FLOW,
		);
		// Only the cleaned file counts as cleaned: the other two are terminal but
		// are not outcomeKind cleaned (App.tsx), so the footer reads one of three.
		await expect(statusSegment(canvasElement, "cleaned")).toBe(
			"1 of 3 cleaned",
		);
		await expect(statusSegment(canvasElement, "tags-removed")).toBe(
			"2 tags removed",
		);
	},
};

// The gear opens the real drawer on the real App; the content behind it is hidden from
// assistive technology while it is open (App.tsx aria-hidden).
export const DrawerOpen: Story = {
	parameters: { a11y: knownA11y("screens-app--drawer-open") },
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await userEvent.click(
			await canvas.findByRole("button", { name: "Open settings" }),
		);
		await expect(await canvas.findByRole("dialog")).toHaveAccessibleName(
			"Settings",
		);
	},
};

// What a failed preload would cause: window.api.platform is undefined, so the real
// SettingsDrawer throws a real TypeError (SettingsDrawer.tsx reads `isMac` on every
// render) inside the real App's own ErrorBoundary, which replaces <main>. Nothing in the
// product changes. The preview's own beforeEach builds a fresh mock per story and its
// cleanup deletes window.api, so the mutation cannot leak into another story. The console
// spy keeps the expected React and boundary logging out of the run and proves the
// boundary caught a thrown error.
let errorSpy: ReturnType<typeof installSpy> | undefined;

function installSpy() {
	return spyOn(console, "error").mockImplementation(() => undefined);
}

export const ErrorBoundaryFailure: Story = {
	beforeEach: () => {
		errorSpy = installSpy();
		Reflect.set(window.api, "platform", undefined);
	},
	parameters: { a11y: knownA11y("screens-app--error-boundary-failure") },
	play: async ({ canvasElement }) => {
		const alert = await within(canvasElement).findByRole("alert");
		await expect(alert).toHaveTextContent("isMac");
		if (errorSpy === undefined)
			throw new Error("the console.error spy is not set");
		await expect(errorSpy).toHaveBeenCalled();
	},
};

// 100 rows, the largest batch any story draws (the scan costs about 10 ms per row per
// theme): every file is cleaned except the last, which is held, so 99 rows are complete
// and the last shows Processing. The hook is sequential, so a held file earlier in the
// list would leave every later row Pending. No error row, so no failure label is needed
// (D-15). The play waits for the 99 complete rows, since the first row also passes
// through Processing, and asserts the row count and that every name is distinct, so a
// builder that returned no rows turns it red.
const LARGE_ENTRIES = batch(100);
const LARGE_FILES = LARGE_ENTRIES.map(({ path, size }) => ({
	path,
	size,
	fixtureCase: OUTCOME_CASES.cleaned,
}));
const LARGE_HELD = LARGE_ENTRIES.at(-1)?.path ?? "";

export const LargeBatch: Story = {
	parameters: {
		a11y: knownA11y("screens-app--large-batch"),
		mockApi: {
			overrides: screenApi({ files: LARGE_FILES, hold: [LARGE_HELD] }),
		},
		copyLint: {
			fixtureText: LARGE_ENTRIES.map(({ name, path }) =>
				path === LARGE_HELD ? pendingLabel(name) : copyLabel(name),
			),
		},
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await chooseFiles(canvasElement);
		await waitFor(() => expect(completeRows(canvasElement)).toHaveLength(99), {
			timeout: 30_000,
		});
		await expect(bodyRows(canvasElement)).toHaveLength(100);
		const names = new Set(
			Array.from(
				canvasElement.querySelectorAll("bdi.file-table__name-text"),
			).map((element) => element.textContent),
		);
		await expect(names.size).toBe(100);
		await expect(
			canvas.getAllByRole("img", { name: "Processing" }),
		).toHaveLength(1);
	},
};
