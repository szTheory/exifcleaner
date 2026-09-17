import type { Result } from "../../common/result";
import type { MetadataEngineError } from "../../domain/exif/exif_errors";

export type NativeMetadataError = Extract<
	MetadataEngineError,
	{ readonly code: "native-error" }
>;

export interface NativeMetadataCapabilities {
	readonly formats: readonly NativeFormatCapabilities[];
}

export interface NativeFormatCapabilities {
	readonly format: string;
	readonly sanitize: boolean;
	readonly detection: "magic";
	readonly preserves: {
		readonly orientation: boolean;
		readonly colorProfile: boolean;
		readonly timestamps: boolean;
	};
}

export interface NativeSanitizeRequest {
	readonly source: string;
	readonly destination: string;
	// Always "copy": by the time a request reaches the native port it has
	// already been admitted by HybridMetadataEngine's outputMode check.
	readonly outputMode: "copy";
	readonly preserveOrientation: boolean;
	readonly preserveColorProfile: boolean;
	readonly preserveTimestamps: boolean;
	readonly signal?: AbortSignal | undefined;
}

export interface NativeMetadataPort {
	getCapabilities(): NativeMetadataCapabilities;
	sanitize(
		request: NativeSanitizeRequest,
	): Promise<Result<void, NativeMetadataError>>;
}
