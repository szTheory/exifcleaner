import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import {
	GIT_ENV,
	disableBackgroundMaintenance,
	git,
	repoRoot,
} from "./temp_repo";

// Deterministic probe for the maintenance.lock race (75.1 D3). `git commit` starts
// `git maintenance run --auto` as a child unless maintenance.auto is false, and that
// child takes and releases .git/objects/maintenance.lock while a test walks the
// directory. GIT_TRACE2_EVENT records every child start, so the control counts the
// maintenance children of one commit instead of racing a timing window.

function removeRepo(repo: string): void {
	// maxRetries: the old-way repo of the anti-vacuity control is deleted right after a
	// commit that started maintenance, so give a late lock create or unlink a few tries.
	fs.rmSync(repo, {
		recursive: true,
		force: true,
		maxRetries: 5,
		retryDelay: 50,
	});
	fs.rmSync(`${repo}.trace2`, { force: true });
}

// A temp repo made the way every creator did before the helper existed. It removes
// itself when its own setup throws, so a caller only guards what it does afterwards.
function oldWayRepo(): string {
	const repo = fs.realpathSync(
		fs.mkdtempSync(path.join(os.tmpdir(), "temp-repo-probe-")),
	);
	try {
		git(repo, ["init", "-q", "-b", "main"]);
		git(repo, ["config", "user.name", "Probe Test"]);
		git(repo, ["config", "user.email", "probe@example.invalid"]);
		git(repo, ["config", "commit.gpgsign", "false"]);
	} catch (error) {
		removeRepo(repo);
		throw error;
	}
	return repo;
}

// Commits one new file and returns how many `git maintenance` children that commit, and
// only that commit, started: the trace file is opened in append mode, so it is
// truncated first.
//
// `maintenance.autoDetach=false` is for teardown, not for the count. Git 2.47 and later
// spawn the child with `--detach` by default, so it can outlive `git commit` and still
// be creating .git/objects/maintenance.lock when removeRepo deletes the repo (the race
// this probe exists to prevent, here with the repo itself as the victim). With the
// setting the child runs in the foreground (`--no-detach`) and finishes before
// `git commit` returns. Older git ignores the key and never detached. The parent emits
// `child_start` either way, so the count is the same.
function maintenanceChildStarts(repo: string, file: string): number {
	const trace = `${repo}.trace2`;
	fs.rmSync(trace, { force: true });
	fs.writeFileSync(path.join(repo, file), `${file}\n`);
	git(repo, ["add", file]);
	const result = spawnSync(
		"git",
		["-c", "maintenance.autoDetach=false", "commit", "-q", "-m", "c"],
		{
			cwd: repo,
			encoding: "utf8",
			env: { ...GIT_ENV, GIT_TRACE2_EVENT: trace },
		},
	);
	expect(result.status, result.stderr).toBe(0);
	const children = fs
		.readFileSync(trace, "utf8")
		.split("\n")
		.filter(
			(line) =>
				line.includes('"event":"child_start"') &&
				line.includes('"argv":["git","maintenance"'),
		);
	// On git 2.47 and later a child spawned with `--detach` means the setting above did
	// not take effect and the teardown is racy again. Older git has no such argument.
	expect(
		children.filter((line) => line.includes('"--detach"')),
		"a maintenance child was started detached despite maintenance.autoDetach=false",
	).toEqual([]);
	return children.length;
}

describe("temp_repo background maintenance probe", () => {
	test("anti-vacuity: a repo made the old way starts git maintenance on commit", () => {
		const repo = oldWayRepo();
		try {
			expect(maintenanceChildStarts(repo, "a.txt")).toBeGreaterThanOrEqual(1);
		} finally {
			removeRepo(repo);
		}
	});

	test("disableBackgroundMaintenance: a helper repo starts no git maintenance on commit", () => {
		const repo = oldWayRepo();
		try {
			disableBackgroundMaintenance(repo);
			expect(maintenanceChildStarts(repo, "a.txt")).toBe(0);
		} finally {
			removeRepo(repo);
		}
	});

	test("planted maintenance.lock: the next commit in a helper repo still starts no git maintenance (the zero child count is the control; the unchanged bytes are a sanity check only)", () => {
		const repo = oldWayRepo();
		try {
			disableBackgroundMaintenance(repo);
			expect(maintenanceChildStarts(repo, "a.txt")).toBe(0);
			const lock = path.join(repo, ".git", "objects", "maintenance.lock");
			const planted = Buffer.from("planted-by-the-75.1-probe\n");
			fs.writeFileSync(lock, planted);
			expect(maintenanceChildStarts(repo, "b.txt")).toBe(0);
			// Git never owns a lock it did not take, so it would leave these bytes alone even
			// if a child ran. The zero count above is what carries this test.
			expect(fs.readFileSync(lock).equals(planted)).toBe(true);
		} finally {
			removeRepo(repo);
		}
	});
});

// The probe above tests the helper on a repo this file builds itself. It cannot see a
// creator that never calls the helper, and that is how commit 836701f fixed one creator
// and missed two siblings. This scan fails when any temp-repo creator under .storybook
// stops disabling background maintenance before its first commit, or when a new creator
// is added without doing so.
const GIT_INIT = /["'`]init["'`]|\bgit init\b/g;
const GIT_COMMIT = /["'`]commit["'`]|\bgit commit\b/;
const HELPER_CALL = "disableBackgroundMaintenance(";

// Test files plus the shared helper module. temp_repo.test.ts is left out: it builds the
// old-way repo on purpose, as the anti-vacuity control.
function repoCreatorCandidates(): string[] {
	return fs
		.readdirSync(path.join(repoRoot, ".storybook"), {
			recursive: true,
			encoding: "utf8",
		})
		.map((rel) => rel.split(path.sep).join("/"))
		.filter(
			(rel) =>
				(rel.endsWith(".test.ts") && rel !== "catalog/temp_repo.test.ts") ||
				rel === "catalog/temp_repo.ts",
		)
		.sort();
}

function createsGitRepos(source: string): boolean {
	return [...source.matchAll(GIT_INIT)].length > 0;
}

// True when, after every `git init` in the source, the helper is called before the next
// commit (or, with no later commit, at all).
function disablesBeforeFirstCommit(source: string): boolean {
	return [...source.matchAll(GIT_INIT)].every((init) => {
		const rest = source.slice(init.index);
		const helper = rest.indexOf(HELPER_CALL);
		const commit = rest.search(GIT_COMMIT);
		return helper !== -1 && (commit === -1 || helper < commit);
	});
}

describe("temp repo creators under .storybook", () => {
	test("every creator calls disableBackgroundMaintenance before its first commit", () => {
		const creators = repoCreatorCandidates().filter((rel) =>
			createsGitRepos(
				fs.readFileSync(path.join(repoRoot, ".storybook", rel), "utf8"),
			),
		);
		// The scan is not vacuous: the three creators known today are found by it.
		expect(creators).toEqual(
			expect.arrayContaining([
				"catalog/foundation.test.ts",
				"catalog/temp_repo.ts",
				"ci_scripts.test.ts",
			]),
		);
		const offenders = creators.filter(
			(rel) =>
				!disablesBeforeFirstCommit(
					fs.readFileSync(path.join(repoRoot, ".storybook", rel), "utf8"),
				),
		);
		expect(
			offenders,
			"these files run `git init` without calling disableBackgroundMaintenance(repo) before their first commit (the maintenance.lock race, 75.1 D3)",
		).toEqual([]);
	});
});
