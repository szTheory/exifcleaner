import { describe, expect, test, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
	ORIENTATION_TEST_FILE,
	ORIENTATION_TEST_TITLE,
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

const RED_OUTPUT = `1) ${ORIENTATION_TEST_TITLE}\nExpected: "Rotate 90 CW" Received: undefined`;

describe("the gated test", () => {
	const spec = fs.readFileSync(
		path.join(process.cwd(), ORIENTATION_TEST_FILE),
		"utf8",
	);
	const body = (title: string) => {
		const start = spec.indexOf(`test("${title}"`);
		const next = spec.indexOf("\n\ttest(", start + 1);
		return spec.slice(start, next === -1 ? undefined : next);
	};

	test("exists exactly once in the spec the gate runs", () => {
		expect(spec.split(`test("${ORIENTATION_TEST_TITLE}"`).length - 1).toBe(1);
	});

	test("uses a JPEG the native cleaner declines, not the plain orientation.jpg", () => {
		const gated = body(ORIENTATION_TEST_TITLE);
		expect(gated).toContain('copyFixture("color_icc_p3.jpg")');
		expect(gated).not.toContain('copyFixture("orientation.jpg")');
		expect(gated).toContain("assertDirEffect(before, after");
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
				output: RED_OUTPUT,
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

	test("restores the starting bytes and rejects a red that is not the gated test", async () => {
		let current = SOURCE;
		const run = vi
			.fn()
			.mockResolvedValueOnce({ status: 0, output: "mutated compile ok" })
			.mockResolvedValueOnce({
				status: 1,
				output: 'some other test: Expected: "Rotate 90 CW" Received: undefined',
			});

		await expect(
			executeOrientationMutation({
				readSource: () => current,
				writeSource: (value) => {
					current = value;
				},
				run,
			}),
		).rejects.toThrow("failed for the wrong reason");
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
