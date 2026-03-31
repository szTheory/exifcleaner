// Hand-rolled fakes for Electron objects used in security/IPC tests.
// No vi.mock — consistent with project convention (D-34).

export interface FakeNavigateEvent {
	defaultPrevented: boolean;
	preventDefault(): void;
}

export function createFakeNavigateEvent(): FakeNavigateEvent {
	return {
		defaultPrevented: false,
		preventDefault() {
			this.defaultPrevented = true;
		},
	};
}

export interface FakeBrowserWindow {
	webContents: {
		id: number;
		handlers: Map<string, (...args: unknown[]) => void>;
		windowOpenHandler:
			| ((details: { url: string }) => { action: string })
			| null;
		on(event: string, handler: (...args: unknown[]) => void): void;
		setWindowOpenHandler(
			handler: (details: { url: string }) => { action: string },
		): void;
	};
}

export function createFakeBrowserWindow(
	webContentsId: number = 1,
): FakeBrowserWindow {
	const handlers = new Map<string, (...args: unknown[]) => void>();
	return {
		webContents: {
			id: webContentsId,
			handlers,
			windowOpenHandler: null,
			on(event: string, handler: (...args: unknown[]) => void) {
				handlers.set(event, handler);
			},
			setWindowOpenHandler(
				handler: (details: { url: string }) => { action: string },
			) {
				this.windowOpenHandler = handler;
			},
		},
	};
}

export function createFakeIpcEvent(senderId: number): {
	sender: { id: number };
} {
	return { sender: { id: senderId } };
}

export interface FakeSession {
	permissionHandler:
		| ((
				webContents: unknown,
				permission: string,
				callback: (granted: boolean) => void,
		  ) => void)
		| null;
	setPermissionRequestHandler(
		handler: (
			webContents: unknown,
			permission: string,
			callback: (granted: boolean) => void,
		) => void,
	): void;
}

export function createFakeSession(): FakeSession {
	return {
		permissionHandler: null,
		setPermissionRequestHandler(
			handler: (
				webContents: unknown,
				permission: string,
				callback: (granted: boolean) => void,
			) => void,
		) {
			this.permissionHandler = handler;
		},
	};
}
