import { _electron as electron } from "playwright";
import type { ElectronApplication, Page } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function launchApp(): Promise<{
	app: ElectronApplication;
	window: Page;
}> {
	const app = await electron.launch({
		args: ["."],
		cwd: path.resolve(__dirname, "../../.."),
		env: {
			...process.env,
			// Use "development" so resource paths resolve to .resources/ in project root
			// (not the Electron.app bundle). The compiled output in out/ is still used.
			NODE_ENV: "development",
		},
		timeout: 15000,
	});
	const window = await app.firstWindow();
	await window.waitForLoadState("domcontentloaded");
	// Wait for the React app to mount (main element with role="main")
	await window.waitForSelector("[role='main']", { timeout: 10000 });
	return { app, window };
}

export async function closeApp(app: ElectronApplication): Promise<void> {
	await app.close();
}
