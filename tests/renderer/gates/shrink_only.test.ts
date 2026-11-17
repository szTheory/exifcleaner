import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
	SHRINK_ONLY_REGISTRY,
	main,
	shrinkOnlyProblems,
	type ShrinkOnlyEntry,
} from "../../../scripts/shrink_only_check.mjs";
import { assertDirEffect, snapshotDir } from "../../helpers/dir_effect";

// GAT-01, GAT-03 / D-10, RESEARCH R8: the GAT-01 pending list and the GAT-03 colour baseline
// may only shrink. A pull request that adds a pending row or a baseline row in the same
// change as a regression would otherwise turn the gate off for exactly that regression, so
// scripts/shrink_only_check.mjs compares each file's keyed rows with the merge-base copy: a
// new key is `added`, a raised value is `raised`, a deleted head file is `deleted`. An absent
// base file is the one admitted bootstrap (the first pull request that adds the file).
//
// The comparison is pure and tested here with planted base and head documents (no git, so
// `yarn test` is hermetic). The CLI reads the merge-base with git and runs as a step of ci.yml;
// the temp-repository tests below run the real CLI against a throwaway repository.

const REPO = fileURLToPath(new URL("../../..", import.meta.url));

const PENDING = SHRINK_ONLY_REGISTRY[0] as ShrinkOnlyEntry;
const BASELINE = SHRINK_ONLY_REGISTRY[1] as ShrinkOnlyEntry;

const made: string[] = [];

afterEach(() => {
	for (const dir of made.splice(0)) {
		fs.rmSync(dir, { recursive: true, force: true });
	}
	vi.restoreAllMocks();
});

function pending(...pairs: Array<[string, string]>): unknown {
	return {
		rows: pairs.map(([token, theme]) => ({
			token,
			theme,
			reason: "planted pending row for the shrink-only comparison",
		})),
	};
}

function baseline(...rows: Array<[string, string, number]>): unknown {
	return {
		schemaVersion: 1,
		rows: rows.map(([file, literal, count]) => ({ file, literal, count })),
	};
}

const codes = (problems: Array<{ code: string }>): string[] =>
	problems.map((problem) => problem.code);

describe("GAT-01, GAT-03 shrink-only registry (D-10)", () => {
	test("the registry holds exactly two frozen rows with the two data paths", () => {
		expect(SHRINK_ONLY_REGISTRY.length).toBe(2);
		expect(Object.isFrozen(SHRINK_ONLY_REGISTRY)).toBe(true);
		expect(SHRINK_ONLY_REGISTRY.map((entry) => [entry.id, entry.path])).toEqual(
			[
				["GAT-01 pending", "tests/renderer/gates/token_drift_pending.json"],
				["GAT-03 baseline", "docs/evidence/colour-literals.json"],
			],
		);
		for (const entry of SHRINK_ONLY_REGISTRY) {
			expect(Object.isFrozen(entry)).toBe(true);
		}
	});

	test("the pending list is keyed token|theme with value 1", () => {
		const row = { token: "--ec-color-bg", theme: "light", reason: "x" };
		expect(PENDING.keyOf(row)).toBe("--ec-color-bg|light");
		expect(PENDING.valueOf(row)).toBe(1);
	});

	test("the colour baseline is keyed file|literal with the count as value", () => {
		const row = { file: "src/a.css", literal: "#fff", count: 3 };
		expect(BASELINE.keyOf(row)).toBe("src/a.css|#fff");
		expect(BASELINE.valueOf(row)).toBe(3);
	});
});

