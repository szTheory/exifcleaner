import path from "node:path";
import type { MetadataEnginePort } from "../../application/metadata_engine_port";
import type { Result } from "../../common/result";
import { assertNever } from "../../common/types";
import type { MetadataEngineError } from "../../domain/exif/exif_errors";
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

		switch (native.error.nativeCode) {
			case "unsupported-format":
			case "malformed-file":
			case "unsafe-structure":
			case "unsupported-feature":
				return this.exiftool.sanitize(request);
			case "aborted":
			case "invalid-options":
			case "not-found":
			case "read-failed":
			case "destination-exists":
			case "destination-changed":
			case "source-changed":
			case "write-failed":
			case "verification-failed":
			case "cleanup-failed":
				return native;
			default:
				return assertNever({ value: native.error.nativeCode });
		}
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

		const candidate = this.capabilities.formats.find(
			(format) =>
				format.sanitize &&
				format.detection === "magic" &&
				(!request.preserveOrientation || format.preserves.orientation) &&
				(!request.preserveColorProfile || format.preserves.colorProfile) &&
				(!request.preserveTimestamps || format.preserves.timestamps),
		);
		return candidate !== undefined;
	}
}
