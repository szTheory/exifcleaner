import type { Result } from "../../src/common/result";
import type {
	NativeWebpError,
	NativeWebpPort,
} from "../../src/infrastructure/metadata/native_webp_port";

export class FakeNativeWebp implements NativeWebpPort {
	sanitizeCalls: Parameters<NativeWebpPort["sanitize"]>[0][] = [];

	sanitizeResult: Result<void, NativeWebpError> = {
		ok: true,
		value: undefined,
	};

	capabilities: ReturnType<NativeWebpPort["getCapabilities"]> = {
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

	getCapabilities(): ReturnType<NativeWebpPort["getCapabilities"]> {
		return this.capabilities;
	}

	async sanitize(
		request: Parameters<NativeWebpPort["sanitize"]>[0],
	): Promise<Result<void, NativeWebpError>> {
		this.sanitizeCalls.push(request);
		return this.sanitizeResult;
	}
}
