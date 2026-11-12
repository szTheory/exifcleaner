import { afterEach, describe, expect, test } from "vitest";
import { withRealHover } from "../src/renderer/story_support/real_pointer";

// D-11 / S-3: withRealHover must never degrade silently to a synthetic hover.
// Runs in the `storybook-a11y-gate` browser project (a real Chromium). The synthetic
// stub throws, so a green run proves the real vitest/browser branch ran.
const throwingSynthetic = {
	hover: (): Promise<void> => {
		throw new Error("the synthetic hover must not run under Vitest");
	},
	unhover: (): Promise<void> => {
		throw new Error("the synthetic unhover must not run under Vitest");
	},
};

const mounted: HTMLElement[] = [];

function mount(tag: string, style: string, label: string): HTMLElement {
	const element = document.createElement(tag);
	element.textContent = label;
	element.setAttribute("style", style);
	document.body.appendChild(element);
	mounted.push(element);
	return element;
}

afterEach(() => {
	for (const element of mounted.splice(0)) element.remove();
});

describe("withRealHover (D-11)", () => {
	test("asserts while the real pointer makes the button match :hover", async () => {
		const button = mount(
			"button",
			"position:absolute;left:40px;top:40px;width:120px;height:40px",
			"Hover me",
		);
		expect(button.matches(":hover")).toBe(false);
		let hoveredDuringAssert: boolean | undefined;
		await withRealHover(button, throwingSynthetic, () => {
			hoveredDuringAssert = button.matches(":hover");
		});
		expect(hoveredDuringAssert).toBe(true);
	});

	test("rejects with the degraded-to-synthetic message on a pointer-events:none target", async () => {
		const target = mount(
			"div",
			"position:absolute;left:40px;top:120px;width:120px;height:40px;pointer-events:none",
			"Unhoverable",
		);
		let asserted = false;
		await expect(
			withRealHover(target, throwingSynthetic, () => {
				asserted = true;
			}),
		).rejects.toThrow("real pointer did not produce :hover");
		// The assertion body never ran against a pointer that did not hover.
		expect(asserted).toBe(false);
	});

	test("leaves no :hover behind on the element or on one at the same coordinates", async () => {
		const first = mount(
			"button",
			"position:absolute;left:40px;top:200px;width:120px;height:40px",
			"First",
		);
		await withRealHover(first, throwingSynthetic, () => {
			expect(first.matches(":hover")).toBe(true);
		});
		expect(first.matches(":hover")).toBe(false);

		// A second element stacked on the same coordinates must not inherit a stuck hover.
		const second = mount(
			"button",
			"position:absolute;left:40px;top:200px;width:120px;height:40px",
			"Second",
		);
		await new Promise<void>((resolve) =>
			requestAnimationFrame(() => resolve()),
		);
		expect(second.matches(":hover")).toBe(false);
	});
});
