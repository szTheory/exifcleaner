import { expect } from "@playwright/test";
import { execFile } from "node:child_process";
import fs from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { createFixtureDir } from "./fixture_copier";
import { assertDirEffect, snapshotDir } from "./dir_effect";
import {
	assertMetadataStripped,
	readMetadataTags,
} from "../e2e/helpers/metadata_assertions";
import type { ElectronApplication, Page } from "playwright";
import { waitForProcessing } from "../e2e/helpers/wait_for_processing";
import { generateCleanedPath } from "../../src/domain/files/cleaned_path";
import {
	buildExiftoolReference,
	buildNativeReference,
	nativeDifferentialProblems,
	type DifferentialPreservation,
} from "./native_differential";

const execFileAsync = promisify(execFile);

export interface ProcessingLaunchContext {
	readonly app: ElectronApplication;
	readonly window: Page;
	readonly exiftoolPath: string;
}

export const SUPPORTED_FORMAT_FIXTURES = [
	"sample.jpg",
	"sample.png",
	"sample.webp",
	"sample.pdf",
	"sample.mp4",
	"sample.m4a",
] as const;

export type SupportedFormatFixture = (typeof SUPPORTED_FORMAT_FIXTURES)[number];
export type ErrorFormatFixture = "corrupted.jpg" | "truncated.mp4";

export interface ProcessingDriver {
	readonly submitFiles: (filePaths: readonly string[]) => Promise<void>;
	readonly waitForTerminal: (options?: {
		timeout?: number;
		expectedFiles?: number;
	}) => Promise<void>;
	readonly setSaveAsCopy: (enabled: boolean) => Promise<void>;
	readonly setPreserveResolution: (enabled: boolean) => Promise<void>;
	readonly terminalRowCounts: () => Promise<{
		readonly total: number;
		readonly complete: number;
		readonly error: number;
	}>;
	readonly outputDisclosure: () => Promise<string>;
	readonly interceptReveal: () => Promise<{
		readonly calls: () => Promise<readonly string[]>;
		readonly restore: () => Promise<void>;
	}>;
}

export function createProcessingDriver(
	context: ProcessingLaunchContext,
): ProcessingDriver {
	return {
		async submitFiles(filePaths: readonly string[]): Promise<void> {
			await context.app.evaluate(
				({ BrowserWindow }, paths) => {
					BrowserWindow.getAllWindows()[0]?.webContents.send(
						"file-open-add-files",
						paths,
					);
				},
				[...filePaths],
			);
		},
		async waitForTerminal(options): Promise<void> {
			await waitForProcessing(context.window, options);
		},
		async setSaveAsCopy(enabled: boolean): Promise<void> {
			await context.window.evaluate((saveAsCopy) => {
				return window.api.settings.set({ saveAsCopy });
			}, enabled);
			await context.window.waitForTimeout(300);
		},
		async setPreserveResolution(enabled: boolean): Promise<void> {
			await context.window.evaluate((preserveResolution) => {
				return window.api.settings.set({ preserveResolution });
			}, enabled);
			await context.window.waitForTimeout(300);
		},
		async terminalRowCounts(): Promise<{
			readonly total: number;
			readonly complete: number;
			readonly error: number;
		}> {
			return context.window.evaluate(() => ({
				total: document.querySelectorAll(".file-table__row").length,
				complete: document.querySelectorAll(".file-table__row--complete")
					.length,
				error: document.querySelectorAll(".file-table__row--error").length,
			}));
		},
		async outputDisclosure(): Promise<string> {
			return context.window
				.locator(".file-table__copy-disclosure")
				.first()
				.innerText();
		},
		async interceptReveal(): Promise<{
			readonly calls: () => Promise<readonly string[]>;
			readonly restore: () => Promise<void>;
		}> {
			await context.app.evaluate(({ shell }) => {
				const calls: string[] = [];
				const originalShowItemInFolder = shell.showItemInFolder;
				Reflect.set(globalThis, "__processingDriverRevealCalls", calls);
				Reflect.set(globalThis, "__processingDriverRestoreReveal", () => {
					shell.showItemInFolder = originalShowItemInFolder;
				});
				shell.showItemInFolder = (filePath: string): void => {
					calls.push(filePath);
				};
			});
			return {
				calls: async (): Promise<readonly string[]> =>
					context.app.evaluate(
						() =>
							Reflect.get(
								globalThis,
								"__processingDriverRevealCalls",
							) as string[],
					),
				restore: async (): Promise<void> => {
					await context.app.evaluate(() => {
						const restore = Reflect.get(
							globalThis,
							"__processingDriverRestoreReveal",
						) as (() => void) | undefined;
						restore?.();
					});
				},
			};
		},
	};
}

