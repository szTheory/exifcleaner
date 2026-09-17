import {
	getCapabilities as getPackageCapabilities,
	sanitizeFile,
} from "exifcleaner-node";
import type { MetadataError } from "exifcleaner-node";
import type { Result } from "../../common/result";
import type {
	NativeMetadataCapabilities,
	NativeMetadataError,
	NativeMetadataPort,
	NativeSanitizeRequest,
} from "./native_metadata_port";

export class NativeMetadataAdapter implements NativeMetadataPort {
	private readonly capabilities: NativeMetadataCapabilities;

	constructor() {
		this.capabilities = Object.freeze(getPackageCapabilities());
	}

	getCapabilities(): NativeMetadataCapabilities {
		return this.capabilities;
	}

	async sanitize(
		request: NativeSanitizeRequest,
	): Promise<Result<void, NativeMetadataError>> {
		const options = {
			sourcePath: request.source,
			destinationPath: request.destination,
			preserveOrientation: request.preserveOrientation,
			preserveColorProfile: request.preserveColorProfile,
			preserveTimestamps: request.preserveTimestamps,
		};
		const result = await sanitizeFile(
			request.signal === undefined
				? options
				: { ...options, signal: request.signal },
		);

		if (result.ok) return { ok: true, value: undefined };

		return { ok: false, error: mapNativeError(result.error) };
	}
}

function mapNativeError(error: MetadataError): NativeMetadataError {
	return {
		...error,
		code: "native-error",
		nativeCode: error.code,
		backend: "native",
		// D-07: map explicitly, not via the spread above alone, so these fields
		// are part of the declared type and readable without a cast.
		phase: error.phase,
		nativeWrite: error.nativeWrite,
		libraryError: error,
	};
}
