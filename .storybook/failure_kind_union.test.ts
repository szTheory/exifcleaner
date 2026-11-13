import { readFileSync } from "node:fs";
import path from "node:path";
import { composeStories } from "@storybook/react-vite";
import ts from "typescript";
import { describe, expect, test } from "vitest";
import * as FileRowStories from "../src/renderer/components/file-list/FileRow.stories";
import {
	FAILURE_CASES,
	FAILURE_WITHOUT_RESIDUAL,
} from "../src/renderer/story_support/process_outcomes";
import { enumerateStories } from "./catalog/story_index.mjs";
import { repoRoot } from "./catalog/temp_repo";

// D-05: the FileEntry.failureKind union, the FAILURE_CASES fixture keys and the
// ErrorExpansion kind stories are one set. A kind added to the union without a
// fixture and a story fails here. Phase 73 SC1 extends this test (no new mechanism): a
// FileRow branch below checks the same union against the composed FileRow stories' args,
// never against story-id slugs (D-09).
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

type FileRowStoryLike = {
	name: string;
	args: {
		file?: {
			failureKind?: string | undefined;
			residualPath?: string | undefined;
		};
		isExpanded?: boolean | undefined;
	};
};

// D-09 / SC1: a story counts for a failure kind only when it is expanded and its file
// has that failureKind (an expanded error row is the only place the per-kind detail
// renders); a collapsed row never counts. For the kinds that differ by residual path,
// one counting story must carry a residualPath and one must not.
export function fileRowKindProblems({
	union,
	without,
	stories,
}: {
	union: readonly string[];
	without: readonly string[];
	stories: readonly FileRowStoryLike[];
}): string[] {
	const counting = (kind: string): FileRowStoryLike[] =>
		stories.filter(
			(story) =>
				story.args.file?.failureKind === kind && story.args.isExpanded === true,
		);
	const problems: string[] = [];
	for (const kind of union) {
		if (counting(kind).length === 0) {
			problems.push(`union member ${kind} has no expanded FileRow story`);
		}
	}
	for (const kind of without) {
		const withKind = counting(kind);
		if (
			!withKind.some((story) => story.args.file?.residualPath !== undefined)
		) {
			problems.push(`${kind} has no FileRow story with a residualPath`);
		}
		if (
			!withKind.some((story) => story.args.file?.residualPath === undefined)
		) {
			problems.push(`${kind} has no FileRow story without a residualPath`);
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

function composedFileRowStories(): FileRowStoryLike[] {
	return Object.values(composeStories(FileRowStories)).map((story) => ({
		name: story.storyName ?? "",
		args: story.args,
	}));
}

describe("FileRow failure coverage (SC1, D-09)", () => {
	const without = Object.keys(FAILURE_WITHOUT_RESIDUAL).sort(compare);

	test("the real union and the composed FileRow stories agree", () => {
		const stories = composedFileRowStories();
		// Anti-vacuity: the composed list is the real story file, not an empty one.
		expect(stories.length).toBeGreaterThanOrEqual(10);
		expect(
			fileRowKindProblems({
				union: unionFromSource(REAL_TEXT),
				without,
				stories,
			}),
		).toEqual([]);
	});

	test("a union member planted in an in-memory copy has no expanded FileRow story", () => {
		const planted = REAL_TEXT.replace(
			'| "xattr"\n\t\t| "refused"',
			'| "xattr"\n\t\t| "planted"\n\t\t| "refused"',
		);
		expect(planted).not.toBe(REAL_TEXT);
		expect(
			fileRowKindProblems({
				union: unionFromSource(planted),
				without,
				stories: composedFileRowStories(),
			}),
		).toEqual(["union member planted has no expanded FileRow story"]);
	});

	test("a dropped Xattr story leaves no xattr story with a residualPath", () => {
		const stories = composedFileRowStories();
		const kept = stories.filter((story) => story.name !== "Xattr");
		expect(kept.length).toBe(stories.length - 1);
		expect(
			fileRowKindProblems({ union: REAL_UNION, without, stories: kept }),
		).toEqual(["xattr has no FileRow story with a residualPath"]);
	});

	test("a story named Write that renders verification does not cover write with a residualPath", () => {
		const stories = composedFileRowStories();
		const verification = stories.find((story) => story.name === "Verification");
		expect(verification).toBeDefined();
		const misnamed = stories.map((story) =>
			story.name === "Write"
				? { name: "Write", args: verification?.args ?? {} }
				: story,
		);
		expect(
			fileRowKindProblems({ union: REAL_UNION, without, stories: misnamed }),
		).toEqual(["write has no FileRow story with a residualPath"]);
	});
});
