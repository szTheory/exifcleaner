import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { assertDirEffect, snapshotDir } from "../../tests/helpers/dir_effect";
import { loadGrid } from "./grid.mjs";
import { enumerateStories } from "./story_index.mjs";
import {
	GIT_ENV,
	childEnv,
	git,
	makeCatalogRepo,
	realScript,
	repoRoot,
	runNode,
} from "./temp_repo";
import { STATE_CLASSES } from "./vocab.mjs";

const CATALOG = ".storybook/catalog/catalog.mjs";
const GLOSSARY_MD = ".storybook/catalog/GLOSSARY.md";
const PERSONAS_MD = ".storybook/catalog/PERSONAS.md";
const GLOSSARY_JSON = ".storybook/catalog/glossary.json";
const REGISTER = ".storybook/catalog/copy-findings.json";
const GRID_JSON = ".storybook/catalog/coverage-grid.json";
const GRID_MD = ".storybook/catalog/COVERAGE-GRID.md";
const SCENARIOS = ".storybook/catalog/scenarios.json";
const WAIVERS = ".storybook/catalog/waivers.json";
const SUBJECTS = ".storybook/catalog/subjects.json";
const FIXTURES = ".storybook/catalog/fixtures";

function withRepo(body: (repo: string) => void): void {
	const repo = makeCatalogRepo();
	try {
		body(repo);
	} finally {
		fs.rmSync(repo, { recursive: true, force: true });
	}
}

// The expected `grid:` counts text, computed from the real model so the CLI tests
// follow the catalog as stories land (Phase 72).
async function gridCounts(): Promise<string> {
	const grid = await loadGrid(repoRoot);
	if (grid.model === null) {
		throw new Error(grid.problems.map((found) => found.message).join("; "));
	}
	const c = grid.model.counts;
	return `${c.subjects} subjects, ${c.cells} cells, ${c.covered} covered, ${c.waived} waived, ${c.gaps} gaps`;
}

// The zero-gaps controls plant their own gaps inside their temp repo (D-03), never
// reading the live grid: the real App row's gaps close in 73-04, and a control that
// needed one would turn red the moment the catalog is complete. Each plant is
// regenerated with the real CLI and committed to the temp repo's `main`, so the
// ratchet sees no change and only the zero-gaps check can fail.
function commitPlant(repo: string, message: string): void {
	const written = run(repo, ["--write"]);
	expect(written.status, written.stderr).toBe(0);
	git(repo, ["add", "-A"]);
	git(repo, ["commit", "-q", "-m", message]);
}

async function gridRow(repo: string, subject: string) {
	const grid = await loadGrid(repo);
	if (grid.model === null) {
		throw new Error(grid.problems.map((found) => found.message).join("; "));
	}
	return grid.model.rows.find((row) => row.subject === subject);
}

// Opens one primitive-tier cell: the first primitive subject's first waiver is
// dropped from the temp copy of waivers.json. Returns the cell as `Subject|class`.
async function openPrimitiveCell(repo: string): Promise<string> {
	const subjects = JSON.parse(
		fs.readFileSync(path.join(repo, SUBJECTS), "utf8"),
	) as Array<{ id: string; tier: string }>;
	const primitive = new Set(
		subjects.filter((entry) => entry.tier === "primitive").map((e) => e.id),
	);
	const file = path.join(repo, WAIVERS);
	const original = fs.readFileSync(file, "utf8");
	const doc = JSON.parse(original) as {
		waivers: Array<{ subject: string; stateClass: string }>;
	};
	const target = doc.waivers.find((waiver) => primitive.has(waiver.subject));
	if (target === undefined) {
		throw new Error("no primitive-tier waiver to open a gap with");
	}
	fs.writeFileSync(
		file,
		`${JSON.stringify(
			{ ...doc, waivers: doc.waivers.filter((waiver) => waiver !== target) },
			null,
			"\t",
		)}\n`,
	);
	// Anti-vacuity: the planted edit changed the temp file, and the regenerated
	// grid shows the cell as a gap.
	expect(fs.readFileSync(file, "utf8")).not.toBe(original);
	commitPlant(repo, "open one primitive cell");
	const row = await gridRow(repo, target.subject);
	expect(row?.cells[target.stateClass]?.status).toBe("gap");
	return `${target.subject}|${target.stateClass}`;
}

