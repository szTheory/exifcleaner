import { describe, it, expect } from "vitest";
import {
	parseGroupedKey,
	getFriendlyGroupKey,
	computeMetadataDiff,
} from "../../src/domain/metadata_groups";

describe("parseGroupedKey", () => {
	it('parses "Camera:Make" into group="Camera" and field="Make"', () => {
		const result = parseGroupedKey("Camera:Make");
		expect(result).toEqual({ group: "Camera", field: "Make" });
	});

	it('parses "GPS:GPSLatitude" into group="GPS" and field="GPSLatitude"', () => {
		const result = parseGroupedKey("GPS:GPSLatitude");
		expect(result).toEqual({ group: "GPS", field: "GPSLatitude" });
	});

	it('returns group="Other" for keys without a colon', () => {
		const result = parseGroupedKey("SourceFile");
		expect(result).toEqual({ group: "Other", field: "SourceFile" });
	});

	it('parses "ICC_Profile:ProfileDescription" correctly', () => {
		const result = parseGroupedKey("ICC_Profile:ProfileDescription");
		expect(result).toEqual({
			group: "ICC_Profile",
			field: "ProfileDescription",
		});
	});
});

describe("getFriendlyGroupKey", () => {
	it('returns "metaGroupCamera" for "Camera"', () => {
		expect(getFriendlyGroupKey("Camera")).toBe("metaGroupCamera");
	});

	it('returns "metaGroupLocation" for "GPS"', () => {
		expect(getFriendlyGroupKey("GPS")).toBe("metaGroupLocation");
	});

	it('returns "metaGroupOther" for unknown group names', () => {
		expect(getFriendlyGroupKey("UnknownGroup")).toBe("metaGroupOther");
	});
});

describe("computeMetadataDiff", () => {
	it("identifies removed and preserved fields across groups", () => {
		const before = {
			"Camera:Make": "Canon",
			"GPS:Lat": "37",
		};
		const after = {
			"Camera:Make": "Canon",
		};

		const groups = computeMetadataDiff(before, after);

		// Camera group: Make preserved
		const camera = groups.find((g) => g.rawGroupName === "Camera");
		expect(camera).toBeDefined();
		expect(camera!.totalCount).toBe(1);
		expect(camera!.removedCount).toBe(0);
		expect(camera!.fields[0]!.name).toBe("Make");
		expect(camera!.fields[0]!.removed).toBe(false);

		// GPS group: Lat removed
		const gps = groups.find((g) => g.rawGroupName === "GPS");
		expect(gps).toBeDefined();
		expect(gps!.totalCount).toBe(1);
		expect(gps!.removedCount).toBe(1);
		expect(gps!.fields[0]!.name).toBe("Lat");
		expect(gps!.fields[0]!.removed).toBe(true);
	});

	it("sorts groups alphabetically by friendly name key", () => {
		const before = {
			"GPS:Lat": "37",
			"Camera:Make": "Canon",
			"Time:CreateDate": "2024-01-01",
		};
		const after = {};

		const groups = computeMetadataDiff(before, after);
		const keys = groups.map((g) => g.friendlyNameKey);

		// metaGroupCamera < metaGroupLocation < metaGroupTime
		expect(keys).toEqual([
			"metaGroupCamera",
			"metaGroupLocation",
			"metaGroupTime",
		]);
	});

	it("excludes computed fields (SourceFile, ImageSize, Megapixels)", () => {
		const before = {
			"Camera:Make": "Canon",
			"Other:SourceFile": "/path/to/file.jpg",
			SourceFile: "/path/to/file.jpg",
			ImageSize: "3000x2000",
			Megapixels: "6.0",
		};
		const after = {};

		const groups = computeMetadataDiff(before, after);
		const allFields = groups.flatMap((g) => g.fields.map((f) => f.name));

		expect(allFields).not.toContain("SourceFile");
		expect(allFields).not.toContain("ImageSize");
		expect(allFields).not.toContain("Megapixels");
		expect(allFields).toContain("Make");
	});

	it("returns empty array for empty before and after", () => {
		const groups = computeMetadataDiff({}, {});
		expect(groups).toEqual([]);
	});

	it("marks all fields as removed when group has all fields removed", () => {
		const before = {
			"Camera:Make": "Canon",
			"Camera:Model": "EOS R5",
		};
		const after = {};

		const groups = computeMetadataDiff(before, after);
		const camera = groups.find((g) => g.rawGroupName === "Camera");

		expect(camera).toBeDefined();
		expect(camera!.removedCount).toBe(2);
		expect(camera!.totalCount).toBe(2);
		expect(camera!.removedCount).toBe(camera!.totalCount);
	});
});
