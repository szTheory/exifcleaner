import type { Page } from "playwright";

export async function waitForProcessing(
	window: Page,
	options?: { timeout?: number },
): Promise<void> {
	const timeout = options?.timeout ?? 10000;
	// Wait for the "Clean more" button to become visible,
	// which signals all file processing is complete
	await window
		.getByRole("button", { name: /clean more/i })
		.waitFor({ state: "visible", timeout });
}
