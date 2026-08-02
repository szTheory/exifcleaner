import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { expect } from "@playwright/test";

const execFileAsync = promisify(execFile);
const XATTR_EXECUTABLE = "/usr/bin/xattr";

export type SeededXattr = { name: string; valueHex: string };

export async function seedXattrs(
	filePath: string,
	xattrs: SeededXattr[],
): Promise<void> {
	for (const { name, valueHex } of xattrs) {
		await execFileAsync(XATTR_EXECUTABLE, [
			"-w",
			"-x",
			name,
			valueHex,
			"--",
			filePath,
		]);
	}
}

export async function readXattrHex(
	filePath: string,
	name: string,
): Promise<string> {
	const { stdout } = await execFileAsync(XATTR_EXECUTABLE, [
		"-p",
		"-x",
		name,
		"--",
		filePath,
	]);
	return stdout.replaceAll(/\s/g, "").toLowerCase();
}

export async function listXattrNames(filePath: string): Promise<string[]> {
	const { stdout } = await execFileAsync(XATTR_EXECUTABLE, ["--", filePath]);
	return stdout
		.split("\n")
		.map((value) => value.trim())
		.filter(Boolean)
		.sort();
}

export async function expectSeededXattrs(
	filePath: string,
	xattrs: SeededXattr[],
): Promise<void> {
	for (const { name, valueHex } of xattrs) {
		expect(await readXattrHex(filePath, name)).toBe(valueHex.toLowerCase());
	}
}

export async function expectNoXattrs(filePath: string): Promise<void> {
	expect(await listXattrNames(filePath)).toEqual([]);
}
