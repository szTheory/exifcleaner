import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	createContainer: vi.fn(),
	initContainer: vi.fn(),
	registerAllowedSender: vi.fn(),
	unregisterSender: vi.fn(),
	hardenNavigation: vi.fn(),
	installPermissionGate: vi.fn(),
	setupExifHandlers: vi.fn(),
	setupFolderHandlers: vi.fn(),
	setupSettingsHandlers: vi.fn(),
	setupThemeHandlers: vi.fn(),
	setupRevealHandlers: vi.fn(),
	setupContextMenu: vi.fn(),
	setupDockEventHandlers: vi.fn(),
	setupApp: vi.fn(),
}));

vi.mock("electron", () => ({
	app: { setAppUserModelId: vi.fn() },
}));
vi.mock("../../src/infrastructure", () => ({ preloadI18nStrings: vi.fn() }));
vi.mock("../../src/main/container", () => ({
	createContainer: mocks.createContainer,
	initContainer: mocks.initContainer,
}));
vi.mock("../../src/main/security/navigation", () => ({
	hardenNavigation: mocks.hardenNavigation,
}));
vi.mock("../../src/main/security/permissions", () => ({
	installPermissionGate: mocks.installPermissionGate,
}));
vi.mock("../../src/main/ipc/ipc_validation", () => ({
	registerAllowedSender: mocks.registerAllowedSender,
	unregisterSender: mocks.unregisterSender,
}));
vi.mock("../../src/main/i18n", () => ({
	setupI18nHandlers: vi.fn(),
	setContainer: vi.fn(),
	handleLanguageChange: vi.fn(),
	setLanguageChangeCallback: vi.fn(),
}));
vi.mock("../../src/main/menu/menu", () => ({ setupMenus: vi.fn() }));
vi.mock("../../src/main/menu/menu_view", () => ({
	setLanguageChangeHandler: vi.fn(),
	setLanguageSettingGetter: vi.fn(),
	setThemeChangeHandler: vi.fn(),
	setThemeSettingGetter: vi.fn(),
}));
vi.mock("../../src/main/menu/menu_dock", () => ({
	setDockLanguageChangeHandler: vi.fn(),
	setDockLanguageSettingGetter: vi.fn(),
}));
vi.mock("../../src/main/exif_handlers", () => ({
	setupExifHandlers: mocks.setupExifHandlers,
}));
vi.mock("../../src/main/folder_handlers", () => ({
	setupFolderHandlers: mocks.setupFolderHandlers,
}));
vi.mock("../../src/main/settings_handlers", () => ({
	setupSettingsHandlers: mocks.setupSettingsHandlers,
}));
vi.mock("../../src/main/theme_handlers", () => ({
	setupThemeHandlers: mocks.setupThemeHandlers,
}));
vi.mock("../../src/main/reveal_handlers", () => ({
	setupRevealHandlers: mocks.setupRevealHandlers,
}));
vi.mock("../../src/main/window/context_menu", () => ({
	setupContextMenu: mocks.setupContextMenu,
}));
vi.mock("../../src/main/lifecycle/dock", () => ({
	setupDockEventHandlers: mocks.setupDockEventHandlers,
}));
vi.mock("../../src/main/lifecycle/app_setup", () => ({
	setupApp: mocks.setupApp,
}));

describe("main process initialization", () => {
	beforeEach(() => {
		vi.resetModules();
		Object.values(mocks).forEach((mock) => mock.mockReset());
		mocks.createContainer.mockReturnValue({
			settings: {
				get: () => ({ language: null, themeMode: "system" }),
				update: vi.fn(),
			},
			exiftoolProcess: { close: vi.fn() },
		});
		mocks.initContainer.mockResolvedValue(undefined);
	});

	it("initializes the container and process-wide handlers only once", async () => {
		const { initProcess } = await import("../../src/main/init");

		const [first, second] = await Promise.all([initProcess(), initProcess()]);

		expect(first).toBe(second);
		expect(mocks.createContainer).toHaveBeenCalledOnce();
		expect(mocks.initContainer).toHaveBeenCalledOnce();
		expect(mocks.setupExifHandlers).toHaveBeenCalledOnce();
		expect(mocks.setupFolderHandlers).toHaveBeenCalledOnce();
		expect(mocks.setupApp).toHaveBeenCalledOnce();
	});

	it("attaches and unregisters sender security per window lifetime", async () => {
		const { attachWindow } = await import("../../src/main/init");
		let destroyed: (() => void) | undefined;
		const window = {
			isDestroyed: () => false,
			webContents: {
				id: 44,
				once: (_event: string, callback: () => void) => {
					destroyed = callback;
				},
			},
		} as never;

		attachWindow(window);
		destroyed?.();

		expect(mocks.registerAllowedSender).toHaveBeenCalledWith(44);
		expect(mocks.hardenNavigation).toHaveBeenCalledWith(window);
		expect(mocks.unregisterSender).toHaveBeenCalledWith(44);
	});
});
