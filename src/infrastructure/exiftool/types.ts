export interface ExifToolResult {
	data: Record<string, unknown>[] | null;
	error: string | null;
}

export interface ExifToolCloseResult {
	success: boolean;
	error: Error | null;
}
