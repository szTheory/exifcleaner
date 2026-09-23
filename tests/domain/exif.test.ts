import { describe, it, expect } from "vitest";
import {
	cleanExifData,
	QUICKTIME_DATE_REMOVAL_ARGS,
	RAW_IDENTIFYING_TAG_DELETES,
} from "../../src/domain/exif/exif";

describe("cleanExifData", () => {
	it("strips flat SourceFile key", () => {
		const result = cleanExifData({
			raw: {
				"Camera:Make": "Canon",
				SourceFile: "/path",
			},
		});

		expect(result).toEqual({ "Camera:Make": "Canon" });
	});

	it("strips grouped SourceFile key (Other:SourceFile)", () => {
		const result = cleanExifData({
			raw: {
				"Other:SourceFile": "/path",
				"Camera:Make": "Canon",
			},
		});

		expect(result).toEqual({ "Camera:Make": "Canon" });
	});

	it("strips all computed fields in both flat and grouped forms", () => {
		const result = cleanExifData({
			raw: {
				SourceFile: "/path",
				"Other:SourceFile": "/path",
				ImageSize: "3000x2000",
				"Image:ImageSize": "3000x2000",
				Megapixels: "6.0",
				"Image:Megapixels": "6.0",
				"Camera:Make": "Canon",
			},
		});

		expect(result).toEqual({ "Camera:Make": "Canon" });
	});

	it("strips structural origins and normalizes retained G1:G2:Tag keys", () => {
		const result = cleanExifData({
			raw: {
				"System:Other:FileName": "photo.jpg",
				"System:Other:FileSize": "711 bytes",
				"JFIF:Image:JFIFVersion": 1.01,
				"ExifTool:ExifToolVersion": 13.5,
				"Composite:Image:ImageSize": "1x1",
				"IFD0:Author:Artist": "Ada",
			},
		});

		expect(result).toEqual({ "Author:Artist": "Ada" });
	});

	it("preserves grouped keys that are not computed fields", () => {
		const result = cleanExifData({
			raw: {
				"Camera:Make": "Canon",
				"GPS:GPSLatitude": "37.7749",
				"Time:CreateDate": "2024-01-01",
			},
		});

		expect(result).toEqual({
			"Camera:Make": "Canon",
			"GPS:GPSLatitude": "37.7749",
			"Time:CreateDate": "2024-01-01",
		});
	});

	it("retains a group1 File comment key under the normalized key Image:Comment", () => {
		const result = cleanExifData({
			raw: { "File:Image:Comment": "hello" },
		});

		expect(result).toEqual({ "Image:Comment": "hello" });
	});

	it("retains a CopyN-instanced group1 File comment key under the same normalized key Image:Comment (D-15c)", () => {
		const result = cleanExifData({
			raw: { "File:Image:Copy1:Comment": "hello" },
		});

		expect(result).toEqual({ "Image:Comment": "hello" });
	});

	it("retains a multi-digit CopyN-instanced group1 File comment key under Image:Comment", () => {
		const result = cleanExifData({
			raw: { "File:Image:Copy10:Comment": "hello" },
		});

		expect(result).toEqual({ "Image:Comment": "hello" });
	});

	it("excludes a multi-digit CopyN-instanced structural File tag", () => {
		const result = cleanExifData({
			raw: { "File:Image:Copy12:ExifByteOrder": "Big-endian" },
		});

		expect(result).toEqual({});
	});

	// Pre-existing normalizeMetadataKey behavior, untouched by this phase: both comment key
	// shapes normalize to the identical key Image:Comment, so a raw object carrying both
	// collides onto a single retained entry rather than producing two. Recorded here so a
	// future change to normalization shows up as a visible count change, not a silent one.
	it("collides File:Image:Comment and File:Image:Copy1:Comment onto a single retained entry", () => {
		const result = cleanExifData({
			raw: {
				"File:Image:Comment": "first",
				"File:Image:Copy1:Comment": "second",
			},
		});

		expect(Object.keys(result)).toHaveLength(1);
		expect(result).toEqual({ "Image:Comment": "second" });
	});

	it("excludes File:Preview:PreviewImage entirely (the fail-open trap detector)", () => {
		const result = cleanExifData({
			raw: { "File:Preview:PreviewImage": "<binary>" },
		});

		expect(result).toEqual({});
	});

	it("excludes File:Image:ExifByteOrder (proving the override set is consulted, not just the blanket entry's removal)", () => {
		const result = cleanExifData({
			raw: { "File:Image:ExifByteOrder": "II" },
		});

		expect(result).toEqual({});
	});

	it("excludes File:Other:FileType, a read-only File tag absent from the writable set", () => {
		const result = cleanExifData({
			raw: { "File:Other:FileType": "JPEG" },
		});

		expect(result).toEqual({});
	});

	it("returns an empty object for an empty input", () => {
		const result = cleanExifData({ raw: {} });

		expect(result).toEqual({});
	});
});

describe("RAW_IDENTIFYING_TAG_DELETES (RMV-05, D-45)", () => {
	it("equals the hand-written 27-entry literal in Task 1 order (RMV-05, D-45)", () => {
		expect(RAW_IDENTIFYING_TAG_DELETES).toEqual([
			"-IFD0:Artist=",
			"-IFD0:Software=",
			"-IFD0:ImageDescription=",
			"-IFD0:Copyright=",
			"-IFD0:XPComment=",
			"-IFD0:XPAuthor=",
			"-IFD0:XPTitle=",
			"-IFD0:XPSubject=",
			"-IFD0:XPKeywords=",
			"-ExifIFD:UserComment=",
			"-ExifIFD:SerialNumber=",
			"-ExifIFD:LensSerialNumber=",
			"-ExifIFD:OwnerName=",
			"-IFD0:CameraSerialNumber=",
			"-IFD0:OriginalRawFileName=",
			"-IFD0:RawDataUniqueID=",
			"-MakerNotes:OwnerName=",
			"-MakerNotes:InternalSerialNumber=",
			"-ExifIFD:DateTimeOriginal=",
			"-ExifIFD:CreateDate=",
			"-IFD0:ModifyDate=",
			"-ExifIFD:OffsetTime=",
			"-ExifIFD:OffsetTimeOriginal=",
			"-ExifIFD:OffsetTimeDigitized=",
			"-ExifIFD:SubSecTime=",
			"-ExifIFD:SubSecTimeOriginal=",
			"-ExifIFD:SubSecTimeDigitized=",
		]);
	});

	it("every entry is group-qualified: -(IFD0|ExifIFD|MakerNotes):Tag= (RMV-05, D-45)", () => {
		for (const entry of RAW_IDENTIFYING_TAG_DELETES) {
			expect(entry).toMatch(/^-(IFD0|ExifIFD|MakerNotes):[A-Za-z]+=$/);
		}
	});

	it("shares no element with QUICKTIME_DATE_REMOVAL_ARGS and never contains -CommonIFD0= (RMV-05, D-45)", () => {
		const overlap = RAW_IDENTIFYING_TAG_DELETES.filter((entry) =>
			(QUICKTIME_DATE_REMOVAL_ARGS as readonly string[]).includes(entry),
		);
		expect(overlap).toEqual([]);
		expect(RAW_IDENTIFYING_TAG_DELETES).not.toContain("-CommonIFD0=");
	});
});
