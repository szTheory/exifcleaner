import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect } from "@playwright/test";
import { createFixtureDir } from "../helpers/fixture_copier";
import {
	assertMetadataStripped,
	readMetadataTags,
} from "./helpers/metadata_assertions";

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const EXIFTOOL_PATH =
	process.platform === "win32"
		? path.resolve(__dirname, "../../.resources/win/bin/exiftool.exe")
		: path.resolve(__dirname, "../../.resources/nix/bin/exiftool");

async function stripAllMetadata(filePath: string): Promise<void> {
	await execFileAsync(EXIFTOOL_PATH, [
		"-all=",
		"-overwrite_original",
		filePath,
	]);
}

test.describe("Oracle accountability", () => {
	test("shared oracle rejects an unstripped fixture with residual-tag diagnostics", async () => {
		const { copyFixture, cleanup } = createFixtureDir();
		try {
			const tempFile = copyFixture("sample.jpg");
			const tags = await readMetadataTags(tempFile);

			expect(tags).toHaveProperty("Make");
			expect(tags).toHaveProperty("Artist");
			expect(tags).toHaveProperty("XResolution");
			expect(tags).toHaveProperty("YResolution");
			expect(tags).toHaveProperty("SourceFile");
			expect(tags).not.toHaveProperty("Source");

			await expect(assertMetadataStripped(tempFile)).rejects.toThrow(
				/Make.*Artist.*XResolution.*YResolution/s,
			);
		} finally {
			cleanup();
		}
	});

	test("shared oracle accepts a structural-only fixture", async () => {
		const { copyFixture, cleanup } = createFixtureDir();
		try {
			const tempFile = copyFixture("no_metadata.jpg");

			await stripAllMetadata(tempFile);
			await expect(assertMetadataStripped(tempFile)).resolves.toBeUndefined();
		} finally {
			cleanup();
		}
	});
});
