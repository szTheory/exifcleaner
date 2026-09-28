import path from "node:path";
import type { MetadataEnginePort } from "../../application/metadata_engine_port";
import type { Result } from "../../common/result";
import type { MetadataEngineError } from "../../domain/exif/exif_errors";
import {
	mintFallbackGrant,
	redeemFallbackGrant,
} from "./native_fallback_authority";
import type {
	NativeMetadataCapabilities,
	NativeMetadataPort,
	NativeSanitizeRequest,
} from "./native_metadata_port";

export class HybridMetadataEngine implements MetadataEnginePort {
	private readonly exiftool: MetadataEnginePort;
	private readonly native: NativeMetadataPort;
	private readonly capabilities: NativeMetadataCapabilities;

	constructor({
		exiftool,
		native,
	}: {
		exiftool: MetadataEnginePort;
		native: NativeMetadataPort;
	}) {
		this.exiftool = exiftool;
		this.native = native;
		this.capabilities = native.getCapabilities();
	}

	inspect(
		request: Parameters<MetadataEnginePort["inspect"]>[0],
	): ReturnType<MetadataEnginePort["inspect"]> {
		return this.exiftool.inspect(request);
	}

	async sanitize(
		request: Parameters<MetadataEnginePort["sanitize"]>[0],
	): Promise<Result<void, MetadataEngineError>> {
		if (!this.isNativeCopyCandidate(request)) {
			return this.exiftool.sanitize(request);
		}

		const nativeRequest: NativeSanitizeRequest = request;
		const native = await this.native.sanitize(nativeRequest);
		if (native.ok) return native;

		// Authority comes solely from the library's own proven pre-write safe
		// decline (native_fallback_authority.ts), never a restated table here.
		const grant = mintFallbackGrant(native.error.libraryError);
		if (grant === undefined || !redeemFallbackGrant(grant)) {
			return native;
		}
		return this.exiftool.sanitize(request);
	}

	private isNativeCopyCandidate(
		request: Parameters<MetadataEnginePort["sanitize"]>[0],
	): request is NativeSanitizeRequest {
		if (request.outputMode !== "copy") {
			return false;
		}

		// Defence-in-depth, not the policy: a copy request whose computed
		// destination collides with the source must not be admitted, even though
		// outputMode above is what actually decides eligibility.
		if (
			request.destination === undefined ||
			path.resolve(request.source) === path.resolve(request.destination)
		) {
			return false;
		}

		// The extension identifies the capability (D-01): a copy request is native-eligible
		// only when its source extension matches exactly one registered format's declared
		// extensions. Content never decides eligibility here — no bytes are read before
		// routing — so a misnamed file (e.g. WebP bytes behind a .png extension) is not an
		// app-level decline; it is caught by exifcleaner-node's own pre-write admission
		// check, which the unchanged fallback grant in native_fallback_authority.ts already
		// turns into an ExifTool retry (D-03). An ambiguous table — two formats claiming the
		// same extension — fails closed to ExifTool rather than guessing.
		const extension = path.extname(request.source).toLowerCase();
		if (extension === "") {
			return false;
		}
		const matches = this.capabilities.formats.filter((format) =>
			format.extensions.some(
				(candidateExtension) => candidateExtension.toLowerCase() === extension,
			),
		);
		if (matches.length !== 1) {
			return false;
		}
		const [format] = matches;
		if (format === undefined) {
			return false;
		}
		return (
			format.sanitize &&
			format.detection === "magic" &&
			(!request.preserveOrientation || format.preserves.orientation) &&
			(!request.preserveColorProfile || format.preserves.colorProfile) &&
			(!request.preserveTimestamps || format.preserves.timestamps) &&
			(!request.preserveResolution || format.preserves.resolution)
		);
	}
}
