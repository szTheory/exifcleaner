import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	openExternal: vi.fn(),
}));

vi.mock("electron", () => ({
	app: {
		getLocale: () => "en",
		getName: () => "ExifCleaner",
		getVersion: () => "4.2.0",
	},
	shell: { openExternal: mocks.openExternal },
}));

vi.mock("../../../src/common", () => ({ isMac: () => true }));
vi.mock("../../../src/main/menu/menu_app_about", () => ({
	showAboutWindow: vi.fn(),
}));
vi.mock("../../../src/main/i18n", () => ({
	i18n: ({ key }: { key: string }) =>
		key === "menu.help.new-releases" ? "New Releases…" : key,
}));

import { helpMenuTemplate } from "../../../src/main/menu/menu_help";

describe("Help menu", () => {
	beforeEach(() => {
		mocks.openExternal.mockClear();
	});

	it("opens the releases page only after the user activates New Releases", () => {
		const submenu = helpMenuTemplate().submenu;
		expect(Array.isArray(submenu)).toBe(true);

		const releasesItem = Array.isArray(submenu)
			? submenu.find((item) => item.label === "New Releases…")
			: undefined;
		expect(releasesItem).toBeDefined();
		expect(mocks.openExternal).not.toHaveBeenCalled();

		(releasesItem?.click as (() => void) | undefined)?.();

		expect(mocks.openExternal).toHaveBeenCalledOnce();
		expect(mocks.openExternal).toHaveBeenCalledWith(
			"https://github.com/szTheory/exifcleaner/releases",
		);
	});
});
