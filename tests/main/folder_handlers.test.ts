import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IpcMainInvokeEvent } from "electron";
import type { Container } from "../../src/main/container";
import { IPC_CHANNELS } from "../../src/common";
import { setupFolderHandlers } from "../../src/main/folder_handlers";
import {
	registerAllowedSender,
	unregisterSender,
} from "../../src/main/ipc/ipc_validation";

const ipcHandleMock = vi.hoisted(() => vi.fn());
const showOpenDialogMock = vi.hoisted(() => vi.fn());

vi.mock("electron", () => ({
	dialog: { showOpenDialog: showOpenDialogMock },
	ipcMain: { handle: ipcHandleMock },
}));

const TEST_SENDER_ID = 726;

function captureHandler(channel: string) {
	const call = ipcHandleMock.mock.calls.find(
		([registered]) => registered === channel,
	);
	if (!call) throw new Error(`No handler registered for ${channel}`);
	return call[1] as (
		event: IpcMainInvokeEvent,
		payload: unknown,
	) => Promise<unknown>;
}

function authorizedEvent(): IpcMainInvokeEvent {
	registerAllowedSender(TEST_SENDER_ID);
	return { sender: { id: TEST_SENDER_ID } } as IpcMainInvokeEvent;
}

beforeEach(() => {
	ipcHandleMock.mockClear();
	showOpenDialogMock.mockReset();
	unregisterSender(TEST_SENDER_ID);
	setupFolderHandlers({
		container: {
			expandFolder: { execute: vi.fn() },
		} as unknown as Container,
		getWindow: () => null,
	});
});

describe("native picker handlers", () => {
	it("returns all selected safe files", async () => {
		showOpenDialogMock.mockResolvedValue({
			canceled: false,
			filePaths: ["/photos/one.jpg", "/photos/two.png"],
		});

		const result = await captureHandler(IPC_CHANNELS.FILES_CHOOSE)(
			authorizedEvent(),
			undefined,
		);

		expect(result).toEqual(["/photos/one.jpg", "/photos/two.png"]);
	});

	it("returns an empty list on file-picker cancellation", async () => {
		showOpenDialogMock.mockResolvedValue({ canceled: true, filePaths: [] });

		const result = await captureHandler(IPC_CHANNELS.FILES_CHOOSE)(
			authorizedEvent(),
			undefined,
		);

		expect(result).toEqual([]);
	});

	it("returns one folder path or null on cancellation", async () => {
		showOpenDialogMock
			.mockResolvedValueOnce({
				canceled: false,
				filePaths: ["/photos"],
			})
			.mockResolvedValueOnce({ canceled: true, filePaths: [] });
		const handler = captureHandler(IPC_CHANNELS.FOLDER_CHOOSE);
		const event = authorizedEvent();

		expect(await handler(event, undefined)).toBe("/photos");
		expect(await handler(event, undefined)).toBeNull();
	});

	it("does not expose newline-bearing native paths to the renderer", async () => {
		showOpenDialogMock.mockResolvedValue({
			canceled: false,
			filePaths: ["/photos/safe.jpg", "/photos/unsafe\n-execute9.jpg"],
		});

		const result = await captureHandler(IPC_CHANNELS.FILES_CHOOSE)(
			authorizedEvent(),
			undefined,
		);

		expect(result).toEqual(["/photos/safe.jpg"]);
	});
});
