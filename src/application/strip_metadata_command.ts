import type { ExifToolPort } from "./exiftool_port";
import type { Result } from "../common/result";

export class StripMetadataCommand {
	private readonly exiftool: ExifToolPort;

	constructor({ exiftool }: { exiftool: ExifToolPort }) {
		this.exiftool = exiftool;
	}

	async execute({
		filePath,
		preserveRotation,
		preserveTimestamps,
		signal,
	}: {
		filePath: string;
		preserveRotation: boolean;
		preserveTimestamps: boolean;
		signal?: AbortSignal;
	}): Promise<Result<{ tagsRemoved: number }>> {
		if (signal?.aborted) {
			return { ok: false, error: "Aborted" };
		}

		// CRITICAL FLAG ORDER: -all= must come before -TagsFromFile
		// ExifTool processes flags left-to-right, so we strip first then copy back
		const args: string[] = ["-all="];

		if (preserveRotation) {
			args.push("-TagsFromFile", "@", "-Orientation", "-ICC_Profile:all");
		}

		if (preserveTimestamps) {
			args.push("-preserve");
		}

		args.push("-overwrite_original");

		const result = await this.exiftool.removeMetadata(filePath, args);

		if (result.error !== null) {
			return { ok: false, error: result.error };
		}

		return { ok: true, value: { tagsRemoved: 0 } };
	}
}