describe("GAT-01 pending list against a planted base", () => {
	const base = pending(["--ec-color-bg", "light"], ["--ec-color-bg", "dark"]);

	test("head equal to base is fine", () => {
		expect(shrinkOnlyProblems({ entry: PENDING, head: base, base })).toEqual(
			[],
		);
	});

	test("a row the base lacks is added", () => {
		const head = pending(
			["--ec-color-bg", "light"],
			["--ec-color-bg", "dark"],
			["--ec-color-text", "light"],
		);
		const problems = shrinkOnlyProblems({ entry: PENDING, head, base });
		expect(codes(problems)).toEqual(["added"]);
		expect(problems[0]?.key).toBe("--ec-color-text|light");
	});

	test("dropping a row is allowed: the list shrinks", () => {
		expect(
			shrinkOnlyProblems({
				entry: PENDING,
				head: pending(["--ec-color-bg", "dark"]),
				base,
			}),
		).toEqual([]);
		expect(
			shrinkOnlyProblems({ entry: PENDING, head: pending(), base }),
		).toEqual([]);
	});

	test("a duplicated row is a raised count, so a repeat cannot hide an addition", () => {
		const head = pending(
			["--ec-color-bg", "light"],
			["--ec-color-bg", "light"],
			["--ec-color-bg", "dark"],
		);
		expect(codes(shrinkOnlyProblems({ entry: PENDING, head, base }))).toEqual([
			"raised",
		]);
	});

	test("a deleted head file is deleted", () => {
		expect(
			codes(shrinkOnlyProblems({ entry: PENDING, head: null, base })),
		).toEqual(["deleted"]);
	});

	test("an absent base is the one bootstrap, whatever the head holds", () => {
		expect(
			shrinkOnlyProblems({
				entry: PENDING,
				head: pending(["--ec-color-bg", "light"]),
				base: null,
			}),
		).toEqual([]);
		expect(
			shrinkOnlyProblems({ entry: PENDING, head: null, base: null }),
		).toEqual([]);
	});
});

describe("GAT-03 colour baseline against a planted base", () => {
	const base = baseline(
		["src/a.css", "#fff", 2],
		["src/a.css", "transparent", 1],
		["src/b.css", "rgba(0, 0, 0, 0.1)", 1],
	);

	test("head equal to base is fine", () => {
		expect(shrinkOnlyProblems({ entry: BASELINE, head: base, base })).toEqual(
			[],
		);
	});

	test("a key the base lacks is added", () => {
		const head = baseline(
			["src/a.css", "#fff", 2],
			["src/a.css", "transparent", 1],
			["src/b.css", "rgba(0, 0, 0, 0.1)", 1],
			["src/c.css", "#123456", 1],
		);
		const problems = shrinkOnlyProblems({ entry: BASELINE, head, base });
		expect(codes(problems)).toEqual(["added"]);
		expect(problems[0]?.key).toBe("src/c.css|#123456");
	});

	test("a raised count is raised", () => {
		const head = baseline(
			["src/a.css", "#fff", 3],
			["src/a.css", "transparent", 1],
			["src/b.css", "rgba(0, 0, 0, 0.1)", 1],
		);
		const problems = shrinkOnlyProblems({ entry: BASELINE, head, base });
		expect(codes(problems)).toEqual(["raised"]);
		expect(problems[0]?.key).toBe("src/a.css|#fff");
	});

	test("a lowered count and a dropped key are allowed: the baseline shrinks", () => {
		expect(
			shrinkOnlyProblems({
				entry: BASELINE,
				head: baseline(["src/a.css", "#fff", 1]),
				base,
			}),
		).toEqual([]);
	});

	test("trading one literal for another is an added key even at equal totals", () => {
		const head = baseline(
			["src/a.css", "#eee", 2],
			["src/a.css", "transparent", 1],
			["src/b.css", "rgba(0, 0, 0, 0.1)", 1],
		);
		expect(codes(shrinkOnlyProblems({ entry: BASELINE, head, base }))).toEqual([
			"added",
		]);
	});

	test("only the two one-count BrowserWindow ground rows are approved additions", () => {
		const oldWindowGrounds = baseline(
			["src/main/window/window_background.ts", "#f5f6f8", 1],
			["src/main/window/window_background.ts", "#141416", 1],
		);
		const approvedWindowGrounds = baseline(
			["src/main/window/window_background.ts", "#0a2e2b", 1],
			["src/main/window/window_background.ts", "#ffffff", 1],
		);
		expect(
			shrinkOnlyProblems({
				entry: BASELINE,
				head: approvedWindowGrounds,
				base: oldWindowGrounds,
			}),
		).toEqual([]);

		for (const invalid of [
			baseline(
				["src/main/window/window_background.ts", "#0a2e2c", 1],
				["src/main/window/window_background.ts", "#ffffff", 1],
			),
			baseline(
				["src/main/window/window_background.ts", "#0a2e2b", 2],
				["src/main/window/window_background.ts", "#ffffff", 1],
			),
			baseline(
				["src/main/window/window_background.ts", "#0a2e2b", 1],
				["src/main/window/window_background.ts", "#ffffff", 1],
				["src/renderer/styles/other.css", "#ffffff", 1],
			),
		]) {
			const problems = shrinkOnlyProblems({
				entry: BASELINE,
				head: invalid,
				base: oldWindowGrounds,
			});
			expect(codes(problems)).toContain("added");
		}
	});

	test("a deleted head file is deleted and an absent base bootstraps", () => {
		expect(
			codes(shrinkOnlyProblems({ entry: BASELINE, head: null, base })),
		).toEqual(["deleted"]);
		expect(
			shrinkOnlyProblems({ entry: BASELINE, head: base, base: null }),
		).toEqual([]);
	});

	test("a document without a rows array is malformed, on either side", () => {
		for (const bad of [{}, { rows: "x" }, 3, "text"]) {
			expect(
				codes(shrinkOnlyProblems({ entry: BASELINE, head: bad, base })),
			).toEqual(["malformed"]);
			expect(
				codes(shrinkOnlyProblems({ entry: BASELINE, head: base, base: bad })),
			).toEqual(["malformed"]);
		}
	});
});

