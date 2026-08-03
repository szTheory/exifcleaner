import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

const ROOT = path.resolve(import.meta.dirname, "../..");

describe("Dependabot compatibility policy", () => {
	test("keeps grouped version updates below major boundaries", () => {
		const config = fs.readFileSync(
			path.join(ROOT, ".github/dependabot.yml"),
			"utf8",
		);

		expect(
			config.match(/update-types:\n\s+- "minor"\n\s+- "patch"/g),
		).toHaveLength(4);
		expect(config).toMatch(
			/dependency-name: "@types\/node"[\s\S]*?update-types:\n\s+- "version-update:semver-major"/,
		);
		expect(config).toMatch(
			/dependency-name: "vite"[\s\S]*?versions:\n\s+- ">=8"/,
		);
	});

	test("keeps security updates in an explicit, visible group", () => {
		const config = fs.readFileSync(
			path.join(ROOT, ".github/dependabot.yml"),
			"utf8",
		);

		expect(config).toContain("security-updates:");
		expect(config).toContain("applies-to: security-updates");
	});
});
