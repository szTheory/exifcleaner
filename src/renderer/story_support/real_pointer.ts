/// <reference types="vite/client" />

// D-11 / V2: a hover story must prove a real pointer produced `:hover`, because a
// synthetic Testing Library hover never matches the `:hover` pseudo-class. Under
// Vitest the helper hovers through `vitest/browser` (a real Chromium pointer) and
// throws if `:hover` did not appear, so it cannot degrade to a synthetic hover
// silently. In the Storybook UI (no Vitest marker) the synthetic pair runs and `:hover`
// is never asserted. The dynamic import runs only under VITEST, and
// .storybook/story_support_imports.test.ts keeps this file out of production
// modules; .storybook/real_pointer_gate.test.tsx is the permanent negative control.
type SyntheticPointer = {
	hover(element: Element): Promise<void>;
	unhover(element: Element): Promise<void>;
};

// The browser build of a Vitest run does not set import.meta.env.VITEST (measured in
// the storybook-a11y-gate project: the keys are BASE_URL, DEV, MODE, PROD, SSR,
// VITEST_STORYBOOK, VITEST_BROWSER_DEBUG), so the Storybook plugin's VITEST_STORYBOOK
// ("true" in the story projects, "false" in the gate project) is the marker, with
// VITEST kept for a node run. The Storybook UI and a static build set neither.
// Long enough for a loaded machine to move the pointer onto a visible element, short
// enough that the permanent negative control (a pointer-events: none target) stays quick.
const HOVER_TIMEOUT_MS = 5_000;

function underVitest(): boolean {
	return (
		import.meta.env["VITEST"] !== undefined ||
		import.meta.env["VITEST_STORYBOOK"] !== undefined
	);
}

export async function withRealHover(
	element: Element,
	synthetic: SyntheticPointer,
	assert: () => Promise<void> | void,
): Promise<void> {
	if (!underVitest()) {
		await synthetic.hover(element);
		try {
			await assert();
		} finally {
			await synthetic.unhover(element);
		}
		return;
	}
	const { userEvent } = await import("vitest/browser");
	try {
		await userEvent.hover(element, { timeout: HOVER_TIMEOUT_MS });
	} catch (error) {
		// Playwright refuses to hover an element that cannot receive pointer events
		// (for example pointer-events: none); that is the same failure as no :hover.
		const reason = error instanceof Error ? error.message.split("\n")[0] : "";
		throw new Error(
			`real pointer did not produce :hover (the hover could not reach the element): ${reason}`,
		);
	}
	try {
		if (!element.matches(":hover")) {
			throw new Error(
				"real pointer did not produce :hover (helper degraded to synthetic)",
			);
		}
		await assert();
	} finally {
		await userEvent.unhover(element);
	}
}
