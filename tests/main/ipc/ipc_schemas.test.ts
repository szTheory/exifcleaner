import { describe, it, expect } from "vitest";
import { ZodError } from "zod";
import {
	exifReadSchema,
	exifRemoveSchema,
	settingsSetSchema,
	filesAddedSchema,
	getLocaleSchema,
	getI18nStringsSchema,
	settingsGetSchema,
	themeGetSchema,
	fileProcessedSchema,
	allFilesProcessedSchema,
	folderClassifySchema,
	folderExpandSchema,
	fileRevealContextMenuSchema,
} from "../../../src/main/ipc/ipc_schemas";

describe("exifReadSchema", () => {
	it("accepts a non-empty string", () => {
		expect(exifReadSchema.parse("/path/to/file.jpg")).toBe("/path/to/file.jpg");
	});

	it("rejects empty string", () => {
		expect(() => exifReadSchema.parse("")).toThrow(ZodError);
	});

	it("rejects non-string", () => {
		expect(() => exifReadSchema.parse(123)).toThrow(ZodError);
	});

	it.each(["/tmp/photo\n-execute99.jpg", "/tmp/photo\r-stay_open.jpg"])(
		"rejects a path containing a protocol line break",
		(filePath) => {
			expect(() => exifReadSchema.parse(filePath)).toThrow(
				"Paths containing line breaks are not supported",
			);
		},
	);
});

describe("exifRemoveSchema", () => {
	it("accepts a non-empty string", () => {
		expect(exifRemoveSchema.parse("/path/to/file.jpg")).toBe(
			"/path/to/file.jpg",
		);
	});

	it("rejects undefined", () => {
		expect(() => exifRemoveSchema.parse(undefined)).toThrow(ZodError);
	});

	it("rejects a direct-clean path containing CRLF", () => {
		expect(() =>
			exifRemoveSchema.parse("/tmp/photo\r\n-overwrite_original"),
		).toThrow("Paths containing line breaks are not supported");
	});
});

describe("path-bearing folder and generated-output schemas", () => {
	it("rejects any unsafe entry in folder classification", () => {
		expect(() =>
			folderClassifySchema.parse(["/safe/photo.jpg", "/unsafe\nphoto.jpg"]),
		).toThrow("Paths containing line breaks are not supported");
	});

	it("rejects an unsafe folder expansion root", () => {
		expect(() => folderExpandSchema.parse("/unsafe\rfolder")).toThrow(
			"Paths containing line breaks are not supported",
		);
	});

	it("rejects an unsafe generated copy path at the reveal boundary", () => {
		expect(() =>
			fileRevealContextMenuSchema.parse({
				originalPath: "/safe/photo.jpg",
				cleanedPath: "/unsafe/photo_cleaned.jpg\n-overwrite_original",
			}),
		).toThrow("Paths containing line breaks are not supported");
	});
});

describe("settingsSetSchema", () => {
	it("accepts partial settings with preserveOrientation", () => {
		const result = settingsSetSchema.parse({ preserveOrientation: true });
		expect(result.preserveOrientation).toBe(true);
	});

	it("accepts empty object (all fields optional)", () => {
		const result = settingsSetSchema.parse({});
		expect(result).toEqual({});
	});

	it("rejects wrong type for preserveOrientation", () => {
		expect(() =>
			settingsSetSchema.parse({ preserveOrientation: "yes" }),
		).toThrow(ZodError);
	});

	it("accepts language as null (nullable)", () => {
		const result = settingsSetSchema.parse({ language: null });
		expect(result.language).toBeNull();
	});

	it("accepts language as string", () => {
		const result = settingsSetSchema.parse({ language: "fr" });
		expect(result.language).toBe("fr");
	});
});

describe("filesAddedSchema", () => {
	it("accepts positive integer", () => {
		expect(filesAddedSchema.parse(5)).toBe(5);
	});

	it("rejects negative number", () => {
		expect(() => filesAddedSchema.parse(-1)).toThrow(ZodError);
	});

	it("rejects non-integer", () => {
		expect(() => filesAddedSchema.parse(1.5)).toThrow(ZodError);
	});

	it("rejects zero", () => {
		expect(() => filesAddedSchema.parse(0)).toThrow(ZodError);
	});
});

describe("getLocaleSchema", () => {
	it("accepts undefined", () => {
		expect(getLocaleSchema.parse(undefined)).toBeUndefined();
	});

	it("rejects a string value", () => {
		expect(() => getLocaleSchema.parse("en")).toThrow(ZodError);
	});
});

describe("void schemas accept undefined", () => {
	it("getI18nStringsSchema accepts undefined", () => {
		expect(getI18nStringsSchema.parse(undefined)).toBeUndefined();
	});

	it("settingsGetSchema accepts undefined", () => {
		expect(settingsGetSchema.parse(undefined)).toBeUndefined();
	});

	it("themeGetSchema accepts undefined", () => {
		expect(themeGetSchema.parse(undefined)).toBeUndefined();
	});

	it("fileProcessedSchema accepts undefined", () => {
		expect(fileProcessedSchema.parse(undefined)).toBeUndefined();
	});

	it("allFilesProcessedSchema accepts undefined", () => {
		expect(allFilesProcessedSchema.parse(undefined)).toBeUndefined();
	});
});
