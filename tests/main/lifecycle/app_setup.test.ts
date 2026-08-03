import { beforeEach, describe, expect, it, vi } from "vitest";

const appMock = vi.hoisted(() => ({
	requestSingleInstanceLock: vi.fn(() => true),
	quit: vi.fn(),
	on: vi.fn(),
}));
const platformMock = vi.hoisted(() => ({ isMac: true, isWindows: false }));

vi.mock("electron", () => ({ app: appMock }));
vi.mock("../../../src/common", () => ({
	isMac: () => platformMock.isMac,
	isWindows: () => platformMock.isWindows,
}));
vi.mock("../../../src/infrastructure", () => ({
	restoreWindowAndFocus: vi.fn(),
}));
vi.mock("../../../src/main/file_open", () => ({ fileOpen: vi.fn() }));

import { setupApp } from "../../../src/main/lifecycle/app_setup";

function listener(eventName: string): (...args: unknown[]) => void {
	const call = appMock.on.mock.calls.find(([event]) => event === eventName);
	if (!call) throw new Error(`No ${eventName} listener registered`);
	return call[1] as (...args: unknown[]) => void;
}

beforeEach(() => {
	appMock.requestSingleInstanceLock.mockReturnValue(true);
	appMock.quit.mockClear();
	appMock.on.mockClear();
	platformMock.isMac = true;
	platformMock.isWindows = false;
});

describe("setupApp lifecycle", () => {
	it("keeps the process alive when the last macOS window closes", () => {
		setupApp({ getWindow: () => null, onQuit: vi.fn() });

		listener("window-all-closed")();

		expect(appMock.quit).not.toHaveBeenCalled();
	});

	it("quits after the last window closes on non-macOS platforms", () => {
		platformMock.isMac = false;
		setupApp({ getWindow: () => null, onQuit: vi.fn() });

		listener("window-all-closed")();

		expect(appMock.quit).toHaveBeenCalledOnce();
	});

	it("registers each process-wide app listener only once per setup", () => {
		setupApp({ getWindow: () => null, onQuit: vi.fn() });

		expect(appMock.on.mock.calls.map(([event]) => event)).toEqual([
			"second-instance",
			"window-all-closed",
			"will-quit",
		]);
	});
});
