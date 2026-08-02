import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RELEASE_NOTES_FILENAME = "RELEASE_NOTES.md";

/**
 * Build the single human-visible heading that identifies a release's notes.
 *
 * @param {{version?: unknown}} packageJson parsed package metadata
 * @returns {string}
 */
export function expectedReleaseHeading(packageJson) {
	if (typeof packageJson.version !== "string" || packageJson.version === "") {
		throw new Error("package.json must contain a non-empty version string");
	}

	return `# ExifCleaner ${packageJson.version}`;
}

/**
 * Check the release identity without interpreting or mutating any release prose.
 *
 * @param {{packageJson: {version?: unknown}; notes: string}} subject
 * @returns {{ok: boolean; reason?: string}}
 */
export function classifyReleaseNotes({ packageJson, notes }) {
	const expected = expectedReleaseHeading(packageJson);
	const identityHeadings = String(notes)
		.split(/\r?\n/)
		.filter((line) => line.startsWith("# ExifCleaner "));
	const exactCount = identityHeadings.filter(
		(line) => line === expected,
	).length;

	if (exactCount === 1 && identityHeadings.length === 1) {
		return { ok: true };
	}

	return {
		ok: false,
		reason: `${RELEASE_NOTES_FILENAME} must contain exactly one top-level identity heading equal to ${expected}.`,
	};
}

/**
 * Run the repository gate from the Electron package root.
 *
 * @returns {number}
 */
export function main() {
	const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
	const rootDirectory = path.resolve(scriptDirectory, "..");
	const packageJson = JSON.parse(
		fs.readFileSync(path.join(rootDirectory, "package.json"), "utf8"),
	);
	const notes = fs.readFileSync(
		path.join(rootDirectory, RELEASE_NOTES_FILENAME),
		"utf8",
	);
	const result = classifyReleaseNotes({ packageJson, notes });

	if (!result.ok) {
		console.error(`\n✗ RELEASE-NOTES GATE FAILED:\n${result.reason}\n`);
		return 1;
	}

	console.log("✓ RELEASE-NOTES GATE PASSED");
	return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	process.exitCode = main();
}
