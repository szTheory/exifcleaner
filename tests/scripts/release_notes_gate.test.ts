import { describe, expect, test } from "vitest";
import {
	classifyReleaseNotes,
	expectedReleaseHeading,
} from "../../scripts/release_notes_gate.mjs";

const PACKAGE_401 = { version: "4.0.1" };
const CANONICAL_HEADING = "# ExifCleaner 4.0.1";

describe("release-note identity gate", () => {
	test("accepts one exact top-level heading that matches the package version", () => {
		const result = classifyReleaseNotes({
			packageJson: PACKAGE_401,
			notes: `${CANONICAL_HEADING}\n\nRelease prose may mention 4.0.0.`,
		});

		expect(expectedReleaseHeading(PACKAGE_401)).toBe(CANONICAL_HEADING);
		expect(result.ok).toBe(true);
	});

	test.each([
		["stale heading", "# ExifCleaner 4.0.0"],
		["incidental version mention", "Release notes for ExifCleaner 4.0.1"],
		["prefix collision", "# ExifCleaner 4.0.10"],
		["missing identity heading", "## Highlights\n\nExifCleaner 4.0.1"],
		[
			"duplicate identity headings",
			`${CANONICAL_HEADING}\n\n${CANONICAL_HEADING}`,
		],
	])("rejects %s", (_name, notes) => {
		const result = classifyReleaseNotes({ packageJson: PACKAGE_401, notes });

		expect(result.ok).toBe(false);
		expect(result.reason).toContain("RELEASE_NOTES.md");
		expect(result.reason).toContain(CANONICAL_HEADING);
	});
});
