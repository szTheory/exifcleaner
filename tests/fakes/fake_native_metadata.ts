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

	capabilities: ReturnType<NativeMetadataPort["getCapabilities"]> = {
		formats: [
			{
				format: "webp",
				sanitize: true,
				detection: "magic",
				preserves: {
					orientation: true,
					colorProfile: true,
					timestamps: true,
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
