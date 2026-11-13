import { spawnSync } from "node:child_process";
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import {
	check,
	diffBaseline,
	fingerprint,
	prune,
	validateBaseline,
	type BaselineDocument,
	type BaselineEntry,
} from "../scripts/findings_ratchet.mjs";
import { assertDirEffect, snapshotDir } from "../tests/helpers/dir_effect";

const repoRoot = path.resolve(import.meta.dirname, "..");
const RATCHET = path.join(repoRoot, "scripts", "findings_ratchet.mjs");

function entry(kind: string, story: string, rule: string): BaselineEntry {
	return {
		fingerprint: fingerprint(kind, story, rule),
		kind,
		story,
		rule,
		reason: "planted for a test",
	};
}

function doc(
	kinds: Record<string, boolean>,
	entries: BaselineEntry[] = [],
): BaselineDocument {
	return {
		schemaVersion: 1,
		kinds: Object.fromEntries(
			Object.entries(kinds).map(([name, sealed]) => [name, { sealed }]),
		),
		entries,
	};
}

const STORY = "settings-languagedropdown--default";
const OTHER = "settings-languagedropdown--arabic";

function codes(result: { problems: { code: string }[] }): string[] {
	return result.problems.map((found) => found.code);
}

describe("findings_ratchet: fingerprint and validateBaseline", () => {
	test("fingerprint joins kind, story and rule with pipes", () => {
		expect(fingerprint("a11y", STORY, "color-contrast")).toBe(
			`a11y|${STORY}|color-contrast`,
		);
	});

	test("a well-formed baseline has no problems", () => {
		expect(
			validateBaseline(doc({ a11y: true }, [entry("a11y", STORY, "x")])),
		).toEqual([]);
	});

	const MALFORMED: ReadonlyArray<[string, unknown, string]> = [
		[
			"schemaVersion 2",
			{ ...doc({ a11y: true }), schemaVersion: 2 },
			"schema-version",
		],
		[
			"unknown top-level field",
			{ ...doc({ a11y: true }), extra: 1 },
			"unknown-field",
		],
		[
			"entry missing reason",
			{
				...doc({ a11y: true }),
				entries: [{ ...entry("a11y", STORY, "x"), reason: undefined }],
			},
			"entry-field",
		],
		[
			"fingerprint not matching kind/story/rule",
			{
				...doc({ a11y: true }),
				entries: [
					{ ...entry("a11y", STORY, "x"), fingerprint: "a11y|other|x" },
				],
			},
			"fingerprint-mismatch",
		],
		[
			"entry of an undeclared kind",
			doc({ a11y: true }, [entry("finding", STORY, "x")]),
			"undeclared-kind",
		],
		[
			"duplicate fingerprints",
			doc({ a11y: true }, [
				entry("a11y", STORY, "x"),
				entry("a11y", STORY, "x"),
			]),
			"duplicate",
		],
		["a non-object", [], "not-object"],
		[
			"a kind with extra keys",
			{ ...doc({}), kinds: { a11y: { sealed: true, more: 1 } } },
			"kind-shape",
		],
	];

	test.each(MALFORMED)("rejects %s", (_name, input, code) => {
		expect(validateBaseline(input).map((found) => found.code)).toContain(code);
	});
});

