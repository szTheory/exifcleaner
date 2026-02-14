declare module "node-exiftool" {
	import { Readable, Writable } from "stream";

	type ExifToolPid = number;

	interface ExifToolResult {
		data: Record<string, unknown>[] | null;
		error: string | null;
	}

	interface ExifToolCloseResult {
		success: boolean;
		error: Error;
	}

	export class ExiftoolProcess {
		constructor(bin: string);
		close(): Promise<ExifToolCloseResult>;
		open(encoding?: string, options?: object): Promise<ExifToolPid>;
		readMetadata(
			file: string | Readable,
			args: string[],
		): Promise<ExifToolResult>;
		writeMetadata(
			file: string | Writable,
			metadata: object,
			extraArgs: string[],
			debug: boolean,
		): Promise<ExifToolResult>;
	}
}
