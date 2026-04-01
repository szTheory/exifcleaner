import type { ExifToolResult } from "./types";

interface ReadySegment {
	readonly executeNum: number;
	readonly output: string;
}

interface ExtractResult {
	readonly completed: readonly ReadySegment[];
	readonly remaining: string;
}

export function extractReadySegments({
	buffer,
}: {
	buffer: string;
}): ExtractResult {
	const completed: ReadySegment[] = [];
	let remaining = buffer;
	const readyRegex = /\{ready(\d+)\}/g;
	let match: RegExpExecArray | null;

	while ((match = readyRegex.exec(remaining)) !== null) {
		const marker = match[1];
		if (marker === undefined) {
			continue;
		}
		const executeNum = parseInt(marker, 10);
		const output = remaining.substring(0, match.index).trim();

		remaining = remaining.substring(match.index + match[0].length);
		remaining = remaining.replace(/^\s+/, "");

		// Reset regex lastIndex since we modified the string
		readyRegex.lastIndex = 0;

		completed.push({ executeNum, output });
	}

	return { completed, remaining };
}

export function parseExiftoolOutput({
	raw,
}: {
	raw: string;
}): ExifToolResult {
	if (raw === "") {
		return { data: null, error: null };
	}

	const trimmed = raw.trimStart();
	const isJson = trimmed.startsWith("[") || trimmed.startsWith("{");

	if (isJson) {
		try {
			const parsed: unknown = JSON.parse(raw);
			if (Array.isArray(parsed) && parsed.length > 0) {
				const firstItem: unknown = parsed[0];
				if (
					firstItem &&
					typeof firstItem === "object" &&
					"Error" in firstItem
				) {
					return {
						data: null,
						error: String(
							(firstItem as Record<string, unknown>).Error,
						),
					};
				}
				return { data: parsed as Record<string, unknown>[], error: null };
			}
			return { data: parsed as Record<string, unknown>[], error: null };
		} catch (err) {
			return {
				data: null,
				error: `Failed to parse ExifTool output: ${err instanceof Error ? err.message : String(err)}`,
			};
		}
	}

	if (raw.toLowerCase().includes("error")) {
		return { data: null, error: raw.trim() };
	}

	return { data: null, error: null };
}