describe("findings_ratchet: check", () => {
	test("an entry added to a sealed kind is added (the SC5 negative control)", () => {
		const base = doc({ a11y: true });
		const head = doc({ a11y: true }, [entry("a11y", STORY, "color-contrast")]);
		const result = check({ head, base });
		expect(result.ok).toBe(false);
		expect(codes(result)).toEqual(["added"]);
	});

	test("an entry removed passes", () => {
		const base = doc({ a11y: true }, [entry("a11y", STORY, "x")]);
		expect(check({ head: doc({ a11y: true }), base }).ok).toBe(true);
		expect(diffBaseline(base, doc({ a11y: true })).removed).toHaveLength(1);
	});

	test("base absent with an empty a11y kind passes (bootstrap)", () => {
		expect(check({ head: doc({ a11y: true }), base: null })).toEqual({
			ok: true,
			problems: [],
		});
	});

	test("base absent with a new kind carrying entries passes (creation)", () => {
		const head = doc({ a11y: true }, [entry("a11y", STORY, "x")]);
		expect(check({ head, base: null }).ok).toBe(true);
	});

	test("new kind introduced once with entries passes", () => {
		const base = doc({ a11y: true });
		const head = doc({ a11y: true, "a11y-phase72": true }, [
			entry("a11y-phase72", STORY, "color-contrast"),
		]);
		expect(check({ head, base })).toEqual({ ok: true, problems: [] });
	});

	test("second addition to a sealed new kind is added", () => {
		const introduced = doc({ a11y: true, "a11y-phase72": true }, [
			entry("a11y-phase72", STORY, "color-contrast"),
		]);
		// The introduction is now the merge-base copy.
		const head = doc({ a11y: true, "a11y-phase72": true }, [
			entry("a11y-phase72", STORY, "color-contrast"),
			entry("a11y-phase72", OTHER, "color-contrast"),
		]);
		const result = check({ head, base: introduced });
		expect(result.ok).toBe(false);
		expect(codes(result)).toEqual(["added"]);
	});

	test("unsealed new kind is new-kind-unsealed", () => {
		const base = doc({ a11y: true });
		const head = doc({ a11y: true, "a11y-phase72": false }, [
			entry("a11y-phase72", STORY, "x"),
		]);
		expect(codes(check({ head, base }))).toEqual(["new-kind-unsealed"]);
	});

	test("a kind present at base and missing at head is kind-removed", () => {
		const base = doc({ a11y: true });
		expect(codes(check({ head: doc({}), base }))).toEqual(["kind-removed"]);
	});

	test("a kind sealed at base and unsealed at head is unsealed", () => {
		const base = doc({ a11y: true });
		expect(codes(check({ head: doc({ a11y: false }), base }))).toEqual([
			"unsealed",
		]);
	});

	test("an entry whose story is not observed is stale", () => {
		const base = doc({ a11y: true }, [entry("a11y", STORY, "x")]);
		const head = doc({ a11y: true }, [entry("a11y", STORY, "x")]);
		expect(check({ head, base, observed: new Set([STORY]) }).ok).toBe(true);
		expect(codes(check({ head, base, observed: new Set([OTHER]) }))).toEqual([
			"stale",
		]);
	});

	test("a malformed head is reported, not compared", () => {
		const result = check({
			head: { ...doc({ a11y: true }), schemaVersion: 2 },
			base: null,
		});
		expect(codes(result)).toContain("schema-version");
	});
});

describe("findings_ratchet: prune", () => {
	test("removes stale entries only", () => {
		const both = [entry("a11y", STORY, "x"), entry("a11y", OTHER, "x")];
		const result = prune({
			head: doc({ a11y: true }, both),
			base: doc({ a11y: true }, both),
			observed: new Set([STORY]),
		});
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.doc.entries.map((found) => found.story)).toEqual([STORY]);
		}
	});

	test("refuses (no document) when an entry was added", () => {
		const result = prune({
			head: doc({ a11y: true }, [entry("a11y", STORY, "x")]),
			base: doc({ a11y: true }),
			observed: new Set([STORY]),
		});
		expect(result.ok).toBe(false);
		expect("doc" in result).toBe(false);
		if (!result.ok) expect(codes(result)).toEqual(["added"]);
	});

	test("refuses a malformed baseline", () => {
		const result = prune({
			head: { ...doc({ a11y: true }), schemaVersion: 2 },
			base: null,
			observed: new Set(),
		});
		expect(result.ok).toBe(false);
	});
});

// --- CLI against a temporary git repository -------------------------------

const GIT_ENV = {
	PATH: process.env["PATH"] ?? "",
	GIT_CONFIG_GLOBAL: os.devNull,
	GIT_CONFIG_SYSTEM: os.devNull,
};

function git(repo: string, args: string[]): void {
	const result = spawnSync("git", args, {
		cwd: repo,
		encoding: "utf8",
		env: GIT_ENV,
	});
	expect(result.status, result.stderr).toBe(0);
}

function writeBaseline(repo: string, value: unknown): void {
	mkdirSync(path.join(repo, "docs", "evidence"), { recursive: true });
	writeFileSync(
		path.join(repo, "docs", "evidence", "known-findings.json"),
		`${JSON.stringify(value, null, "\t")}\n`,
	);
}

