import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { assertDirEffect, snapshotDir } from "../../tests/helpers/dir_effect";
import { compareCodeUnits, isCalendarDate, resolveInRoot } from "./closed.mjs";
import { readMergeBase, resolveBaseRef } from "./merge_base.mjs";
import { git, repoRoot } from "./temp_repo";
import {
	FILTERED_TREES,
	STATE_CLASSES,
	STATE_CLASS_DEFS,
	STATE_CLASS_TIEBREAK,
} from "./vocab.mjs";
import * as vocab from "./vocab.mjs";

// The criterion's list, hard-coded so a drive-by edit of vocab.mjs goes red.
const CRITERION_STATE_CLASSES = [
	"happy",
	"empty",
	"one",
	"many",
	"boundary",
	"loading",
	"error",
	"denied",
	"stale",
	"long",
	"intl",
	"huge",
];

describe("vocab.mjs", () => {
	test("STATE_CLASSES is the criterion list, frozen, and the tie-break is a permutation of it", () => {
		expect([...STATE_CLASSES]).toEqual(CRITERION_STATE_CLASSES);
		expect(Object.isFrozen(STATE_CLASSES)).toBe(true);
		expect([...STATE_CLASS_TIEBREAK]).toEqual([
			"denied",
			"stale",
			"error",
			"loading",
			"empty",
			"huge",
			"boundary",
			"long",
			"intl",
			"many",
			"one",
			"happy",
		]);
		expect([...STATE_CLASS_TIEBREAK].sort()).toEqual(
			[...CRITERION_STATE_CLASSES].sort(),
		);
	});

	test("every closed vocabulary export is frozen", () => {
		for (const [name, value] of Object.entries(vocab)) {
			if (value instanceof RegExp) continue;
			expect(Object.isFrozen(value), `${name} must be frozen`).toBe(true);
		}
	});

	test("STATE_CLASS_DEFS has one complete definition per class", () => {
		expect(Object.keys(STATE_CLASS_DEFS)).toEqual(CRITERION_STATE_CLASSES);
		for (const [name, entry] of Object.entries(STATE_CLASS_DEFS)) {
			expect(entry.definition, name).not.toBe("");
			expect(entry.classifyLike, name).not.toBe("");
			expect(entry.anchors.length, name).toBeGreaterThan(0);
		}
	});

	test("every STATE_CLASS_DEFS anchor resolves to a filtered-tree file containing its symbol", () => {
		let checked = 0;
		for (const [name, entry] of Object.entries(STATE_CLASS_DEFS)) {
			for (const anchor of entry.anchors) {
				const [file, symbol] = anchor.split("#");
				expect(file, `${name} anchor ${anchor}`).toBeTruthy();
				expect(symbol, `${name} anchor ${anchor}`).toBeTruthy();
				const inTrees =
					FILTERED_TREES.some(
						(tree) => file === tree || file?.startsWith(`${tree}/`),
					) || file === "src/main/reveal_handlers.ts";
				expect(inTrees, `${anchor} is outside the filtered trees`).toBe(true);
				const text = fs.readFileSync(path.join(repoRoot, file ?? ""), "utf8");
				expect(text, `${anchor}: symbol not in file`).toContain(symbol ?? "");
				checked += 1;
			}
		}
		expect(checked).toBeGreaterThanOrEqual(20);
	});

	test("denied and stale follow RESEARCH C7", () => {
		expect(STATE_CLASS_DEFS["denied"]?.anchors).toContain(
			"src/domain/files/file_processing_outcome.ts#unsafe-raf-write",
		);
		const stale = STATE_CLASS_DEFS["stale"]?.anchors ?? [];
		expect(stale).toContain(
			"src/renderer/components/file-list/FileRow.tsx#commitFailedSummary",
		);
		expect(stale).toContain(
			"src/main/reveal_handlers.ts#File no longer exists",
		);
	});
});

