import { app, screen } from "electron";
import type { BrowserWindow, Display } from "electron";
import { readFileSync, writeFileSync, renameSync } from "node:fs";
import { randomBytes } from "node:crypto";
import path from "node:path";

const WINDOW_STATE_SAVE_DEBOUNCE_MS = 300;

export interface WindowState {
	readonly width: number;
	readonly height: number;
	readonly x: number | undefined;
	readonly y: number | undefined;
	readonly isMaximized: boolean;
}

export function isWindowState(value: unknown): value is WindowState {
	if (typeof value !== "object" || value === null) {
		return false;
	}

	const obj: Record<string, unknown> = Object.create(null);
	Object.assign(obj, value);

	if (typeof obj["width"] !== "number" || typeof obj["height"] !== "number") {
		return false;
	}

	if (typeof obj["isMaximized"] !== "boolean") {
		return false;
	}

	if (obj["x"] !== undefined && typeof obj["x"] !== "number") {
		return false;
	}

	if (obj["y"] !== undefined && typeof obj["y"] !== "number") {
		return false;
	}

	return true;
}

const DEFAULT_WIDTH = 580;
const DEFAULT_HEIGHT = 337;

const DEFAULT_STATE: WindowState = {
	width: DEFAULT_WIDTH,
	height: DEFAULT_HEIGHT,
	x: undefined,
	y: undefined,
	isMaximized: false,
};

function getStatePath(): string {
	return path.join(app.getPath("userData"), "window-state.json");
}

// Pure function: checks if a window rect overlaps any display work area.
export function isWithinDisplayBounds(
	bounds: { x: number; y: number; width: number; height: number },
	displays: Display[],
): boolean {
	for (const display of displays) {
		const area = display.workArea;
		// Two rects overlap iff neither is fully to the left, right, above, or below the other
		const overlaps =
			bounds.x < area.x + area.width &&
			bounds.x + bounds.width > area.x &&
			bounds.y < area.y + area.height &&
			bounds.y + bounds.height > area.y;
		if (overlaps) {
			return true;
		}
	}
	return false;
}

// Pure function: validates JSON string and returns a WindowState.
// Testable without Electron's screen or fs modules.
export function validateAndLoadState(
	json: string | null,
	displays: Display[],
): WindowState {
	if (json === null) {
		return { ...DEFAULT_STATE };
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(json);
	} catch {
		return { ...DEFAULT_STATE };
	}

	if (!isWindowState(parsed)) {
		return { ...DEFAULT_STATE };
	}

	const { width, height, isMaximized, x, y } = parsed;

	if (width <= 0 || height <= 0) {
		return { ...DEFAULT_STATE };
	}

	if (x !== undefined && y !== undefined) {
		if (!isWithinDisplayBounds({ x, y, width, height }, displays)) {
			return { width, height, x: undefined, y: undefined, isMaximized };
		}
	}

	return { width, height, x, y, isMaximized };
}

// Synchronous since it runs once before window creation and the file is tiny (<200 bytes).
export function loadWindowState(): WindowState {
	try {
		const json = readFileSync(getStatePath(), "utf-8");
		const displays = screen.getAllDisplays();
		return validateAndLoadState(json, displays);
	} catch {
		return { ...DEFAULT_STATE };
	}
}

// Only saves if window is not minimized (avoid saving minimized dimensions).
export function saveWindowState(win: BrowserWindow): void {
	if (win.isMinimized()) {
		return;
	}

	const bounds = win.getBounds();
	const state: WindowState = {
		width: bounds.width,
		height: bounds.height,
		x: bounds.x,
		y: bounds.y,
		isMaximized: win.isMaximized(),
	};

	const json = JSON.stringify(state, null, "\t");
	const statePath = getStatePath();
	const tempPath = statePath + "." + randomBytes(6).toString("hex");

	try {
		writeFileSync(tempPath, json, "utf-8");
		// Atomic rename -- sync for close event reliability
		renameSync(tempPath, statePath);
	} catch (err: unknown) {
		console.error("Failed to save window state", String(err));
	}
}

// Debounced save for resize/move to avoid disk thrashing.
export function setupWindowStatePersistence(win: BrowserWindow): void {
	let saveTimeout: ReturnType<typeof setTimeout> | undefined;

	const debouncedSave = (): void => {
		if (saveTimeout !== undefined) {
			clearTimeout(saveTimeout);
		}
		saveTimeout = setTimeout(() => {
			saveWindowState(win);
		}, WINDOW_STATE_SAVE_DEBOUNCE_MS);
	};

	win.on("resize", debouncedSave);
	win.on("move", debouncedSave);
	win.on("close", () => {
		if (saveTimeout !== undefined) {
			clearTimeout(saveTimeout);
		}
		saveWindowState(win);
	});
}