describe("the real data files against themselves (anti-vacuity)", () => {
	test("each registry file exists, holds rows, and shrinks against itself", () => {
		// Phase 77 may retire every pending role and four obsolete colour rows.
		const expectedMinimum = [0, 16];
		SHRINK_ONLY_REGISTRY.forEach((entry, index) => {
			const doc: unknown = JSON.parse(
				fs.readFileSync(path.join(REPO, entry.path), "utf8"),
			);
			const rows = entry.rows(doc) ?? [];
			expect(rows.length).toBeGreaterThanOrEqual(expectedMinimum[index] ?? 1);
			expect(shrinkOnlyProblems({ entry, head: doc, base: doc })).toEqual([]);
		});
	});
});

// ---------------------------------------------------------------------------------------
// The CLI against a throwaway git repository: the real merge-base read, no network.

function git(cwd: string, ...args: string[]): void {
	execFileSync(
		"git",
		[
			"-c",
			"user.name=Gate Test",
			"-c",
			"user.email=gate-test@example.invalid",
			"-c",
			"commit.gpgsign=false",
			...args,
		],
		{ cwd, stdio: ["ignore", "pipe", "pipe"] },
	);
}

function writeData(root: string, files: Record<string, unknown>): void {
	for (const [rel, doc] of Object.entries(files)) {
		const target = path.join(root, rel);
		fs.mkdirSync(path.dirname(target), { recursive: true });
		fs.writeFileSync(target, `${JSON.stringify(doc, null, "\t")}\n`);
	}
}

const PENDING_PATH = "tests/renderer/gates/token_drift_pending.json";
const BASELINE_PATH = "docs/evidence/colour-literals.json";

function makeRepo(initial: Record<string, unknown>): string {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "shrink-only-"));
	made.push(root);
	git(root, "init", "-q", "-b", "master");
	fs.writeFileSync(path.join(root, "README.md"), "base\n");
	writeData(root, initial);
	git(root, "add", "-A");
	git(root, "commit", "-q", "-m", "base");
	git(root, "checkout", "-q", "-b", "feature");
	return root;
}

