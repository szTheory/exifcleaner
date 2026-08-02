import type { ExifToolPort } from "../exiftool_port";
import type { Result } from "../../common";
import type { ExifError } from "../../domain";
import { cleanExifData } from "../../domain";

export class ReadMetadataQuery {
	private readonly exiftool: ExifToolPort;

	constructor({ exiftool }: { exiftool: ExifToolPort }) {
		this.exiftool = exiftool;
	}

	async execute({
		filePath,
	}: {
		filePath: string;
	}): Promise<Result<Record<string, unknown>, ExifError>> {
		// G1 identifies the physical metadata family (System/File/JFIF/EXIF/etc.)
		// while G2 supplies the user-facing category. cleanExifData uses both to
		// discard structural fields, then normalizes retained keys back to G2:Tag.
		const args = ["-G1:2"];
		const result = await this.exiftool.readMetadata({ filePath, args });

		if (!result.ok) {
			return result;
		}

		const firstItem = result.value[0];
		if (firstItem === undefined) {
			return { ok: true, value: {} };
		}
		const diagnostic = Object.entries(firstItem).find(([key]) => {
			const parts = key.split(":");
			const tag = parts.at(-1);
			return parts[0] === "ExifTool" && (tag === "Error" || tag === "Warning");
		});
		if (diagnostic !== undefined) {
			return {
				ok: false,
				error: {
					code: "exiftool-error",
					detail: String(diagnostic[1]),
				},
			};
		}

		return { ok: true, value: cleanExifData({ raw: firstItem }) };
	}
}
