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
			NODE_ENV: "production",
		},
		timeout: 15000,
	});
	const window = await app.firstWindow();
	await window.waitForLoadState("domcontentloaded");
	return { app, window };
}

export async function closeApp(app: ElectronApplication): Promise<void> {
	await app.close();
}
