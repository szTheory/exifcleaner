import {
	getCapabilities as getPackageCapabilities,
	sanitizeFile,
} from "exifcleaner-node";
import type { MetadataError } from "exifcleaner-node";
import type { Result } from "../../common/result";
import type {
	NativeWebpCapabilities,
	NativeWebpError,
	NativeWebpPort,
	NativeWebpSanitizeRequest,
} from "../metadata/native_webp_port";

export class NativeWebpAdapter implements NativeWebpPort {
	private readonly capabilities: NativeWebpCapabilities;

	constructor() {
		this.capabilities = Object.freeze(getPackageCapabilities());
	}

	getCapabilities(): NativeWebpCapabilities {
		return this.capabilities;
	}

	async sanitize(
		request: NativeWebpSanitizeRequest,
	): Promise<Result<void, NativeWebpError>> {
		const options = {
			sourcePath: request.source,
			destinationPath: request.destination,
			preserveOrientation: request.preserveOrientation,
			preserveColorProfile: request.preserveColorProfile,
			preserveTimestamps: request.preserveTimestamps,
		};
		const result = await sanitizeFile(
			request.signal === undefined ? options : { ...options, signal: request.signal },
		);

		if (result.ok) return { ok: true, value: undefined };

		return { ok: false, error: mapNativeError(result.error) };
	}
}

function mapNativeError(error: MetadataError): NativeWebpError {
	return {
		...error,
		code: "native-error",
		nativeCode: error.code,
		backend: "native-webp",
	};
}
