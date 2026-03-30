import type { Page } from "playwright";

export async function waitForProcessing(
	window: Page,
	options?: { timeout?: number },
): Promise<void> {
	const timeout = options?.timeout ?? 10000;
	const pollInterval = 200;
	const deadline = Date.now() + timeout;

	// Wait until:
	// 1. At least one file row exists
	// 2. No spinners are visible (all files finished processing)
	while (Date.now() < deadline) {
		const state = await window.evaluate(() => {
			const rows = document.querySelectorAll(".file-table__row");
			const spinners = document.querySelectorAll(
				'.status-icon__spinner',
			);
			return {
				rowCount: rows.length,
				spinnerCount: spinners.length,
			};
		});

		if (state.rowCount > 0 && state.spinnerCount === 0) {
			return;
		}

		await window.waitForTimeout(pollInterval);
	}

	throw new Error(
		`waitForProcessing timed out after ${timeout}ms — files may still be processing`,
	);
}