// Adds a screen-tier subject, `PlantedScreen`, to the temp repo: a subjects.json row in
// sorted position and the minimal non-story component file scanSubjectIds needs. The
// grid then shows its 12 cells as gaps, with no scenario or waiver of the real catalog
// involved.
async function plantScreenSubject(repo: string): Promise<void> {
	const file = path.join(repo, SUBJECTS);
	const original = fs.readFileSync(file, "utf8");
	const doc = JSON.parse(original) as Array<{ id: string; tier: string }>;
	doc.push({ id: "PlantedScreen", tier: "screen" });
	doc.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
	fs.writeFileSync(file, `${JSON.stringify(doc, null, "\t")}\n`);
	const dir = path.join(repo, "src/renderer/components/planted");
	fs.mkdirSync(dir, { recursive: true });
	fs.writeFileSync(
		path.join(dir, "PlantedScreen.tsx"),
		"export function PlantedScreen(): null {\n\treturn null;\n}\n",
	);
	expect(fs.readFileSync(file, "utf8")).not.toBe(original);
	commitPlant(repo, "plant a screen subject");
	const row = await gridRow(repo, "PlantedScreen");
	expect(row?.tier).toBe("screen");
	expect(STATE_CLASSES.map((c) => row?.cells[c]?.status)).toEqual(
		STATE_CLASSES.map(() => "gap"),
	);
}

function run(repo: string, args: string[]) {
	return runNode(realScript(CATALOG), args, repo);
}

describe("catalog.mjs against a temp git repo", () => {
	test("--check in a fresh catalog repo passes", () => {
		withRepo((repo) => {
			const result = run(repo, ["--check", "--base", "main"]);
			expect(result.status, result.stderr).toBe(0);
			expect(result.stdout).toContain("CATALOG CHECK PASSED");
			expect(result.stdout).toMatch(
				/copy findings: \d+ entries \(merge-base [0-9a-f]{7}\)/,
			);
		});
	});

	test("shown red: one changed byte in GLOSSARY.md fails --check and changes nothing", () => {
		withRepo((repo) => {
			const file = path.join(repo, GLOSSARY_MD);
			fs.writeFileSync(file, `${fs.readFileSync(file, "utf8")}x`);
			const before = snapshotDir(repo);
			const result = run(repo, ["--check", "--base", "main"]);
			expect(result.status).toBe(1);
			expect(result.stderr).toContain("CATALOG CHECK FAILED");
			expect(result.stderr).toContain(
				"GLOSSARY.md is stale; run yarn catalog:write",
			);
			assertDirEffect(before, snapshotDir(repo), {});
		});
	});

	test("shown red: one changed byte in PERSONAS.md fails --check and changes nothing", () => {
		withRepo((repo) => {
			const file = path.join(repo, PERSONAS_MD);
			fs.writeFileSync(file, `${fs.readFileSync(file, "utf8")}x`);
			const before = snapshotDir(repo);
			const result = run(repo, ["--check", "--base", "main"]);
			expect(result.status).toBe(1);
			expect(result.stderr).toContain("CATALOG CHECK FAILED");
			expect(result.stderr).toContain(
				"PERSONAS.md is stale; run yarn catalog:write",
			);
			assertDirEffect(before, snapshotDir(repo), {});
		});
	});

	test("--write regenerates only GLOSSARY.md, after which --check passes", () => {
		withRepo((repo) => {
			const file = path.join(repo, GLOSSARY_MD);
			fs.writeFileSync(file, `${fs.readFileSync(file, "utf8")}x`);
			const before = snapshotDir(repo);
			const result = run(repo, ["--write"]);
			expect(result.status, result.stderr).toBe(0);
			expect(result.stdout).toContain("CATALOG WRITE");
			assertDirEffect(before, snapshotDir(repo), { modified: [GLOSSARY_MD] });
			expect(run(repo, ["--check", "--base", "main"]).status).toBe(0);
		});
	});

	test("shown red: a planted unknown field refuses --write and changes nothing", () => {
		withRepo((repo) => {
			const file = path.join(repo, GLOSSARY_JSON);
			const doc = JSON.parse(fs.readFileSync(file, "utf8")) as Record<
				string,
				unknown
			>;
			fs.writeFileSync(
				file,
				`${JSON.stringify({ ...doc, planted: true }, null, "\t")}\n`,
			);
			const before = snapshotDir(repo);
			const result = run(repo, ["--write"]);
			expect(result.status).toBe(1);
			expect(result.stderr).toContain("unknown-field");
			assertDirEffect(before, snapshotDir(repo), {});
		});
	});

	test("shown red: added entry via CLI (catalog.mjs) exits 1, says added and changes nothing", () => {
		withRepo((repo) => {
			// The merge-base copy lacks one entry that the working copy lists.
			const file = path.join(repo, REGISTER);
			const full = fs.readFileSync(file, "utf8");
			const doc = JSON.parse(full) as {
				entries: Array<{ fingerprint: string }>;
			};
			fs.writeFileSync(
				file,
				`${JSON.stringify(
					{
						...doc,
						entries: doc.entries.filter(
							(entry) => entry.fingerprint !== "manual|apostrophe-mix",
						),
					},
					null,
					"\t",
				)}\n`,
			);
			git(repo, ["add", REGISTER]);
			git(repo, ["commit", "-q", "-m", "base without one entry"]);
			fs.writeFileSync(file, full);
			const before = snapshotDir(repo);
			const result = run(repo, ["--check", "--base", "main"]);
			expect(result.status).toBe(1);
			expect(result.stderr).toContain("CATALOG CHECK FAILED");
			expect(result.stderr).toContain("added");
			assertDirEffect(before, snapshotDir(repo), {});
		});
	});

	test("shown red: no flags exits 1 and an unknown flag fails closed", () => {
		withRepo((repo) => {
			const before = snapshotDir(repo);
			const bare = run(repo, []);
			expect(bare.status).toBe(1);
			expect(bare.stderr).toContain("pass exactly one of --check or --write");
			const unknown = run(repo, ["--check", "--base", "main", "--frobnicate"]);
			expect(unknown.status).toBe(1);
			expect(unknown.stderr).toContain("unknown argument --frobnicate");
			assertDirEffect(before, snapshotDir(repo), {});
		});
	});
});

