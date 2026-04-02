import { describe, it, expect, vi } from "vitest";
import { logError } from "../../src/common/log_error";

describe("logError", () => {
	it("calls console.error with domain prefix", () => {
		const spy = vi.spyOn(console, "error").mockImplementation(() => {});

		const error = new Error("test");
		logError("exif", error);

		expect(spy).toHaveBeenCalledWith("[exif]", error);
		spy.mockRestore();
	});

	it("formats domain prefix with brackets", () => {
		const spy = vi.spyOn(console, "error").mockImplementation(() => {});

		logError("settings", "something went wrong");

		expect(spy).toHaveBeenCalledWith("[settings]", "something went wrong");
		spy.mockRestore();
	});
});
