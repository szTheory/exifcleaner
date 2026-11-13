import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, test } from "vitest";
import { enumerateFile, enumerateStories } from "./catalog/story_index.mjs";
import { repoRoot } from "./catalog/temp_repo";

// D-01: a story's title is `<group>/<file basename>`, with the group chosen by the
// directory under src/renderer/components. manifest.mjs is not involved: this gate
// reads titles from the same CSF enumeration the catalog uses.
export const TITLE_GROUPS: Readonly<Record<string, string>> = Object.freeze({
	settings: "Settings",
	ui: "UI",
	icons: "Icons",
	"file-list": "File list",
	screens: "Screens",
});

const COMPONENTS_DIR = "src/renderer/components/";

export function titleProblems(
	records: ReadonlyArray<{ file: string; title: string | null }>,
): string[] {
	const problems: string[] = [];
	const seen = new Set<string>();
	for (const { file, title } of records) {
		if (seen.has(file)) continue;
		seen.add(file);
		if (!file.startsWith(COMPONENTS_DIR)) {
			problems.push(`${file} is not under ${COMPONENTS_DIR}`);
			continue;
		}
		const rest = file.slice(COMPONENTS_DIR.length);
		const slash = rest.indexOf("/");
		const dir = slash === -1 ? "" : rest.slice(0, slash);
		const group = Object.keys(TITLE_GROUPS).includes(dir)
			? TITLE_GROUPS[dir]
			: undefined;
		if (group === undefined) {
			problems.push(
				`${file} is in unmapped directory "${dir}" (add it to TITLE_GROUPS)`,
			);
			continue;
		}
		const basename = path.posix.basename(file, ".stories.tsx");
		const expected = `${group}/${basename}`;
		if (title !== expected) {
			problems.push(
				`${file} has title ${JSON.stringify(title)}, expected ${JSON.stringify(expected)}`,
			);
		}
	}
	return problems;
}

const scratch = fs.realpathSync(
	fs.mkdtempSync(path.join(os.tmpdir(), "story-titles-")),
);
afterAll(() => {
	fs.rmSync(scratch, { recursive: true, force: true });
});

async function plant(rel: string, title: string) {
	const absolute = path.join(scratch, rel);
	fs.mkdirSync(path.dirname(absolute), { recursive: true });
	fs.writeFileSync(
		absolute,
		`import { X } from "x";\nexport default { title: ${JSON.stringify(title)}, component: X };\nexport const One = {};\n`,
	);
	return enumerateFile(absolute, rel);
}

describe("story titles follow the D-01 folder map", () => {
	test("the real stories are all titled <group>/<basename>", async () => {
		const stories = await enumerateStories(repoRoot);
		const files = new Set(stories.map((story) => story.file));
		// Anti-vacuity: the Phase 70 story and the Phase 72 tracer subject are seen.
		expect(files.size).toBeGreaterThanOrEqual(2);
		expect([...files]).toContain(
			"src/renderer/components/settings/LanguageDropdown.stories.tsx",
		);
		expect([...files]).toContain(
			"src/renderer/components/file-list/ErrorExpansion.stories.tsx",
		);
		expect(stories.length).toBeGreaterThanOrEqual(11);
		expect(titleProblems(stories)).toEqual([]);
	});

	test("the group map is frozen and covers exactly the five directories", () => {
		expect(Object.isFrozen(TITLE_GROUPS)).toBe(true);
		expect(TITLE_GROUPS).toEqual({
			settings: "Settings",
			ui: "UI",
			icons: "Icons",
			"file-list": "File list",
			screens: "Screens",
		});
	});

	test("a planted story with the wrong title yields exactly one problem naming the file", async () => {
		const planted = await plant(
			"src/renderer/components/settings/Wrong.stories.tsx",
			"UI/Wrong",
		);
		expect(titleProblems(planted)).toEqual([
			'src/renderer/components/settings/Wrong.stories.tsx has title "UI/Wrong", expected "Settings/Wrong"',
		]);
	});

	test("a planted story in an unmapped directory yields exactly one problem", async () => {
		const planted = await plant(
			"src/renderer/components/other/X.stories.tsx",
			"Other/X",
		);
		expect(titleProblems(planted)).toEqual([
			'src/renderer/components/other/X.stories.tsx is in unmapped directory "other" (add it to TITLE_GROUPS)',
		]);
	});

	test("a correctly titled planted story yields none", async () => {
		const planted = await plant(
			"src/renderer/components/ui/Fine.stories.tsx",
			"UI/Fine",
		);
		expect(titleProblems(planted)).toEqual([]);
	});
});
