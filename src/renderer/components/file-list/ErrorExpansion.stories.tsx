import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, within } from "storybook/test";
import { knownA11y } from "../../story_support/known_a11y";
import {
	FAILURE_CASES,
	GENERIC_FAILURE,
	entryFor,
	errorTextFor,
} from "../../story_support/process_outcomes";
import { ErrorExpansion } from "./ErrorExpansion";

// ErrorExpansion takes only a string (D-14): the per-kind summaries, labels and the
// reveal control belong to FileRow (Phase 73). Each story's `error` is the text
// FileRow would hand it for that failure, built through the real reducer by the
// shared fixtures; a `failureKind` change cannot reach these stories (RESEARCH C3),
// so D-05's union test is what notices a new kind. Every play asserts a hard-coded
// literal, never one computed from the fixture, so corrupting a fixture turns the
// story red instead of agreeing with itself (SC3).
const meta = {
	title: "File list/ErrorExpansion",
	component: ErrorExpansion,
	args: { error: "", onCopy: fn() },
} satisfies Meta<typeof ErrorExpansion>;

// Framework-mandated default export (CSF: Storybook reads the story file's default export).
export default meta;

type Story = StoryObj<typeof meta>;

async function expectDetail(
	canvasElement: HTMLElement,
	literal: string,
): Promise<void> {
	const canvas = within(canvasElement);
	const detail = canvasElement.querySelector("pre");
	await expect(detail).not.toBeNull();
	await expect(detail?.textContent).toBe(literal);
	await expect(canvas.getByText("Click to copy")).toBeInTheDocument();
}

const LONG_PATH =
	"/Users/example/Pictures/2024/Summer holiday in the mountains/RAW exports/very-long-camera-file-name-IMG_2041_final_edit_v3.HEIC.exifcleaner-stage-3f9c1a2e-7b64-4d0a-9c2e-1f5a8d7b6e90.HEIC";

export const Write: Story = {
	parameters: {
		a11y: knownA11y("file-list-errorexpansion--write"),
		copyLint: {
			fixtureText: [
				"Generated output write failed",
				"/path/to/incomplete-output.jpg",
			],
		},
	},
	args: { error: errorTextFor(entryFor(FAILURE_CASES.write)) },
	play: async ({ canvasElement }) => {
		await expectDetail(
			canvasElement,
			"Generated output write failed: /path/to/incomplete-output.jpg",
		);
	},
};

export const Verification: Story = {
	parameters: {
		a11y: knownA11y("file-list-errorexpansion--verification"),
		copyLint: { fixtureText: ["Generated output verification failed"] },
	},
	args: { error: errorTextFor(entryFor(FAILURE_CASES.verification)) },
	play: async ({ canvasElement }) => {
		await expectDetail(canvasElement, "Generated output verification failed");
	},
};

export const Cleanup: Story = {
	parameters: {
		a11y: knownA11y("file-list-errorexpansion--cleanup"),
		copyLint: {
			fixtureText: [
				"Generated output cleanup failed",
				"/path/to/incomplete-output.jpg",
			],
		},
	},
	args: { error: errorTextFor(entryFor(FAILURE_CASES.cleanup)) },
	play: async ({ canvasElement }) => {
		await expectDetail(
			canvasElement,
			"Generated output cleanup failed: /path/to/incomplete-output.jpg",
		);
	},
};

export const Commit: Story = {
	parameters: {
		a11y: knownA11y("file-list-errorexpansion--commit"),
		copyLint: { fixtureText: ["Generated output commit failed"] },
	},
	args: { error: errorTextFor(entryFor(FAILURE_CASES.commit)) },
	play: async ({ canvasElement }) => {
		await expectDetail(canvasElement, "Generated output commit failed");
	},
};

export const Xattr: Story = {
	parameters: {
		a11y: knownA11y("file-list-errorexpansion--xattr"),
		copyLint: {
			fixtureText: [
				"Embedded metadata was removed, but macOS extended attributes could not be cleared: Operation not permitted",
			],
		},
	},
	args: { error: errorTextFor(entryFor(FAILURE_CASES.xattr)) },
	play: async ({ canvasElement }) => {
		await expectDetail(
			canvasElement,
			"Embedded metadata was removed, but macOS extended attributes could not be cleared: Operation not permitted: /path/to/cleaned.jpg",
		);
	},
};

export const Refused: Story = {
	parameters: {
		a11y: knownA11y("file-list-errorexpansion--refused"),
	},
	args: { error: errorTextFor(entryFor(FAILURE_CASES.refused)) },
	play: async ({ canvasElement }) => {
		await expectDetail(
			canvasElement,
			"RAF metadata removal is disabled because writing this format can damage the original. The file was left unchanged.",
		);
	},
};

export const GenericFailure: Story = {
	parameters: {
		a11y: knownA11y("file-list-errorexpansion--generic-failure"),
	},
	args: { error: errorTextFor(entryFor(GENERIC_FAILURE)) },
	play: async ({ canvasElement }) => {
		await expectDetail(
			canvasElement,
			"ExifTool crashed unexpectedly. Restart the app to retry.",
		);
	},
};

export const LongDetail: Story = {
	parameters: {
		a11y: knownA11y("file-list-errorexpansion--long-detail"),
		copyLint: { fixtureText: ["Generated output cleanup failed"] },
	},
	args: {
		error: errorTextFor({
			...entryFor(FAILURE_CASES.cleanup),
			residualPath: LONG_PATH,
		}),
	},
	play: async ({ canvasElement }) => {
		await expectDetail(
			canvasElement,
			`Generated output cleanup failed: ${LONG_PATH}`,
		);
	},
};