// The coverage grid layer (JTBD-03, D-25, D-26): each rejected run exits 1 and
// leaves the whole directory unchanged.
describe("catalog.mjs coverage grid against a temp git repo", () => {
	function storyIds(): Promise<string[]> {
		return enumerateStories(repoRoot).then((stories) =>
			stories.map((story) => story.id),
		);
	}

	function plantIndex(
		repo: string,
		ids: string[],
		extra: string[] = [],
	): string {
		const entries: Record<string, unknown> = {};
		for (const id of [...ids, ...extra]) {
			entries[id] = { type: "story", id, name: "x" };
		}
		entries["docs-entry"] = { type: "docs", id: "docs-entry" };
		const file = path.join(repo, "index.json");
		fs.writeFileSync(file, JSON.stringify({ v: 5, entries }));
		return "index.json";
	}

	test("shown red: COVERAGE-GRID.md drift (one changed byte)", () => {
		withRepo((repo) => {
			const file = path.join(repo, GRID_MD);
			fs.writeFileSync(file, `${fs.readFileSync(file, "utf8")}x`);
			const before = snapshotDir(repo);
			const result = run(repo, ["--check", "--base", "main"]);
			expect(result.status).toBe(1);
			expect(result.stderr).toContain(
				"COVERAGE-GRID.md is stale; run yarn catalog:write",
			);
			assertDirEffect(before, snapshotDir(repo), {});
		});
	});

	test("shown red: coverage-grid.json drift (one changed byte)", () => {
		withRepo((repo) => {
			const file = path.join(repo, GRID_JSON);
			const original = fs.readFileSync(file, "utf8");
			// Derived from the current JSON so the mutation never goes vacuous when the
			// counts move (Phase 72): bump gaps by one.
			const gaps = /"gaps": (\d+)/.exec(original);
			expect(gaps).not.toBeNull();
			const mutated = original.replace(
				/"gaps": \d+/,
				`"gaps": ${Number(gaps?.[1]) + 1}`,
			);
			expect(mutated).not.toBe(original);
			fs.writeFileSync(file, mutated);
			const before = snapshotDir(repo);
			const result = run(repo, ["--check", "--base", "main"]);
			expect(result.status).toBe(1);
			expect(result.stderr).toContain("coverage-grid.json is stale");
			assertDirEffect(before, snapshotDir(repo), {});
		});
	});

	test("shown red: gap-added via CLI (a scenario dropped at head, grid regenerated)", () => {
		withRepo((repo) => {
			const file = path.join(repo, SCENARIOS);
			const doc = JSON.parse(fs.readFileSync(file, "utf8")) as {
				scenarios: Array<{ id: string; stateClass: string }>;
			};
			fs.writeFileSync(
				file,
				`${JSON.stringify(
					{
						...doc,
						// Every LanguageDropdown happy scenario goes (Phase 72 added several),
						// so the cell is a gap at head and was covered at the merge-base.
						scenarios: doc.scenarios.filter(
							(scenario) =>
								!(
									scenario.id.startsWith("language-dropdown.") &&
									scenario.stateClass === "happy"
								),
						),
					},
					null,
					"\t",
				)}\n`,
			);
			const written = run(repo, ["--write"]);
			expect(written.status, written.stderr).toBe(0);
			const before = snapshotDir(repo);
			const result = run(repo, ["--check", "--base", "main"]);
			expect(result.status).toBe(1);
			expect(result.stderr).toContain("gap-added");
			expect(result.stderr).toContain("LanguageDropdown|happy");
			assertDirEffect(before, snapshotDir(repo), {});
		});
	});

	test("grid bootstrap: a merge-base without coverage-grid.json is admitted once", async () => {
		const counts = await gridCounts();
		withRepo((repo) => {
			const json = fs.readFileSync(path.join(repo, GRID_JSON), "utf8");
			const markdown = fs.readFileSync(path.join(repo, GRID_MD), "utf8");
			git(repo, ["rm", "-q", GRID_JSON, GRID_MD]);
			git(repo, ["commit", "-q", "-m", "base without the grid"]);
			fs.writeFileSync(path.join(repo, GRID_JSON), json);
			fs.writeFileSync(path.join(repo, GRID_MD), markdown);
			const before = snapshotDir(repo);
			const result = run(repo, ["--check", "--base", "main"]);
			expect(result.status, result.stderr).toBe(0);
			expect(result.stdout).toContain(`grid: ${counts} (bootstrap)`);
			assertDirEffect(before, snapshotDir(repo), {});
		});
	});

	test("grid at the merge-base: a normal run reports the merge-base sha", async () => {
		const counts = await gridCounts();
		withRepo((repo) => {
			const result = run(repo, ["--check", "--base", "main"]);
			expect(result.status, result.stderr).toBe(0);
			expect(result.stdout).toMatch(
				new RegExp(`grid: ${counts} \\(merge-base [0-9a-f]{7}\\)`),
			);
		});
	});

	test("shown red: build the catalog first (--index at a missing file)", () => {
		withRepo((repo) => {
			const before = snapshotDir(repo);
			const result = run(repo, [
				"--check",
				"--base",
				"main",
				"--index",
				"storybook-static/index.json",
			]);
			expect(result.status).toBe(1);
			expect(result.stderr).toContain("build the catalog first");
			assertDirEffect(before, snapshotDir(repo), {});
		});
	});

	test("shown red: index lacks a story (--index at a planted index.json)", async () => {
		const ids = await storyIds();
		withRepo((repo) => {
			const missing = ids[0];
			const index = plantIndex(repo, ids.slice(1));
			const before = snapshotDir(repo);
			const result = run(repo, ["--check", "--base", "main", "--index", index]);
			expect(result.status).toBe(1);
			expect(result.stderr).toContain(
				`story ${missing} is enumerated from source`,
			);
			assertDirEffect(before, snapshotDir(repo), {});
		});
	});

	test("shown red: index has a story the source does not enumerate", async () => {
		const ids = await storyIds();
		withRepo((repo) => {
			const index = plantIndex(repo, ids, ["planted--extra"]);
			const before = snapshotDir(repo);
			const result = run(repo, ["--check", "--base", "main", "--index", index]);
			expect(result.status).toBe(1);
			expect(result.stderr).toContain("story planted--extra is in index.json");
			assertDirEffect(before, snapshotDir(repo), {});
		});
	});

	test("an index with exactly the enumerated stories passes (docs entries are ignored)", async () => {
		const ids = await storyIds();
		withRepo((repo) => {
			const index = plantIndex(repo, ids);
			const result = run(repo, ["--check", "--base", "main", "--index", index]);
			expect(result.status, result.stderr).toBe(0);
		});
	});

	test("shown red: zero-gaps screen names every gap of a planted screen row", async () => {
		// Independent of the live App row (D-03): the temp repo gets its own screen
		// subject, so the outcome is the same whether App has 12 gaps or none.
		const repo = makeCatalogRepo();
		try {
			await plantScreenSubject(repo);
			const before = snapshotDir(repo);
			const result = run(repo, [
				"--check",
				"--base",
				"main",
				"--zero-gaps",
				"--tier",
				"screen",
			]);
			expect(result.status).toBe(1);
			for (const stateClass of STATE_CLASSES) {
				expect(result.stderr).toContain(`gap|PlantedScreen|${stateClass}`);
			}
			expect(result.stderr).not.toContain("gap|ChevronIcon");
			assertDirEffect(before, snapshotDir(repo), {});
		} finally {
			fs.rmSync(repo, { recursive: true, force: true });
		}
	});

	test("shown red: zero-gaps without --tier looks at every tier, and --tier needs --zero-gaps", async () => {
		const repo = makeCatalogRepo();
		try {
			const cell = await openPrimitiveCell(repo);
			const before = snapshotDir(repo);
			const all = run(repo, ["--check", "--base", "main", "--zero-gaps"]);
			expect(all.status).toBe(1);
			expect(all.stderr).toContain(`gap|${cell}`);
			const primitive = run(repo, [
				"--check",
				"--base",
				"main",
				"--zero-gaps",
				"--tier",
				"primitive",
			]);
			expect(primitive.status).toBe(1);
			expect(primitive.stderr).toContain(`gap|${cell}`);
			const bare = run(repo, ["--check", "--base", "main", "--tier", "screen"]);
			expect(bare.status).toBe(1);
			expect(bare.stderr).toContain("--tier only applies with --zero-gaps");
			const unknown = run(repo, [
				"--check",
				"--base",
				"main",
				"--zero-gaps",
				"--tier",
				"atom",
			]);
			expect(unknown.status).toBe(1);
			expect(unknown.stderr).toContain("unknown tier atom");
			assertDirEffect(before, snapshotDir(repo), {});
		} finally {
			fs.rmSync(repo, { recursive: true, force: true });
		}
	});

	test("shown red: a planted full-row waivers.json fails --check and refuses --write", () => {
		withRepo((repo) => {
			fs.copyFileSync(
				path.join(repoRoot, FIXTURES, "waiver_full_row.json"),
				path.join(repo, WAIVERS),
			);
			const before = snapshotDir(repo);
			const check = run(repo, ["--check", "--base", "main"]);
			expect(check.status).toBe(1);
			expect(check.stderr).toContain("full-row");
			const write = run(repo, ["--write"]);
			expect(write.status).toBe(1);
			expect(write.stderr).toContain("full-row");
			assertDirEffect(before, snapshotDir(repo), {});
		});
	});
});

