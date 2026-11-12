import { readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, test } from "vitest";
import { FAILURE_CASES } from "../src/renderer/story_support/process_outcomes";
import { enumerateStories } from "./catalog/story_index.mjs";
import { repoRoot } from "./catalog/temp_repo";

// D-05: the FileEntry.failureKind union, the FAILURE_CASES fixture keys and the
// ErrorExpansion kind stories are one set. A kind added to the union without a
// fixture and a story fails here. Phase 73 SC1 extends this test (FileRow's per-kind
// summaries) rather than adding a second mechanism.
//
// The two stories that show no kind are declared, never inferred: GenericFailure is
// the `{ success: false, error }` branch (no failureKind), LongDetail is a wrapping
// string.
export const NON_KIND_STORIES: readonly string[] = [
	"generic-failure",
	"long-detail",
];

const APP_CONTEXT = "src/renderer/contexts/AppContext.tsx";

function compare(a: string, b: string): number {
	return a < b ? -1 : a > b ? 1 : 0;
}

export function unionFromSource(text: string): string[] {
	const sf = ts.createSourceFile(
		APP_CONTEXT,
		text,
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.TSX,
	);
	let entry: ts.InterfaceDeclaration | undefined;
	ts.forEachChild(sf, (node) => {
		if (ts.isInterfaceDeclaration(node) && node.name.text === "FileEntry") {
			entry = node;
		}
	});
	if (entry === undefined) {
		throw new Error(`interface FileEntry is missing from ${APP_CONTEXT}`);
	}
	let property: ts.PropertySignature | undefined;
	for (const member of entry.members) {
		if (
			ts.isPropertySignature(member) &&
			ts.isIdentifier(member.name) &&
			member.name.text === "failureKind"
		) {
			property = member;
		}
	}
	if (property === undefined || property.type === undefined) {
		throw new Error(`FileEntry.failureKind is missing from ${APP_CONTEXT}`);
	}
	const members = ts.isUnionTypeNode(property.type)
		? property.type.types
		: [property.type];
	const kinds: string[] = [];
	for (const member of members) {
		if (ts.isLiteralTypeNode(member) && ts.isStringLiteral(member.literal)) {
			kinds.push(member.literal.text);
		}
	}
	return kinds.sort(compare);
}

export function failureKindCoverageProblems({
	union,
	fixtureKeys,
	storyKinds,
}: {
	union: readonly string[];
	fixtureKeys: readonly string[];
	storyKinds: readonly string[];
}): string[] {
	const problems: string[] = [];
	for (const kind of union) {
		if (!fixtureKeys.includes(kind)) {
			problems.push(`union member ${kind} has no fixture`);
		}
		if (!storyKinds.includes(kind)) {
			problems.push(`union member ${kind} has no ErrorExpansion story`);
		}
	}
	for (const key of fixtureKeys) {
		if (!union.includes(key)) {
			problems.push(`fixture ${key} is not in the union`);
		}
	}
	for (const kind of storyKinds) {
		if (!union.includes(kind)) {
			problems.push(`story ${kind} is not a failure kind`);
		}
	}
	return problems.sort(compare);
}

const REAL_TEXT = readFileSync(path.join(repoRoot, APP_CONTEXT), "utf8");
const REAL_UNION = [
	"cleanup",
	"commit",
	"refused",
	"verification",
	"write",
	"xattr",
];

async function realStoryKinds(): Promise<string[]> {
	const stories = await enumerateStories(repoRoot);
	return stories
		.filter((story) => story.component === "ErrorExpansion")
		.map((story) => story.id.slice(story.id.indexOf("--") + 2))
		.filter((kind) => !NON_KIND_STORIES.includes(kind))
		.sort(compare);
}

describe("failureKind union coverage (D-05)", () => {
	test("the union read from AppContext.tsx is the six known kinds", () => {
		expect(unionFromSource(REAL_TEXT)).toEqual(REAL_UNION);
	});

	test("a literal planted in an in-memory copy of the union is read back", () => {
		const planted = REAL_TEXT.replace(
			'| "xattr"\n\t\t| "refused"',
			'| "xattr"\n\t\t| "planted"\n\t\t| "refused"',
		);
		expect(planted).not.toBe(REAL_TEXT);
		expect(unionFromSource(planted)).toContain("planted");
	});

	test("a source without the interface or the property throws naming what is missing", () => {
		expect(() => unionFromSource("export const x = 1;")).toThrow(
			"interface FileEntry is missing",
		);
		expect(() =>
			unionFromSource("export interface FileEntry { id: string }"),
		).toThrow("FileEntry.failureKind is missing");
	});

	test("the real union, fixture keys and kind stories agree", async () => {
		const storyKinds = await realStoryKinds();
		// Anti-vacuity: the tracer stories exist.
		expect(storyKinds.length).toBeGreaterThanOrEqual(1);
		expect(
			failureKindCoverageProblems({
				union: unionFromSource(REAL_TEXT),
				fixtureKeys: Object.keys(FAILURE_CASES).sort(compare),
				storyKinds,
			}),
		).toEqual([]);
	});

	test("a planted union member with a fixture but no story yields exactly one problem", async () => {
		const storyKinds = await realStoryKinds();
		const planted = REAL_TEXT.replace(
			'| "xattr"\n\t\t| "refused"',
			'| "xattr"\n\t\t| "planted"\n\t\t| "refused"',
		);
		expect(
			failureKindCoverageProblems({
				union: unionFromSource(planted),
				fixtureKeys: [...Object.keys(FAILURE_CASES), "planted"],
				storyKinds,
			}),
		).toEqual(["union member planted has no ErrorExpansion story"]);
		// With neither a fixture nor a story, both gaps are reported (sorted).
		expect(
			failureKindCoverageProblems({
				union: unionFromSource(planted),
				fixtureKeys: Object.keys(FAILURE_CASES),
				storyKinds,
			}),
		).toEqual([
			"union member planted has no ErrorExpansion story",
			"union member planted has no fixture",
		]);
	});

	test("a dropped fixture key yields exactly one problem", async () => {
		const storyKinds = await realStoryKinds();
		expect(
			failureKindCoverageProblems({
				union: REAL_UNION,
				fixtureKeys: Object.keys(FAILURE_CASES).filter(
					(key) => key !== "commit",
				),
				storyKinds,
			}),
		).toEqual(["union member commit has no fixture"]);
	});

	test("a dropped story kind yields exactly one problem", async () => {
		const storyKinds = (await realStoryKinds()).filter(
			(kind) => kind !== "xattr",
		);
		expect(
			failureKindCoverageProblems({
				union: REAL_UNION,
				fixtureKeys: Object.keys(FAILURE_CASES),
				storyKinds,
			}),
		).toEqual(["union member xattr has no ErrorExpansion story"]);
	});
});
