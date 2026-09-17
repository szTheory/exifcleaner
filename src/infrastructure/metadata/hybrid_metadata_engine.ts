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
		if (
			request.destination === undefined ||
			path.resolve(request.source) === path.resolve(request.destination) ||
			path.extname(request.source).toLowerCase() !== ".webp"
		) {
			return false;
		}

		const webp = this.capabilities.formats.find(
			(format) => format.format === "webp",
		);
		return (
			webp !== undefined &&
			webp.sanitize &&
			webp.detection === "magic" &&
			(!request.preserveOrientation || webp.preserves.orientation) &&
			(!request.preserveColorProfile || webp.preserves.colorProfile) &&
			(!request.preserveTimestamps || webp.preserves.timestamps)
		);
	}
}
