import type { ExifToolPort } from "../exiftool_port";
import type { Result } from "../../common";

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
		saveAsCopy,
		outputPath,
		signal,
	}: {
		filePath: string;
		preserveOrientation: boolean;
		preserveColorProfile: boolean;
		preserveTimestamps: boolean;
		saveAsCopy: boolean;
		outputPath?: string;
		signal?: AbortSignal;
	}): Promise<Result<{ tagsRemoved: number }>> {
		if (signal?.aborted) {
			return { ok: false, error: "Aborted" };
		}

		// CRITICAL FLAG ORDER: -all= must come before -TagsFromFile
		// ExifTool processes flags left-to-right, so we strip first then copy back
		const args: string[] = ["-all="];

		const preserveTags: string[] = [];
		if (preserveOrientation) preserveTags.push("-Orientation");
		if (preserveColorProfile) preserveTags.push("-ICC_Profile");

		if (preserveTags.length > 0) {
			args.push("-TagsFromFile", "@", ...preserveTags);
		}

		if (preserveTimestamps) {
			args.push("-P");
		}

		if (saveAsCopy && outputPath) {
			args.push("-o", outputPath);
		} else {
			args.push("-overwrite_original");
		}

		const result = await this.exiftool.removeMetadata(filePath, args);

		if (result.error !== null) {
			return { ok: false, error: result.error };
		}

		return { ok: true, value: { tagsRemoved: 0 } };
	}
}
