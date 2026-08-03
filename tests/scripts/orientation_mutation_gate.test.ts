import { describe, expect, test, vi } from "vitest";
import {
	applyOrientationMutation,
	executeOrientationMutation,
} from "../../scripts/orientation_mutation_gate.mjs";

const SOURCE = `
const preserveTags: string[] = [];
if (preserveOrientation) preserveTags.push("-Orientation");
if (preserveColorProfile) preserveTags.push("-ICC_Profile");
`;

describe("applyOrientationMutation", () => {
	test("removes exactly the production Orientation copy-back seam", () => {
		const mutated = applyOrientationMutation(SOURCE);

		expect(mutated).not.toContain('preserveTags.push("-Orientation")');
		expect(mutated).toContain('preserveTags.push("-ICC_Profile")');
	});

	test("refuses a missing or ambiguous seam", () => {
		expect(() => applyOrientationMutation("const x = 1;")).toThrow(
			"exactly one Orientation copy-back seam",
		);
		expect(() => applyOrientationMutation(`${SOURCE}\n${SOURCE}`)).toThrow(
			"exactly one Orientation copy-back seam",
		);
	});
});

describe("executeOrientationMutation", () => {
	test("requires RED, restores byte-for-byte, then requires GREEN", async () => {
		let current = SOURCE;
		const writes: string[] = [];
		const run = vi
			.fn()
			.mockResolvedValueOnce({ status: 0, output: "mutated compile ok" })
			.mockResolvedValueOnce({
				status: 1,
				output: 'Expected: "Rotate 90 CW" Received: undefined',
			})
			.mockResolvedValueOnce({ status: 0, output: "restored compile ok" })
			.mockResolvedValueOnce({ status: 0, output: "1 passed" });

		await executeOrientationMutation({
			readSource: () => current,
			writeSource: (value) => {
				current = value;
				writes.push(value);
			},
			run,
		});

		expect(current).toBe(SOURCE);
		expect(writes).toHaveLength(2);
		expect(run).toHaveBeenCalledTimes(4);
	});

	test("restores the starting bytes when the mutated test unexpectedly passes", async () => {
		let current = SOURCE;
		const run = vi
			.fn()
			.mockResolvedValueOnce({ status: 0, output: "mutated compile ok" })
			.mockResolvedValueOnce({ status: 0, output: "unexpected green" });

		await expect(
			executeOrientationMutation({
				readSource: () => current,
				writeSource: (value) => {
					current = value;
				},
				run,
			}),
		).rejects.toThrow("expected the controlled mutation to fail");
		expect(current).toBe(SOURCE);
	});

	test("restores the starting bytes when compilation fails", async () => {
		let current = SOURCE;
		const run = vi
			.fn()
			.mockResolvedValueOnce({ status: 2, output: "compile failed" });

		await expect(
			executeOrientationMutation({
				readSource: () => current,
				writeSource: (value) => {
					current = value;
				},
				run,
			}),
		).rejects.toThrow("mutated compile failed");
		expect(current).toBe(SOURCE);
	});
});
