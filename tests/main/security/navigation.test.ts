import { describe, it, expect, beforeEach } from "vitest";
import { hardenNavigation } from "../../../src/main/security/navigation";
import {
	createFakeBrowserWindow,
	createFakeNavigateEvent,
} from "../../fakes/electron_fakes";
import type { FakeBrowserWindow } from "../../fakes/electron_fakes";

describe("hardenNavigation", () => {
	let fakeWin: FakeBrowserWindow;
	let openExternalCalls: string[];

	beforeEach(() => {
		fakeWin = createFakeBrowserWindow();
		openExternalCalls = [];
		// Inject fake openExternal for testability (no vi.mock needed)
		hardenNavigation(fakeWin as never, (url: string) => {
			openExternalCalls.push(url);
		});
	});

	describe("will-navigate", () => {
		function triggerNavigate(url: string) {
			const event = createFakeNavigateEvent();
			const handler = fakeWin.webContents.handlers.get("will-navigate");
			if (!handler) throw new Error("will-navigate handler not installed");
			handler(event, url);
			return event;
		}

		it("allows file:// URL", () => {
			const event = triggerNavigate("file:///Users/test/app/index.html");
			expect(event.defaultPrevented).toBe(false);
		});

		it("blocks https://evil.com", () => {
			const event = triggerNavigate("https://evil.com/phish");
			expect(event.defaultPrevented).toBe(true);
		});

		it("allows http://localhost:5173 in dev mode", () => {
			const origEnv = process.env.NODE_ENV;
			process.env.NODE_ENV = "development";
			try {
				const event = triggerNavigate("http://localhost:5173/");
				expect(event.defaultPrevented).toBe(false);
			} finally {
				process.env.NODE_ENV = origEnv;
			}
		});

		it("blocks http://localhost:5173 in production", () => {
			const origEnv = process.env.NODE_ENV;
			process.env.NODE_ENV = "production";
			try {
				const event = triggerNavigate("http://localhost:5173/");
				expect(event.defaultPrevented).toBe(true);
			} finally {
				process.env.NODE_ENV = origEnv;
			}
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
