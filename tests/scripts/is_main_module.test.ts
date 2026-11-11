import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { assertDirEffect, snapshotDir } from "../helpers/dir_effect";
import { isMainModule } from "../../scripts/is_main_module.mjs";

describe("isMainModule (WR-02)", () => {
	let tmp = "";
	let script = "";

	beforeEach(() => {
		tmp = fs.realpathSync(
			fs.mkdtempSync(path.join(os.tmpdir(), "is-main-module-")),
		);
		script = path.join(tmp, "entry.mjs");
		fs.writeFileSync(script, "export {};\n");
	});

	afterEach(() => {
		fs.rmSync(tmp, { recursive: true, force: true });
	});

	test("the same path is the main module", () => {
		expect(isMainModule(pathToFileURL(script).href, ["node", script])).toBe(
			true,
		);
	});

	test("a symlink to the module is the main module (the WR-02 case)", () => {
		const link = path.join(tmp, "link.mjs");
		fs.symlinkSync(script, link);
		const before = snapshotDir(tmp);
		expect(isMainModule(pathToFileURL(script).href, ["node", link])).toBe(true);
		assertDirEffect(before, snapshotDir(tmp), {});
	});

	test("a different file is not the main module", () => {
		const other = path.join(tmp, "other.mjs");
		fs.writeFileSync(other, "export {};\n");
		expect(isMainModule(pathToFileURL(script).href, ["node", other])).toBe(
			false,
		);
	});

	test("a missing or empty argv[1] is false, not an error", () => {
		const url = pathToFileURL(script).href;
		expect(isMainModule(url, ["node"])).toBe(false);
		expect(isMainModule(url, ["node", ""])).toBe(false);
		expect(
			isMainModule(url, ["node", path.join(tmp, "does-not-exist.mjs")]),
		).toBe(false);
	});
});
