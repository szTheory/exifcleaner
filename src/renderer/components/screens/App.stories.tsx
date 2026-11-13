import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { App } from "../../App";
import { knownA11y } from "../../story_support/known_a11y";
import { FAILURE_CASES } from "../../story_support/process_outcomes";
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