export async function runPositiveFormatScenario(
	context: ProcessingLaunchContext,
	fixture: SupportedFormatFixture,
): Promise<void> {
	const driver = createProcessingDriver(context);
	const { dir, copyFixture, cleanup } = createFixtureDir();
	const consoleErrors: string[] = [];
	context.window.on("console", (message) => {
		if (message.type() === "error") consoleErrors.push(message.text());
	});

	try {
		const filePath = copyFixture(fixture);
		const outputPath = generateCleanedPath({
			filePath,
			exists: fs.existsSync,
		});
		const before = snapshotDir(dir);
		await driver.submitFiles([filePath]);
		await driver.waitForTerminal();
		const after = snapshotDir(dir);

		assertDirEffect(before, after, {
			modified: [],
			added: [path.basename(outputPath)],
			removed: [],
			unchanged: [fixture],
		});
		await assertMetadataStripped(outputPath, context.exiftoolPath);
		expect(await driver.terminalRowCounts()).toEqual({
			total: 1,
			complete: 1,
			error: 0,
		});
	} finally {
		cleanup();
	}

	expect(consoleErrors).toEqual([]);
}

export async function runMixedFormatScenario(
	context: ProcessingLaunchContext,
): Promise<void> {
	const driver = createProcessingDriver(context);
	const { dir, copyFixtures, cleanup } = createFixtureDir();
	const consoleErrors: string[] = [];
	context.window.on("console", (message) => {
		if (message.type() === "error") consoleErrors.push(message.text());
	});

	try {
		const filePaths = copyFixtures([...SUPPORTED_FORMAT_FIXTURES]);
		const outputPaths = filePaths.map((filePath) =>
			generateCleanedPath({ filePath, exists: fs.existsSync }),
		);
		const before = snapshotDir(dir);
		await driver.submitFiles(filePaths);
		await driver.waitForTerminal({
			timeout: 30000,
			expectedFiles: SUPPORTED_FORMAT_FIXTURES.length,
		});
		const after = snapshotDir(dir);

		assertDirEffect(before, after, {
			modified: [],
			added: outputPaths.map((outputPath) => path.basename(outputPath)),
			removed: [],
			unchanged: SUPPORTED_FORMAT_FIXTURES,
		});
		for (const outputPath of outputPaths) {
			await assertMetadataStripped(outputPath, context.exiftoolPath);
		}
		expect(await driver.terminalRowCounts()).toEqual({
			total: SUPPORTED_FORMAT_FIXTURES.length,
			complete: SUPPORTED_FORMAT_FIXTURES.length,
			error: 0,
		});
	} finally {
		cleanup();
	}

	expect(consoleErrors).toEqual([]);
}

export async function runErrorFormatScenario(
	context: ProcessingLaunchContext,
	fixture: ErrorFormatFixture,
): Promise<void> {
	const driver = createProcessingDriver(context);
	const { dir, copyFixture, cleanup } = createFixtureDir();
	const consoleErrors: string[] = [];
	context.window.on("console", (message) => {
		if (message.type() === "error") consoleErrors.push(message.text());
	});

	try {
		const fileName = fixture === "truncated.mp4" ? "sample.mp4" : fixture;
		const filePath = copyFixture(fileName);
		if (fixture === "truncated.mp4") {
			fs.truncateSync(filePath, 1);
			await expect(
				execFileAsync(context.exiftoolPath, ["-json", filePath]),
			).rejects.toMatchObject({ code: expect.any(Number) });
		}
		const before = snapshotDir(dir);
		await driver.submitFiles([filePath]);
		await driver.waitForTerminal();
		const after = snapshotDir(dir);

		assertDirEffect(before, after, {
			unchanged: [fileName],
			added: [],
			modified: [],
			removed: [],
		});
		const errorRow = context.window.locator(".file-table__row--error");
		expect(await driver.terminalRowCounts()).toEqual({
			total: 1,
			complete: 0,
			error: 1,
		});
		await expect(errorRow).toHaveAttribute("aria-label", /\S/);
		await errorRow.click();
		await expect(
			context.window.locator(".file-table__error-text"),
		).toContainText(/\S/);

		if (fixture === "truncated.mp4") {
			await expect(
				context.window.locator(".file-table__after-done"),
			).toHaveCount(0);
			await expect(context.window.locator(".file-table__reveal")).toHaveCount(
				0,
			);
		}
	} finally {
		cleanup();
	}

	expect(consoleErrors).toEqual([]);
}

// ADP-05/SC4: the app's default preservations (Save as copy, orientation, color profile
// and resolution on, timestamps off) -- see 58-10-PLAN.md D-14/D-15.
const NATIVE_DIFFERENTIAL_PRESERVATION: DifferentialPreservation = {
	preserveOrientation: true,
	preserveColorProfile: true,
	preserveResolution: true,
	preserveTimestamps: false,
};

