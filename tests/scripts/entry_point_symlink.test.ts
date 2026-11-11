import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { assertDirEffect, snapshotDir } from "../helpers/dir_effect";

// Phase 70 review WR-02: each integrity-gate script ran its CLI only when
// `process.argv[1] === fileURLToPath(import.meta.url)`. Node keeps argv[1] as the path it was
// given while import.meta.url is the realpath, so a script started through a symlinked absolute
// path skipped its CLI entirely and exited 0 with no output (a fail-open on the integrity gate).
// Every case below picks an invocation whose direct run fails on purpose, so "the symlinked run
// behaves exactly like the direct run" cannot be satisfied by a silent exit 0.

const repoRoot = path.resolve(import.meta.dirname, "../..");

interface CliCase {
	readonly name: string;
	readonly script: string;
	readonly args: readonly string[];
	// Env var names whose values are paths inside the case's temp dir, by file name.
	readonly env: (tmp: string) => Record<string, string>;
	readonly status: number;
	readonly output: RegExp;
}

const CASES: readonly CliCase[] = [
	{
		name: "brand_fetch",
		script: "scripts/brand_fetch.mjs",
		args: [],
		env: (tmp) => ({
			BRAND_FETCH: "offline",
			BRAND_CACHE_DIR: path.join(tmp, "nonexistent-cache"),
		}),
		status: 1,
		output: /brand: FAILED: .*no cached brand zip/,
	},
	{
		name: "brand_update",
		script: "scripts/brand_update.mjs",
		// A short commit is rejected before any network access or write.
		args: ["abc123"],
		env: (tmp) => ({
			BRAND_PIN_FILE: path.join(tmp, "must-not-exist.pin.json"),
			BRAND_CACHE_DIR: path.join(tmp, "nonexistent-cache"),
		}),
		status: 1,
		output: /brand: update FAILED: .*40-character/,
	},
	{
		name: "findings_ratchet",
		script: "scripts/findings_ratchet.mjs",
		args: [],
		env: () => ({}),
		status: 1,
		output: /FINDINGS RATCHET FAILED: pass exactly one of --check or --write/,
	},
	{
		name: "storybook_budget_check",
		script: "scripts/storybook_budget_check.mjs",
		args: [],
		env: () => ({}),
		status: 1,
		output: /STORYBOOK BUDGET FAILED: start-missing/,
	},
];

describe("script entry points run when started through a symlink (WR-02)", () => {
	let tmp = "";

	beforeEach(() => {
		// realpath: os.tmpdir() is itself a symlink on macOS (/var -> /private/var).
		tmp = fs.realpathSync(
			fs.mkdtempSync(path.join(os.tmpdir(), "entry-symlink-")),
		);
	});

	afterEach(() => {
		fs.rmSync(tmp, { recursive: true, force: true });
	});

	function run(script: string, testCase: CliCase) {
		return spawnSync(process.execPath, [script, ...testCase.args], {
			cwd: tmp,
			encoding: "utf8",
			env: { PATH: process.env["PATH"] ?? "", ...testCase.env(tmp) },
			timeout: 60_000,
		});
	}

	function outcome(result: ReturnType<typeof run>) {
		return {
			status: result.status,
			stdout: result.stdout,
			stderr: result.stderr,
		};
	}

	// Snapshots the whole temp dir around a run: the symlink fixtures are in the "before",
	// so a run that wrote anything (a cache dir, a pin file, a summary) fails here.
	function runAssertingNoWrites(script: string, testCase: CliCase) {
		const before = snapshotDir(tmp);
		const result = run(script, testCase);
		assertDirEffect(before, snapshotDir(tmp), {});
		return result;
	}

	describe.each(CASES)("$name", (testCase) => {
		const direct = () => path.join(repoRoot, testCase.script);

		test("the direct path fails closed as specified (the baseline the symlink runs must match)", () => {
			const result = runAssertingNoWrites(direct(), testCase);
			expect(result.status, result.stderr).toBe(testCase.status);
			expect(result.stderr).toMatch(testCase.output);
		});

		test("through a symlinked repository directory it behaves exactly like the direct path", () => {
			const link = path.join(tmp, "repo-link");
			fs.symlinkSync(repoRoot, link, "junction");
			const expected = outcome(run(direct(), testCase));
			const result = runAssertingNoWrites(
				path.join(link, testCase.script),
				testCase,
			);
			expect(result.status, result.stderr).toBe(testCase.status);
			expect(result.stderr).toMatch(testCase.output);
			expect(outcome(result)).toEqual(expected);
		});

		// File symlinks need a privilege on Windows; the directory junction above already
		// covers the realpath-versus-argv[1] mismatch there.
		test.skipIf(process.platform === "win32")(
			"through a symlink to the script file it behaves exactly like the direct path",
			() => {
				const link = path.join(tmp, "script-link.mjs");
				fs.symlinkSync(direct(), link);
				const expected = outcome(run(direct(), testCase));
				const result = runAssertingNoWrites(link, testCase);
				expect(result.status, result.stderr).toBe(testCase.status);
				expect(result.stderr).toMatch(testCase.output);
				expect(outcome(result)).toEqual(expected);
			},
		);
	});
});