// A repo whose `main` branch holds `committed` (or no baseline file when null).
function makeRepo(committed: BaselineDocument | null): string {
	const repo = mkdtempSync(path.join(os.tmpdir(), "ratchet-cli-"));
	git(repo, ["init", "-q", "-b", "main"]);
	git(repo, ["config", "user.name", "Ratchet Test"]);
	git(repo, ["config", "user.email", "ratchet@example.invalid"]);
	git(repo, ["config", "commit.gpgsign", "false"]);
	if (committed === null) {
		writeFileSync(path.join(repo, "README.md"), "x\n");
		git(repo, ["add", "README.md"]);
	} else {
		writeBaseline(repo, committed);
		git(repo, ["add", "docs/evidence/known-findings.json"]);
	}
	git(repo, ["commit", "-q", "-m", "base"]);
	return repo;
}

function writeIndex(repo: string, stories: string[]): string {
	const file = path.join(repo, "storybook-index.json");
	writeFileSync(
		file,
		JSON.stringify({
			v: 5,
			entries: Object.fromEntries(
				stories.map((id) => [id, { id, type: "story" }]),
			),
		}),
	);
	return file;
}

function runRatchet(repo: string, args: string[]) {
	return spawnSync(process.execPath, [RATCHET, ...args], {
		cwd: repo,
		encoding: "utf8",
		env: { ...GIT_ENV, HOME: process.env["HOME"] ?? "" },
		timeout: 60_000,
	});
}

describe("findings_ratchet CLI against a temp git repo", () => {
	test("a planted extra entry makes --check exit 1 with added and changes nothing", () => {
		const repo = makeRepo(doc({ a11y: true }));
		try {
			writeBaseline(repo, doc({ a11y: true }, [entry("a11y", STORY, "x")]));
			const index = writeIndex(repo, [STORY]);
			const dir = path.join(repo, "docs", "evidence");
			const before = snapshotDir(dir);
			const result = runRatchet(repo, [
				"--check",
				"--base",
				"main",
				"--index",
				index,
			]);
			expect(result.status).toBe(1);
			expect(result.stderr).toContain("FINDINGS RATCHET FAILED");
			expect(result.stderr).toContain("added");
			assertDirEffect(before, snapshotDir(dir), {});
		} finally {
			rmSync(repo, { recursive: true, force: true });
		}
	});

	// 72-05 (D-21): the first control (an entry added to the merge-base a11y kind) is
	// the case above; this is the second, against the real sealed kind name. A change
	// that adds an entry to an a11y-p72 kind that already exists at the merge-base is
	// rejected with `added`, so the Phase 72 baseline can only shrink after it merges.
	test("a second change adding an entry to an existing a11y-p72 kind is rejected with added", () => {
		const kinds = { a11y: true, "a11y-p72": true };
		const repo = makeRepo(
			doc(kinds, [entry("a11y-p72", STORY, "color-contrast")]),
		);
		try {
			writeBaseline(
				repo,
				doc(kinds, [
					entry("a11y-p72", STORY, "color-contrast"),
					entry("a11y-p72", OTHER, "color-contrast"),
				]),
			);
			const index = writeIndex(repo, [STORY, OTHER]);
			const dir = path.join(repo, "docs", "evidence");
			const before = snapshotDir(dir);
			const result = runRatchet(repo, [
				"--check",
				"--base",
				"main",
				"--index",
				index,
			]);
			expect(result.status).toBe(1);
			expect(result.stderr).toContain("FINDINGS RATCHET FAILED");
			expect(result.stderr).toContain("added");
			assertDirEffect(before, snapshotDir(dir), {});
		} finally {
			rmSync(repo, { recursive: true, force: true });
		}
	});

	test("--write with an added entry is refused and leaves the file unchanged", () => {
		const repo = makeRepo(doc({ a11y: true }));
		try {
			writeBaseline(repo, doc({ a11y: true }, [entry("a11y", STORY, "x")]));
			const index = writeIndex(repo, [STORY]);
			const dir = path.join(repo, "docs", "evidence");
			const file = path.join(dir, "known-findings.json");
			const contents = readFileSync(file, "utf8");
			const before = snapshotDir(dir);
			const result = runRatchet(repo, [
				"--write",
				"--base",
				"main",
				"--index",
				index,
			]);
			expect(result.status).toBe(1);
			expect(result.stderr).toContain("added");
			expect(readFileSync(file, "utf8")).toBe(contents);
			assertDirEffect(before, snapshotDir(dir), {});
		} finally {
			rmSync(repo, { recursive: true, force: true });
		}
	});

	test("a committed entry whose story left the catalog: --check says stale, --write prunes only that file", () => {
		const stale = doc({ a11y: true }, [entry("a11y", STORY, "x")]);
		const repo = makeRepo(stale);
		try {
			const index = writeIndex(repo, [OTHER]);
			const dir = path.join(repo, "docs", "evidence");
			const beforeCheck = snapshotDir(dir);
			const checked = runRatchet(repo, [
				"--check",
				"--base",
				"main",
				"--index",
				index,
			]);
			expect(checked.status).toBe(1);
			expect(checked.stderr).toContain("stale");
			assertDirEffect(beforeCheck, snapshotDir(dir), {});

			const written = runRatchet(repo, [
				"--write",
				"--base",
				"main",
				"--index",
				index,
			]);
			expect(written.status).toBe(0);
			assertDirEffect(beforeCheck, snapshotDir(dir), {
				modified: ["known-findings.json"],
			});
			expect(
				JSON.parse(readFileSync(path.join(dir, "known-findings.json"), "utf8")),
			).toEqual(doc({ a11y: true }));

			const again = runRatchet(repo, [
				"--check",
				"--base",
				"main",
				"--index",
				index,
			]);
			expect(again.status).toBe(0);
			expect(again.stdout).toContain("✓ FINDINGS RATCHET PASSED");
		} finally {
			rmSync(repo, { recursive: true, force: true });
		}
	});

	test("an unchanged baseline passes and changes nothing", () => {
		const repo = makeRepo(doc({ a11y: true }));
		try {
			const index = writeIndex(repo, [STORY]);
			const dir = path.join(repo, "docs", "evidence");
			const before = snapshotDir(dir);
			const result = runRatchet(repo, [
				"--check",
				"--base",
				"main",
				"--index",
				index,
			]);
			expect(result.status).toBe(0);
			expect(result.stdout).toContain("✓ FINDINGS RATCHET PASSED");
			assertDirEffect(before, snapshotDir(dir), {});
		} finally {
			rmSync(repo, { recursive: true, force: true });
		}
	});

	test("a merge-base without a baseline file is the bootstrap case and passes", () => {
		const repo = makeRepo(null);
		try {
			writeBaseline(repo, doc({ a11y: true }));
			const dir = path.join(repo, "docs", "evidence");
			const before = snapshotDir(dir);
			const result = runRatchet(repo, ["--check", "--base", "main"]);
			expect(result.status).toBe(0);
			expect(result.stdout).toContain("bootstrap");
			assertDirEffect(before, snapshotDir(dir), {});
		} finally {
			rmSync(repo, { recursive: true, force: true });
		}
	});

	test("a missing --index fails closed with a build-the-catalog message", () => {
		const repo = makeRepo(doc({ a11y: true }));
		try {
			const result = runRatchet(repo, [
				"--check",
				"--base",
				"main",
				"--index",
				path.join(repo, "storybook-static", "index.json"),
			]);
			expect(result.status).toBe(1);
			expect(result.stderr).toContain("build the catalog first");
		} finally {
			rmSync(repo, { recursive: true, force: true });
		}
	});
});

