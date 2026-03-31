import { describe, expect, it } from "vitest";
import {
	isWithinDisplayBounds,
	validateAndLoadState,
} from "../../src/main/window/window_state";
import type { Display } from "electron";

// Helper to create a display-like object with workArea
function makeDisplay(x: number, y: number, width: number, height: number): Display {
	return {
		workArea: { x, y, width, height },
	} as Display;
}

describe("isWithinDisplayBounds", () => {
	const singleDisplay = [makeDisplay(0, 0, 1920, 1080)];
	const dualDisplays = [
		makeDisplay(0, 0, 1920, 1080),
		makeDisplay(1920, 0, 2560, 1440),
	];

	it("returns true when window is fully inside a single display", () => {
		const result = isWithinDisplayBounds(
			{ x: 100, y: 100, width: 580, height: 337 },
			singleDisplay,
		);
		expect(result).toBe(true);
	});

	it("returns false when window is completely outside all displays", () => {
		const result = isWithinDisplayBounds(
			{ x: 5000, y: 5000, width: 580, height: 337 },
			singleDisplay,
		);
		expect(result).toBe(false);
	});

	it("returns true when window is on the second display", () => {
		const result = isWithinDisplayBounds(
			{ x: 2000, y: 100, width: 580, height: 337 },
			dualDisplays,
		);
		expect(result).toBe(true);
	});

	it("returns true when window at 0,0 with default size fits primary display", () => {
		const result = isWithinDisplayBounds(
			{ x: 0, y: 0, width: 580, height: 337 },
			singleDisplay,
		);
		expect(result).toBe(true);
	});

	it("returns false when negative coordinates do not overlap any display", () => {
		const result = isWithinDisplayBounds(
			{ x: -2000, y: -2000, width: 580, height: 337 },
			singleDisplay,
		);
		expect(result).toBe(false);
	});

	it("returns true when window partially overlaps a display", () => {
		// Window extends beyond right edge but still overlaps
		const result = isWithinDisplayBounds(
			{ x: 1800, y: 100, width: 580, height: 337 },
			singleDisplay,
		);
		expect(result).toBe(true);
	});

	it("returns false when window is between displays with no overlap", () => {
		// Gap between displays (display 1 ends at 1920, display 2 starts at 2000)
		const gapDisplays = [
			makeDisplay(0, 0, 1920, 1080),
			makeDisplay(2000, 0, 2560, 1440),
		];
		const result = isWithinDisplayBounds(
			{ x: 1920, y: 0, width: 80, height: 337 },
			gapDisplays,
		);
		expect(result).toBe(false);
	});
});

describe("validateAndLoadState", () => {
	const displays = [makeDisplay(0, 0, 1920, 1080)];
	const defaultState = {
		width: 580,
		height: 337,
		x: undefined,
		y: undefined,
		isMaximized: false,
	};

	it("returns default state when json is null", () => {
		const result = validateAndLoadState(null, displays);
		expect(result).toEqual(defaultState);
	});

	it("returns default state when json is invalid", () => {
		const result = validateAndLoadState("not json", displays);
		expect(result).toEqual(defaultState);
	});

	it("returns saved state when valid and within display bounds", () => {
		const saved = JSON.stringify({
			width: 800,
			height: 600,
			x: 100,
			y: 100,
			isMaximized: false,
		});
		const result = validateAndLoadState(saved, displays);
		expect(result).toEqual({
			width: 800,
			height: 600,
			x: 100,
			y: 100,
			isMaximized: false,
		});
	});

	it("returns state with undefined position when saved position is off-screen", () => {
		const saved = JSON.stringify({
			width: 800,
			height: 600,
			x: 5000,
			y: 5000,
			isMaximized: false,
		});
		const result = validateAndLoadState(saved, displays);
		expect(result).toEqual({
			width: 800,
			height: 600,
			x: undefined,
			y: undefined,
			isMaximized: false,
		});
	});

	it("returns default state when JSON has missing required fields", () => {
		const saved = JSON.stringify({ width: 800 });
		const result = validateAndLoadState(saved, displays);
		expect(result).toEqual(defaultState);
	});

	it("returns default state when width/height are invalid numbers", () => {
		const saved = JSON.stringify({
			width: -1,
			height: 0,
			x: 100,
			y: 100,
			isMaximized: false,
		});
		const result = validateAndLoadState(saved, displays);
		expect(result).toEqual(defaultState);
	});

	it("preserves isMaximized flag from saved state", () => {
		const saved = JSON.stringify({
			width: 800,
			height: 600,
			x: 100,
			y: 100,
			isMaximized: true,
		});
		const result = validateAndLoadState(saved, displays);
		expect(result.isMaximized).toBe(true);
	});
});
