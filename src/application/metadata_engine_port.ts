import type { Result } from "../common";
import type { MetadataEngineError } from "../domain/exif/exif_errors";

export type MetadataInspectionPurpose = "display" | "output-verification";

export interface MetadataInspection {
	/**
	 * For purpose "output-verification" (D-10), this carries the raw -G1:2:4 diagnostic
	 * record ExifTool already reads while reopening the generated output, keyed
	 * Group1:Group2[:CopyN]:Tag -- not a display-cleaned map. Consumed by
	 * VerifyGeneratedOutputQuery's opt-in copyModeLeakCheck.
	 */
	readonly metadata: Record<string, unknown>;
	readonly recordCount: number;
	readonly verification: {
		readonly fileType: unknown;
		readonly error: unknown;
	};
}

export interface MetadataEnginePort {
	inspect({
		source,
		purpose,
	}: {
		source: string;
		purpose: MetadataInspectionPurpose;
	}): Promise<Result<MetadataInspection, MetadataEngineError>>;

	sanitize({
		source,
		destination,
		outputMode,
		preserveOrientation,
		preserveColorProfile,
		preserveResolution,
		preserveTimestamps,
		signal,
	}: {
		source: string;
		destination?: string | undefined;
		outputMode: "copy" | "overwrite";
		preserveOrientation: boolean;
		preserveColorProfile: boolean;
		preserveResolution: boolean;
		preserveTimestamps: boolean;
		signal?: AbortSignal | undefined;
	}): Promise<Result<void, MetadataEngineError>>;
}
