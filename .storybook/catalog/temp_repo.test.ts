import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { GIT_ENV, disableBackgroundMaintenance, git } from "./temp_repo";

// Deterministic probe for the maintenance.lock race (75.1 D3). `git commit` starts
// `git maintenance run --auto` as a child unless maintenance.auto is false, and that
// child takes and releases .git/objects/maintenance.lock while a test walks the
// directory. GIT_TRACE2_EVENT records every child start, so the control counts the
// maintenance children of one commit instead of racing a timing window.

// A temp repo made the way every creator did before the helper existed.
function oldWayRepo(): string {
	const repo = fs.realpathSync(
		fs.mkdtempSync(path.join(os.tmpdir(), "temp-repo-probe-")),
	);
	git(repo, ["init", "-q", "-b", "main"]);
	git(repo, ["config", "user.name", "Probe Test"]);
	git(repo, ["config", "user.email", "probe@example.invalid"]);
	git(repo, ["config", "commit.gpgsign", "false"]);
	return repo;
}

// Commits one new file and returns how many `git maintenance` children that commit started.
function maintenanceChildStarts(repo: string, file: string): number {
	const trace = `${repo}.trace2`;
	fs.writeFileSync(path.join(repo, file), `${file}\n`);
	git(repo, ["add", file]);
	const result = spawnSync("git", ["commit", "-q", "-m", "c"], {
		cwd: repo,
		encoding: "utf8",
		env: { ...GIT_ENV, GIT_TRACE2_EVENT: trace },
	});
	expect(result.status, result.stderr).toBe(0);
	return fs
		.readFileSync(trace, "utf8")
		.split("\n")
		.filter(
			(line) =>
				line.includes('"event":"child_start"') &&
				line.includes('"argv":["git","maintenance"'),
		).length;
}

function removeRepo(repo: string): void {
	fs.rmSync(repo, { recursive: true, force: true });
	fs.rmSync(`${repo}.trace2`, { force: true });
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

	test("planted lock: a helper repo leaves .git/objects/maintenance.lock byte-identical and starts no maintenance", () => {
		const repo = oldWayRepo();
		try {
			disableBackgroundMaintenance(repo);
			expect(maintenanceChildStarts(repo, "a.txt")).toBe(0);
			const lock = path.join(repo, ".git", "objects", "maintenance.lock");
			const planted = Buffer.from("planted-by-the-75.1-probe\n");
			fs.writeFileSync(lock, planted);
			expect(maintenanceChildStarts(repo, "b.txt")).toBe(0);
			expect(fs.readFileSync(lock).equals(planted)).toBe(true);
		} finally {
			removeRepo(repo);
		}
	});
});
