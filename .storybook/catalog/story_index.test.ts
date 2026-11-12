import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, test } from "vitest";
import {
	STORIES_GLOB,
	UNTITLED_SENTINEL,
	enumerateFile,
	enumerateStories,
	listStoryFiles,
	scenarioTagProblems,
} from "./story_index.mjs";
import { repoRoot } from "./temp_repo";

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "story-index-"));
afterAll(() => {
	fs.rmSync(scratch, { recursive: true, force: true });
});

async function enumerateSource(name: string, source: string) {
	const file = path.join(scratch, name);
	fs.writeFileSync(file, source);
	return enumerateFile(file, `planted/${name}`);
}

function walkStories(dir: string): string[] {
	return fs
		.readdirSync(dir, { withFileTypes: true })
		.flatMap((entry) =>
			entry.isDirectory()
				? walkStories(path.join(dir, entry.name))
				: entry.name.endsWith(".stories.tsx")
					? [path.join(dir, entry.name)]
					: [],
		);
}

describe("the real stories", () => {
	test("the Phase 70 LanguageDropdown ids stay in the index and every story matches its own file's meta", async () => {
		const stories = await enumerateStories(repoRoot);
		const ids = stories.map((story) => story.id);
		for (const seed of [
			"settings-languagedropdown--arabic",
			"settings-languagedropdown--default",
			"settings-languagedropdown--persian",
		]) {
			expect(ids).toContain(seed);
		}
		// Anti-vacuity: the three seed stories plus the eight ErrorExpansion stories.
		expect(stories.length).toBeGreaterThanOrEqual(11);
		for (const story of stories) {
			const source = fs.readFileSync(path.join(repoRoot, story.file), "utf8");
			expect(source, story.file).toContain(
				`title: ${JSON.stringify(story.title)}`,
			);
			expect(source, story.file).toContain(`component: ${story.component}`);
		}
		const language = stories.filter(
			(story) => story.component === "LanguageDropdown",
		);
		// The three Phase 70 stories (their ids are asserted above) plus the stories
		// Phase 72 appended, so the count may only grow.
		expect(language.length).toBeGreaterThanOrEqual(3);
		for (const story of language) {
			expect(story.title).toBe("Settings/LanguageDropdown");
			expect(story.file).toBe(
				"src/renderer/components/settings/LanguageDropdown.stories.tsx",
			);
		}
	});

	test("main.ts still holds the stories glob the enumerator mirrors", () => {
		const main = fs.readFileSync(
			path.join(repoRoot, ".storybook/main.ts"),
			"utf8",
		);
		expect(STORIES_GLOB).toBe("../src/renderer/**/*.stories.@(ts|tsx)");
		expect(main).toContain(STORIES_GLOB);
	});

	test("fixture stories are never listed", () => {
		const fixtures = walkStories(path.join(repoRoot, ".storybook/fixtures"));
		expect(fixtures.length).toBeGreaterThanOrEqual(2);
		const listed = listStoryFiles(repoRoot);
		expect(listed.length).toBeGreaterThanOrEqual(1);
		for (const file of listed) {
			expect(file.startsWith("src/renderer/")).toBe(true);
			expect(file).not.toContain(".storybook");
		}
	});

	test("listStoryFiles finds .stories.ts and .stories.tsx and nothing else", () => {
		const root = fs.mkdtempSync(path.join(scratch, "tree-"));
		for (const rel of [
			"src/renderer/b.stories.tsx",
			"src/renderer/sub/a.stories.ts",
			"src/renderer/sub/plain.ts",
			"src/renderer/sub/a.stories.tsx.bak",
		]) {
			const file = path.join(root, rel);
			fs.mkdirSync(path.dirname(file), { recursive: true });
			fs.writeFileSync(file, "export {};\n");
		}
		expect(listStoryFiles(root)).toEqual([
			"src/renderer/b.stories.tsx",
			"src/renderer/sub/a.stories.ts",
		]);
	});
});

describe("measured CSF variants", () => {
	test("shown red: untitled story maps to null", async () => {
		const stories = await enumerateSource(
			"untitled.stories.tsx",
			'import { X } from "x";\nexport default { component: X };\nexport const One = {};\n',
		);
		expect(stories).toHaveLength(1);
		expect(stories[0]?.title).toBeNull();
		expect(stories[0]?.component).toBe("X");
		expect(stories[0]?.id).toContain("catalog-untitled");
		expect(UNTITLED_SENTINEL).toBe("__catalog_untitled__");
	});

	test("a titled story keeps its title", async () => {
		const stories = await enumerateSource(
			"titled.stories.tsx",
			'import { X } from "x";\nexport default { title: "Scratch/Titled", component: X };\nexport const One = {};\n',
		);
		expect(stories[0]).toMatchObject({
			id: "scratch-titled--one",
			title: "Scratch/Titled",
			component: "X",
		});
	});

	test("a meta with no component records component null", async () => {
		const stories = await enumerateSource(
			"nocomponent.stories.tsx",
			'export default { title: "Scratch/NoComponent" };\nexport const One = {};\n',
		);
		expect(stories[0]?.component).toBeNull();
		expect(stories[0]?.title).toBe("Scratch/NoComponent");
	});

	test("an aliased import is reported as its local name", async () => {
		const stories = await enumerateSource(
			"alias.stories.tsx",
			'import { LanguageDropdown as LD } from "x";\nexport default { title: "Scratch/Alias", component: LD };\nexport const One = {};\n',
		);
		expect(stories[0]?.component).toBe("LD");
	});

	test("includeStories limits the list and a spread story is still listed", async () => {
		const stories = await enumerateSource(
			"include.stories.tsx",
			'import { X } from "x";\nexport default { title: "Scratch/Include", component: X, includeStories: ["One", "Three"] };\nexport const One = {};\nexport const Two = {};\nexport const Three = { ...One };\n',
		);
		expect(stories.map((story) => story.id)).toEqual([
			"scratch-include--one",
			"scratch-include--three",
		]);
	});

	test("story tags and meta tags merge, sorted", async () => {
		const stories = await enumerateSource(
			"tags.stories.tsx",
			'import { X } from "x";\nexport default { title: "Scratch/Tags", component: X, tags: ["zeta"] };\nexport const One = { tags: ["alpha"] };\n',
		);
		expect(stories[0]?.tags).toEqual(["alpha", "zeta"]);
	});

	test("a parse failure names the file", async () => {
		await expect(
			enumerateSource("broken.stories.tsx", "export default {{{"),
		).rejects.toThrow("planted/broken.stories.tsx");
	});
});

describe("D-21: no tags link a story to a scenario", () => {
	test("no real story or meta carries a scenario-shaped tag", async () => {
		const stories = await enumerateStories(repoRoot);
		expect(stories.length).toBeGreaterThanOrEqual(3);
		expect(scenarioTagProblems(stories)).toEqual([]);
	});

	test("shown red: scenario tag on a story", async () => {
		const stories = await enumerateSource(
			"tagged.stories.tsx",
			'import { X } from "x";\nexport default { title: "Scratch/Tagged", component: X, tags: ["language-dropdown.rtl-locales"] };\nexport const One = { tags: ["scenario:x"] };\n',
		);
		expect(
			scenarioTagProblems(stories).map(({ code, story }) => ({ code, story })),
		).toEqual([
			{ code: "scenario-tag", story: "scratch-tagged--one" },
			{ code: "scenario-tag", story: "scratch-tagged--one" },
		]);
	});
});
