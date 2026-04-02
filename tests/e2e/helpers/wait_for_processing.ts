import type { Page } from "playwright";

export async function waitForProcessing(
	window: Page,
	options?: { timeout?: number; expectedFiles?: number },
): Promise<void> {
	const timeout = options?.timeout ?? 10000;
	const expectedFiles = options?.expectedFiles ?? 1;
	const pollInterval = 200;
	const deadline = Date.now() + timeout;

	// Wait until:
	// 1. Expected number of file rows exist
	// 2. No spinners are visible (all files finished processing)
	// 3. All rows have completed (complete class applied)
	//
	// Checking all three conditions prevents a race where spinners briefly
	// disappear between sequential file processing on slower CI runners.
	while (Date.now() < deadline) {
		const state = await window.evaluate(() => {
			const rows = document.querySelectorAll(".file-table__row");
			const spinners = document.querySelectorAll(
				".status-icon__spinner",
			);
			const completeRows = document.querySelectorAll(
				".file-table__row--complete",
			);
			const errorRows = document.querySelectorAll(
				".file-table__row--error",
			);
			return {
				rowCount: rows.length,
				spinnerCount: spinners.length,
				completeCount: completeRows.length,
				errorCount: errorRows.length,
			};
		});

		const finishedCount = state.completeCount + state.errorCount;
		if (
			state.rowCount >= expectedFiles &&
			state.spinnerCount === 0 &&
			finishedCount >= expectedFiles
		) {
			return;
		}

		await window.waitForTimeout(pollInterval);
	}

	throw new Error(
		`waitForProcessing timed out after ${timeout}ms — files may still be processing`,
	);
}
