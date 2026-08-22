import type { Result } from "../../common/result";
import type { MetadataEngineError } from "../../domain/exif/exif_errors";

export type NativeWebpError = Extract<
	MetadataEngineError,
	{ readonly code: "native-error" }
>;

export interface NativeWebpCapabilities {
	readonly formats: readonly NativeWebpFormatCapabilities[];
}

export interface NativeWebpFormatCapabilities {
	readonly format: "webp";
	readonly sanitize: boolean;
	readonly detection: "magic" | string;
	readonly preserves: {
		readonly orientation: boolean;
		readonly colorProfile: boolean;
		readonly timestamps: boolean;
	};
}

export interface NativeWebpSanitizeRequest {
	readonly source: string;
	readonly destination: string;
	readonly preserveOrientation: boolean;
	readonly preserveColorProfile: boolean;
	readonly preserveTimestamps: boolean;
	readonly signal?: AbortSignal | undefined;
}

export interface NativeWebpPort {
	getCapabilities(): NativeWebpCapabilities;
	sanitize(
		request: NativeWebpSanitizeRequest,
	): Promise<Result<void, NativeWebpError>>;
}
