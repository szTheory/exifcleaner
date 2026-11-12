// Helper for tests that run a catalog CLI against a temporary git repository.
//
// Contract (every spawn goes through `runNode`):
//   - `scriptAbsPath` is ALWAYS the real script in the working tree
//     (`realScript(...)`), never the copy inside the temp repo. The copy cannot
//     resolve `../../scripts/is_main_module.mjs` or bare packages such as
//     `typescript` and `storybook/internal/csf-tools`.
//   - `cwd` is the temp repo, and only the cwd-relative CHECK_INPUTS are copied
//     into it, so a passing run there also proves the CLI reads no other data.
//   - The child gets a scrubbed environment built from named keys only. A
//     spread of `process.env` would carry `NODE_OPTIONS=--import=./.storybook/
//     network_guard.mjs` (a relative path set by `yarn test:storybook`), which
//     cannot resolve when the child's cwd is the temp repo.
// Precedent: `RATCHET` at .storybook/ci_scripts.test.ts line 24 and
// `runRatchet` at about line 303.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect } from "vitest";
import { CHECK_INPUTS } from "./catalog.mjs";

export const GIT_ENV = {
	PATH: process.env["PATH"] ?? "",
	GIT_CONFIG_GLOBAL: os.devNull,
	GIT_CONFIG_SYSTEM: os.devNull,
};

// The electron working-tree root (this file lives two levels below it).
export const repoRoot = path.resolve(import.meta.dirname, "../..");

export function realScript(relPath: string): string {
	return path.join(repoRoot, relPath);
}

export function git(repo: string, args: string[]): void {
	const result = spawnSync("git", args, {
		cwd: repo,
		encoding: "utf8",
		env: GIT_ENV,
	});
	expect(result.status, result.stderr).toBe(0);
}

export function childEnv(
	extra: Record<string, string> = {},
): Record<string, string> {
	return { ...GIT_ENV, HOME: process.env["HOME"] ?? "", ...extra };
}

// A fresh git repository whose `main` holds a copy of every CHECK_INPUTS entry.
export function makeCatalogRepo(root: string = repoRoot): string {
	const repo = fs.realpathSync(
		fs.mkdtempSync(path.join(os.tmpdir(), "catalog-cli-")),
	);
	for (const input of CHECK_INPUTS) {
		const from = path.join(root, input);
		if (!fs.existsSync(from)) {
			throw new Error(`CHECK_INPUTS entry ${input} is missing from ${root}`);
		}
		const to = path.join(repo, input);
		fs.mkdirSync(path.dirname(to), { recursive: true });
		fs.cpSync(from, to, { recursive: true });
	}
	git(repo, ["init", "-q", "-b", "main"]);
	git(repo, ["config", "user.name", "Catalog Test"]);
	git(repo, ["config", "user.email", "catalog@example.invalid"]);
	git(repo, ["config", "commit.gpgsign", "false"]);
	git(repo, ["add", "-A"]);
	git(repo, ["commit", "-q", "-m", "base"]);
	return repo;
}

export function runNode(
	scriptAbsPath: string,
	args: string[],
	cwd: string,
	extraEnv: Record<string, string> = {},
) {
	return spawnSync(process.execPath, [scriptAbsPath, ...args], {
		cwd,
		encoding: "utf8",
		env: childEnv(extraEnv),
		timeout: 60_000,
	});
}
