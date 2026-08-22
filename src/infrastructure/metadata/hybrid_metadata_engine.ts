import path from "node:path";
import type { MetadataEnginePort } from "../../application/metadata_engine_port";
import type { Result } from "../../common/result";
import { assertNever } from "../../common/types";
import type { MetadataEngineError } from "../../domain/exif/exif_errors";
import type {
	NativeWebpCapabilities,
	NativeWebpPort,
	NativeWebpSanitizeRequest,
} from "./native_webp_port";

export class HybridMetadataEngine implements MetadataEnginePort {
	private readonly exiftool: MetadataEnginePort;
	private readonly nativeWebp: NativeWebpPort;
	private readonly capabilities: NativeWebpCapabilities;

	constructor({
		exiftool,
		nativeWebp,
	}: {
		exiftool: MetadataEnginePort;
		nativeWebp: NativeWebpPort;
	}) {
		this.exiftool = exiftool;
		this.nativeWebp = nativeWebp;
		this.capabilities = nativeWebp.getCapabilities();
	}

	inspect(
		request: Parameters<MetadataEnginePort["inspect"]>[0],
	): ReturnType<MetadataEnginePort["inspect"]> {
		return this.exiftool.inspect(request);
	}

	async sanitize(
		request: Parameters<MetadataEnginePort["sanitize"]>[0],
	): Promise<Result<void, MetadataEngineError>> {
		if (!this.isNativeWebpCopyCandidate(request)) {
			return this.exiftool.sanitize(request);
		}

		const nativeRequest: NativeWebpSanitizeRequest = request;
		const native = await this.nativeWebp.sanitize(nativeRequest);
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

	private isNativeWebpCopyCandidate(
		request: Parameters<MetadataEnginePort["sanitize"]>[0],
	): request is NativeWebpSanitizeRequest {
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
