import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { assertDirEffect, snapshotDir } from "../../tests/helpers/dir_effect";
import { makeCatalogRepo, realScript, repoRoot, runNode } from "./temp_repo";
import {
	TOKENS_CSS_PATH,
	TOKEN_MAP_PATH,
	declaredTokens,
	loadTokenMapContext,
	usedTokens,
	validateTokenMap,
	type TokenMapContext,
	type TokenMapDocument,
} from "./token_map.mjs";

const CATALOG = ".storybook/catalog/catalog.mjs";

const ctx: TokenMapContext = loadTokenMapContext(repoRoot);
const real = JSON.parse(
	fs.readFileSync(path.join(repoRoot, TOKEN_MAP_PATH), "utf8"),
) as TokenMapDocument;

function codes(doc: unknown, context: TokenMapContext = ctx): string[] {
	return validateTokenMap(doc, context).map((found) => found.code);
}

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

// A planted custom property in both theme blocks of a stylesheet text.
function withPlantedToken(css: string, declaration: string): string {
	return css
		.replace(":root {", `:root {\n\t${declaration}`)
		.replace(
			'[data-theme="dark"] {',
			`[data-theme="dark"] {\n\t${declaration}`,
		);
}

describe("the real token map", () => {
	test("validates to no problems", () => {
		expect(validateTokenMap(real, ctx)).toEqual([]);
	});

	test("anti-vacuity: the scan sees the measured sets and the map holds one entry per name", () => {
		const declared = declaredTokens(ctx.tokensCss);
		expect(declared.root.size).toBe(59);
		expect(declared.dark.size).toBe(39);
		expect(declared.other).toEqual([]);
		expect(
			usedTokens({ ...ctx.sources, [TOKENS_CSS_PATH]: ctx.tokensCss }),
		).toHaveLength(65);
		expect(real.entries).toHaveLength(68);
		expect(Object.keys(real)).toEqual(["schemaVersion", "brandPin", "entries"]);
	});

	test("every disposition is used at least once", () => {
		const used = new Set(real.entries.map((entry) => entry.disposition));
		for (const disposition of [
			"adopt",
			"derive",
			"keep-platform",
			"propose-upstream",
			"retire",
			"local",
		]) {
			expect(used.has(disposition as never), disposition).toBe(true);
		}
	});
});

describe("a custom property added without a map entry (SC2, D-19)", () => {
	test("shown red in-process: a property added to both theme blocks is exactly unmapped", () => {
		const planted = {
			...ctx,
			tokensCss: withPlantedToken(
				ctx.tokensCss,
				"--ec-color-planted: #123456;",
			),
		};
		expect(codes(real, planted)).toEqual(["unmapped"]);
	});

	test("shown red through the CLI: the same declaration in a temp repo fails --check and changes nothing", () => {
		withRepo((repo) => {
			const file = path.join(repo, TOKENS_CSS_PATH);
			fs.writeFileSync(
				file,
				withPlantedToken(
					fs.readFileSync(file, "utf8"),
					"--ec-color-planted: #123456;",
				),
			);
			const before = snapshotDir(repo);
			const result = run(repo, ["--check", "--base", "main"]);
			expect(result.status).toBe(1);
			expect(result.stderr).toContain("CATALOG CHECK FAILED");
			expect(result.stderr).toContain("unmapped");
			expect(result.stderr).toContain("--ec-color-planted");
			assertDirEffect(before, snapshotDir(repo), {});
		});
	});
});
