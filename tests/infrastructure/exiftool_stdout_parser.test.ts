import { describe, expect, it } from "vitest";
import {
	extractReadySegments,
	parseExiftoolOutput,
} from "../../src/infrastructure/exiftool/exiftool_stdout_parser";

describe("extractReadySegments", () => {
	it("extracts a single ready marker with no output", () => {
		const result = extractReadySegments({ buffer: "{ready0}\n" });
		expect(result.completed).toEqual([{ executeNum: 0, output: "" }]);
		expect(result.remaining).toBe("");
	});

	it("extracts a single ready marker with JSON output", () => {
		const result = extractReadySegments({
			buffer: '[{"FileName":"test.jpg"}]\n{ready1}\n',
		});
		expect(result.completed).toEqual([
			{ executeNum: 1, output: '[{"FileName":"test.jpg"}]' },
		]);
		expect(result.remaining).toBe("");
	});

	it("returns partial data without ready marker as remaining", () => {
		const result = extractReadySegments({
			buffer: "partial data without ready marker",
		});
		expect(result.completed).toEqual([]);
		expect(result.remaining).toBe("partial data without ready marker");
	});

	it("extracts multiple ready markers", () => {
		const result = extractReadySegments({
			buffer: '[{"a":1}]\n{ready0}\n[{"b":2}]\n{ready1}\n',
		});
		expect(result.completed).toHaveLength(2);
		expect(result.completed[0]).toEqual({
			executeNum: 0,
			output: '[{"a":1}]',
		});
		expect(result.completed[1]).toEqual({
			executeNum: 1,
			output: '[{"b":2}]',
		});
		expect(result.remaining).toBe("");
	});

	it("handles trailing data after last ready marker", () => {
		const result = extractReadySegments({
			buffer: '[{"a":1}]\n{ready0}\npartial',
		});
		expect(result.completed).toEqual([
			{ executeNum: 0, output: '[{"a":1}]' },
		]);
		expect(result.remaining).toBe("partial");
	});
});

describe("parseExiftoolOutput", () => {
	it("parses valid JSON array with metadata", () => {
		const result = parseExiftoolOutput({
			raw: '[{"FileName":"test.jpg"}]',
		});
		expect(result).toEqual({
			data: [{ FileName: "test.jpg" }],
			error: null,
		});
	});

	it("returns error when first item has Error field", () => {
		const result = parseExiftoolOutput({
			raw: '[{"Error":"File not found"}]',
		});
		expect(result).toEqual({ data: null, error: "File not found" });
	});

	it("returns success for plain text like image files updated", () => {
		const result = parseExiftoolOutput({ raw: "1 image files updated" });
		expect(result).toEqual({ data: null, error: null });
	});

	it("returns error for text containing error keyword", () => {
		const result = parseExiftoolOutput({ raw: "Error: File not found" });
		expect(result).toEqual({ data: null, error: "Error: File not found" });
	});

	it("returns error for invalid JSON that starts with bracket", () => {
		const result = parseExiftoolOutput({ raw: "[invalid json}" });
		expect(result.data).toBeNull();
		expect(result.error).toContain("Failed to parse ExifTool output");
	});

	it("returns null data and null error for empty string", () => {
		const result = parseExiftoolOutput({ raw: "" });
		expect(result).toEqual({ data: null, error: null });
	});

	it("handles JSON object (non-array) output", () => {
		const result = parseExiftoolOutput({ raw: '{"key":"value"}' });
		expect(result).toEqual({ data: { key: "value" }, error: null });
	});

	it("handles case-insensitive error detection in text", () => {
		const result = parseExiftoolOutput({
			raw: "  Warning: Some ERROR occurred  ",
		});
		expect(result).toEqual({
			data: null,
			error: "Warning: Some ERROR occurred",
		});
	});
});
