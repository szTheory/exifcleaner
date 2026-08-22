import type { ExifToolPort } from "../exiftool_port";
import type { Result } from "../../common";
import type { ExifError } from "../../domain";
import { QUICKTIME_DATE_REMOVAL_ARGS } from "../../domain/exif/exif";
import { isMediaFile } from "../../domain/files/file_types";

// Builds ExifTool arguments, then invokes the bundled CLI to remove metadata.
export class StripMetadataCommand {
	private readonly exiftool: ExifToolPort;

	constructor({ exiftool }: { exiftool: ExifToolPort }) {
		this.exiftool = exiftool;
	}

	async execute({
		filePath,
		preserveOrientation,
		preserveColorProfile,
		preserveTimestamps,
		outputPath,
		signal,
	}: {
		filePath: string;
		preserveOrientation: boolean;
		preserveColorProfile: boolean;
		preserveTimestamps: boolean;
		saveAsCopy: boolean;
		outputPath?: string | undefined;
		signal?: AbortSignal | undefined;
	}): Promise<Result<{ tagsRemoved: number }, ExifError>> {
		// Example: an AbortController cancelled a queued cleanup before ExifTool started.
		if (signal?.aborted) {
			return {
				ok: false,
				error: { code: "exiftool-error", detail: "Aborted" },
			};
		}

		// CRITICAL FLAG ORDER: -all= must come before -TagsFromFile
		// ExifTool processes flags left-to-right, so we strip first then copy back
		const args: string[] = ["-all="];
		if (isMediaFile({ filename: filePath })) {
			args.push(...QUICKTIME_DATE_REMOVAL_ARGS);
		}

		const preserveTags: string[] = [];
		if (preserveOrientation) preserveTags.push("-Orientation");
		if (preserveColorProfile) preserveTags.push("-ICC_Profile");

		if (preserveTags.length > 0) {
			args.push("-TagsFromFile", "@", ...preserveTags);
		}

		if (preserveTimestamps) {
			args.push("-P");
		}

		if (outputPath) {
			args.push("-o", outputPath);
		} else {
			args.push("-overwrite_original");
		}

		const result = await this.exiftool.removeMetadata({ filePath, args });

		if (!result.ok) {
			return result;
		}

		return { ok: true, value: { tagsRemoved: 0 } };
	}
}
