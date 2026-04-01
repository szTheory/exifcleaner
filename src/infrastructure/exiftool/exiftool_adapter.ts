import type { ExifToolPort } from "../../application";
import type { Result } from "../../common";
import type { ExiftoolProcess } from "./ExiftoolProcess";

// Adapter pattern: wraps the existing ExiftoolProcess with the clean ExifToolPort
// interface. Does NOT modify ExiftoolProcess.ts (working infrastructure code).

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
	}): Promise<{ data: Record<string, unknown>[] | null; error: string | null }> {
		return this.process.readMetadata({ filePath, args });
	}

	async removeMetadata({
		filePath,
		args,
	}: {
		filePath: string;
		args: string[];
	}): Promise<{ data: null; error: string | null }> {
		// Bridge: ExifToolPort's removeMetadata receives args like
		// ["-all=", "-TagsFromFile", "@", "-Orientation", "-overwrite_original"].
		// The adapter passes these as extraArgs to writeMetadata with an empty
		// metadata object {} since -all= is already in the args array.
		const result = await this.process.writeMetadata({
			filePath,
			metadata: {},
			extraArgs: args,
		});
		return { data: null, error: result.error };
	}
}
