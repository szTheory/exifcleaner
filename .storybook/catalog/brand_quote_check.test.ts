import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { assertDirEffect, snapshotDir } from "../../tests/helpers/dir_effect";
import { checkBrandQuotes, headingRanges } from "./brand_quote_check.mjs";
import { makeCatalogRepo, realScript, repoRoot, runNode } from "./temp_repo";

const SCRIPT = ".storybook/catalog/brand_quote_check.mjs";
const CACHE = ".brand-cache/unpacked/exifcleaner-brand";
const RULES = ".storybook/catalog/copy_lint_rules.json";
const CATALOG = ".storybook/catalog/catalog.json";
const USAGE =
	"usage: node .storybook/catalog/brand_quote_check.mjs [--cache <dir>]";

interface Rule {
	id: string;
	source: { section: string; quote: string };
}

function readJsonFile<T>(repo: string, relPath: string): T {
	return JSON.parse(fs.readFileSync(path.join(repo, relPath), "utf8")) as T;
}

// A planted BRAND.md built from the repository's own rules and catalog: one
// `##` heading per cited section holding every quote cited under it, the
// Inclusive language section a `###` subheading of Voice, so the file passes
// the real check without the real (gitignored, networked) cache.
function plantedBrand(repo: string): string {
	const rules = readJsonFile<{ rules: Rule[] }>(repo, RULES).rules;
	const catalog = readJsonFile<unknown>(repo, CATALOG);
	const bySection = new Map<string, string[]>();
	for (const rule of rules) {
		const quotes = bySection.get(rule.source.section) ?? [];
		quotes.push(rule.source.quote);
		bySection.set(rule.source.section, quotes);
	}
	const raw = JSON.stringify(catalog);
	for (const match of raw.matchAll(/"section":"([^"]+)"/g)) {
		const section = match[1] ?? "";
		if (!bySection.has(section)) bySection.set(section, []);
	}
	const voice = "Voice: this, not that";
	const inclusive = "Inclusive language, and writing for translation";
	const parts = ["# Planted brand book", ""];
	for (const [section, quotes] of bySection) {
		if (section === inclusive) continue;
		parts.push(`## ${section}`, "", ...quotes.map((quote) => `- ${quote}`), "");
		if (section === voice && bySection.has(inclusive)) {
			parts.push(
				`### ${inclusive}`,
				"",
				...(bySection.get(inclusive) ?? []).map((quote) => `- ${quote}`),
				"",
			);
		}
	}
	if (bySection.has(inclusive) && !bySection.has(voice)) {
		parts.push(`### ${inclusive}`, "");
	}
	return `${parts.join("\n")}\n`;
}

function withRepo(
	body: (repo: string, cacheDir: string) => void,
	{ plant = true }: { plant?: boolean } = {},
): void {
	const repo = makeCatalogRepo();
	try {
		const cacheDir = path.join(repo, CACHE);
		if (plant) {
			fs.mkdirSync(cacheDir, { recursive: true });
			fs.writeFileSync(path.join(cacheDir, "BRAND.md"), plantedBrand(repo));
		}
		body(repo, cacheDir);
	} finally {
		fs.rmSync(repo, { recursive: true, force: true });
	}
}

function run(repo: string, args: string[] = []) {
	return runNode(realScript(SCRIPT), args, repo);
}

function rewrite(repo: string, relPath: string, edit: (doc: any) => void) {
	const file = path.join(repo, relPath);
	const doc = JSON.parse(fs.readFileSync(file, "utf8"));
	edit(doc);
	fs.writeFileSync(file, `${JSON.stringify(doc, null, "\t")}\n`);
}

