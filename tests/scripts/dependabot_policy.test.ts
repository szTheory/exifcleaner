import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

const ROOT = path.resolve(import.meta.dirname, "../..");

// The ignore entry for one dependency: the `- dependency-name:` line, every indented line
// that belongs to it, and the comment lines directly above it (`undefined` when absent).
function ignoreEntry(
	config: string,
	name: string,
): { comment: string; body: string } | undefined {
	const lines = config.split("\n");
	const start = lines.findIndex(
		(line) => line.trim() === `- dependency-name: "${name}"`,
	);
	if (start === -1) return undefined;
	const indent = (lines[start] ?? "").search(/\S/);
	let end = start + 1;
	while (
		end < lines.length &&
		(lines[end] ?? "").trim() !== "" &&
		(lines[end] ?? "").search(/\S/) > indent
	)
		end += 1;
	let first = start;
	while ((lines[first - 1] ?? "").trim().startsWith("#")) first -= 1;
	return {
		comment: lines.slice(first, start).join("\n"),
		body: lines
			.slice(start, end)
			.map((line) => line.trim())
			.join("\n"),
	};
}

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
			/dependency-name: "electron"[\s\S]*?update-types:\n\s+- "version-update:semver-major"/,
		);
		expect(config).toMatch(
			/dependency-name: "zod"[\s\S]*?update-types:\n\s+- "version-update:semver-major"/,
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

	// 69-07 (D-02): the native writer is a sealed dependency. A whole-package ignore (no
	// update-types, no versions) keeps Dependabot from proposing an unsealed bump; promotion is a
	// deliberate act that re-runs the seal. The seal gate in CI still fails an unsealed bump
	// closed regardless of what Dependabot does for security updates.
	test("ignores the sealed exifcleaner-node dependency as a whole package", () => {
		const config = fs.readFileSync(
			path.join(ROOT, ".github/dependabot.yml"),
			"utf8",
		);

		const entry = ignoreEntry(config, "exifcleaner-node");
		expect(entry).toBeDefined();
		expect(entry?.body).toBe('- dependency-name: "exifcleaner-node"');
		expect(entry?.comment).toContain("exifcleaner_node_dependency_gate");
		expect(entry?.comment).toContain("deliberate");
	});

	test("the sealed-dependency matcher rejects a restricted or unexplained ignore entry", () => {
		const restricted = [
			"    ignore:",
			'      - dependency-name: "exifcleaner-node"',
			"        update-types:",
			'          - "version-update:semver-major"',
		].join("\n");
		expect(ignoreEntry(restricted, "exifcleaner-node")?.body).not.toBe(
			'- dependency-name: "exifcleaner-node"',
		);
		const unexplained = [
			"    ignore:",
			'      - dependency-name: "exifcleaner-node"',
		].join("\n");
		expect(ignoreEntry(unexplained, "exifcleaner-node")?.comment).not.toContain(
			"exifcleaner_node_dependency_gate",
		);
		expect(ignoreEntry("version: 2\n", "exifcleaner-node")).toBeUndefined();
	});
});
