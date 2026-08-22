import type { Result } from "../../src/common/result";
import type { NativeWebpError, NativeWebpPort } from "../../src/infrastructure/metadata/native_webp_port";

export class FakeNativeWebp implements NativeWebpPort {
	sanitizeCalls: Parameters<NativeWebpPort["sanitize"]>[0][] = [];

	sanitizeResult: Result<void, NativeWebpError> = { ok: true, value: undefined };

	getCapabilities(): ReturnType<NativeWebpPort["getCapabilities"]> {
		throw new Error("not implemented");
	}

	async sanitize(
		request: Parameters<NativeWebpPort["sanitize"]>[0],
	): Promise<Result<void, NativeWebpError>> {
		this.sanitizeCalls.push(request);
		return this.sanitizeResult;
	}
}
