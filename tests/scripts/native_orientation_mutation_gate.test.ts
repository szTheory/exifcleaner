import { describe, expect, test, vi } from "vitest";
import {
	applyNativeOrientationMutation,
	executeNativeOrientationMutation,
} from "../../scripts/native_orientation_mutation_gate.mjs";

const SOURCE = `
const nativeRequest = {
	preserveOrientation: request.preserveOrientation,
	preserveColorProfile: request.preserveColorProfile,
	preserveResolution: request.preserveResolution,
};
`;

describe("applyNativeOrientationMutation", () => {
	test("swaps exactly the production native Orientation forwarding seam to false", () => {
		const mutated = applyNativeOrientationMutation(SOURCE);

		expect(mutated).toContain("preserveOrientation: false,");
		expect(mutated).not.toContain(
			"preserveOrientation: request.preserveOrientation,",
		);
		expect(mutated).toContain(
			"preserveColorProfile: request.preserveColorProfile,",
		);
		expect(mutated).toContain(
			"preserveResolution: request.preserveResolution,",
		);
	});

	test("refuses a missing or duplicated seam", () => {
		expect(() => applyNativeOrientationMutation("const x = 1;")).toThrow(
			"exactly one native Orientation forwarding seam",
		);
		expect(() =>
			applyNativeOrientationMutation(`${SOURCE}\n${SOURCE}`),
		).toThrow("exactly one native Orientation forwarding seam");
	});
});

describe("executeNativeOrientationMutation", () => {
	test("requires RED, restores byte-for-byte, then requires GREEN", async () => {
		let current = SOURCE;
		const writes: string[] = [];
		const run = vi
			.fn()
			.mockResolvedValueOnce({ status: 0, output: "mutated compile ok" })
			.mockResolvedValueOnce({
				status: 1,
				output:
					'Expected: "Rotate 90 CW" orientation.jpg orientation.png Received: undefined',
			})
			.mockResolvedValueOnce({ status: 0, output: "restored compile ok" })
			.mockResolvedValueOnce({ status: 0, output: "2 passed" });

		await executeNativeOrientationMutation({
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
			executeNativeOrientationMutation({
				readSource: () => current,
				writeSource: (value) => {
					current = value;
				},
				run,
			}),
		).rejects.toThrow("expected the controlled mutation to fail");
		expect(current).toBe(SOURCE);
	});

	test("restores the starting bytes when the mutated test fails for the wrong reason", async () => {
		let current = SOURCE;
		const run = vi
			.fn()
			.mockResolvedValueOnce({ status: 0, output: "mutated compile ok" })
			.mockResolvedValueOnce({
				status: 1,
				output: "some unrelated failure reason",
			});

		await expect(
			executeNativeOrientationMutation({
				readSource: () => current,
				writeSource: (value) => {
					current = value;
				},
				run,
			}),
		).rejects.toThrow("controlled mutation failed for the wrong reason");
		expect(current).toBe(SOURCE);
	});

	test("restores the starting bytes when compilation fails", async () => {
		let current = SOURCE;
		const run = vi
			.fn()
			.mockResolvedValueOnce({ status: 2, output: "compile failed" });

		await expect(
			executeNativeOrientationMutation({
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
