import { it, expect, beforeEach, afterEach } from "vitest";
import { ExpandFolderCommand } from "../../src/application/expand_folder_command";
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

	const result = await command.execute({ dirPath: tmpDir });

	expect(result.ok).toBe(true);
	if (result.ok) {
		expect(result.value).toHaveLength(2);
		const basenames = result.value.map((p) => path.basename(p)).sort();
		expect(basenames).toEqual(["photo.png", "test.jpg"]);
	}
});

it("filters out unsupported files", async () => {
	await writeFile(path.join(tmpDir, "test.jpg"), "fake-jpg");
	await writeFile(path.join(tmpDir, "readme.txt"), "hello");

	const result = await command.execute({ dirPath: tmpDir });

	expect(result.ok).toBe(true);
	if (result.ok) {
		expect(result.value).toHaveLength(1);
		expect(path.basename(result.value[0]!)).toBe("test.jpg");
	}
});

it("returns empty array for empty directory", async () => {
	const result = await command.execute({ dirPath: tmpDir });

	expect(result.ok).toBe(true);
	if (result.ok) {
		expect(result.value).toEqual([]);
	}
});

it("returns error for nonexistent directory", async () => {
	const result = await command.execute({
		dirPath: path.join(tmpDir, "nonexistent"),
	});

	expect(result.ok).toBe(false);
});
