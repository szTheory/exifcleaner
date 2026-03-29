import type { ExifToolPort } from "./exiftool_port";
import type { Result } from "../common/result";
import { cleanExifData } from "../domain/exif";

export class ReadMetadataQuery {
	private readonly exiftool: ExifToolPort;

	constructor({ exiftool }: { exiftool: ExifToolPort }) {
		this.exiftool = exiftool;
	}

	async execute({
		filePath,
	}: {
		filePath: string;
	}): Promise<Result<Record<string, unknown>>> {
		const args = ["-G2", "-File:all", "-ExifToolVersion"];
		const result = await this.exiftool.readMetadata(filePath, args);

		if (result.data === null) {
			return { ok: false, error: result.error ?? "No data returned" };
		}

		const firstItem = result.data[0];
		if (firstItem === undefined) {
			return { ok: true, value: {} };
		}

		return { ok: true, value: cleanExifData(firstItem) };
	}
}
