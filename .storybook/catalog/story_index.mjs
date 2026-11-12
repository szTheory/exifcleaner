// No-build story enumeration (JTBD-02, D-21).
//
// Stories are read with the CSF parser Storybook itself uses (the csf-tools
// internal entry, an unstable API, so the Storybook pin is exact and a bump
// arrives through a reviewed PR). No browser, no
// build, no `index.json`, no regex and no TypeScript compiler.
//
// Measured behaviour this module relies on (Storybook 10.6.6):
//   - `makeTitle` is called with no usable title when `meta` has none, so the
//     callback returns a sentinel and the record maps it back to `null`.
//   - `csf.meta.component` is the identifier as written: an aliased import
//     is reported under its local name, so composite stories import the
//     component unaliased.
//   - `includeStories` and `excludeStories` are honoured by `csf.stories`.
//   - A story's own `tags` do not include the meta tags, and a spread story
//     (`Three = { ...One }`) loses its tags; the record merges the story tags
//     with `csf.meta.tags`. This is why a scenario never links by tag.
import fs from "node:fs";
import path from "node:path";
import { readCsf } from "storybook/internal/csf-tools";
import { compareCodeUnits } from "./closed.mjs";
import { SCENARIO_ID_PATTERN } from "./vocab.mjs";

// The glob in .storybook/main.ts; a test asserts main.ts still holds it.
export const STORIES_GLOB = "../src/renderer/**/*.stories.@(ts|tsx)";

// csf-tools needs a string title to build ids; this stands in for "no title".
export const UNTITLED_SENTINEL = "__catalog_untitled__";

/**
 * Repo-relative story files under src/renderer, sorted by code unit. The walk
 * starts at src/renderer, so .storybook/fixtures is excluded by location.
 *
 * @param {string} root
 * @returns {string[]}
 */
export function listStoryFiles(root) {
	/** @param {string} relative @returns {string[]} */
	const walk = (relative) =>
		fs
			.readdirSync(path.join(root, relative), { withFileTypes: true })
			.flatMap((entry) => {
				const child = `${relative}/${entry.name}`;
				if (entry.isDirectory()) return walk(child);
				return entry.name.endsWith(".stories.ts") ||
					entry.name.endsWith(".stories.tsx")
					? [child]
					: [];
			});
	return walk("src/renderer").sort(compareCodeUnits);
}

/**
 * @param {string} absPath
 * @param {string} relPath
 */
export async function enumerateFile(absPath, relPath) {
	let csf;
	try {
		csf = await readCsf(absPath, {
			makeTitle: (/** @type {string | null | undefined} */ title) =>
				title ?? UNTITLED_SENTINEL,
		});
		csf.parse();
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		throw new Error(`${relPath}: ${reason}`);
	}
	const meta = csf.meta;
	const title = meta.title === UNTITLED_SENTINEL ? null : (meta.title ?? null);
	const component = meta.component ?? null;
	const metaTags = Array.isArray(meta.tags) ? meta.tags : [];
	return csf.stories.map((story) => ({
		id: story.id,
		file: relPath,
		title,
		component,
		tags: [
			...new Set([
				...(Array.isArray(story.tags) ? story.tags : []),
				...metaTags,
			]),
		].sort(compareCodeUnits),
	}));
}

/**
 * Every story under src/renderer, ids sorted by code unit.
 *
 * @param {string} root
 */
export async function enumerateStories(root) {
	const records = [];
	for (const relPath of listStoryFiles(root)) {
		records.push(...(await enumerateFile(path.join(root, relPath), relPath)));
	}
	return records.sort((a, b) => compareCodeUnits(a.id, b.id));
}

/**
 * D-21: the manifest is the only story-to-scenario link. A tag shaped like a
 * scenario id, or starting `scenario:`, is a footgun because a spread story
 * loses it.
 *
 * @param {ReadonlyArray<{ id: string, tags: readonly string[] }>} stories
 */
export function scenarioTagProblems(stories) {
	const found = [];
	for (const story of stories) {
		for (const tag of story.tags) {
			if (SCENARIO_ID_PATTERN.test(tag) || tag.startsWith("scenario:")) {
				found.push({
					code: "scenario-tag",
					story: story.id,
					message: `story ${story.id} carries the scenario-shaped tag ${tag}; link scenarios in scenarios.json only`,
				});
			}
		}
	}
	return found;
}
