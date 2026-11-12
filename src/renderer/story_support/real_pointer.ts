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
// Long enough for a loaded machine to move the pointer onto a visible element: a full
// parallel `yarn test:storybook` on a busy host starved a 5 s limit (Phase 72, 72-02).
// The permanent negative control (a pointer-events: none target) passes a short
// `timeoutMs` of its own so it stays quick.
const HOVER_TIMEOUT_MS = 20_000;

function underVitest(): boolean {
	return (
		import.meta.env["VITEST"] !== undefined ||
		import.meta.env["VITEST_STORYBOOK"] !== undefined
	);
}

// Test seam, for the permanent negative control only: a stub whose hover resolves while
// matches reports no :hover proves the post-hover check is a branch of its own (a
// pointer-events: none target fails in the catch below and never reaches it). Stories
// pass neither, so the real vitest/browser hover and element.matches(":hover") run.
type RealPointerSeam = {
	hover?: ((element: Element, timeoutMs: number) => Promise<void>) | undefined;
	matches?: ((element: Element) => boolean) | undefined;
};

export async function withRealHover(
	element: Element,
	synthetic: SyntheticPointer,
	assert: () => Promise<void> | void,
	{
		timeoutMs = HOVER_TIMEOUT_MS,
		hover,
		matches,
	}: { timeoutMs?: number } & RealPointerSeam = {},
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
	const realHover = hover ?? ((el, ms) => userEvent.hover(el, { timeout: ms }));
	const isHovered = matches ?? ((el) => el.matches(":hover"));
	try {
		await realHover(element, timeoutMs);
	} catch (error) {
		// Playwright refuses to hover an element that cannot receive pointer events
		// (for example pointer-events: none); that is the same failure as no :hover.
		const reason = error instanceof Error ? error.message.split("\n")[0] : "";
		throw new Error(
			`real pointer did not produce :hover (the hover could not reach the element): ${reason}`,
		);
	}
	try {
		if (!isHovered(element)) {
			throw new Error(
				"real pointer did not produce :hover (helper degraded to synthetic)",
			);
		}
		await assert();
	} finally {
		await userEvent.unhover(element);
	}
}
