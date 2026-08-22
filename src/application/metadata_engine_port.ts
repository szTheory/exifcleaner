import type { Result } from "../common";
import type { ExifError } from "../domain";

export type MetadataInspectionPurpose =
	| "display"
	| "output-verification";

export interface MetadataInspection {
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
	}): Promise<Result<MetadataInspection, ExifError>>;
}
