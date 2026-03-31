import { app, screen } from "electron";
import type { BrowserWindow, Display } from "electron";
import { readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { rename } from "node:fs/promises";
import path from "node:path";

export interface WindowState {
	width: number;
	height: number;
	x: number | undefined;
	y: number | undefined;
	isMaximized: boolean;
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

/**
 * Pure function: checks if a window rect overlaps any display work area.
 * Overlap means the window's rectangle intersects with at least one display.
 */
export function isWithinDisplayBounds(
	bounds: { x: number; y: number; width: number; height: number },
	displays: Display[],
): boolean {
	for (const display of displays) {
		const area = display.workArea;
		// Check rectangle intersection: two rects overlap if and only if
		// neither is fully to the left, right, above, or below the other
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

/**
 * Pure function: validates JSON string and returns a WindowState.
 * Testable without Electron's screen or fs modules.
 */
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

	if (typeof parsed !== "object" || parsed === null) {
		return { ...DEFAULT_STATE };
	}

	const obj = parsed as Record<string, unknown>;

	// Validate required fields
	if (
		typeof obj["width"] !== "number" ||
		typeof obj["height"] !== "number" ||
		typeof obj["isMaximized"] !== "boolean"
	) {
		return { ...DEFAULT_STATE };
	}

	const width = obj["width"];
	const height = obj["height"];
	const isMaximized = obj["isMaximized"];

	// Validate dimensions are positive
	if (width <= 0 || height <= 0) {
		return { ...DEFAULT_STATE };
	}

	// Position may be undefined (first launch or intentionally centered)
	const x = typeof obj["x"] === "number" ? obj["x"] : undefined;
	const y = typeof obj["y"] === "number" ? obj["y"] : undefined;

	// If position is defined, check it's within display bounds
	if (x !== undefined && y !== undefined) {
		if (!isWithinDisplayBounds({ x, y, width, height }, displays)) {
			// Off-screen: keep dimensions but reset position
			return { width, height, x: undefined, y: undefined, isMaximized };
		}
	}

	return { width, height, x, y, isMaximized };
}

/**
 * Loads window state from disk. Synchronous since it runs once before
 * window creation and the file is tiny (<200 bytes).
 */
export function loadWindowState(): WindowState {
	try {
		const json = readFileSync(getStatePath(), "utf-8");
		const displays = screen.getAllDisplays();
		return validateAndLoadState(json, displays);
	} catch {
		return { ...DEFAULT_STATE };
	}
}

/**
 * Saves current window bounds to disk using atomic write.
 * Only saves if window is not minimized (avoid saving minimized dimensions).
 */
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
		// Atomic rename (sync for close event reliability)
		const fs = require("node:fs") as typeof import("node:fs");
		fs.renameSync(tempPath, statePath);
	} catch (err: unknown) {
		console.error("Failed to save window state", String(err));
	}
}

/**
 * Attaches resize, move, and close handlers that persist window state.
 * Uses debounced save (300ms) for resize/move to avoid disk thrashing.
 */
export function setupWindowStatePersistence(win: BrowserWindow): void {
	let saveTimeout: ReturnType<typeof setTimeout> | undefined;

	const debouncedSave = (): void => {
		if (saveTimeout !== undefined) {
			clearTimeout(saveTimeout);
		}
		saveTimeout = setTimeout(() => {
			saveWindowState(win);
		}, 300);
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
