import type { Result } from "../common";

export interface ExifToolPort {
	open(): Promise<number>;
	close(): Promise<Result<void>>;
	readMetadata(
		filePath: string,
		args: string[],
	): Promise<{ data: Record<string, unknown>[] | null; error: string | null }>;
	removeMetadata(
		filePath: string,
		args: string[],
	): Promise<{ data: null; error: string | null }>;
}
