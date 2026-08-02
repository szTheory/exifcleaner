import type { ExifToolPort } from "../../application";
import type { Result } from "../../common";
import type { ExifError } from "../../domain";
import {
	UnsafeExifToolPathError,
	type ExiftoolProcess,
} from "./ExiftoolProcess";

const UNSAFE_PATH_MESSAGE = "The selected file path is not supported";

// Adapter pattern: wraps the existing ExiftoolProcess with the clean ExifToolPort
// interface. Does NOT modify ExiftoolProcess.ts (working infrastructure code).
// Converts ExiftoolProcess's { data, error } / throw pattern to Result<T, ExifError>.

export class ExifToolAdapter implements ExifToolPort {
	private readonly process: ExiftoolProcess;

	constructor({ process }: { process: ExiftoolProcess }) {
		this.process = process;
	}

	async open(): Promise<number> {
		return this.process.open();
	}

	async close(): Promise<Result<void>> {
		const result = await this.process.close();
		if (result.success) {
			return { ok: true, value: undefined };
		}
		return {
			ok: false,
			error: result.error?.message ?? "Failed to close ExifTool",
		};
	}

	async readMetadata({
		filePath,
		args,
	}: {
		filePath: string;
		args: string[];
	}): Promise<Result<Record<string, unknown>[], ExifError>> {
		try {
			const result = await this.process.readMetadata({ filePath, args });

			if (result.error !== null) {
				return {
					ok: false,
					error: { code: "exiftool-error", detail: result.error },
				};
			}

			if (result.data === null) {
				return {
					ok: false,
					error: { code: "exiftool-error", detail: "No data returned" },
				};
			}

			return { ok: true, value: result.data };
		} catch (error) {
			if (error instanceof UnsafeExifToolPathError) {
				return {
					ok: false,
					error: { code: "exiftool-error", detail: UNSAFE_PATH_MESSAGE },
				};
			}
			return { ok: false, error: { code: "process-not-open" } };
		}
	}

	async removeMetadata({
		filePath,
		args,
	}: {
		filePath: string;
		args: string[];
	}): Promise<Result<void, ExifError>> {
		try {
			// Bridge: ExifToolPort's removeMetadata receives args like
			// ["-all=", "-TagsFromFile", "@", "-Orientation", "-overwrite_original"].
			// The adapter passes these as extraArgs to writeMetadata with an empty
			// metadata object {} since -all= is already in the args array.
			const result = await this.process.writeMetadata({
				filePath,
				metadata: {},
				extraArgs: args,
			});

			if (result.error !== null) {
				return {
					ok: false,
					error: { code: "exiftool-error", detail: result.error },
				};
			}

			return { ok: true, value: undefined };
		} catch (error) {
			if (error instanceof UnsafeExifToolPathError) {
				return {
					ok: false,
					error: { code: "exiftool-error", detail: UNSAFE_PATH_MESSAGE },
				};
			}
			return { ok: false, error: { code: "process-not-open" } };
		}
	}
}
