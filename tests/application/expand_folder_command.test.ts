import { it, expect, beforeEach, afterEach } from "vitest";
import { ExpandFolderCommand } from "../../src/application/commands/expand_folder_command";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

let command: ExpandFolderCommand;
let tmpDir: string;

beforeEach(async () => {
	command = new ExpandFolderCommand();
	tmpDir = await mkdtemp(path.join(os.tmpdir(), "expand-test-"));
});

afterEach(async () => {
	await rm(tmpDir, { recursive: true, force: true });
});

it("finds supported files recursively", async () => {
	await writeFile(path.join(tmpDir, "test.jpg"), "fake-jpg");
	await mkdir(path.join(tmpDir, "subdir"));
	await writeFile(path.join(tmpDir, "subdir", "photo.png"), "fake-png");
	await writeFile(path.join(tmpDir, "notes.txt"), "unsupported");
	await writeFile(path.join(tmpDir, "subdir", "details.md"), "unsupported");
	await mkdir(path.join(tmpDir, "unsupported-directory.txt"));

	const result = await command.execute({ dirPath: tmpDir });

	expect(result.ok).toBe(true);
	if (result.ok) {
		expect(result.value.files).toHaveLength(2);
		const basenames = result.value.files.map((p) => path.basename(p)).sort();
		expect(basenames).toEqual(["photo.png", "test.jpg"]);
		expect(result.value.skippedCount).toBe(2);
	}
});

it("reports unsupported-only folders without supported paths", async () => {
	await writeFile(path.join(tmpDir, "readme.txt"), "hello");

	const result = await command.execute({ dirPath: tmpDir });

	expect(result.ok).toBe(true);
	if (result.ok) {
		expect(result.value.files).toEqual([]);
		expect(result.value.skippedCount).toBe(1);
	}
});

it("returns empty array for empty directory", async () => {
	const result = await command.execute({ dirPath: tmpDir });

	expect(result.ok).toBe(true);
	if (result.ok) {
		expect(result.value.files).toEqual([]);
		expect(result.value.skippedCount).toBe(0);
	}
});

it("returns FolderError for nonexistent directory", async () => {
	const nonexistent = path.join(tmpDir, "nonexistent");
	const result = await command.execute({ dirPath: nonexistent });

	expect(result.ok).toBe(false);
	if (!result.ok) {
		expect(result.error.code).toBe("read-failed");
		// An equality matcher does not narrow the FolderError union -- narrow explicitly
		// before reading members that exist only on the "read-failed" variant.
		if (result.error.code === "read-failed") {
			expect(result.error.dirPath).toBe(nonexistent);
			expect(result.error.cause).toBeTruthy();
		}
	}
});

it("returns read-failed error for permission-denied directory", async () => {
	// chmod 0o000 does not prevent root from reading — skip on root
	const { getuid } = await import("node:process");
	if (typeof getuid === "function" && getuid() === 0) return;

	const { chmod } = await import("node:fs/promises");
	const restrictedDir = path.join(tmpDir, "restricted");
	await mkdir(restrictedDir);
	await writeFile(path.join(restrictedDir, "photo.jpg"), "fake");
	await chmod(restrictedDir, 0o000);

	try {
		const result = await command.execute({ dirPath: restrictedDir });

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error.code).toBe("read-failed");
			// An equality matcher does not narrow the FolderError union -- narrow
			// explicitly before reading the "read-failed"-only dirPath member.
			if (result.error.code === "read-failed") {
				expect(result.error.dirPath).toBe(restrictedDir);
			}
		}
	} finally {
		await chmod(restrictedDir, 0o755);
	}
});
