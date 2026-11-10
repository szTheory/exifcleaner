import { describe, expect, test } from "vitest";
import type {
	RemoveMetadataEvidence,
	RemoveMetadataResult,
} from "../../src/common/ipc_channels";
import { assertSmokeRow, formatSmokeRow } from "./smoke_row";

// Permanent negative control for the smoke row assertion (69-15, D-18, T-69-46): a smoke row that
// cannot fail proves nothing, so each way a row can be wrong is shown to turn it red here, in
// vitest, where the assertion itself runs on every `yarn test`.

const NATIVE_OVERWRITE_PASSED: RemoveMetadataEvidence = {
	engine: "native",
	outputMode: "overwrite",
	leakCheck: "passed",
};

function success(evidence?: RemoveMetadataEvidence): RemoveMetadataResult {
	return {
		success: true,
		outputPath: "ignored",
		wasForcedCopy: false,
		wroteFile: true,
		outputSize: 1,
		...(evidence === undefined ? {} : { evidence }),
	};
}

describe("assertSmokeRow", () => {
	test("passes for success with evidence equal to the expected triple", () => {
		expect(() =>
			assertSmokeRow({
				file: "row-jpg",
				result: success(NATIVE_OVERWRITE_PASSED),
				expected: NATIVE_OVERWRITE_PASSED,
			}),
		).not.toThrow();
	});

	test("returns the evidence so the caller prints exactly what was asserted", () => {
		expect(
			assertSmokeRow({
				file: "row-jpg",
				result: success(NATIVE_OVERWRITE_PASSED),
				expected: NATIVE_OVERWRITE_PASSED,
			}),
		).toEqual(NATIVE_OVERWRITE_PASSED);
	});

	test("throws naming the file when the removal failed", () => {
		expect(() =>
			assertSmokeRow({
				file: "row-png",
				result: { success: false, error: "boom" },
				expected: NATIVE_OVERWRITE_PASSED,
			}),
		).toThrow(/row-png.*success/u);
	});

	test("throws naming the file when the evidence is missing", () => {
		expect(() =>
			assertSmokeRow({
				file: "row-webp",
				result: success(),
				expected: NATIVE_OVERWRITE_PASSED,
			}),
		).toThrow(/row-webp.*evidence/u);
	});

	test("throws naming the engine when exiftool wrote where native is expected", () => {
		expect(() =>
			assertSmokeRow({
				file: "row-heic",
				result: success({ ...NATIVE_OVERWRITE_PASSED, engine: "exiftool" }),
				expected: NATIVE_OVERWRITE_PASSED,
			}),
		).toThrow(/row-heic.*engine.*exiftool.*native/u);
	});

	test("throws naming the output mode when the mode differs", () => {
		expect(() =>
			assertSmokeRow({
				file: "row-avif",
				result: success({ ...NATIVE_OVERWRITE_PASSED, outputMode: "copy" }),
				expected: NATIVE_OVERWRITE_PASSED,
			}),
		).toThrow(/row-avif.*outputMode.*copy.*overwrite/u);
	});

	test("throws naming the leak check when it did not run", () => {
		expect(() =>
			assertSmokeRow({
				file: "row-jpeg",
				result: success({ ...NATIVE_OVERWRITE_PASSED, leakCheck: "not-run" }),
				expected: NATIVE_OVERWRITE_PASSED,
			}),
		).toThrow(/row-jpeg.*leakCheck.*not-run.*passed/u);
	});
});

describe("formatSmokeRow", () => {
	test("renders exactly the CI log line", () => {
		expect(formatSmokeRow("row-heif", NATIVE_OVERWRITE_PASSED)).toBe(
			"SMOKE-ROW row-heif engine=native mode=overwrite leak=passed",
		);
	});

	test("refuses a file name that carries a path separator", () => {
		expect(() =>
			formatSmokeRow("/tmp/user/photo.jpg", NATIVE_OVERWRITE_PASSED),
		).toThrow(/path separator/u);
		expect(() =>
			formatSmokeRow("C:\\Users\\me\\photo.jpg", NATIVE_OVERWRITE_PASSED),
		).toThrow(/path separator/u);
	});

	test("refuses whitespace in the file name so a log line stays one grep-able record", () => {
		expect(() => formatSmokeRow("row heif", NATIVE_OVERWRITE_PASSED)).toThrow(
			/whitespace/u,
		);
	});
});
