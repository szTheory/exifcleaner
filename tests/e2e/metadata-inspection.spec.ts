import { test, expect } from "@playwright/test";
import type { ElectronApplication, Page } from "playwright";
import { launchApp, closeApp } from "./helpers/app_launcher";
import { createFixtureDir } from "../helpers/fixture_copier";
import { waitForProcessing } from "./helpers/wait_for_processing";
import { snapshotDir, assertDirEffect } from "../helpers/dir_effect";

test.describe("Metadata Inspection", () => {
	let app: ElectronApplication;
	// Hazard: this Page-typed variable is named `window`, which shadows the DOM global
	// inside no-argument .evaluate() closures (TypeScript resolves lexically, not to
	// the in-page context). See settings.spec.ts for the fix if this file grows an
	// .evaluate(() => window....) call that needs type-checking.
	let window: Page;
	let consoleErrors: string[];

	test.beforeEach(async () => {
		consoleErrors = [];
		const launched = await launchApp({ settings: { saveAsCopy: false } });
		app = launched.app;
		window = launched.window;

		window.on("console", (msg) => {
			if (msg.type() === "error") {
				consoleErrors.push(msg.text());
			}
		});
	});

	test.afterEach(async () => {
		const unexpectedErrors = consoleErrors.filter(
			(msg) => !msg.includes("ExifTool") && !msg.includes("ENOENT"),
		);
		if (app) {
			await closeApp(app);
		}
		expect(unexpectedErrors, "Unexpected console.error messages").toEqual([]);
	});

	test("shows metadata groups with before/after diff", async () => {
		const { dir, copyFixture, cleanup } = createFixtureDir();
		try {
			const tempFile = copyFixture("sample.jpg");

			const before = snapshotDir(dir);

			await app.evaluate(
				({ BrowserWindow }, filePaths) => {
					const win = BrowserWindow.getAllWindows()[0];
					if (win) {
						win.webContents.send("file-open-add-files", filePaths);
					}
				},
				[tempFile],
			);

			await waitForProcessing(window);

			const after = snapshotDir(dir);

			assertDirEffect(before, after, {
				modified: ["sample.jpg"],
				added: [],
				removed: [],
				unchanged: [],
			});

			// Click to expand the file row
			const fileRow = window.locator(".file-table__row--complete").first();
			await fileRow.click();

			// Verify the metadata expansion is visible
			const expansion = window.locator(".metadata-expansion");
			await expect(expansion).toBeVisible();

			// Now check for metadata field names
			const allFieldNames = expansion.locator(".metadata-field__name");
			const fieldCount = await allFieldNames.count();
			expect(fieldCount).toBeGreaterThan(0);

			// Collect all field names
			const allNames: string[] = [];
			for (let i = 0; i < fieldCount; i++) {
				const text = await allFieldNames.nth(i).textContent();
				if (text) allNames.push(text);
			}

			// The expansion shows removable embedded metadata, not ExifTool's
			// structural file facts.
			const knownTags = [
				"Make",
				"Model",
				"Artist",
				"Copyright",
				"DateTimeOriginal",
				"GPSLatitude",
			];
			const hasKnownTag = knownTags.some((tag) => allNames.includes(tag));
			expect(
				hasKnownTag,
				`Expected at least one of ${knownTags.join(", ")} in metadata fields. Found: ${allNames.join(", ")}`,
			).toBe(true);
		} finally {
			cleanup();
		}
	});

	test("shows removed indicators for stripped metadata tags", async () => {
		const { dir, copyFixture, cleanup } = createFixtureDir();
		try {
			const tempFile = copyFixture("orientation.jpg");
			await window.evaluate(() =>
				globalThis.window.api.settings.set({ preserveResolution: false }),
			);
			await window.waitForTimeout(300);

			const before = snapshotDir(dir);

			await app.evaluate(
				({ BrowserWindow }, filePaths) => {
					const win = BrowserWindow.getAllWindows()[0];
					if (win) {
						win.webContents.send("file-open-add-files", filePaths);
					}
				},
				[tempFile],
			);

			await waitForProcessing(window);

			const after = snapshotDir(dir);

			assertDirEffect(before, after, {
				modified: ["orientation.jpg"],
				added: [],
				removed: [],
				unchanged: [],
			});

			// Expand the file row
			const fileRow = window.locator(".file-table__row--complete").first();
			await fileRow.click();

			const expansion = window.locator(".metadata-expansion");
			await expect(expansion).toBeVisible();

			// Most embedded fields are removed.
			const removedFields = expansion.locator(".metadata-field--removed");
			const removedCount = await removedFields.count();
			expect(removedCount).toBeGreaterThan(0);

			// Still-present fields are secondary and sit in a closed disclosure; they are in
			// the DOM either way, so they are counted without opening it.
			const preservedFields = expansion.locator(".metadata-field--preserved");
			const preservedCount = await preservedFields.count();
			expect(preservedCount).toBeGreaterThan(0);
		} finally {
			cleanup();
		}
	});
});