describe("the CLI against a temp repository", () => {
	const initial = {
		[PENDING_PATH]: pending(
			["--ec-color-bg", "light"],
			["--ec-color-bg", "dark"],
		),
		[BASELINE_PATH]: baseline(["src/a.css", "#fff", 2]),
	};

	function run(root: string, argv: string[]): { code: number; out: string } {
		const lines: string[] = [];
		vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
			lines.push(args.join(" "));
		});
		vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
			lines.push(args.join(" "));
		});
		const before = snapshotDir(root);
		const code = main(argv, { root });
		vi.restoreAllMocks();
		// Whole-directory effect, every case: the check only reads the working tree and git
		// objects, so a run (green or red, bootstrap or fail-closed) adds, changes and
		// removes nothing in the repository, .git included.
		assertDirEffect(before, snapshotDir(root), {});
		return { code, out: lines.join("\n") };
	}

	test("a head equal to the merge-base passes for both rows", () => {
		const root = makeRepo(initial);
		const { code, out } = run(root, ["--base", "master"]);
		expect(code).toBe(0);
		expect(out).toContain("SHRINK-ONLY OK GAT-01 pending");
		expect(out).toContain("SHRINK-ONLY OK GAT-03 baseline");
		expect(out).not.toContain("bootstrap");
	});

	test("an added pending row exits 1 and names the key", () => {
		const root = makeRepo(initial);
		writeData(root, {
			[PENDING_PATH]: pending(
				["--ec-color-bg", "light"],
				["--ec-color-bg", "dark"],
				["--ec-color-text", "light"],
			),
		});
		const { code, out } = run(root, ["--base", "master"]);
		expect(code).toBe(1);
		expect(out).toContain("added");
		expect(out).toContain("--ec-color-text|light");
	});

	test("a raised colour count and an added colour key each exit 1", () => {
		const root = makeRepo(initial);
		writeData(root, { [BASELINE_PATH]: baseline(["src/a.css", "#fff", 3]) });
		let result = run(root, ["--base", "master"]);
		expect(result.code).toBe(1);
		expect(result.out).toContain("raised");
		writeData(root, {
			[BASELINE_PATH]: baseline(
				["src/a.css", "#fff", 2],
				["src/b.css", "#000", 1],
			),
		});
		result = run(root, ["--base", "master"]);
		expect(result.code).toBe(1);
		expect(result.out).toContain("src/b.css|#000");
	});

	test("a deleted data file exits 1", () => {
		const root = makeRepo(initial);
		fs.rmSync(path.join(root, PENDING_PATH));
		const { code, out } = run(root, ["--base", "master"]);
		expect(code).toBe(1);
		expect(out).toContain("deleted");
	});

	test("a shrunk head passes", () => {
		const root = makeRepo(initial);
		writeData(root, {
			[PENDING_PATH]: pending(["--ec-color-bg", "dark"]),
			[BASELINE_PATH]: baseline(),
		});
		expect(run(root, ["--base", "master"]).code).toBe(0);
	});

	test("files absent at the merge-base bootstrap, both rows, and say so", () => {
		const root = makeRepo({});
		writeData(root, initial);
		const { code, out } = run(root, ["--base", "master"]);
		expect(code).toBe(0);
		expect(out).toContain("SHRINK-ONLY OK GAT-01 pending (bootstrap)");
		expect(out).toContain("SHRINK-ONLY OK GAT-03 baseline (bootstrap)");
	});

	test("a missing base ref fails closed, never a pass", () => {
		const root = makeRepo(initial);
		const { code, out } = run(root, ["--base", "origin/nonexistent"]);
		expect(code).toBe(1);
		expect(out).toContain("not found");
	});

	test("the default base is origin/master, which a repository without it cannot resolve", () => {
		const root = makeRepo(initial);
		const saved = process.env["GITHUB_BASE_REF"];
		delete process.env["GITHUB_BASE_REF"];
		try {
			const { code, out } = run(root, []);
			expect(code).toBe(1);
			expect(out).toContain("origin/master");
		} finally {
			if (saved !== undefined) process.env["GITHUB_BASE_REF"] = saved;
		}
	});

	test("an unknown argument and a missing --base value exit 1", () => {
		const root = makeRepo(initial);
		expect(run(root, ["--nope"]).code).toBe(1);
		expect(run(root, ["--base"]).code).toBe(1);
	});
});
