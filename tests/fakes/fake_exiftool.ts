import type { ExifToolPort } from "../../src/application/exiftool_port";
import type { Result } from "../../src/common/result";

export class FakeExifTool implements ExifToolPort {
	calls: Array<{ method: string; args: unknown[] }> = [];

	readResult: { data: Record<string, unknown>[] | null; error: string | null } =
		{
			data: [{ FileName: "test.jpg" }],
			error: null,
		};

	removeResult: { data: null; error: string | null } = {
		data: null,
		error: null,
	};

	async open(): Promise<number> {
		this.calls.push({ method: "open", args: [] });
		return 12345;
	}

	async close(): Promise<Result<void>> {
		this.calls.push({ method: "close", args: [] });
		return { ok: true, value: undefined };
	}

	async readMetadata({
		filePath,
		args,
	}: {
		filePath: string;
		args: string[];
	}): Promise<{ data: Record<string, unknown>[] | null; error: string | null }> {
		this.calls.push({ method: "readMetadata", args: [filePath, args] });
		return this.readResult;
	}

	async removeMetadata({
		filePath,
		args,
	}: {
		filePath: string;
		args: string[];
	}): Promise<{ data: null; error: string | null }> {
		this.calls.push({ method: "removeMetadata", args: [filePath, args] });
		return this.removeResult;
	}
}
