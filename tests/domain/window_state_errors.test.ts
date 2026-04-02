import { describe, it, expect } from "vitest";
import { formatWindowStateError } from "../../src/domain/window_state_errors";
import type { WindowStateError } from "../../src/domain/window_state_errors";

describe("WindowStateError", () => {
	describe("formatWindowStateError", () => {
		it("formats save-failed with window context and cause", () => {
			const result = formatWindowStateError({
				code: "save-failed",
				filePath: "/p",
				cause: "ENOSPC",
			});

			expect(result).toMatch(/window/i);
			expect(result).toContain("ENOSPC");
		});

		it("produces non-empty strings for all codes", () => {
			const errors: WindowStateError[] = [
				{ code: "save-failed", filePath: "/p", cause: "err" },
			];

			for (const error of errors) {
				expect(
					formatWindowStateError(error).length,
				).toBeGreaterThan(0);
			}
		});
	});

	describe("serialization", () => {
		it("all error variants survive JSON round-trip", () => {
			const errors: WindowStateError[] = [
				{ code: "save-failed", filePath: "/p", cause: "ENOSPC" },
			];

			for (const error of errors) {
				const roundTripped = JSON.parse(
					JSON.stringify(error),
				) as WindowStateError;
				expect(roundTripped).toEqual(error);
			}
		});
	});
});
