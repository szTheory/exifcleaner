import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { assertDirEffect, snapshotDir } from "../../tests/helpers/dir_effect";
import {
	checkBrandQuotes,
	headingRanges,
	mapBrandRefs,
	pairsBrandRefs,
	resolveTokenPath,
	specBrandSources,
	specTokenSources,
} from "./brand_quote_check.mjs";
import { makeCatalogRepo, realScript, repoRoot, runNode } from "./temp_repo";

const SCRIPT = ".storybook/catalog/brand_quote_check.mjs";
const CACHE = ".brand-cache/unpacked/exifcleaner-brand";
const RULES = ".storybook/catalog/copy_lint_rules.json";
const CATALOG = ".storybook/catalog/catalog.json";
const SPEC = ".storybook/catalog/ui-spec.json";
const TOKEN_MAP = ".storybook/catalog/token_map.json";
const PAIRS = "tests/renderer/contrast/contrast_pairs.json";
const USAGE =
	"usage: node .storybook/catalog/brand_quote_check.mjs [--cache <dir>]";

interface Rule {
	id: string;
	source: { section: string; quote: string };
}

function readJsonFile<T>(repo: string, relPath: string): T {
	return JSON.parse(fs.readFileSync(path.join(repo, relPath), "utf8")) as T;
}

