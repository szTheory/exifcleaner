import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "@playwright/test";
import type { ElectronApplication, Page } from "playwright";
import { closeApp, launchApp } from "./helpers/app_launcher";
import {
	runMixedFormatScenario,
	runPositiveFormatScenario,
	runErrorFormatScenario,
	runRafRefusalScenario,
	SUPPORTED_FORMAT_FIXTURES,
	type ProcessingLaunchContext,
} from "../helpers/processing_driver";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const EXIFTOOL_PATH =
	process.platform === "win32"
		? path.resolve(__dirname, "../../.resources/win/bin/exiftool.exe")
		: path.resolve(__dirname, "../../.resources/nix/bin/exiftool");

test.describe("File type coverage", () => {
	let app: ElectronApplication;
	let window: Page;

	function context(): ProcessingLaunchContext {
		return { app, window, exiftoolPath: EXIFTOOL_PATH };
	}

	test.beforeEach(async () => {
		const launched = await launchApp({ settings: { saveAsCopy: true } });
		app = launched.app;
		window = launched.window;
	});

	test.afterEach(async () => {
		if (app) await closeApp(app);
	});

	for (const fixture of SUPPORTED_FORMAT_FIXTURES) {
		const testName =
			fixture === "sample.mp4"
				? "MP4 valid control strips metadata"
				: `${fixture} strips metadata`;
		test(testName, async () => {
			await runPositiveFormatScenario(context(), fixture);
		});
	}

	test("mixed batch strips metadata from every advertised format", async () => {
		await runMixedFormatScenario(context());
	});

	test("corrupted JPEG reports detailed error output", async () => {
		await runErrorFormatScenario(context(), "corrupted.jpg");
	});

	test("truncated MP4 rejects before output", async () => {
		await runErrorFormatScenario(context(), "truncated.mp4");
	});

	test("RAF is refused without modifying the original or writing an artifact", async () => {
		await runRafRefusalScenario(context());
	});
});
