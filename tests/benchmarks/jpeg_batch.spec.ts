import { test, expect, _electron as electron } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

test("200 pristine JPEGs reach terminal rows", async () => {
	const fixture = process.env.BENCHMARK_FIXTURE;
	const output = process.env.BENCHMARK_SAMPLE_OUT;
	if (!fixture || !output)
		throw new Error("Benchmark protocol environment is incomplete");
	const directory = fs.mkdtempSync(
		path.join(os.tmpdir(), "phase22-jpeg-batch-"),
	);
	const files = Array.from({ length: 200 }, (_, index) => {
		const target = path.join(
			directory,
			`${String(index).padStart(3, "0")}.jpg`,
		);
		fs.copyFileSync(fixture, target);
		return target;
	});
	let app;
	try {
		app = await electron.launch({
			args: [".", `--user-data-dir=${path.join(directory, "profile")}`],
			cwd: process.cwd(),
			env: { NODE_ENV: "development" },
		});
		const page = await app.firstWindow();
		await page.waitForSelector("[role='main']");
		await page.evaluate(() => window.api.settings.set({ saveAsCopy: false }));
		const startedAt = performance.now();
		await app.evaluate(
			({ BrowserWindow }, paths) =>
				BrowserWindow.getAllWindows()[0]?.webContents.send(
					"file-open-add-files",
					paths,
				),
			files,
		);
		await expect
			.poll(
				async () =>
					page
						.locator(".file-table__row--complete, .file-table__row--error")
						.count(),
				{ timeout: 120000 },
			)
			.toBe(200);
		const terminal = await page.locator(".file-table__row--error").count();
		if (terminal) throw new Error(`${terminal} benchmark rows failed`);
		fs.writeFileSync(
			output,
			JSON.stringify({
				durationMs: performance.now() - startedAt,
				terminalRows: 200,
			}),
		);
	} finally {
		await app?.close();
		fs.rmSync(directory, { recursive: true, force: true });
	}
});
