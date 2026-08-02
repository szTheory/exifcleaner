import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect } from "@playwright/test";
import { createFixtureDir } from "../helpers/fixture_copier";
import { assertDirEffect, snapshotDir } from "../helpers/dir_effect";
import { launchApp, closeApp } from "./helpers/app_launcher";
import {
	assertMetadataStripped,
	readMetadataTags,
} from "./helpers/metadata_assertions";
import { waitForProcessing } from "./helpers/wait_for_processing";

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const EXIFTOOL_PATH =
	process.platform === "win32"
		? path.resolve(__dirname, "../../.resources/win/bin/exiftool.exe")
		: path.resolve(__dirname, "../../.resources/nix/bin/exiftool");
const ISSUE_240_CREATE_DATE_TAGS = [
	"CreateDate",
	"TrackCreateDate",
	"MediaCreateDate",
] as const;
const ISSUE_240_MEASURED_VALUE = "2019:10:02 00:49:04";

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

	test.fail(
		"#240 stripped MP4 does not retain create-date metadata",
		async () => {
			const { app, window: page } = await launchApp();
			const consoleErrors: string[] = [];
			page.on("console", (msg) => {
				if (msg.type() === "error") {
					consoleErrors.push(msg.text());
				}
			});
			const { dir, copyFixture, cleanup } = createFixtureDir();
			try {
				const tempFile = copyFixture("issue240.mp4");
				const tagsBefore = await readMetadataTags(tempFile);
				for (const tag of ISSUE_240_CREATE_DATE_TAGS) {
					expect(tagsBefore[tag], `${tag} precondition for #240`).toBe(
						ISSUE_240_MEASURED_VALUE,
					);
				}
				const before = snapshotDir(dir);

				await app.evaluate(
					({ BrowserWindow }, filePaths) => {
						const win = BrowserWindow.getAllWindows()[0];
						if (win) {
							win.webContents.send("file-open-add-files", filePaths);
						}
					},
					[tempFile],
				);

				await waitForProcessing(page, { timeout: 15000 });
				const after = snapshotDir(dir);
				assertDirEffect(before, after, { modified: ["issue240.mp4"] });

				const tagsAfter = await readMetadataTags(tempFile);
				const residualCreateDateTags = ISSUE_240_CREATE_DATE_TAGS.filter(
					(tag) => tagsAfter[tag] !== undefined,
				);
				expect(
					residualCreateDateTags,
					`#240 residual create-date metadata after stripping: ${residualCreateDateTags.join(", ")}`,
				).toEqual([]);
				await assertMetadataStripped(tempFile);
			} finally {
				cleanup();
				await closeApp(app);
			}
			const unexpectedErrors = consoleErrors.filter(
				(msg) => !msg.includes("ExifTool") && !msg.includes("ENOENT"),
			);
			expect(unexpectedErrors, "Unexpected console.error messages").toEqual([]);
		},
	);
});
