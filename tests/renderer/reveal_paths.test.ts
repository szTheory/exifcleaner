import { describe, expect, it } from "vitest";
import { resolveRevealTargets } from "../../src/renderer/utils/reveal_paths";

describe("resolveRevealTargets", () => {
	it("uses the original path as the only reveal target for overwrite results", () => {
		const result = resolveRevealTargets({
			path: "/tmp/sample.jpg",
			outputPath: "/tmp/sample.jpg",
		});

		expect(result).toEqual({
			primaryPath: "/tmp/sample.jpg",
			contextPaths: null,
		});
	});

	it("uses the stored cleaned copy and original path for copy results", () => {
		const result = resolveRevealTargets({
			path: "/tmp/sample.jpg",
			outputPath: "/tmp/sample_cleaned.jpg",
		});

		expect(result).toEqual({
			primaryPath: "/tmp/sample_cleaned.jpg",
			contextPaths: {
				cleanedPath: "/tmp/sample_cleaned.jpg",
				originalPath: "/tmp/sample.jpg",
			},
		});
	});

	it("uses the stored collision suffix without predicting the cleaned name", () => {
		const result = resolveRevealTargets({
			path: "/tmp/sample.jpg",
			outputPath: "/tmp/sample_cleaned_2.jpg",
		});

		expect(result.primaryPath).toBe("/tmp/sample_cleaned_2.jpg");
		expect(result.contextPaths).toEqual({
			cleanedPath: "/tmp/sample_cleaned_2.jpg",
			originalPath: "/tmp/sample.jpg",
		});
	});

	it("does not change targets when unrelated settings objects change", () => {
		const file = {
			path: "/tmp/sample.jpg",
			outputPath: "/tmp/sample_cleaned_2.jpg",
		};
		const before = resolveRevealTargets(file);
		const settingsBefore = { saveAsCopy: true };
		const settingsAfter = { saveAsCopy: false };
		expect(settingsBefore.saveAsCopy).not.toBe(settingsAfter.saveAsCopy);

		const after = resolveRevealTargets(file);

		expect(after).toEqual(before);
	});
});