// A planted BRAND.md built from the repository's own rules, catalog and
// ui-spec.json: one `##` heading per cited section holding every quote cited
// under it, the Inclusive language section a `###` subheading of Voice, and a
// level-prefixed spec section (`## In the product`, `### In the product`)
// emitted as exactly that heading line, so the file passes the real check
// without the real (gitignored, networked) cache.
function plantedBrand(repo: string): string {
	const rules = readJsonFile<{ rules: Rule[] }>(repo, RULES).rules;
	const catalog = readJsonFile<unknown>(repo, CATALOG);
	const spec = readJsonFile<unknown>(repo, SPEC);
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
	for (const source of specBrandSources(spec)) {
		const section = String(source.section);
		const quotes = bySection.get(section) ?? [];
		quotes.push(String(source.quote));
		bySection.set(section, quotes);
	}
	const voice = "Voice: this, not that";
	const inclusive = "Inclusive language, and writing for translation";
	const parts = ["# Planted brand book", ""];
	for (const [section, quotes] of bySection) {
		if (section === inclusive) continue;
		const heading = /^#{1,6} /.test(section) ? section : `## ${section}`;
		parts.push(heading, "", ...quotes.map((quote) => `- ${quote}`), "");
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

// A planted tokens.json: the nested `{ color: { dark: { tide: { $value: { hex }
// } } } }` shape of the real file, built from the spec's `tokens` sources and
// from every brand path token_map.json adopts or derives from (hexes from the
// map; a derive path no `adopt` ref or spec value gives a hex for fails here).
function plantedTokens(repo: string): Record<string, unknown> {
	const hexes = new Map<string, string>();
	for (const source of specTokenSources(readJsonFile<unknown>(repo, SPEC))) {
		hexes.set(String(source.path), String(source.value));
	}
	const refs = mapBrandRefs(readJsonFile<unknown>(repo, TOKEN_MAP));
	for (const ref of refs) {
		if (typeof ref.hex === "string") hexes.set(String(ref.token), ref.hex);
	}
	// The contrast pairs document cites colour paths of its own (the proposed set
	// and the BRAND.md ratio rows); their hexes are planted too.
	for (const ref of pairsBrandRefs(readJsonFile<unknown>(repo, PAIRS))) {
		hexes.set(String(ref.token), String(ref.hex));
	}
	for (const ref of refs) {
		if (!hexes.has(String(ref.token))) {
			throw new Error(`no hex to plant for ${ref.name} ${ref.token}`);
		}
	}
	const root: Record<string, unknown> = {};
	for (const [dotted, hex] of hexes) {
		let node = root;
		for (const key of dotted.split(".")) {
			const next = node[key] ?? {};
			node[key] = next;
			node = next as Record<string, unknown>;
		}
		node["$value"] = { hex };
	}
	return root;
}

// The pure check over a repo's planted files, the map only (no spec, so a map
// defect is not mixed with the spec's own codes).
function mapProblems(repo: string, cacheDir: string) {
	return checkBrandQuotes({
		brandText: fs.readFileSync(path.join(cacheDir, "BRAND.md"), "utf8"),
		rulesDoc: { brandPin: "x", rules: [] },
		catalogDoc: {},
		pin: readJsonFile<{ commit: string }>(repo, "brand.pin.json").commit,
		tokenMapDoc: readJsonFile(repo, TOKEN_MAP),
		tokensDoc: readJsonFile(repo, path.join(CACHE, "tokens.json")),
	}).filter((found) => found.code !== "rule-pin-mismatch");
}

// The pairs document alone (no spec, no map), so a pairs defect is not mixed with
// the other documents' codes.
function pairsProblems(repo: string, cacheDir: string) {
	return checkBrandQuotes({
		brandText: fs.readFileSync(path.join(cacheDir, "BRAND.md"), "utf8"),
		rulesDoc: { brandPin: "x", rules: [] },
		catalogDoc: {},
		pin: readJsonFile<{ commit: string }>(repo, "brand.pin.json").commit,
		pairsDoc: readJsonFile(repo, PAIRS),
		tokensDoc: readJsonFile(repo, path.join(CACHE, "tokens.json")),
	}).filter((found) => found.code !== "rule-pin-mismatch");
}

function withRepo(
	body: (repo: string, cacheDir: string) => void,
	{ plant = true, tokens = true }: { plant?: boolean; tokens?: boolean } = {},
): void {
	const repo = makeCatalogRepo();
	try {
		// The pairs document is not a CHECK_INPUTS entry, so the temp repository
		// does not hold it until it is copied from the real one.
		fs.mkdirSync(path.join(repo, path.dirname(PAIRS)), { recursive: true });
		fs.copyFileSync(path.join(repoRoot, PAIRS), path.join(repo, PAIRS));
		const cacheDir = path.join(repo, CACHE);
		if (plant) {
			fs.mkdirSync(cacheDir, { recursive: true });
			fs.writeFileSync(path.join(cacheDir, "BRAND.md"), plantedBrand(repo));
			if (tokens) {
				fs.writeFileSync(
					path.join(cacheDir, "tokens.json"),
					`${JSON.stringify(plantedTokens(repo), null, "\t")}\n`,
				);
			}
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
				/BRAND QUOTE CHECK PASSED — \d+ rules, \d+ catalog sections, \d+ spec quotes, \d+ spec tokens, [1-9]\d* map brand refs, [1-9]\d* pairs refs/,
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

	test("shown red: no tokens.json", () => {
		// BRAND.md is planted and tokens.json is not: the check fails closed
		// instead of skipping the token half (T-74-06).
		withRepo(
			(repo) => {
				const before = snapshotDir(repo);
				const result = run(repo);
				expect(result.status).toBe(1);
				expect(result.stderr).toContain("BRAND QUOTE CHECK FAILED");
				expect(result.stderr).toContain("run yarn brand:fetch");
				assertDirEffect(before, snapshotDir(repo), {});
			},
			{ tokens: false },
		);
	});

	test("shown red: a tampered tokens.json hex", () => {
		withRepo((repo, cacheDir) => {
			rewrite(repo, path.join(CACHE, "tokens.json"), (doc) => {
				doc.color.dark.tide.$value.hex = "#000000";
			});
			const before = snapshotDir(repo);
			const result = run(repo);
			expect(result.status).toBe(1);
			expect(result.stderr).toContain("color.dark.tide");
			expect(result.stderr).toContain("#000000");
			assertDirEffect(before, snapshotDir(repo), {});
			const problems = checkBrandQuotes({
				brandText: fs.readFileSync(path.join(cacheDir, "BRAND.md"), "utf8"),
				rulesDoc: readJsonFile(repo, RULES),
				catalogDoc: readJsonFile(repo, CATALOG),
				pin: readJsonFile<{ commit: string }>(repo, "brand.pin.json").commit,
				specDoc: readJsonFile(repo, SPEC),
				tokensDoc: readJsonFile(repo, path.join(CACHE, "tokens.json")),
			});
			// Every spec value that cites the planted path is red, with this one code.
			expect(problems.length).toBeGreaterThan(0);
			expect([...new Set(problems.map((found) => found.code))]).toEqual([
				"spec-token-hex-mismatch",
			]);
		});
	});

	test("shown red: a deleted tokens.json path", () => {
		withRepo((repo, cacheDir) => {
			rewrite(repo, path.join(CACHE, "tokens.json"), (doc) => {
				delete doc.color.dark.tide;
			});
			const before = snapshotDir(repo);
			const result = run(repo);
			expect(result.status).toBe(1);
			expect(result.stderr).toContain("color.dark.tide");
			expect(result.stderr).toContain("is not a colour in tokens.json");
			assertDirEffect(before, snapshotDir(repo), {});
			const problems = checkBrandQuotes({
				brandText: fs.readFileSync(path.join(cacheDir, "BRAND.md"), "utf8"),
				rulesDoc: readJsonFile(repo, RULES),
				catalogDoc: readJsonFile(repo, CATALOG),
				pin: readJsonFile<{ commit: string }>(repo, "brand.pin.json").commit,
				specDoc: readJsonFile(repo, SPEC),
				tokensDoc: readJsonFile(repo, path.join(CACHE, "tokens.json")),
			});
			// Every spec value that cites the planted path is red, with this one code.
			expect(problems.length).toBeGreaterThan(0);
			expect([...new Set(problems.map((found) => found.code))]).toEqual([
				"spec-token-path-missing",
			]);
		});
	});

	test("shown red: a tampered map brand hex", () => {
		withRepo((repo, cacheDir) => {
			rewrite(repo, path.join(CACHE, "tokens.json"), (doc) => {
				doc.color.secondary.pewter.$value.hex = "#000000";
			});
			const before = snapshotDir(repo);
			const result = run(repo);
			expect(result.status).toBe(1);
			expect(result.stderr).toContain("BRAND QUOTE CHECK FAILED");
			expect(result.stderr).toContain("--ec-color-text-secondary");
			expect(result.stderr).toContain("color.secondary.pewter");
			expect(result.stderr).toContain("#000000");
			assertDirEffect(before, snapshotDir(repo), {});
			// The map alone: exactly one problem, with its own code.
			expect(mapProblems(repo, cacheDir).map((found) => found.code)).toEqual([
				"map-token-hex-mismatch",
			]);
		});
	});

	test("shown red: a missing map brand path", () => {
		withRepo((repo, cacheDir) => {
			rewrite(repo, path.join(CACHE, "tokens.json"), (doc) => {
				delete doc.color.dark.tide;
			});
			const before = snapshotDir(repo);
			const result = run(repo);
			expect(result.status).toBe(1);
			expect(result.stderr).toContain("--ec-color-surface brand.dark");
			expect(result.stderr).toContain("color.dark.tide");
			expect(result.stderr).toContain("is not a colour in tokens.json");
			assertDirEffect(before, snapshotDir(repo), {});
			// The adopt ref and the derive source that name the path, each its own entry.
			const found = mapProblems(repo, cacheDir);
			expect(found.map((problem) => problem.code)).toEqual([
				"map-token-path-missing",
				"map-token-path-missing",
			]);
			expect(found.map((problem) => problem.location)).toEqual([
				"--ec-color-error-bg from",
				"--ec-color-surface brand.dark",
			]);
		});
	});

	test("shown red: a tampered proposed hex", () => {
		withRepo((repo, cacheDir) => {
			// color.light.exifcleaner-teal is cited by the pairs document alone, so the
			// pairs check is the only one that can see this tamper.
			rewrite(repo, path.join(CACHE, "tokens.json"), (doc) => {
				doc.color.light["exifcleaner-teal"].$value.hex = "#000000";
			});
			const before = snapshotDir(repo);
			const result = run(repo);
			expect(result.status).toBe(1);
			expect(result.stderr).toContain("BRAND QUOTE CHECK FAILED");
			expect(result.stderr).toContain("color.light.exifcleaner-teal");
			expect(result.stderr).toContain("#000000");
			assertDirEffect(before, snapshotDir(repo), {});
			expect(pairsProblems(repo, cacheDir).map((found) => found.code)).toEqual([
				"pairs-token-hex-mismatch",
				"pairs-token-hex-mismatch",
			]);
		});
	});

	test("shown red: a tampered hex of a proposed colour the spec also cites", () => {
		withRepo((repo, cacheDir) => {
			rewrite(repo, path.join(CACHE, "tokens.json"), (doc) => {
				doc.color.light["steady-teal"].$value.hex = "#000000";
			});
			const before = snapshotDir(repo);
			const result = run(repo);
			expect(result.status).toBe(1);
			expect(result.stderr).toContain("color.light.steady-teal");
			assertDirEffect(before, snapshotDir(repo), {});
			const found = pairsProblems(repo, cacheDir);
			expect(found.length).toBeGreaterThan(0);
			expect([...new Set(found.map((problem) => problem.code))]).toEqual([
				"pairs-token-hex-mismatch",
			]);
		});
	});

	test("shown red: a missing pairs path", () => {
		withRepo((repo, cacheDir) => {
			rewrite(repo, path.join(CACHE, "tokens.json"), (doc) => {
				delete doc.color.light["exifcleaner-teal"];
			});
			const before = snapshotDir(repo);
			const result = run(repo);
			expect(result.status).toBe(1);
			expect(result.stderr).toContain("color.light.exifcleaner-teal");
			expect(result.stderr).toContain("is not a colour in tokens.json");
			assertDirEffect(before, snapshotDir(repo), {});
			expect([
				...new Set(pairsProblems(repo, cacheDir).map((found) => found.code)),
			]).toEqual(["pairs-token-path-missing"]);
		});
	});

	test("shown red: pairs brandPin must equal brand.pin.json", () => {
		withRepo((repo, cacheDir) => {
			rewrite(repo, PAIRS, (doc) => {
				doc.brandPin = "0".repeat(40);
			});
			const before = snapshotDir(repo);
			const result = run(repo);
			expect(result.status).toBe(1);
			expect(result.stderr).toContain("contrast_pairs.json");
			expect(result.stderr).toContain("brandPin is not the commit");
			assertDirEffect(before, snapshotDir(repo), {});
			expect(pairsProblems(repo, cacheDir).map((found) => found.code)).toEqual([
				"pairs-pin-mismatch",
			]);
		});
	});

	test("pairsBrandRefs lists every colour path of the proposed set and the ratio rows, and skips ids", () => {
		const refs = pairsBrandRefs(
			JSON.parse(fs.readFileSync(path.join(repoRoot, PAIRS), "utf8")),
		);
		expect(refs.length).toBeGreaterThan(20);
		for (const ref of refs) expect(String(ref.token)).toMatch(/^color\./);
		expect(pairsBrandRefs(null)).toEqual([]);
		expect(pairsBrandRefs({ proposed: "x", brandRatios: 3 })).toEqual([]);
		expect(
			pairsBrandRefs({
				proposed: [
					7,
					{ id: "a", fg: { ref: "dark-rinse.pressed-light", hex: "#DCE6E5" } },
					{ id: "b", fg: { ref: "color.dark.tide", hex: "#12403C" }, bg: 3 },
				],
				brandRatios: [{ fg: { ref: "color.dark.tide", hex: "#12403C" } }],
			}).map((ref) => ref.token),
		).toEqual(["color.dark.tide", "color.dark.tide"]);
	});

	test("shown red: map brandPin must equal brand.pin.json", () => {
		withRepo((repo, cacheDir) => {
			rewrite(repo, TOKEN_MAP, (doc) => {
				doc.brandPin = "0".repeat(40);
			});
			const before = snapshotDir(repo);
			const result = run(repo);
			expect(result.status).toBe(1);
			expect(result.stderr).toContain("token_map.json");
			expect(result.stderr).toContain("brandPin is not the commit");
			assertDirEffect(before, snapshotDir(repo), {});
			expect(mapProblems(repo, cacheDir).map((found) => found.code)).toEqual([
				"map-pin-mismatch",
			]);
		});
	});

	test("mapBrandRefs lists every adopt ref and derive source, and skips malformed entries", () => {
		const refs = mapBrandRefs(
			JSON.parse(fs.readFileSync(path.join(repoRoot, TOKEN_MAP), "utf8")),
		);
		// Four adopt entries with a light and a dark ref, and one derive with two sources.
		expect(refs).toHaveLength(10);
		expect(refs.filter((ref) => ref.hex === undefined)).toHaveLength(2);
		expect(mapBrandRefs(null)).toEqual([]);
		expect(mapBrandRefs({ entries: "x" })).toEqual([]);
		expect(
			mapBrandRefs({
				entries: [
					7,
					{ name: "--a", disposition: "adopt", brand: 3 },
					{ name: "--b", disposition: "derive", from: "color.x" },
				],
			}),
		).toEqual([]);
	});

	test("shown red: a prototype path never resolves", () => {
		const tokens = {
			color: { dark: { tide: { $value: { hex: "#12403C" } } } },
		};
		expect(resolveTokenPath(tokens, "color.dark.tide")).toBe("#12403C");
		// None of these is an own property of a parsed object: each is null, not
		// a walk into Object.prototype (T-74-05).
		expect(resolveTokenPath(tokens, "color.__proto__.hex")).toBeNull();
		expect(resolveTokenPath(tokens, "constructor.prototype")).toBeNull();
		expect(resolveTokenPath(tokens, "color.dark.tide.constructor")).toBeNull();
		expect(resolveTokenPath(tokens, "__proto__")).toBeNull();
		expect(resolveTokenPath(tokens, "toString")).toBeNull();
		// A path that stops short of a colour, or one with an empty step, is null.
		expect(resolveTokenPath(tokens, "color.dark")).toBeNull();
		expect(resolveTokenPath(tokens, "color..tide")).toBeNull();
		expect(resolveTokenPath(tokens, "")).toBeNull();
		expect(resolveTokenPath(undefined, "color.dark.tide")).toBeNull();
		// The own-property check is what refuses an inherited colour: a polluted
		// Object.prototype entry must not resolve through a plain `in` walk.
		Object.defineProperty(Object.prototype, "polluted-key", {
			value: { $value: { hex: "#FFFFFF" } },
			configurable: true,
		});
		try {
			expect(resolveTokenPath({ color: {} }, "color.polluted-key")).toBeNull();
		} finally {
			delete (Object.prototype as Record<string, unknown>)["polluted-key"];
		}
	});

	test("shown red: a duplicated heading is ambiguous unless level-prefixed", () => {
		const brandText = [
			"# Book",
			"## Dup",
			"- level two quote",
			"### Dup",
			"- level three quote",
			"",
		].join("\n");
		const pin = "d".repeat(40);
		const specFor = (section: string, quote: string) => ({
			brandPin: pin,
			type: [
				{
					id: "type.sample",
					value: quote,
					brand: { section, quote },
				},
			],
		});
		const codesFor = (section: string, quote: string) =>
			checkBrandQuotes({
				brandText,
				rulesDoc: { brandPin: pin, rules: [] },
				catalogDoc: {},
				pin,
				specDoc: specFor(section, quote),
				tokensDoc: {},
			}).map((found) => found.code);
		// A bare citation of a text that is two headings is ambiguous, as for rules.
		expect(codesFor("Dup", "level two quote")).toEqual([
			"spec-section-ambiguous",
		]);
		// A level prefix picks one heading, and each quote lives in its own level.
		expect(codesFor("## Dup", "level two quote")).toEqual([]);
		expect(codesFor("### Dup", "level three quote")).toEqual([]);
		expect(codesFor("### Dup", "level two quote")).toEqual([
			"spec-quote-not-in-section",
		]);
		expect(codesFor("#### Dup", "level two quote")).toEqual([
			"spec-section-not-heading",
		]);
	});

	test("shown red: spec brandPin must equal brand.pin.json", () => {
		withRepo((repo) => {
			rewrite(repo, SPEC, (doc) => {
				doc.brandPin = "0".repeat(40);
			});
			const before = snapshotDir(repo);
			const result = run(repo);
			expect(result.status).toBe(1);
			expect(result.stderr).toContain("ui-spec.json");
			expect(result.stderr).toContain("brandPin is not the commit");
			assertDirEffect(before, snapshotDir(repo), {});
		});
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
