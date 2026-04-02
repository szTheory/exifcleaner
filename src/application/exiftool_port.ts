import type { Result } from "../common";
import type { ExifError } from "../domain";

export interface ExifToolPort {
	open(): Promise<number>;
	close(): Promise<Result<void>>;
	readMetadata({
		filePath,
		args,
	}: {
		filePath: string;
		args: string[];
	}): Promise<Result<Record<string, unknown>[], ExifError>>;
	removeMetadata({
		filePath,
		args,
	}: {
		filePath: string;
		args: string[];
	}): Promise<Result<void, ExifError>>;
}
