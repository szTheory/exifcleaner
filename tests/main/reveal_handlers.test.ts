import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { IpcMainInvokeEvent } from "electron";
import {
	registerAllowedSender,
	unregisterSender,
} from "../../src/main/ipc/ipc_validation";
import { setupRevealHandlers } from "../../src/main/reveal_handlers";

const ipcHandleMock = vi.hoisted(() => vi.fn());
const existsSyncMock = vi.hoisted(() => vi.fn());
const showItemInFolderMock = vi.hoisted(() => vi.fn());
const buildFromTemplateMock = vi.hoisted(() => vi.fn());
const popupMock = vi.hoisted(() => vi.fn());
const getAllWindowsMock = vi.hoisted(() => vi.fn());

vi.mock("electron", () => ({
	ipcMain: { handle: ipcHandleMock },
	shell: { showItemInFolder: showItemInFolderMock },
	Menu: {
		buildFromTemplate: (template: unknown) => {
			buildFromTemplateMock(template);
			return { popup: popupMock };
		},
	},
	BrowserWindow: { getAllWindows: getAllWindowsMock },
}));

vi.mock("node:fs", () => ({ existsSync: existsSyncMock }));

const TEST_SENDER_ID = 2109;

function captureContextMenuHandler(): (
	event: IpcMainInvokeEvent,
	payload: unknown,
) => Promise<unknown> {
	const call = ipcHandleMock.mock.calls.find(([channel]) => {
		return channel === "file:reveal-context-menu";
	});
	if (call === undefined)
		throw new Error("Context-menu handler was not registered");
	return call[1] as (
		event: IpcMainInvokeEvent,
		payload: unknown,
	) => Promise<unknown>;
}

function makeAuthorizedEvent(): IpcMainInvokeEvent {
	registerAllowedSender(TEST_SENDER_ID);
	return { sender: { id: TEST_SENDER_ID } } as IpcMainInvokeEvent;
}

beforeEach(() => {
	ipcHandleMock.mockClear();
	existsSyncMock.mockReset();
	showItemInFolderMock.mockReset();
	buildFromTemplateMock.mockReset();
	popupMock.mockReset();
	getAllWindowsMock.mockReset();
	getAllWindowsMock.mockReturnValue([{}]);
	existsSyncMock.mockReturnValue(true);
});

afterEach(() => {
	unregisterSender(TEST_SENDER_ID);
});

describe("save-as-copy reveal context menu", () => {
	it("reveals each validated concrete artifact from its corresponding native menu callback", async () => {
		setupRevealHandlers();
		const handler = captureContextMenuHandler();

		await expect(
			handler(makeAuthorizedEvent(), {
				cleanedPath: "/photos/sample_cleaned_2.jpg",
				originalPath: "/photos/sample.jpg",
			}),
		).resolves.toEqual({ success: true });

		expect(popupMock).toHaveBeenCalledWith({ window: {} });
		const template = buildFromTemplateMock.mock.calls[0]?.[0] as Array<{
			id: string;
			label: string;
			click?: () => void;
		}>;
		const cleanedCopyItem = template.find(
			({ label }) => label === "Reveal Cleaned Copy",
		);
		const originalItem = template.find(
			({ label }) => label === "Reveal Original",
		);

		expect(cleanedCopyItem?.click).toBeTypeOf("function");
		expect(originalItem?.click).toBeTypeOf("function");
		expect(cleanedCopyItem?.id).toBe("reveal-cleaned-copy");
		expect(originalItem?.id).toBe("reveal-original");
		cleanedCopyItem?.click?.();
		originalItem?.click?.();

		expect(existsSyncMock).toHaveBeenCalledWith("/photos/sample_cleaned_2.jpg");
		expect(existsSyncMock).toHaveBeenCalledWith("/photos/sample.jpg");
		expect(showItemInFolderMock).toHaveBeenNthCalledWith(
			1,
			"/photos/sample_cleaned_2.jpg",
		);
		expect(showItemInFolderMock).toHaveBeenNthCalledWith(
			2,
			"/photos/sample.jpg",
		);
	});
});