describe("closed.mjs helpers", () => {
	const root = path.join(os.tmpdir(), "closed-root");

	test.each([
		["empty", ""],
		["absolute", "/etc/passwd"],
		["parent", "../x"],
		["embedded parent", "src/../../x"],
		["backslash", "a\\b"],
		["wildcard", "src/*.ts"],
		["drive-relative", "C:x"],
		["NUL", "src/a\0b"],
		["brace", "src/{a,b}.ts"],
	])("resolveInRoot rejects %s", (_name, input) => {
		expect(resolveInRoot(root, input)).toBeNull();
	});

	test("resolveInRoot accepts a plain relative path and stays inside the root", () => {
		const resolved = resolveInRoot(root, "src/renderer/App.tsx");
		expect(resolved).toBe(path.join(root, "src/renderer/App.tsx"));
		expect(path.relative(root, resolved ?? "").startsWith("..")).toBe(false);
	});

	test("isCalendarDate is a real calendar check", () => {
		expect(isCalendarDate("2026-02-30")).toBe(false);
		expect(isCalendarDate("2026-02-28")).toBe(true);
		expect(isCalendarDate("2026-2-1")).toBe(false);
		expect(isCalendarDate("2024-02-29")).toBe(true);
		expect(isCalendarDate(20260228)).toBe(false);
	});

	test("compareCodeUnits orders by code unit, not locale", () => {
		expect(compareCodeUnits("B", "a")).toBe(-1);
		expect(compareCodeUnits("a", "B")).toBe(1);
		expect(compareCodeUnits("a", "a")).toBe(0);
	});
});

describe("merge_base.mjs", () => {
	function makeRepo(): string {
		const repo = fs.realpathSync(
			fs.mkdtempSync(path.join(os.tmpdir(), "merge-base-")),
		);
		git(repo, ["init", "-q", "-b", "main"]);
		git(repo, ["config", "user.name", "Merge Base Test"]);
		git(repo, ["config", "user.email", "merge-base@example.invalid"]);
		git(repo, ["config", "commit.gpgsign", "false"]);
		return repo;
	}

	function commit(repo: string, files: Record<string, string>): void {
		for (const [name, text] of Object.entries(files)) {
			fs.writeFileSync(path.join(repo, name), text);
			git(repo, ["add", name]);
		}
		git(repo, ["commit", "-q", "-m", "c"]);
	}

	test("a file absent at the merge-base gives base null", () => {
		const repo = makeRepo();
		try {
			commit(repo, { "README.md": "x\n" });
			git(repo, ["switch", "-q", "-c", "feature"]);
			commit(repo, { "data.json": '{"a":1}\n' });
			const before = snapshotDir(repo);
			const read = readMergeBase("data.json", { ref: "main", cwd: repo });
			expect(read.base).toBeNull();
			expect(read.mergeBase).toMatch(/^[0-9a-f]{40}$/);
			assertDirEffect(before, snapshotDir(repo), {});
		} finally {
			fs.rmSync(repo, { recursive: true, force: true });
		}
	});

	test("a file present at the merge-base is returned parsed, not the head copy", () => {
		const repo = makeRepo();
		try {
			commit(repo, { "data.json": '{"a":1}\n' });
			git(repo, ["switch", "-q", "-c", "feature"]);
			commit(repo, { "data.json": '{"a":2}\n' });
			const before = snapshotDir(repo);
			const read = readMergeBase("data.json", { ref: "main", cwd: repo });
			expect(read.base).toEqual({ a: 1 });
			assertDirEffect(before, snapshotDir(repo), {});
		} finally {
			fs.rmSync(repo, { recursive: true, force: true });
		}
	});

	test("shown red: a ref that does not exist throws naming the ref and git fetch origin", () => {
		const repo = makeRepo();
		try {
			commit(repo, { "README.md": "x\n" });
			const before = snapshotDir(repo);
			expect(() =>
				readMergeBase("data.json", { ref: "origin/master", cwd: repo }),
			).toThrow(/origin\/master.*git fetch origin/);
			assertDirEffect(before, snapshotDir(repo), {});
		} finally {
			fs.rmSync(repo, { recursive: true, force: true });
		}
	});

	test("resolveBaseRef: explicit wins, then GITHUB_BASE_REF, then origin/master", () => {
		expect(resolveBaseRef(undefined, { GITHUB_BASE_REF: "master" })).toBe(
			"origin/master",
		);
		expect(resolveBaseRef("main", {})).toBe("main");
		expect(resolveBaseRef("main", { GITHUB_BASE_REF: "master" })).toBe("main");
		expect(resolveBaseRef(undefined, {})).toBe("origin/master");
		expect(resolveBaseRef(undefined, { GITHUB_BASE_REF: "release" })).toBe(
			"origin/release",
		);
	});
});
