import type { Result } from "../../src/common/result";
import type {
	NativeMetadataError,
	NativeMetadataPort,
} from "../../src/infrastructure/metadata/native_metadata_port";

export class FakeNativeMetadata implements NativeMetadataPort {
	sanitizeCalls: Parameters<NativeMetadataPort["sanitize"]>[0][] = [];

	sanitizeResult: Result<void, NativeMetadataError> = {
		ok: true,
		value: undefined,
	};

	// Mirrors exifcleaner-node 0.4.0's real getCapabilities() routing fields (webp/png/jpeg
	// measured at 58-01; heic/avif measured at 63-14 against the installed package, and
	// guarded by a deep-equal projection in native_copy_candidate_routing.test.ts):
	// five formats, real extension arrays.
	// Empty extensions arrays would make every routing case fall through to ExifTool and
	// pass for the wrong reason (RESEARCH Pitfall 1), so these are the actual registered
	// shapes, not placeholders.
	capabilities: ReturnType<NativeMetadataPort["getCapabilities"]> = {
		formats: [
			{
				format: "webp",
				extensions: [".webp"],
				sanitize: true,
				detection: "magic",
				preserves: {
					orientation: true,
					colorProfile: true,
					timestamps: true,
					resolution: false,
				},
			},
			{
				format: "png",
				extensions: [".png"],
				sanitize: true,
				detection: "magic",
				preserves: {
					orientation: true,
					colorProfile: true,
					timestamps: true,
					resolution: true,
				},
			},
			{
				format: "jpeg",
				extensions: [".jpg", ".jpeg"],
				sanitize: true,
				detection: "magic",
				preserves: {
					orientation: true,
					colorProfile: true,
					timestamps: true,
					resolution: true,
				},
			},
			{
				format: "heic",
				extensions: [".heic", ".heif"],
				sanitize: true,
				detection: "magic",
				preserves: {
					orientation: true,
					colorProfile: true,
					timestamps: true,
					resolution: true,
				},
			},
			{
				format: "avif",
				extensions: [".avif"],
				sanitize: true,
				detection: "magic",
				preserves: {
					orientation: true,
					colorProfile: true,
					timestamps: true,
					resolution: true,
				},
			},
		],
	};

	getCapabilities(): ReturnType<NativeMetadataPort["getCapabilities"]> {
		return this.capabilities;
	}

	async sanitize(
		request: Parameters<NativeMetadataPort["sanitize"]>[0],
	): Promise<Result<void, NativeMetadataError>> {
		this.sanitizeCalls.push(request);
		return this.sanitizeResult;
	}
}
