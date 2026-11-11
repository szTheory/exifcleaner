import { composeStories, setProjectAnnotations } from "@storybook/react-vite";
import * as a11yAnnotations from "@storybook/addon-a11y/preview";
import { expect, test } from "vitest";
import preview from "./preview";
import * as fixtureStories from "./fixtures/a11y_violation.stories";

// Runs in the `storybook-a11y-gate` browser project (VITEST_STORYBOOK=false,
// the only setting under which addon-a11y throws on a violation). The project
// annotations are the real preview plus the addon's, so this proves the same
// configuration that gates the catalog really fails a violating story.
setProjectAnnotations([a11yAnnotations, preview]);
const { Violating } = composeStories(fixtureStories);

test("a violating story rejects under parameters.a11y.test = error", async () => {
	await expect(Violating.run()).rejects.toThrow(/button-name|color-contrast/);
});
