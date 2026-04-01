import type { Result } from "../common";

export interface ExifToolPort {
	open(): Promise<number>;
	close(): Promise<Result<void>>;
	readMetadata({
		filePath,
		args,
	}: {
		filePath: string;
		args: string[];
	}): Promise<{ data: Record<string, unknown>[] | null; error: string | null }>;
	removeMetadata({
		filePath,
		args,
	}: {
		filePath: string;
		args: string[];
	}): Promise<{ data: null; error: string | null }>;
}
