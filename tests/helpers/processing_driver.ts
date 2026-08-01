import type { ElectronApplication, Page } from "playwright";
import { waitForProcessing } from "../e2e/helpers/wait_for_processing";

export interface ProcessingLaunchContext {
	readonly app: ElectronApplication;
	readonly window: Page;
}

export interface ProcessingDriver {
	readonly submitFiles: (filePaths: readonly string[]) => Promise<void>;
	readonly waitForTerminal: (options?: {
		timeout?: number;
		expectedFiles?: number;
	}) => Promise<void>;
	readonly setSaveAsCopy: (enabled: boolean) => Promise<void>;
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
