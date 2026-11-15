import { test, expect } from "@playwright/test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { ElectronApplication, Page } from "playwright";
import { launchApp, closeApp } from "./helpers/app_launcher";

test.describe("Security", () => {
	let app: ElectronApplication;
	let page: Page;
	let consoleErrors: string[];

	test.beforeAll(async () => {
		consoleErrors = [];
		const launched = await launchApp();
		app = launched.app;
		page = launched.window;

		page.on("console", (msg) => {
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
		const csp = await page.evaluate(() => {
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

	test("CSP blocks eval() from inline scripts", async () => {
		// Playwright's evaluate() uses DevTools protocol which bypasses CSP.
		// To test CSP enforcement, inject an inline script element that tries eval.
		// CSP script-src 'self' blocks both inline scripts and eval().
		const executed = await page.evaluate(() => {
			return new Promise<boolean>((resolve) => {
				(window as any).__evalTestResult = "not-run";
				const script = document.createElement("script");
				script.textContent =
					'try { eval("1+1"); window.__evalTestResult = "eval-succeeded"; } catch(e) { window.__evalTestResult = "eval-blocked"; }';
				document.head.appendChild(script);
				// Inline script is blocked by CSP, so __evalTestResult stays "not-run"
				setTimeout(() => {
					resolve((window as any).__evalTestResult === "not-run");
				}, 100);
			});
		});
		expect(executed).toBe(true);
	});

	test("CSP blocks dynamic script injection", async () => {
		const executed = await page.evaluate(() => {
			(window as any).__injectedScriptRan = false;
			const script = document.createElement("script");
			script.textContent = "(window).__injectedScriptRan = true;";
			document.head.appendChild(script);
			return (window as any).__injectedScriptRan;
		});
		expect(executed).toBe(false);
	});

	test("has secure BrowserWindow configuration", async () => {
		const isNodeIntegrationEnabled = await page.evaluate(() => {
			return typeof require !== "undefined";
		});
		expect(isNodeIntegrationEnabled).toBe(false);
	});

	test("CSP meta tag has no wildcard or remote origins", async () => {
		const csp = await page.evaluate(() => {
			const meta = document.querySelector(
				'meta[http-equiv="Content-Security-Policy"]',
			);
			return meta?.getAttribute("content") ?? "";
		});
		expect(csp).not.toContain("*");
		expect(csp).not.toContain("http:");
		expect(csp).not.toContain("https:");
		expect(csp).toContain("'self'");
	});

	test("blocks navigation to external URLs", async () => {
		// Capture URL before navigation attempt
		const urlBefore = page.url();

		// Attempt to navigate to an external URL
		// Navigation is blocked synchronously by Electron's will-navigate handler.
		// Per D-29: no explicit sleeps or waitForSelector -- immediate URL assertion.
		await page.evaluate(() => {
			try {
				window.location.href = "https://example.com";
			} catch {
				// CSP or navigation handler may throw -- that's expected
			}
		});

		// Verify the URL has not changed (no sleep needed per D-29)
		const urlAfter = page.url();
		expect(urlAfter).toBe(urlBefore);
		expect(urlAfter).not.toContain("example.com");
	});

	test("blocks navigation to a foreign file:// document such as a dropped HTML file", async () => {
		// Chromium navigates to a file dropped outside the drop zone. The preload runs in
		// whatever document the window shows, so a foreign file:// page must never load.
		const dir = mkdtempSync(path.join(tmpdir(), "exifcleaner-nav-"));
		const htmlPath = path.join(dir, "dropped.html");
		writeFileSync(htmlPath, "<!doctype html><title>dropped</title>");
		const foreignUrl = pathToFileURL(htmlPath).href;
		const urlBefore = page.url();

		try {
			const navigated = page
				.waitForEvent("framenavigated", { timeout: 1_000 })
				.then(() => true)
				.catch(() => false);
			await page.evaluate((url) => {
				window.location.href = url;
			}, foreignUrl);

			expect(await navigated).toBe(false);
			expect(page.url()).toBe(urlBefore);
			expect(
				await page.evaluate(() => typeof window.api?.exif?.readMetadata),
			).toBe("function");
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});
