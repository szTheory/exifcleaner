import { it, expect, describe } from "vitest";
import { assertNever, getOrThrow } from "../../src/common/types";

describe("getOrThrow", () => {
	it("returns value when key exists", () => {
		const map = new Map<string, number>([["a", 1]]);
		expect(getOrThrow(map, "a")).toBe(1);
	});

	it("throws Error with key in message when key is missing", () => {
		const map = new Map<string, number>();
		expect(() => getOrThrow(map, "missingKey")).toThrowError(
			/missingKey/,
		);
	});

	it("throws an Error instance (not a string)", () => {
		const map = new Map<string, number>();
		try {
			getOrThrow(map, "x");
			expect.fail("should have thrown");
		} catch (err: unknown) {
			expect(err).toBeInstanceOf(Error);
		}
	});
});

describe("assertNever", () => {
	it("throws at runtime when called with a value", () => {
		// Cast to never for test purposes (test files are exempt per D-18)
		const value = "unexpected" as never;
		expect(() => assertNever(value)).toThrowError(/unexpected/i);
	});

	it("throws with custom message when provided", () => {
		const value = 42 as never;
		expect(() => assertNever(value, "custom error")).toThrowError(
			"custom error",
		);
	});

	it("throws an Error instance", () => {
		const value = "x" as never;
		try {
			assertNever(value);
			expect.fail("should have thrown");
		} catch (err: unknown) {
			expect(err).toBeInstanceOf(Error);
		}
	});
});