export interface NativeDifferentialScenarioSpec {
	readonly fixture: "sample.jpg" | "orientation.png";
	readonly removedTags: readonly string[];
	readonly preservedTags: Readonly<Record<string, unknown>>;
}

/**
 * Proves, on an installed artifact, that the native engine (not ExifTool) actually
 * cleaned `fixture` under the app's default preservations. Submits the file through the
 * real IPC path, then independently rebuilds both a native reference (exifcleaner-node's
 * own sanitizeFile) and an ExifTool reference (the app's exact argument shape) from
 * separate fresh copies of the fixture in a second, unwatched temp directory -- so the
 * watched directory's assertDirEffect blast radius stays exactly the app's own output
 * plus its documented native-publication stage residue. The installed output must equal
 * the native reference and differ from the ExifTool reference (D-14), and the verified
 * outcome (removed/preserved tags) must hold on the real output.
 */
export async function runNativeDifferentialScenario(
	context: ProcessingLaunchContext,
	{ fixture, removedTags, preservedTags }: NativeDifferentialScenarioSpec,
): Promise<void> {
	const driver = createProcessingDriver(context);
	const { dir, copyFixture, cleanup } = createFixtureDir();
	const references = createFixtureDir();
	const consoleErrors: string[] = [];
	context.window.on("console", (message) => {
		if (message.type() === "error") consoleErrors.push(message.text());
	});

	try {
		const filePath = copyFixture(fixture);
		const outputPath = generateCleanedPath({
			filePath,
			exists: fs.existsSync,
		});
		const before = snapshotDir(dir);
		await driver.submitFiles([filePath]);
		await driver.waitForTerminal();
		const after = snapshotDir(dir);

		assertDirEffect(before, after, {
			modified: [],
			added: [path.basename(outputPath)],
			removed: [],
			unchanged: [fixture],
		});
		expect(await driver.terminalRowCounts()).toEqual({
			total: 1,
			complete: 1,
			error: 0,
		});

		// Two independent fresh copies of the same source bytes, in a directory the
		// app's own submission never touches.
		const nativeSource = references.copyFixture(fixture);
		const exiftoolSource = path.join(references.dir, `etool-${fixture}`);
		fs.copyFileSync(nativeSource, exiftoolSource);

		const nativeOutput = path.join(references.dir, `native-out-${fixture}`);
		const native = await buildNativeReference({
			sourcePath: nativeSource,
			outputPath: nativeOutput,
			preservation: NATIVE_DIFFERENTIAL_PRESERVATION,
		});

		const exiftoolOutput = path.join(references.dir, `etool-out-${fixture}`);
		const exiftool = buildExiftoolReference({
			exiftoolPath: context.exiftoolPath,
			sourcePath: exiftoolSource,
			outputPath: exiftoolOutput,
			preservation: NATIVE_DIFFERENTIAL_PRESERVATION,
		});

		const installed = await readFile(outputPath);
		expect(nativeDifferentialProblems({ installed, native, exiftool })).toEqual(
			[],
		);

		const tags = await readMetadataTags(outputPath, context.exiftoolPath);
		for (const tag of removedTags) {
			expect(tags).not.toHaveProperty(tag);
		}
		for (const [key, value] of Object.entries(preservedTags)) {
			expect(tags[key]).toEqual(value);
		}
	} finally {
		cleanup();
		references.cleanup();
	}

	expect(consoleErrors).toEqual([]);
}

export async function runRafRefusalScenario(
	context: ProcessingLaunchContext,
): Promise<void> {
	const driver = createProcessingDriver(context);
	const { dir, copyFixture, cleanup } = createFixtureDir();
	const consoleErrors: string[] = [];
	context.window.on("console", (message) => {
		if (message.type() === "error") consoleErrors.push(message.text());
	});
	try {
		const sourcePath = copyFixture("sample.raf");
		const before = snapshotDir(dir);
		await driver.submitFiles([sourcePath]);
		await driver.waitForTerminal();
		const after = snapshotDir(dir);

		assertDirEffect(before, after, {
			unchanged: ["sample.raf"],
			added: [],
			modified: [],
			removed: [],
		});
		expect(await driver.terminalRowCounts()).toEqual({
			total: 1,
			complete: 0,
			error: 1,
		});
		const row = context.window.locator(".file-table__row--error");
		await expect(row).toHaveAttribute("aria-label", /RAF|write safely/i);
		await row.click();
		await expect(
			context.window.locator(".file-table__error-text"),
		).toContainText(/RAF|write safely/i);
		await expect(context.window.locator(".file-table__reveal")).toHaveCount(0);
	} finally {
		cleanup();
	}

	expect(consoleErrors).toEqual([]);
}
