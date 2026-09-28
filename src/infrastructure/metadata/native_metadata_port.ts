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
	readonly extensions: readonly string[];
	readonly sanitize: boolean;
	readonly detection: "magic";
	readonly preserves: {
		readonly orientation: boolean;
		readonly colorProfile: boolean;
		readonly timestamps: boolean;
		readonly resolution: boolean;
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
	// Read by isNativeCopyCandidate (58-01, D-04/D-05): a request asking to keep
	// resolution goes native only when the source format's capability preserves
	// it (NativeFormatCapabilities.preserves.resolution). Forwarded to
	// exifcleaner-node's sanitizeFile, which requires it as an explicit boolean
	// (0.3.0 rejects a missing/non-boolean value with invalid-options).
	readonly preserveResolution: boolean;
	readonly preserveTimestamps: boolean;
	readonly signal?: AbortSignal | undefined;
}

export interface NativeMetadataPort {
	getCapabilities(): NativeMetadataCapabilities;
	sanitize(
		request: NativeSanitizeRequest,
	): Promise<Result<void, NativeMetadataError>>;
}
