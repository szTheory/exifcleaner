import { describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS, type Settings } from "../../src/domain";
import type { Container } from "../../src/main/container";

const mocks = vi.hoisted(() => ({
	handleLanguageChange: vi.fn(),
}));

vi.mock("electron", () => ({
	ipcMain: { handle: vi.fn() },
}));

vi.mock("../../src/main/i18n", () => ({
	handleLanguageChange: mocks.handleLanguageChange,
}));

describe("settings update notifications", () => {
	it("persists before broadcasting settings and the effective language", async () => {
		let settings: Settings = { ...DEFAULT_SETTINGS, language: "en" };
		let finishWrite: (() => void) | undefined;
		const writeStarted = new Promise<void>((resolve) => {
			finishWrite = resolve;
		});
		const update = vi.fn(
			async ({ partial }: { partial: Partial<Settings> }) => {
				await writeStarted;
				settings = { ...settings, ...partial };
			},
		);
		const send = vi.fn();
		const container = {
			settings: { get: () => settings, update },
		} as unknown as Container;
		const { updateSettingsAndNotify } =
			await import("../../src/main/settings_handlers");

		const pending = updateSettingsAndNotify({
			container,
			getWindow: () => ({ webContents: { send } }) as never,
			partial: { language: "fr" },
		});

		expect(send).not.toHaveBeenCalled();
		expect(mocks.handleLanguageChange).not.toHaveBeenCalled();

		finishWrite?.();
		const result = await pending;

		expect(result.language).toBe("fr");
		expect(send).toHaveBeenCalledWith("settings:changed", result);
		expect(mocks.handleLanguageChange).toHaveBeenCalledWith("en", "fr");
	});
});
