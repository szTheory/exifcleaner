import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { assertDirEffect, snapshotDir } from "../../tests/helpers/dir_effect";
import {
	childEnv,
	makeCatalogRepo,
	realScript,
	repoRoot,
	runNode,
} from "./temp_repo";

const CATALOG = ".storybook/catalog/catalog.mjs";
const GLOSSARY_MD = ".storybook/catalog/GLOSSARY.md";
const GLOSSARY_JSON = ".storybook/catalog/glossary.json";

function withRepo(body: (repo: string) => void): void {
	const repo = makeCatalogRepo();
	try {
		body(repo);
	} finally {
		fs.rmSync(repo, { recursive: true, force: true });
	}
}

function run(repo: string, args: string[]) {
	return runNode(realScript(CATALOG), args, repo);
}

describe("catalog.mjs against a temp git repo", () => {
	test("--check in a fresh catalog repo passes", () => {
		withRepo((repo) => {
			const result = run(repo, ["--check"]);
			expect(result.status, result.stderr).toBe(0);
			expect(result.stdout).toContain("CATALOG CHECK PASSED");
		});
	});

	test("shown red: one changed byte in GLOSSARY.md fails --check and changes nothing", () => {
		withRepo((repo) => {
			const file = path.join(repo, GLOSSARY_MD);
			fs.writeFileSync(file, `${fs.readFileSync(file, "utf8")}x`);
			const before = snapshotDir(repo);
			const result = run(repo, ["--check"]);
			expect(result.status).toBe(1);
			expect(result.stderr).toContain("CATALOG CHECK FAILED");
			expect(result.stderr).toContain(
				"GLOSSARY.md is stale; run yarn catalog:write",
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
			expect(run(repo, ["--check"]).status).toBe(0);
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

	test("shown red: no flags exits 1 and an unknown flag fails closed", () => {
		withRepo((repo) => {
			const before = snapshotDir(repo);
			const bare = run(repo, []);
			expect(bare.status).toBe(1);
			expect(bare.stderr).toContain("pass exactly one of --check or --write");
			const unknown = run(repo, ["--check", "--frobnicate"]);
			expect(unknown.status).toBe(1);
			expect(unknown.stderr).toContain("unknown argument --frobnicate");
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

	test("temp_repo: child env has no NODE_OPTIONS", () => {
		// yarn test:storybook preloads the network guard, so this is not vacuous.
		expect(process.env["NODE_OPTIONS"]).toBeDefined();
		expect("NODE_OPTIONS" in childEnv({})).toBe(false);
		withRepo((repo) => {
			const result = runNode(realScript(CATALOG), ["--check"], repo);
			expect(result.status, result.stderr).toBe(0);
		});
	});
});
