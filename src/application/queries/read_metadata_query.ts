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
		const args = ["-G2", "-File:all", "-ExifToolVersion"];
		const result = await this.exiftool.readMetadata({ filePath, args });

		if (!result.ok) {
			return result;
		}

		const firstItem = result.value[0];
		if (firstItem === undefined) {
			return { ok: true, value: {} };
		}

		return { ok: true, value: cleanExifData({ raw: firstItem }) };
	}
}
