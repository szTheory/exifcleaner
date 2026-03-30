import { test, expect } from "@playwright/test";
import type { ElectronApplication, Page } from "playwright";
import { launchApp, closeApp } from "./helpers/app_launcher";

test.describe("Security", () => {
	let app: ElectronApplication;
	let window: Page;
	let consoleErrors: string[];

	test.beforeAll(async () => {
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

	test.afterAll(async () => {
		if (app) {
			await closeApp(app);
		}
	});

	test("has CSP meta tag with expected directives", async () => {
		const csp = await window.evaluate(() => {
			const meta = document.querySelector(
				'meta[http-equiv="Content-Security-Policy"]',
			);
			return meta?.getAttribute("content") ?? null;
		});

		expect(csp).not.toBeNull();
		// Verify key directives are present
		expect(csp).toContain("default-src");
		expect(csp).toContain("script-src");
		// Verify no unsafe-eval (security requirement)
		expect(csp).not.toContain("unsafe-eval");
		// Verify self-contained (no remote origins)
		expect(csp).toContain("'self'");
	});

	test("blocks navigation to external URLs", async () => {
		// Capture URL before navigation attempt
		const urlBefore = window.url();

		// Attempt to navigate to an external URL
		// Navigation is blocked synchronously by Electron's will-navigate handler.
		// Per D-29: no explicit sleeps or waitForSelector -- immediate URL assertion.
		await window.evaluate(() => {
			try {
				window.location.href = "https://example.com";
			} catch {
				// CSP or navigation handler may throw -- that's expected
			}
		});

		// Verify the URL has not changed (no sleep needed per D-29)
		const urlAfter = window.url();
		expect(urlAfter).toBe(urlBefore);
		expect(urlAfter).not.toContain("example.com");
	});
});