// WR-02 shape (tests/scripts/entry_point_symlink.test.ts): started through a
// symlink the CLI must still run and fail closed, never exit 0 silently.
describe("catalog.mjs started through a symlink", () => {
	function withTmp(body: (tmp: string) => void): void {
		// realpath: os.tmpdir() is itself a symlink on macOS (/var -> /private/var).
		const tmp = fs.realpathSync(
			fs.mkdtempSync(path.join(os.tmpdir(), "catalog-symlink-")),
		);
		try {
			body(tmp);
		} finally {
			fs.rmSync(tmp, { recursive: true, force: true });
		}
	}

	test("shown red: symlinked start through a symlinked repository directory", () => {
		withTmp((tmp) => {
			const link = path.join(tmp, "repo-link");
			fs.symlinkSync(repoRoot, link, "junction");
			const before = snapshotDir(tmp);
			const result = runNode(path.join(link, CATALOG), [], tmp);
			expect(result.status, result.stderr).toBe(1);
			expect(result.stderr).toContain("pass exactly one of --check or --write");
			assertDirEffect(before, snapshotDir(tmp), {});
		});
	});

	test("shown red: symlinked start through a symlink to the script file", () => {
		withTmp((tmp) => {
			const link = path.join(tmp, "catalog-link.mjs");
			fs.symlinkSync(realScript(CATALOG), link);
			const before = snapshotDir(tmp);
			const result = runNode(link, [], tmp);
			expect(result.status, result.stderr).toBe(1);
			expect(result.stderr).toContain("pass exactly one of --check or --write");
			assertDirEffect(before, snapshotDir(tmp), {});
		});
	});
});

describe("temp_repo helper contract", () => {
	test("temp_repo: repoRoot is the working tree", () => {
		expect(fs.existsSync(path.join(repoRoot, "package.json"))).toBe(true);
		expect(fs.existsSync(realScript(CATALOG))).toBe(true);
	});

	test("temp_repo: a catalog repo never starts background git maintenance", () => {
		withRepo((repo) => {
			for (const key of ["maintenance.auto", "gc.auto"]) {
				const result = spawnSync("git", ["config", "--get", key], {
					cwd: repo,
					encoding: "utf8",
					env: GIT_ENV,
				});
				expect(result.stdout.trim(), key).toBe(
					key === "gc.auto" ? "0" : "false",
				);
			}
		});
	});

	test("temp_repo: child env has no NODE_OPTIONS", () => {
		// yarn test:storybook preloads the network guard, so this is not vacuous.
		expect(process.env["NODE_OPTIONS"]).toBeDefined();
		expect("NODE_OPTIONS" in childEnv({})).toBe(false);
		withRepo((repo) => {
			const result = runNode(
				realScript(CATALOG),
				["--check", "--base", "main"],
				repo,
			);
			expect(result.status, result.stderr).toBe(0);
		});
	});
});
