import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import {
	findLeakedTags,
	copyModeLeakCheckFormatOf,
	type CopyModeLeakCheckFormat,
} from "../../src/domain/exif/copy_mode_leak_check";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface SweepRow {
	readonly variant: string;
	readonly format: "jpeg" | "png";
	readonly combo: string;
	readonly preserveOrientation: boolean;
	readonly preserveColorProfile: boolean;
	readonly preserveResolution: boolean;
	readonly engine: "exiftool" | "native";
	readonly outcome: "written" | "declined" | "error";
	readonly keys: readonly string[];
}

function recordFromKeys(keys: readonly string[]): Record<string, unknown> {
	const record: Record<string, unknown> = {};
	for (const key of keys) {
		record[key] = "placeholder-value";
	}
	return record;
}

describe("copyModeLeakCheckFormatOf", () => {
	it("maps PNG to png", () => {
		expect(copyModeLeakCheckFormatOf({ fileType: "PNG" })).toBe("png");
	});

	it("maps JPEG to jpeg", () => {
		expect(copyModeLeakCheckFormatOf({ fileType: "JPEG" })).toBe("jpeg");
	});

	it.each([["WEBP"], [undefined], [42]])(
		"returns undefined for %s",
		(fileType) => {
			expect(copyModeLeakCheckFormatOf({ fileType })).toBeUndefined();
		},
	);
});

