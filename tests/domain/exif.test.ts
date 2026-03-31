import { describe, it, expect } from "vitest";
import { cleanExifData } from "../../src/domain/exif/exif";

describe("cleanExifData", () => {
	it("strips flat SourceFile key", () => {
		const result = cleanExifData({
			"Camera:Make": "Canon",
			SourceFile: "/path",
		});

		expect(result).toEqual({ "Camera:Make": "Canon" });
	});

	it("strips grouped SourceFile key (Other:SourceFile)", () => {
		const result = cleanExifData({
			"Other:SourceFile": "/path",
			"Camera:Make": "Canon",
		});

		expect(result).toEqual({ "Camera:Make": "Canon" });
	});

	it("strips all computed fields in both flat and grouped forms", () => {
		const result = cleanExifData({
			SourceFile: "/path",
			"Other:SourceFile": "/path",
			ImageSize: "3000x2000",
			"Image:ImageSize": "3000x2000",
			Megapixels: "6.0",
			"Image:Megapixels": "6.0",
			"Camera:Make": "Canon",
		});

		expect(result).toEqual({ "Camera:Make": "Canon" });
	});

	it("preserves grouped keys that are not computed fields", () => {
		const result = cleanExifData({
			"Camera:Make": "Canon",
			"GPS:GPSLatitude": "37.7749",
			"Time:CreateDate": "2024-01-01",
		});

		expect(result).toEqual({
			"Camera:Make": "Canon",
			"GPS:GPSLatitude": "37.7749",
			"Time:CreateDate": "2024-01-01",
		});
	});
});
