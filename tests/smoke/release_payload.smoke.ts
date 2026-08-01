import { expect, test } from "@playwright/test";
import fs from "node:fs";
import { assertMetadataStripped } from "../e2e/helpers/metadata_assertions";
import { createFixtureDir } from "../helpers/fixture_copier";
import { assertDirEffect, snapshotDir } from "../helpers/dir_effect";
import { createProcessingDriver } from "../helpers/processing_driver";
import {
	closePackagedApp,
	launchPackagedApp,
	type PackagedLaunchContext,
} from "./helpers/packaged_launcher";

test.describe.configure({ mode: "serial" });

async function expectFocusInsideDialog(
	context: PackagedLaunchContext,
): Promise<void> {
	const dialog = context.window.getByRole("dialog", { name: "Settings" });
	const focusableCount = await dialog
		.locator(
			'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
		)
		.count();
	expect(focusableCount).toBeGreaterThan(0);

	for (let index = 0; index < focusableCount + 1; index += 1) {
		await context.window.keyboard.press("Tab");
		expect(
			await context.window.evaluate(() => {
				const dialogNode = document.querySelector(
					'[role="dialog"][aria-label="Settings"]',
				);
				return dialogNode?.contains(document.activeElement) ?? false;
			}),
		).toBe(true);
	}

	await context.window.keyboard.press("Shift+Tab");
	expect(
		await context.window.evaluate(() => {
			const dialogNode = document.querySelector(
				'[role="dialog"][aria-label="Settings"]',
			);
			return dialogNode?.contains(document.activeElement) ?? false;
		}),
	).toBe(true);
}

async function expectNoVisibleOverflow(
	context: PackagedLaunchContext,
): Promise<void> {
	const overflowing = await context.window.evaluate(() =>
		[
			...document.querySelectorAll<HTMLElement>(
				".drop-zone, .settings-drawer, .settings-drawer *",
			),
		]
			.filter(
				(element) =>
					element.checkVisibility() &&
					element.clientWidth > 0 &&
					element.scrollWidth > element.clientWidth,
			)
			.map((element) => element.className || element.tagName),
	);
	expect(overflowing).toEqual([]);
}

test("#300 installed payload reports its stat-derived non-empty SIZE", async () => {
	const context = await launchPackagedApp();
	const driver = createProcessingDriver(context);
	const { dir, copyFixture, cleanup } = createFixtureDir();

	try {
		const filePath = copyFixture("sample.jpg");
		const sizeWhenAdded = fs.statSync(filePath).size;
		expect(sizeWhenAdded).toBeGreaterThan(0);
		expect(sizeWhenAdded).toBeLessThan(1024);
		const before = snapshotDir(dir);

		await driver.submitFiles([filePath]);
		await driver.waitForTerminal();

		assertDirEffect(before, snapshotDir(dir), {
			modified: ["sample.jpg"],
			added: [],
			removed: [],
		});
		await assertMetadataStripped(filePath, context.exiftoolPath);
		const sizeCell = context.window.locator(".file-table__cell--size").first();
		await expect(sizeCell).toHaveText(`${sizeWhenAdded} B`);
		await expect(sizeCell).not.toHaveText("0 B");
		await expect(
			context.window.getByRole("table", { name: "File list" }),
		).toBeVisible();
	} finally {
		cleanup();
		await closePackagedApp(context);
	}
});

test("#301 installed settings retain semantic keyboard and pointer paths", async () => {
	const context = await launchPackagedApp();
	const trigger = context.window.getByRole("button", { name: "Open settings" });
	const dialog = context.window.getByRole("dialog", { name: "Settings" });

	try {
		await expect(
			context.window.getByText("No files selected", { exact: true }),
		).toBeVisible();
		await expect(context.window.locator(".drop-zone")).toContainText(/drag/i);
		await trigger.click();
		await expect(dialog).toBeVisible();
		await expect(dialog).toHaveAttribute("aria-modal", "true");
		await expect(
			dialog.getByRole("button", { name: "Close settings" }),
		).toBeFocused();
		await expectFocusInsideDialog(context);
		await expectNoVisibleOverflow(context);
		await dialog.getByRole("button", { name: "Close settings" }).click();
		await expect(dialog).not.toBeVisible();
		await expect(trigger).toBeFocused();

		await trigger.press("Enter");
		await expect(dialog).toBeVisible();
		await context.window.keyboard.press("Escape");
		await expect(dialog).not.toBeVisible();
		await expect(trigger).toBeFocused();

		await trigger.press(" ");
		await expect(dialog).toBeVisible();
		await context.window
			.locator(".settings-drawer__backdrop")
			.click({ force: true });
		await expect(dialog).not.toBeVisible();
		await expect(trigger).toBeFocused();

		await trigger.click();
		await expect(dialog).toBeVisible();
		await trigger.click({ force: true });
		await expect(dialog).not.toBeVisible();
		await expect(trigger).toBeFocused();
	} finally {
		await closePackagedApp(context);
	}
});

test("#306 installed launches use separate exact profiles and remove them", async () => {
	const first = await launchPackagedApp();
	const firstProfile = first.userDataDir;

	try {
		expect(await first.app.evaluate(() => process.argv)).toContain(
			`--user-data-dir=${firstProfile}`,
		);
	} finally {
		await closePackagedApp(first);
	}
	expect(fs.existsSync(firstProfile)).toBe(false);

	const second = await launchPackagedApp();
	try {
		expect(second.userDataDir).not.toBe(firstProfile);
		expect(await second.app.evaluate(() => process.argv)).toContain(
			`--user-data-dir=${second.userDataDir}`,
		);
	} finally {
		await closePackagedApp(second);
	}
	expect(fs.existsSync(second.userDataDir)).toBe(false);
});