describe("findLeakedTags", () => {
	it("reports a JPEG XMP-dc identifying tag as a leak", () => {
		const record = {
			SourceFile: "/tmp/a.jpg",
			"File:Other:FileType": "JPEG",
			"XMP-dc:Author:Creator": "ZZ58-ARTIST",
		};
		const result = findLeakedTags({
			record,
			format: "jpeg",
			preservation: {
				preserveOrientation: false,
				preserveColorProfile: false,
				preserveResolution: false,
			},
		});
		expect(result).toEqual(["XMP-dc:Creator"]);
	});

	it("includes a GPS identifying tag as a leak alongside XMP", () => {
		const record = {
			SourceFile: "/tmp/a.jpg",
			"File:Other:FileType": "JPEG",
			"XMP-dc:Author:Creator": "ZZ58-ARTIST",
			"GPS:Location:GPSLatitude": "37 deg 46' 29.64\" N",
		};
		const result = findLeakedTags({
			record,
			format: "jpeg",
			preservation: {
				preserveOrientation: false,
				preserveColorProfile: false,
				preserveResolution: false,
			},
		});
		expect(result).toContain("GPS:GPSLatitude");
		expect(result).toContain("XMP-dc:Creator");
	});

	it("reports a PNG text-chunk comment as a leak while ImageWidth stays permitted", () => {
		const record = {
			"PNG:Image:ImageWidth": 1,
			"PNG:Author:Comment": "ZZ58-COMMENT",
		};
		const result = findLeakedTags({
			record,
			format: "png",
			preservation: {
				preserveOrientation: false,
				preserveColorProfile: false,
				preserveResolution: false,
			},
		});
		expect(result).toEqual(["PNG:Comment"]);
	});

	it("treats IFD0:Orientation as a leak when preserveOrientation is false", () => {
		const record = { "IFD0:Image:Orientation": "Rotate 90 CW" };
		const result = findLeakedTags({
			record,
			format: "jpeg",
			preservation: {
				preserveOrientation: false,
				preserveColorProfile: false,
				preserveResolution: false,
			},
		});
		expect(result).toEqual(["IFD0:Orientation"]);
	});

	it("permits IFD0:Orientation when preserveOrientation is true", () => {
		const record = { "IFD0:Image:Orientation": "Rotate 90 CW" };
		const result = findLeakedTags({
			record,
			format: "jpeg",
			preservation: {
				preserveOrientation: true,
				preserveColorProfile: false,
				preserveResolution: false,
			},
		});
		expect(result).toEqual([]);
	});

	it.each([
		["preserveOrientation" as const, "IFD0:Image:Orientation"],
		["preserveResolution" as const, "IFD0:Image:XResolution"],
	])("resolution keys follow the same permit-when-requested pattern (%s)", (flag, key) => {
		const record = { [key]: "1" };
		const off = findLeakedTags({
			record,
			format: "jpeg",
			preservation: {
				preserveOrientation: false,
				preserveColorProfile: false,
				preserveResolution: false,
			},
		});
		expect(off).toEqual([`${key.split(":")[0]}:${key.split(":").at(-1)}`]);

		const on = findLeakedTags({
			record,
			format: "jpeg",
			preservation: {
				preserveOrientation: flag === "preserveOrientation",
				preserveColorProfile: false,
				preserveResolution: flag === "preserveResolution",
			},
		});
		expect(on).toEqual([]);
	});

	it("permits ICC groups only when preserveColorProfile is true", () => {
		const record = { "ICC_Profile:Image:ProfileDescription": "Test" };
		const off = findLeakedTags({
			record,
			format: "jpeg",
			preservation: {
				preserveOrientation: false,
				preserveColorProfile: false,
				preserveResolution: false,
			},
		});
		expect(off).toEqual(["ICC_Profile:ProfileDescription"]);

		const on = findLeakedTags({
			record,
			format: "jpeg",
			preservation: {
				preserveOrientation: false,
				preserveColorProfile: true,
				preserveResolution: false,
			},
		});
		expect(on).toEqual([]);
	});

	it("treats JFIF:Image:Copy1:XResolution as JFIF:XResolution", () => {
		const record = { "JFIF:Image:Copy1:XResolution": "300" };
		const on = findLeakedTags({
			record,
			format: "jpeg",
			preservation: {
				preserveOrientation: false,
				preserveColorProfile: false,
				preserveResolution: true,
			},
		});
		expect(on).toEqual([]);
	});

	it("reports XMP-dc:Author:Copy1:Creator as a leak (duplicate of a forbidden tag)", () => {
		const record = { "XMP-dc:Author:Copy1:Creator": "ZZ58-ARTIST" };
		const result = findLeakedTags({
			record,
			format: "jpeg",
			preservation: {
				preserveOrientation: false,
				preserveColorProfile: false,
				preserveResolution: false,
			},
		});
		expect(result).toEqual(["XMP-dc:Creator"]);
	});

	it("reports a key with no Group1:Tag shape as a leak", () => {
		const record = { UnknownFlatKey: "value" };
		const result = findLeakedTags({
			record,
			format: "jpeg",
			preservation: {
				preserveOrientation: false,
				preserveColorProfile: false,
				preserveResolution: false,
			},
		});
		expect(result).toEqual(["UnknownFlatKey"]);
	});

	it("never reports SourceFile", () => {
		const record = { SourceFile: "/tmp/a.jpg" };
		const result = findLeakedTags({
			record,
			format: "jpeg",
			preservation: {
				preserveOrientation: false,
				preserveColorProfile: false,
				preserveResolution: false,
			},
		});
		expect(result).toEqual([]);
	});

	it.each(["System:Other:FileName", "ExifTool:ExifToolVersion"])(
		"never reports a %s key (whole-group exemption)",
		(key) => {
			const record = { [key]: "value" };
			const result = findLeakedTags({
				record,
				format: "jpeg",
				preservation: {
					preserveOrientation: false,
					preserveColorProfile: false,
					preserveResolution: false,
				},
			});
			expect(result).toEqual([]);
		},
	);

	it("sorts and de-duplicates the returned leak names", () => {
		const record = {
			"XMP-dc:Author:Creator": "a",
			"GPS:Location:GPSLatitude": "b",
			"GPS:Location:Copy1:GPSLatitude": "c",
		};
		const result = findLeakedTags({
			record,
			format: "jpeg",
			preservation: {
				preserveOrientation: false,
				preserveColorProfile: false,
				preserveResolution: false,
			},
		});
		expect(result).toEqual(["GPS:GPSLatitude", "XMP-dc:Creator"]);
	});

	it("never echoes tag values into the result (names only)", () => {
		const record = { "XMP-dc:Author:Creator": "super-secret-value" };
		const result = findLeakedTags({
			record,
			format: "jpeg",
			preservation: {
				preserveOrientation: false,
				preserveColorProfile: false,
				preserveResolution: false,
			},
		});
		expect(result.join(" ")).not.toContain("super-secret-value");
	});

	describe("sweep replay", () => {
		const sweepPath = path.join(
			__dirname,
			"fixtures/copy_mode_leak_sweep.json",
		);
		const rows = JSON.parse(
			fs.readFileSync(sweepPath, "utf8"),
		) as readonly SweepRow[];
		const writtenRows = rows.filter((row) => row.outcome === "written");

		it("has at least 200 written rows to replay", () => {
			expect(writtenRows.length).toBeGreaterThanOrEqual(200);
		});

		it.each(
			writtenRows.map(
				(row) =>
					[
						`${row.variant} ${row.combo} ${row.engine}`,
						row,
					] as const,
			),
		)("clean output %s has zero leaks", (_label, row) => {
			const format: CopyModeLeakCheckFormat = row.format;
			const record = recordFromKeys(row.keys);
			const result = findLeakedTags({
				record,
				format,
				preservation: {
					preserveOrientation: row.preserveOrientation,
					preserveColorProfile: row.preserveColorProfile,
					preserveResolution: row.preserveResolution,
				},
			});
			expect(result).toEqual([]);
		});
	});
});
