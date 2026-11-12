import { composeStories, setProjectAnnotations } from "@storybook/react-vite";
import * as a11yAnnotations from "@storybook/addon-a11y/preview";
import { expect, test } from "vitest";
import { collectCopyUnits } from "./catalog/copy_lint_dom";
import preview from "./preview";
import * as fixtureStories from "./fixtures/copy_lint_violation.stories";

// Runs in the `storybook-a11y-gate` browser project (the plain project: the
// planted stories are outside the catalog glob). The annotations are the real
// preview plus the addon's, so this proves the hook that gates the real stories
// also fails a violating story. A throw in afterEach is what rejects run().
setProjectAnnotations([a11yAnnotations, preview]);
const {
	Planted,
	Clean,
	FixtureText,
	FixtureTextUnexcused,
	FixtureTextLeak,
	DisableIgnored,
	NonEnglish,
	Empty,
} = composeStories(fixtureStories);

test("shown red: Planted rejects with banned.just", async () => {
	await expect(Planted.run()).rejects.toThrow(/banned\.just/);
});

test("shown red: FixtureTextUnexcused rejects (a real hit without the excuse)", async () => {
	await expect(FixtureTextUnexcused.run()).rejects.toThrow(/banned\.just/);
});

test("shown red: FixtureTextLeak rejects (the excuse covers the file name only)", async () => {
	await expect(FixtureTextLeak.run()).rejects.toThrow(/banned\.just/);
});

test("shown red: DisableIgnored rejects (no off switch exists)", async () => {
	await expect(DisableIgnored.run()).rejects.toThrow(/banned\.just/);
});

test("resolves: Clean", async () => {
	await expect(Clean.run()).resolves.not.toThrow();
});

test("resolves: Empty", async () => {
	await expect(Empty.run()).resolves.not.toThrow();
});

test("resolves: FixtureText (excused by a visible fixtureText substring)", async () => {
	await expect(FixtureText.run()).resolves.not.toThrow();
});

test("resolves: NonEnglish (only en is linted)", async () => {
	await expect(NonEnglish.run()).resolves.not.toThrow();
});

test("collectCopyUnits skips Storybook's own preview wrappers and nothing else", () => {
	const root = document.createElement("div");
	root.innerHTML =
		'<div class="sb-wrapper"><p>Please check the Storybook config.</p></div>' +
		'<div class="sb-wrapper-lookalike"><p>Story text</p></div>' +
		'<button aria-label="Open" title="Tip">Go</button>';
	expect(collectCopyUnits(root).map((unit) => unit.text)).toEqual([
		"Story text",
		"Go",
		"Open",
		"Tip",
	]);
});
