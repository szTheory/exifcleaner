import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { canonicalJson } from "./closed.mjs";
import {
	SCENARIOS_PATH,
	checkManifest,
	loadManifestInputs,
	type ManifestDocument,
} from "./manifest.mjs";
import { SUBJECTS_PATH } from "./subjects.mjs";
import { repoRoot } from "./temp_repo";

const inputs = await loadManifestInputs(repoRoot);
const scenariosText = fs.readFileSync(
	path.join(repoRoot, SCENARIOS_PATH),
	"utf8",
);
const subjectsText = fs.readFileSync(
	path.join(repoRoot, SUBJECTS_PATH),
	"utf8",
);
const real = JSON.parse(scenariosText) as ManifestDocument;

function isSorted(ids: string[]): boolean {
	return ids.every((id, index) => index === 0 || (ids[index - 1] ?? "") <= id);
}

describe("the real manifest", () => {
	test("the real manifest against the real stories, catalog and subjects is clean", () => {
		expect(checkManifest(inputs)).toEqual([]);
	});

	test("anti-vacuity: the run saw the LanguageDropdown stories and both seed scenarios", () => {
		const ids = inputs.stories.map((story) => story.id);
		expect(ids.length).toBeGreaterThanOrEqual(3);
		expect(ids).toContain("settings-languagedropdown--default");
		expect(ids).toContain("settings-languagedropdown--arabic");
		expect(ids).toContain("settings-languagedropdown--persian");
		expect(real.scenarios.map((scenario) => scenario.id)).toEqual([
			"language-dropdown.rtl-locales",
			"language-dropdown.system-default",
		]);
	});

	test("canonical form: scenarios.json is canonicalJson of its parse, sorted by id", () => {
		expect(scenariosText).toBe(canonicalJson(real));
		const ids = real.scenarios.map((scenario) => scenario.id);
		expect(isSorted(ids)).toBe(true);
		// The sort check is shown red on an unsorted clone.
		expect(isSorted([...ids].reverse())).toBe(false);
	});

	test("canonical form: subjects.json is canonicalJson of its parse, sorted by id", () => {
		const subjects = JSON.parse(subjectsText) as Array<{
			id: string;
			tier: string;
		}>;
		expect(subjectsText).toBe(canonicalJson(subjects));
		const ids = subjects.map((subject) => subject.id);
		expect(isSorted(ids)).toBe(true);
		expect(isSorted([...ids].reverse())).toBe(false);
	});
});
