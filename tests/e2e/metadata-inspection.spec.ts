import { test, expect } from "@playwright/test";
import type { ElectronApplication, Page } from "playwright";
import { launchApp, closeApp } from "./helpers/app_launcher";
import { createFixtureDir } from "./helpers/fixture_copier";
import { waitForProcessing } from "./helpers/wait_for_processing";

test.describe("Metadata Inspection", () => {
	let app: ElectronApplication;
	let window: Page;
	let consoleErrors: string[];

	test.beforeEach(async () => {
		consoleErrors = [];
		const launched = await launchApp();
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

	test("expands a processed file to show metadata details", async () => {
		const { copyFixture, cleanup } = createFixtureDir();
		try {
			const tempFile = copyFixture("sample.jpg");

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

			// Click on the completed file row to expand it
			const fileRow = window.locator(".file-table__row--complete").first();
			await expect(fileRow).toBeVisible();
			await fileRow.click();

			// Verify the metadata expansion panel is visible
			const expansion = window.locator(".metadata-expansion");
			await expect(expansion).toBeVisible();
		} finally {
			cleanup();
		}
	});

	test("shows metadata groups with before/after diff", async () => {
		const { copyFixture, cleanup } = createFixtureDir();
		try {
			const tempFile = copyFixture("sample.jpg");

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

			// Click to expand the file row
			const fileRow = window.locator(".file-table__row--complete").first();
			await fileRow.click();

			// Verify the metadata expansion is visible
			const expansion = window.locator(".metadata-expansion");
			await expect(expansion).toBeVisible();

			// Metadata groups start collapsed -- expand them all
			const groupHeaders = expansion.locator(".metadata-group__header");
			const groupCount = await groupHeaders.count();
			expect(groupCount).toBeGreaterThan(0);

			for (let i = 0; i < groupCount; i++) {
				await groupHeaders.nth(i).click();
			}

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

			// The metadata expansion shows file-level tags (via -G2 -File:all).
			// Known tags that should be present include structural fields like:
			// ExifByteOrder, ImageWidth, ImageHeight, EncodingProcess, etc.
			const knownTags = [
				"ExifByteOrder",
				"ImageWidth",
				"ImageHeight",
				"EncodingProcess",
				"FileName",
				"FileSize",
				"MIMEType",
			];
			const hasKnownTag = knownTags.some((tag) =>
				allNames.includes(tag),
			);
			expect(
				hasKnownTag,
				`Expected at least one of ${knownTags.join(", ")} in metadata fields. Found: ${allNames.join(", ")}`,
			).toBe(true);
		} finally {
			cleanup();
		}
	});

	test("shows removed indicators for stripped metadata tags", async () => {
		const { copyFixture, cleanup } = createFixtureDir();
		try {
			const tempFile = copyFixture("sample.jpg");

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

			// Expand the file row
			const fileRow = window.locator(".file-table__row--complete").first();
			await fileRow.click();

			const expansion = window.locator(".metadata-expansion");
			await expect(expansion).toBeVisible();

			// Expand all metadata groups
			const groupHeaders = expansion.locator(".metadata-group__header");
			const groupCount = await groupHeaders.count();
			for (let i = 0; i < groupCount; i++) {
				await groupHeaders.nth(i).click();
			}

			// After processing sample.jpg with preserveOrientation=true,
			// ExifByteOrder gets stripped (present in before, absent in after).
			// This should appear as a removed field.
			const removedFields = expansion.locator(
				".metadata-field--removed",
			);
			const removedCount = await removedFields.count();
			expect(removedCount).toBeGreaterThan(0);

			// Verify removed fields have the minus icon indicator (U+2212)
			const firstRemovedIcon = removedFields
				.first()
				.locator(".metadata-field__icon");
			const iconText = await firstRemovedIcon.textContent();
			expect(iconText).toBe("\u2212");

			// Verify preserved fields also exist (structural tags present in both)
			const preservedFields = expansion.locator(
				".metadata-field--preserved",
			);
			const preservedCount = await preservedFields.count();
			expect(preservedCount).toBeGreaterThan(0);

			// Preserved fields show checkmark (U+2713)
			const firstPreservedIcon = preservedFields
				.first()
				.locator(".metadata-field__icon");
			const preservedIconText =
				await firstPreservedIcon.textContent();
			expect(preservedIconText).toBe("\u2713");
		} finally {
			cleanup();
		}
	});
});
