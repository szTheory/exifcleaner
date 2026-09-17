import type { Result } from "../../common";
import type { ExifError } from "../../domain";
import type { MetadataEnginePort } from "../metadata_engine_port";

export class StripMetadataCommand {
	private readonly metadataEngine: MetadataEnginePort;

	constructor({
		metadataEngine,
		exiftool,
	}: {
		metadataEngine?: MetadataEnginePort;
		/** @deprecated Compatibility alias until the Phase 41 container migration. */
		exiftool?: unknown;
	}) {
		this.metadataEngine = metadataEngine ?? (exiftool as MetadataEnginePort);
	}

	async execute({
		filePath,
		outputMode,
		preserveOrientation,
		preserveColorProfile,
		preserveTimestamps,
		outputPath,
		signal,
	}: {
		filePath: string;
		outputMode: "copy" | "overwrite";
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
				error: { code: "engine-error", detail: "Aborted" },
			};
		}

		const result = await this.metadataEngine.sanitize({
			source: filePath,
			destination: outputPath,
			outputMode,
			preserveOrientation,
			preserveColorProfile,
			preserveTimestamps,
			signal,
		});

		if (!result.ok) {
			return result;
		}

		return { ok: true, value: { tagsRemoved: 0 } };
	}
}
