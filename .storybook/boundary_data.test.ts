import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { FileProcessingStatus } from "../src/domain";
import {
	LONG_UNBROKEN_NAME,
	RLO_NAME,
	batch,
} from "../src/renderer/story_support/boundary_data";
import { repoRoot } from "./catalog/temp_repo";

// D-17 / STY-03: the boundary fixtures are pure and only describe rows the real pipeline
// can produce. The stories assert rendered text; this file asserts the data itself.
describe("boundary_data batch(count)", () => {
	test("batch(6) has six rows with distinct ids and paths", () => {
		const rows = batch(6);
		expect(rows).toHaveLength(6);
		expect(new Set(rows.map((row) => row.id)).size).toBe(6);
		expect(new Set(rows.map((row) => row.path)).size).toBe(6);
	});

	test("batch(0) is empty and two calls are deep-equal (no random source, no clock)", () => {
		expect(batch(0)).toEqual([]);
		expect(batch(6)).toEqual(batch(6));
	});

	test("every Complete row carries the cleaned fold, every other row is Pending or Processing", () => {
		const rows = batch(6);
		for (const row of rows) {
			if (row.status === FileProcessingStatus.Complete) {
				expect(row.outcomeKind).toBe("cleaned");
				expect(row.beforeTags).not.toBeNull();
				expect(row.afterTags).not.toBeNull();
			} else {
				expect([
					FileProcessingStatus.Pending,
					FileProcessingStatus.Processing,
				]).toContain(row.status);
				expect(row.outcomeKind).toBeUndefined();
			}
		}
		// Anti-vacuity: the batch really mixes the three states.
		expect(new Set(rows.map((row) => row.status)).size).toBe(3);
	});

	test("sizes stay inside uint32 and differ by row", () => {
		const sizes = batch(40).map((row) => row.size);
		expect(sizes.every((size) => size >= 0 && size <= 0xffffffff)).toBe(true);
		expect(new Set(sizes).size).toBeGreaterThan(30);
	});
});

describe("boundary_data names (T-73-05 Trojan Source)", () => {
	test("the long name is 180 code units and the RLO name holds the override", () => {
		expect(LONG_UNBROKEN_NAME).toHaveLength(180);
		expect(RLO_NAME).toContain("\u202E");
	});

	test("no raw bidirectional control character sits in the fixture source", () => {
		const source = readFileSync(
			path.join(repoRoot, "src/renderer/story_support/boundary_data.ts"),
			"utf8",
		);
		expect(source).not.toMatch(/[\u202A-\u202E\u2066-\u2069]/);
		// The escape form is present, so the scan above is not vacuous.
		expect(source).toContain("\\u202E");
	});
});