describe("brand_quote_check against a planted cache", () => {
	test("resolves: all quotes present", () => {
		withRepo((repo) => {
			const before = snapshotDir(repo);
			const result = run(repo);
			expect(result.status, result.stderr).toBe(0);
			expect(result.stdout).toMatch(
				/BRAND QUOTE CHECK PASSED — \d+ rules, \d+ catalog sections/,
			);
			assertDirEffect(before, snapshotDir(repo), {});
		});
	});

	test("shown red: quote absent", () => {
		withRepo((repo, cacheDir) => {
			const file = path.join(cacheDir, "BRAND.md");
			const quote = readJsonFile<{ rules: Rule[] }>(repo, RULES).rules.find(
				(rule) => rule.id === "banned.just",
			)?.source.quote;
			expect(quote).toBeDefined();
			fs.writeFileSync(
				file,
				fs.readFileSync(file, "utf8").replaceAll(quote ?? "", "removed line"),
			);
			const before = snapshotDir(repo);
			const result = run(repo);
			expect(result.status).toBe(1);
			expect(result.stderr).toContain("BRAND QUOTE CHECK FAILED");
			expect(result.stderr).toContain("banned.just");
			expect(result.stderr).toContain("quote absent");
			assertDirEffect(before, snapshotDir(repo), {});
		});
	});

	test("shown red: quote outside its section", () => {
		withRepo((repo) => {
			// banned.just cites Voice, but its quote sits under the Inclusive
			// language subheading, so it is in the file yet not in the section.
			rewrite(repo, RULES, (doc) => {
				const rule = doc.rules.find(
					(candidate: Rule) => candidate.id === "banned.just",
				);
				rule.source.section = "Voice: this, not that";
			});
			const before = snapshotDir(repo);
			const result = run(repo);
			expect(result.status).toBe(1);
			expect(result.stderr).toContain("banned.just");
			expect(result.stderr).toContain("quote not in section");
			assertDirEffect(before, snapshotDir(repo), {});
		});
	});

	test("headingRanges: subsection ends the parent range", () => {
		const text = [
			"# Book",
			"## Voice: this, not that",
			"- a line",
			"### Inclusive language, and writing for translation",
			"- inside",
			"## How to write our name",
			"last",
		].join("\n");
		const ranges = headingRanges(`${text}\n`);
		const voice = ranges.find((r) => r.heading === "Voice: this, not that");
		const inclusive = ranges.find((r) => r.heading.startsWith("Inclusive"));
		const name = ranges.find((r) => r.heading === "How to write our name");
		expect(voice).toMatchObject({ level: 2, start: 2, end: 3 });
		expect(inclusive).toMatchObject({ level: 3, start: 4, end: 5 });
		expect(name).toMatchObject({ start: 6, end: 7 });
	});

	test("headingRanges: a hash line inside a code fence is not a heading", () => {
		const ranges = headingRanges(
			["# A", "```", "# not a heading", "```", "## B"].join("\n"),
		);
		expect(ranges.map((r) => r.heading)).toEqual(["A", "B"]);
	});

	test("shown red: rule section not a heading", () => {
		withRepo((repo) => {
			rewrite(repo, RULES, (doc) => {
				const rule = doc.rules.find(
					(candidate: Rule) => candidate.id === "banned.simply",
				);
				rule.source.section = "A section the book does not have";
			});
			const before = snapshotDir(repo);
			const result = run(repo);
			expect(result.status).toBe(1);
			expect(result.stderr).toContain("banned.simply");
			expect(result.stderr).toContain("is not a heading");
			assertDirEffect(before, snapshotDir(repo), {});
		});
	});

	test("shown red: catalog section not a heading", () => {
		withRepo((repo) => {
			rewrite(repo, CATALOG, (doc) => {
				doc.personas[0].claims[0].source = {
					kind: "brand",
					pin: doc.personas[0].claims[0].source.pin,
					section: "Not A Heading",
				};
			});
			const before = snapshotDir(repo);
			const result = run(repo);
			expect(result.status).toBe(1);
			expect(result.stderr).toContain("Not A Heading");
			expect(result.stderr).toContain("is not a heading");
			assertDirEffect(before, snapshotDir(repo), {});
		});
	});

	test("shown red: catalog pin and rules pin must equal brand.pin.json", () => {
		const problems = checkBrandQuotes({
			brandText: "## Key messages\n",
			rulesDoc: { brandPin: "a".repeat(40), rules: [] },
			catalogDoc: {
				coreJob: {
					clauses: [
						{
							source: {
								kind: "brand",
								pin: "b".repeat(40),
								section: "Key messages",
							},
						},
					],
				},
			},
			pin: "c".repeat(40),
		});
		expect(problems.map((found) => found.code)).toEqual([
			"catalog-pin-mismatch",
			"rule-pin-mismatch",
		]);
	});

	test("shown red: no cache", () => {
		withRepo(
			(repo) => {
				const before = snapshotDir(repo);
				const result = run(repo);
				expect(result.status).toBe(1);
				expect(result.stderr).toContain("run yarn brand:fetch");
				assertDirEffect(before, snapshotDir(repo), {});
			},
			{ plant: false },
		);
	});

	test("shown red: an unknown argument exits 1 with the usage line", () => {
		withRepo((repo) => {
			const before = snapshotDir(repo);
			const result = run(repo, ["--frobnicate"]);
			expect(result.status).toBe(1);
			expect(result.stderr).toContain(USAGE);
			assertDirEffect(before, snapshotDir(repo), {});
		});
	});
});

// RESEARCH Pitfall 8 / T-71-24: started through a symlink the CLI must still
// run and fail closed, never exit 0 without running.
describe("brand_quote_check started through a symlink", () => {
	function withTmp(body: (tmp: string) => void): void {
		const tmp = fs.realpathSync(
			fs.mkdtempSync(path.join(os.tmpdir(), "brand-quote-symlink-")),
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
			const result = runNode(path.join(link, SCRIPT), ["--bogus"], tmp);
			expect(result.status, result.stderr).toBe(1);
			expect(result.stderr).toContain(USAGE);
			assertDirEffect(before, snapshotDir(tmp), {});
		});
	});

	test("shown red: symlinked start through a symlink to the script file", () => {
		withTmp((tmp) => {
			const link = path.join(tmp, "brand-quote-link.mjs");
			fs.symlinkSync(realScript(SCRIPT), link);
			const before = snapshotDir(tmp);
			const result = runNode(link, ["--bogus"], tmp);
			expect(result.status, result.stderr).toBe(1);
			expect(result.stderr).toContain(USAGE);
			assertDirEffect(before, snapshotDir(tmp), {});
		});
	});
});
