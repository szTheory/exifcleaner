import { describe, it, expect, beforeEach } from "vitest";
import { hardenNavigation } from "../../../src/main/security/navigation";
import {
	createFakeBrowserWindow,
	createFakeNavigateEvent,
} from "../../fakes/electron_fakes";
import type { FakeBrowserWindow } from "../../fakes/electron_fakes";
import type { AppUrlPolicy } from "../../../src/main/security/app_url";

const ENTRY_URL =
	"file:///Applications/ExifCleaner.app/Contents/Resources/app.asar/out/renderer/index.html";
const PACKAGED: AppUrlPolicy = {
	isPackaged: true,
	rendererEntryUrl: ENTRY_URL,
};
const DEV: AppUrlPolicy = {
	isPackaged: false,
	rendererEntryUrl: ENTRY_URL,
	devServerUrl: "http://localhost:5173/",
};

describe("hardenNavigation", () => {
	let fakeWin: FakeBrowserWindow;
	let openExternalCalls: string[];

	beforeEach(() => {
		fakeWin = createFakeBrowserWindow();
		openExternalCalls = [];
		// Inject fake openExternal for testability (no vi.mock needed)
		hardenNavigation(fakeWin as never, PACKAGED, (url: string) => {
			openExternalCalls.push(url);
		});
	});

	describe("will-navigate", () => {
		function triggerNavigate(url: string, win: FakeBrowserWindow = fakeWin) {
			const event = createFakeNavigateEvent();
			const handler = win.webContents.handlers.get("will-navigate");
			if (!handler) throw new Error("will-navigate handler not installed");
			handler(event, url);
			return event;
		}

		function devWindow(): FakeBrowserWindow {
			const win = createFakeBrowserWindow();
			hardenNavigation(win as never, DEV, () => {});
			return win;
		}

		it("allows the bundled renderer entry", () => {
			const event = triggerNavigate(ENTRY_URL);
			expect(event.defaultPrevented).toBe(false);
		});

		it("allows the bundled renderer entry with a hash", () => {
			const event = triggerNavigate(`${ENTRY_URL}#/settings`);
			expect(event.defaultPrevented).toBe(false);
		});

		it("blocks a dropped HTML file (other file:// documents)", () => {
			const event = triggerNavigate("file:///Users/test/Downloads/evil.html");
			expect(event.defaultPrevented).toBe(true);
		});

		it("blocks https://evil.com", () => {
			const event = triggerNavigate("https://evil.com/phish");
			expect(event.defaultPrevented).toBe(true);
		});

		it("blocks http://localhost in packaged builds", () => {
			const event = triggerNavigate("http://localhost:5173/");
			expect(event.defaultPrevented).toBe(true);
		});

		it("allows the dev server origin in unpackaged builds", () => {
			const event = triggerNavigate(
				"http://localhost:5173/index.html",
				devWindow(),
			);
			expect(event.defaultPrevented).toBe(false);
		});

		it("blocks other localhost ports in unpackaged builds", () => {
			const event = triggerNavigate("http://localhost:8080/", devWindow());
			expect(event.defaultPrevented).toBe(true);
		});

		it("blocks userinfo tricks that only look like the dev server", () => {
			const event = triggerNavigate(
				"http://localhost:5173@evil.com/",
				devWindow(),
			);
			expect(event.defaultPrevented).toBe(true);
		});
	});

	describe("setWindowOpenHandler", () => {
		it("returns deny for all URLs", () => {
			const handler = fakeWin.webContents.windowOpenHandler;
			if (!handler) throw new Error("windowOpenHandler not installed");
			const result = handler({ url: "https://example.com" });
			expect(result).toEqual({ action: "deny" });
		});

		it("calls openExternal for HTTPS URLs", () => {
			const handler = fakeWin.webContents.windowOpenHandler;
			if (!handler) throw new Error("windowOpenHandler not installed");
			handler({ url: "https://example.com/docs" });
			expect(openExternalCalls).toContain("https://example.com/docs");
		});

		it("does not call openExternal for HTTP URLs", () => {
			const handler = fakeWin.webContents.windowOpenHandler;
			if (!handler) throw new Error("windowOpenHandler not installed");
			handler({ url: "http://example.com" });
			expect(openExternalCalls).toHaveLength(0);
		});
	});
});