// --- storybook_budget_check CLI -------------------------------------------

const BUDGET = path.join(repoRoot, "scripts", "storybook_budget_check.mjs");

const GOOD_BUDGET = {
	phase: "70",
	stories: 3,
	measuredSeconds: 69,
	budgetSeconds: 300,
	runId: "43080512177",
};

// Runs the CLI in a fresh temporary cwd (a planted budget file when `budget`
// is given) and asserts the whole directory delta: only the step-summary file
// may appear, and only when `summary` is set.
function runBudgetCase(args: {
	budget?: unknown;
	env: Record<string, string>;
	summary?: boolean;
}) {
	const cwd = mkdtempSync(path.join(os.tmpdir(), "budget-cli-"));
	try {
		if (args.budget !== undefined) {
			mkdirSync(path.join(cwd, "docs", "evidence"), { recursive: true });
			writeFileSync(
				path.join(cwd, "docs", "evidence", "storybook-ci-budget.json"),
				JSON.stringify(args.budget),
			);
		}
		const before = snapshotDir(cwd);
		const result = spawnSync(process.execPath, [BUDGET], {
			cwd,
			encoding: "utf8",
			env: {
				PATH: process.env["PATH"] ?? "",
				...(args.summary
					? { GITHUB_STEP_SUMMARY: path.join(cwd, "summary.md") }
					: {}),
				...args.env,
			},
			timeout: 60_000,
		});
		assertDirEffect(before, snapshotDir(cwd), {
			added: args.summary ? ["summary.md"] : [],
		});
		const summary = args.summary
			? readFileSync(path.join(cwd, "summary.md"), "utf8")
			: "";
		return { result, summary };
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
}

describe("storybook_budget_check CLI", () => {
	test("no budget file prints BOOTSTRAP and exits 0", () => {
		const { result } = runBudgetCase({
			env: { STORYBOOK_JOB_START: "1000", STORYBOOK_JOB_NOW: "1042" },
		});
		expect(result.status).toBe(0);
		expect(result.stdout).toContain(
			"BOOTSTRAP: no budget file yet; elapsed 42s",
		);
	});

	test("elapsed over budget exits 1 and writes the table to the step summary", () => {
		const { result, summary } = runBudgetCase({
			budget: { ...GOOD_BUDGET, measuredSeconds: 1, budgetSeconds: 1 },
			env: { STORYBOOK_JOB_START: "1000", STORYBOOK_JOB_NOW: "1100" },
			summary: true,
		});
		expect(result.status).toBe(1);
		expect(result.stderr).toContain("over-budget");
		expect(summary).toContain("| elapsed (s) | budget (s) |");
		expect(summary).toContain("| 100 | 1 | 1 | 43080512177 |");
	});

	test("the real clock is used when it is not pinned: start 100 s ago, budget 1 s", () => {
		const start = Math.floor(Date.now() / 1000) - 100;
		const { result } = runBudgetCase({
			budget: { ...GOOD_BUDGET, measuredSeconds: 1, budgetSeconds: 1 },
			env: { STORYBOOK_JOB_START: String(start) },
		});
		expect(result.status).toBe(1);
		expect(result.stderr).toContain("over-budget");
	});

	test("elapsed equal to the budget passes, one second more fails", () => {
		const at = runBudgetCase({
			budget: GOOD_BUDGET,
			env: { STORYBOOK_JOB_START: "1000", STORYBOOK_JOB_NOW: "1300" },
			summary: true,
		});
		expect(at.result.status).toBe(0);
		expect(at.result.stdout).toContain("✓ STORYBOOK BUDGET PASSED");
		expect(at.summary).toContain("| 300 | 300 | 69 | 43080512177 |");
		const over = runBudgetCase({
			budget: GOOD_BUDGET,
			env: { STORYBOOK_JOB_START: "1000", STORYBOOK_JOB_NOW: "1301" },
		});
		expect(over.result.status).toBe(1);
		expect(over.result.stderr).toContain("over-budget");
	});

	test("the checked-in budget file is accepted by the CLI", () => {
		const result = spawnSync(process.execPath, [BUDGET], {
			cwd: repoRoot,
			encoding: "utf8",
			env: {
				PATH: process.env["PATH"] ?? "",
				STORYBOOK_JOB_START: String(Math.floor(Date.now() / 1000)),
			},
			timeout: 60_000,
		});
		expect(result.stderr).not.toContain("STORYBOOK BUDGET FAILED");
		expect(result.status).toBe(0);
		expect(result.stdout).toContain("✓ STORYBOOK BUDGET PASSED");
	});

	const INVALID: ReadonlyArray<[string, unknown, string]> = [
		[
			"a missing field",
			{ phase: "70", stories: 3, measuredSeconds: 69, runId: "1" },
			"missing-field",
		],
		["runId TBD", { ...GOOD_BUDGET, runId: "TBD" }, "bad-run-id"],
		[
			"measured above budget",
			{ ...GOOD_BUDGET, measuredSeconds: 301 },
			"measured-over-budget",
		],
		["an unknown field", { ...GOOD_BUDGET, extra: 1 }, "unknown-field"],
		["zero stories", { ...GOOD_BUDGET, stories: 0 }, "bad-stories"],
	];

	test.each(INVALID)(
		"%s exits 1 with its own problem code",
		(_name, budget, code) => {
			const { result } = runBudgetCase({
				budget,
				env: { STORYBOOK_JOB_START: "1000", STORYBOOK_JOB_NOW: "1010" },
			});
			expect(result.status).toBe(1);
			expect(result.stderr).toContain(`${code}:`);
		},
	);

	test.each([
		["with a budget file", GOOD_BUDGET],
		["without a budget file", undefined],
	])("a missing STORYBOOK_JOB_START exits 1 %s", (_name, budget) => {
		const { result } = runBudgetCase({ budget, env: {} });
		expect(result.status).toBe(1);
		expect(result.stderr).toContain("start-missing");
	});
});
