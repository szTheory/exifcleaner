import { it, expect, describe } from "vitest";
import {
	parseAccentColorHex,
	ACCENT_COLOR_FALLBACK,
} from "../../src/domain/accent_color";

describe("ACCENT_COLOR_FALLBACK", () => {
	it("is #007AFF", () => {
		expect(ACCENT_COLOR_FALLBACK).toBe("#007AFF");
	});
});

describe("parseAccentColorHex", () => {
	it("strips alpha and prepends # for 8-char RGBA string", () => {
		expect(parseAccentColorHex({ raw: "aabbccdd" })).toBe("#aabbcc");
	});

	it("lowercases the output", () => {
		expect(parseAccentColorHex({ raw: "FF0000FF" })).toBe("#ff0000");
	});

	it("returns fallback for empty string", () => {
		expect(parseAccentColorHex({ raw: "" })).toBe("#007AFF");
	});

	it("returns fallback for short strings", () => {
		expect(parseAccentColorHex({ raw: "abc" })).toBe("#007AFF");
	});

	it("returns fallback for non-string input", () => {
		expect(
			parseAccentColorHex({ raw: undefined as unknown as string }),
		).toBe("#007AFF");
	});
});
