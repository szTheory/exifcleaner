import { it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

const DOMAIN_DIR = path.resolve(__dirname, "../../src/domain");

const FORBIDDEN_IMPORTS = [
	'from "node:',
	'from "electron"',
	'from "fs"',
	'require("node:',
	'require("electron"',
	'require("fs"',
];

it("domain files have no I/O or Electron imports", () => {
	const files = fs
		.readdirSync(DOMAIN_DIR)
		.filter((f) => f.endsWith(".ts"));

	expect(files.length).toBeGreaterThan(0);

	const violations: string[] = [];

	for (const file of files) {
		const content = fs.readFileSync(path.join(DOMAIN_DIR, file), "utf8");
		for (const forbidden of FORBIDDEN_IMPORTS) {
			if (content.includes(forbidden)) {
				violations.push(`${file} contains "${forbidden}"`);
			}
		}
	}

	expect(violations).toEqual([]);
});
