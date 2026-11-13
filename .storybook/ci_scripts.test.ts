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
import baseline from "../docs/evidence/known-findings.json";
import {
	DISPOSITIONS,
	FINDINGS_RATCHET_CODES,
	REGISTER_KINDS,
	check,
	diffBaseline,
	fingerprint,
	prune,
	validateBaseline,
	type BaselineDocument,
	type BaselineEntry,
	type Verdict,
} from "../scripts/findings_ratchet.mjs";
import { assertDirEffect, snapshotDir } from "../tests/helpers/dir_effect";
import { DISPOSITIONS as VOCAB_DISPOSITIONS } from "./catalog/vocab.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..");
const RATCHET = path.join(repoRoot, "scripts", "findings_ratchet.mjs");

function entry(kind: string, story: string, rule: string): BaselineEntry {
	return {
		fingerprint: fingerprint(kind, story, rule),
		kind,
		story,
		rule,
		reason: "planted for a test",
		disposition: "fix-v5.1",
	};
}

// `verdicts` is written only when given: an absent log must validate as [] (the
// merge-base copy on master has none).
function doc(
	kinds: Record<string, boolean>,
	entries: BaselineEntry[] = [],
	verdicts?: Verdict[],
): BaselineDocument {
	return {
		schemaVersion: 1,
		kinds: Object.fromEntries(
			Object.entries(kinds).map(([name, sealed]) => [name, { sealed }]),
		),
		entries,
		...(verdicts === undefined ? {} : { verdicts }),
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
			doc({ a11y: true }, [entry("a11y-p72", STORY, "x")]),
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
		const head = doc({ a11y: true, "a11y-p72": true }, [
			entry("a11y-p72", STORY, "color-contrast"),
		]);
		expect(check({ head, base })).toEqual({ ok: true, problems: [] });
	});

	test("second addition to a sealed new kind is added", () => {
		const introduced = doc({ a11y: true, "a11y-p72": true }, [
			entry("a11y-p72", STORY, "color-contrast"),
		]);
		// The introduction is now the merge-base copy.
		const head = doc({ a11y: true, "a11y-p72": true }, [
			entry("a11y-p72", STORY, "color-contrast"),
			entry("a11y-p72", OTHER, "color-contrast"),
		]);
		const result = check({ head, base: introduced });
		expect(result.ok).toBe(false);
		expect(codes(result)).toEqual(["added"]);
	});

	test("unsealed new kind is new-kind-unsealed", () => {
		const base = doc({ a11y: true });
		const head = doc({ a11y: true, "a11y-p72": false }, [
			entry("a11y-p72", STORY, "x"),
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

// --- findings register rules (Phase 73, FLW-02, D-26 to D-30) -------------------

const REG = "silent-failure";
const SLUG = "planted-slug";

function registerEntry(
	story: string,
	patch: Partial<BaselineEntry> = {},
	kind: string = REG,
	rule: string = SLUG,
): BaselineEntry {
	return { ...entry(kind, story, rule), severity: "major", ...patch };
}

function rejectEntry(story: string = STORY): BaselineEntry {
	return registerEntry(story, { disposition: "reject" });
}

function verdict(of: BaselineEntry, patch: Partial<Verdict> = {}): Verdict {
	return {
		fingerprint: of.fingerprint,
		verdict: "reject",
		reason: "planted: a catalog artefact, not a defect",
		decidedAt: "2026-11-13",
		decidedBy: "maintainer",
		reply: "planted for a test",
		...patch,
	};
}

function regDoc(
	entries: BaselineEntry[],
	verdicts?: Verdict[],
): BaselineDocument {
	return doc({ a11y: true, "a11y-p72": true, [REG]: true }, entries, verdicts);
}

// The shape master has today: axe kinds only, every entry with a disposition, no
// verdicts. check() validates this copy with the head's validator, so it must stay
// valid under every rule above (every field added is optional at the top level).
const MASTER_SHAPED = doc({ a11y: true, "a11y-p72": true }, [
	entry("a11y-p72", STORY, "color-contrast"),
]);

function problemsOf(value: unknown): string[] {
	return validateBaseline(value).map((found) => found.code);
}

type Unit = [name: string, run: () => string[], expected: string[]];

// One planted defect per new code, each yielding exactly its own code (the
// blast-radius assertion: toEqual of the whole code list, never toContain).
const REGISTER_UNITS: ReadonlyArray<Unit> = [
	[
		"a register entry without a story",
		() =>
			problemsOf({
				...regDoc([]),
				entries: [{ ...registerEntry(STORY), story: undefined }],
			}),
		["entry-field"],
	],
	[
		"an entry without a disposition",
		() =>
			problemsOf({
				...regDoc([]),
				entries: [{ ...registerEntry(STORY), disposition: undefined }],
			}),
		["entry-field"],
	],
	[
		"disposition wontfix",
		() =>
			problemsOf(regDoc([registerEntry(STORY, { disposition: "wontfix" })])),
		["bad-disposition"],
	],
	[
		"a register entry without a severity",
		() =>
			problemsOf({
				...regDoc([]),
				entries: [{ ...registerEntry(STORY), severity: undefined }],
			}),
		["bad-severity"],
	],
	[
		"severity high",
		() => problemsOf(regDoc([registerEntry(STORY, { severity: "high" })])),
		["bad-severity"],
	],
	[
		"a register rule that is not a kebab slug",
		() => {
			const rule = "Not A Slug";
			return problemsOf(
				regDoc([
					registerEntry(STORY, {
						rule,
						fingerprint: fingerprint(REG, STORY, rule),
					}),
				]),
			);
		},
		["bad-slug"],
	],
	[
		"kind contrast",
		() =>
			problemsOf(
				doc({ a11y: true, contrast: true }, [
					registerEntry(STORY, {}, "contrast"),
				]),
			),
		["unknown-kind"],
	],
	[
		"an a11y-prefixed kind outside the axe pattern",
		() =>
			problemsOf(
				doc({ a11y: true, "a11y-contrast": true }, [
					registerEntry(STORY, {}, "a11y-contrast"),
				]),
			),
		["unknown-kind"],
	],
	[
		"a reject entry without a verdict row",
		() => problemsOf(regDoc([rejectEntry()])),
		["reject-unrecorded"],
	],
	[
		"a verdict row without a reject entry",
		() => {
			const kept = registerEntry(STORY);
			return problemsOf(regDoc([kept], [verdict(kept)]));
		},
		["verdict-orphan"],
	],
	[
		"a verdict row dated 2026-02-30",
		() => {
			const rejected = rejectEntry();
			return problemsOf(
				regDoc([rejected], [verdict(rejected, { decidedAt: "2026-02-30" })]),
			);
		},
		["verdict-shape"],
	],
	[
		"a verdict row decided by bot",
		() => {
			const rejected = rejectEntry();
			return problemsOf(
				regDoc([rejected], [verdict(rejected, { decidedBy: "bot" })]),
			);
		},
		["verdict-shape"],
	],
	[
		"a merge-base verdict row edited in head",
		() => {
			const rejected = rejectEntry();
			const base = regDoc([rejected], [verdict(rejected)]);
			const head = regDoc(
				[rejected],
				[verdict(rejected, { reply: "rewritten after the fact" })],
			);
			return codes(check({ head, base }));
		},
		["verdict-rewritten"],
	],
	[
		"a merge-base verdict row removed in head",
		() => {
			const rejected = rejectEntry();
			const base = regDoc([rejected], [verdict(rejected)]);
			return codes(check({ head: regDoc([], []), base }));
		},
		["verdict-rewritten"],
	],
];

describe("findings register: one planted defect, one code (D-30)", () => {
	test.each(REGISTER_UNITS)("%s", (_name, run, expected) => {
		expect(run()).toEqual(expected);
	});

	test("green controls: a reject entry with its row, a document without verdicts and the master-shaped base all validate", () => {
		const rejected = rejectEntry();
		expect(problemsOf(regDoc([rejected], [verdict(rejected)]))).toEqual([]);
		expect("verdicts" in MASTER_SHAPED).toBe(false);
		expect(problemsOf(regDoc([registerEntry(STORY)]))).toEqual([]);
		expect(problemsOf(MASTER_SHAPED)).toEqual([]);
		expect(
			problemsOf(
				doc({ a11y: true, "a11y-p73": true }, [entry("a11y-p73", STORY, "x")]),
			),
		).toEqual([]);
	});

	test("the real baseline validates and passes against a master-shaped base", () => {
		expect(problemsOf(baseline)).toEqual([]);
		// Master holds the a11y and a11y-p72 entries; the head adds the sealed
		// a11y-p73 kind (and, later, register kinds) on top.
		const base = doc(
			{ a11y: true, "a11y-p72": true },
			baseline.entries
				.filter((found) => found.kind === "a11y-p72")
				.map((found) => ({ ...found })),
		);
		expect(problemsOf(base)).toEqual([]);
		expect(
			check({ head: baseline as unknown as BaselineDocument, base }),
		).toEqual({ ok: true, problems: [] });
	});

	test("the same story and rule under two kinds are two fingerprints, a repeated fingerprint is duplicate", () => {
		const two = [
			registerEntry(STORY, {}, "token-gap"),
			registerEntry(STORY, {}, "access-gap"),
		];
		expect(
			problemsOf(
				doc({ a11y: true, "token-gap": true, "access-gap": true }, two),
			),
		).toEqual([]);
		expect(
			problemsOf(
				doc({ a11y: true, "token-gap": true }, [
					registerEntry(STORY, {}, "token-gap"),
					registerEntry(STORY, {}, "token-gap"),
				]),
			),
		).toEqual(["duplicate"]);
	});

	test("first introduction of a sealed register kind passes once; a second change to it is added", () => {
		const first = regDoc([registerEntry(STORY), registerEntry(OTHER)]);
		expect(check({ head: first, base: MASTER_SHAPED })).toEqual({
			ok: true,
			problems: [],
		});
		// After merge the introduction is the merge-base copy, not the previous commit.
		const third = registerEntry("settings-languagedropdown--persian");
		expect(
			codes(check({ head: regDoc([...first.entries, third]), base: first })),
		).toEqual(["added"]);
	});

	test("a register kind introduced unsealed is new-kind-unsealed", () => {
		const head = doc({ a11y: true, "a11y-p72": true, [REG]: false }, [
			registerEntry(STORY),
		]);
		expect(codes(check({ head, base: MASTER_SHAPED }))).toEqual([
			"new-kind-unsealed",
		]);
	});

	test("a verdict row that stays unchanged, or a new row for a new reject, passes against the base", () => {
		const first = rejectEntry();
		const second = rejectEntry(OTHER);
		const base = regDoc([first], [verdict(first)]);
		expect(check({ head: base, base })).toEqual({ ok: true, problems: [] });
		// Flipping an existing entry to reject is the post-seed route and needs a new row;
		// the entry is not new, so it is not an addition either.
		const flippedBase = regDoc([registerEntry(OTHER)]);
		const flipped = regDoc([second], [verdict(second)]);
		expect(check({ head: flipped, base: flippedBase })).toEqual({
			ok: true,
			problems: [],
		});
	});

	test("the dispositions inlined in the ratchet equal vocab.mjs DISPOSITIONS", () => {
		expect([...DISPOSITIONS]).toEqual([...VOCAB_DISPOSITIONS]);
	});
});

describe("findings register: stale entries and prune (D-28)", () => {
	const axe = entry("a11y-p72", STORY, "color-contrast");
	const register = registerEntry(OTHER);
	const both = doc({ a11y: true, "a11y-p72": true, [REG]: true }, [
		axe,
		register,
	]);

	test("a stale axe entry says run --write to prune and a stale register entry says it is never pruned", () => {
		const axeOnly = check({
			head: both,
			base: both,
			observed: new Set([OTHER]),
		});
		expect(codes(axeOnly)).toEqual(["stale"]);
		expect(axeOnly.problems[0]?.message).toContain("run --write to prune");
		const registerOnly = check({
			head: both,
			base: both,
			observed: new Set([STORY]),
		});
		expect(codes(registerOnly)).toEqual(["stale"]);
		expect(registerOnly.problems[0]?.message).toContain(
			"register entries are never pruned",
		);
		expect(registerOnly.problems[0]?.message).not.toContain("run --write");
	});

	test("prune removes a stale axe entry and keeps the register entry", () => {
		const result = prune({
			head: both,
			base: both,
			observed: new Set([OTHER]),
		});
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.doc.entries.map((found) => found.fingerprint)).toEqual([
				register.fingerprint,
			]);
		}
	});

	test("prune refuses a stale register entry and returns no document", () => {
		const result = prune({
			head: both,
			base: both,
			observed: new Set([STORY]),
		});
		expect(result.ok).toBe(false);
		expect("doc" in result).toBe(false);
		if (!result.ok) {
			expect(codes(result)).toEqual(["stale"]);
			expect(result.problems[0]?.message).toContain(
				"register entries are never pruned",
			);
		}
	});

	test("prune with both stale refuses and removes nothing", () => {
		const result = prune({ head: both, base: both, observed: new Set() });
		expect(result.ok).toBe(false);
		expect("doc" in result).toBe(false);
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

// --- findings register controls against a temporary git repository (D-30) --------

// The codes in the CLI's failure text: `✗ FINDINGS RATCHET FAILED: code: message; ...`.
function stderrCodes(stderr: string): string[] {
	const body = (stderr.split("FINDINGS RATCHET FAILED: ")[1] ?? "").replace(
		/^refusing to write: /,
		"",
	);
	const known = new RegExp(
		`(?:^|; )(${FINDINGS_RATCHET_CODES.join("|")}): `,
		"g",
	);
	return [...body.matchAll(known)].map((match) => match[1] ?? "");
}

type CliCase = {
	name: string;
	// What main holds (the merge-base copy), and what the working tree holds.
	base: BaselineDocument;
	head: unknown;
	stories: string[];
	mode?: "--check" | "--write";
	// The whole list of codes the run reports; [] means it passes.
	codes: string[];
	says?: string;
};

const SOMEONE_ELSE = "settings-languagedropdown--persian";
const rejected = rejectEntry();
const RECORDED = regDoc([rejected], [verdict(rejected)]);

// Each case runs the real script against a temp git repo and asserts the whole
// docs/evidence directory delta: a failing or refused run changes nothing.
const CLI_CASES: readonly CliCase[] = [
	{
		name: "a register entry without a story",
		base: MASTER_SHAPED,
		head: {
			...regDoc([]),
			entries: [{ ...registerEntry(STORY), story: undefined }],
		},
		stories: [STORY],
		codes: ["entry-field"],
	},
	{
		name: "an entry without a disposition",
		base: MASTER_SHAPED,
		head: {
			...regDoc([]),
			entries: [{ ...registerEntry(STORY), disposition: undefined }],
		},
		stories: [STORY],
		codes: ["entry-field"],
	},
	{
		name: "disposition wontfix",
		base: MASTER_SHAPED,
		head: regDoc([registerEntry(STORY, { disposition: "wontfix" })]),
		stories: [STORY],
		codes: ["bad-disposition"],
	},
	{
		name: "a register entry whose story is absent from the index",
		base: regDoc([registerEntry(STORY)]),
		head: regDoc([registerEntry(STORY)]),
		stories: [OTHER],
		codes: ["stale"],
		says: "register entries are never pruned",
	},
	{
		name: "an unknown kind",
		base: MASTER_SHAPED,
		head: doc({ a11y: true, "a11y-p72": true, contrast: true }, [
			registerEntry(STORY, {}, "contrast"),
		]),
		stories: [STORY],
		codes: ["unknown-kind"],
	},
	{
		name: "an a11y-prefixed kind outside the axe pattern",
		base: MASTER_SHAPED,
		head: doc({ a11y: true, "a11y-p72": true, "a11y-contrast": true }, [
			registerEntry(STORY, {}, "a11y-contrast"),
		]),
		stories: [STORY],
		codes: ["unknown-kind"],
	},
	{
		name: "a reject entry with no verdict row",
		base: MASTER_SHAPED,
		head: regDoc([rejectEntry()]),
		stories: [STORY],
		codes: ["reject-unrecorded"],
	},
	{
		name: "a verdict row with no reject entry",
		base: MASTER_SHAPED,
		head: regDoc([registerEntry(STORY)], [verdict(registerEntry(STORY))]),
		stories: [STORY],
		codes: ["verdict-orphan"],
	},
	{
		name: "a merge-base verdict row edited in the working tree",
		base: RECORDED,
		head: regDoc([rejected], [verdict(rejected, { reply: "rewritten" })]),
		stories: [STORY],
		codes: ["verdict-rewritten"],
	},
	{
		name: "--write with a stale register entry is refused and the file is unchanged",
		base: regDoc([registerEntry(STORY)]),
		head: regDoc([registerEntry(STORY)]),
		stories: [OTHER],
		mode: "--write",
		codes: ["stale"],
		says: "refusing to write",
	},
	{
		name: "an entry added to a register kind that exists at the merge-base",
		base: regDoc([registerEntry(STORY)]),
		head: regDoc([registerEntry(STORY), registerEntry(OTHER)]),
		stories: [STORY, OTHER],
		codes: ["added"],
	},
	{
		name: "a register kind introduced unsealed",
		base: MASTER_SHAPED,
		head: doc({ a11y: true, "a11y-p72": true, [REG]: false }, [
			registerEntry(STORY),
		]),
		stories: [STORY],
		codes: ["new-kind-unsealed"],
	},
	{
		name: "first introduction of a sealed register kind with two entries (green)",
		base: MASTER_SHAPED,
		head: regDoc([registerEntry(STORY), registerEntry(OTHER)]),
		stories: [STORY, OTHER],
		codes: [],
	},
	{
		name: "a reject entry with its verdict row (green)",
		base: MASTER_SHAPED,
		head: RECORDED,
		stories: [STORY],
		codes: [],
	},
	{
		name: "a stale axe entry beside a live register entry: --check says stale",
		base: doc({ a11y: true, [REG]: true }, [
			entry("a11y", SOMEONE_ELSE, "x"),
			registerEntry(STORY),
		]),
		head: doc({ a11y: true, [REG]: true }, [
			entry("a11y", SOMEONE_ELSE, "x"),
			registerEntry(STORY),
		]),
		stories: [STORY],
		codes: ["stale"],
		says: "run --write to prune",
	},
];

describe("findings register CLI against a temp git repo (D-30)", () => {
	test.each(CLI_CASES.map((control) => [control.name, control] as const))(
		"%s",
		(_name, control) => {
			const repo = makeRepo(control.base);
			try {
				writeBaseline(repo, control.head);
				const index = writeIndex(repo, control.stories);
				const dir = path.join(repo, "docs", "evidence");
				const file = path.join(dir, "known-findings.json");
				const contents = readFileSync(file, "utf8");
				const before = snapshotDir(dir);
				const result = runRatchet(repo, [
					control.mode ?? "--check",
					"--base",
					"main",
					"--index",
					index,
				]);
				if (control.codes.length === 0) {
					expect(result.status, result.stderr).toBe(0);
					expect(result.stdout).toContain("✓ FINDINGS RATCHET PASSED");
				} else {
					expect(result.status).toBe(1);
					expect(result.stderr).toContain("FINDINGS RATCHET FAILED");
					expect(stderrCodes(result.stderr)).toEqual(control.codes);
					if (control.says !== undefined) {
						expect(result.stderr).toContain(control.says);
					}
				}
				// A failing, refused or passing check never writes: the directory is as it was.
				expect(readFileSync(file, "utf8")).toBe(contents);
				assertDirEffect(before, snapshotDir(dir), {});
			} finally {
				rmSync(repo, { recursive: true, force: true });
			}
		},
	);

	test("a second --write after a successful prune changes nothing (idempotent)", () => {
		const stale = doc({ a11y: true }, [entry("a11y", STORY, "x")]);
		const repo = makeRepo(stale);
		try {
			const index = writeIndex(repo, [OTHER]);
			const dir = path.join(repo, "docs", "evidence");
			const first = runRatchet(repo, [
				"--write",
				"--base",
				"main",
				"--index",
				index,
			]);
			expect(first.status, first.stderr).toBe(0);
			expect(first.stdout).toContain("pruned 1 stale entries");
			const afterFirst = snapshotDir(dir);
			const second = runRatchet(repo, [
				"--write",
				"--base",
				"main",
				"--index",
				index,
			]);
			expect(second.status, second.stderr).toBe(0);
			expect(second.stdout).toContain("pruned 0 stale entries");
			assertDirEffect(afterFirst, snapshotDir(dir), {});
		} finally {
			rmSync(repo, { recursive: true, force: true });
		}
	});

	test("an entry added to an a11y-p72 kind that exists at the merge-base is added (axe control beside the register one)", () => {
		const kinds = { a11y: true, "a11y-p72": true };
		const base = doc(kinds, [entry("a11y-p72", STORY, "color-contrast")]);
		const head = doc(kinds, [
			entry("a11y-p72", STORY, "color-contrast"),
			entry("a11y-p72", OTHER, "color-contrast"),
		]);
		expect(codes(check({ head, base }))).toEqual(["added"]);
	});
});

describe("findings ratchet: every code has a control (D-30)", () => {
	const NEW_CODES = [
		"unknown-kind",
		"bad-disposition",
		"bad-severity",
		"bad-slug",
		"verdict-shape",
		"reject-unrecorded",
		"verdict-orphan",
		"verdict-rewritten",
	];

	test("FINDINGS_RATCHET_CODES is frozen, sorted and free of duplicates", () => {
		expect(Object.isFrozen(FINDINGS_RATCHET_CODES)).toBe(true);
		expect([...FINDINGS_RATCHET_CODES]).toEqual(
			[...new Set(FINDINGS_RATCHET_CODES)].sort(),
		);
	});

	test("every new code is in the list and is the expected code of at least one unit control", () => {
		const unitCodes = REGISTER_UNITS.flatMap((unit) => unit[2]);
		for (const code of NEW_CODES) {
			expect(FINDINGS_RATCHET_CODES, code).toContain(code);
			expect(unitCodes, code).toContain(code);
		}
	});

	test("every control expects a code the script can emit, and the SC4 codes also have a temp-repo run", () => {
		const unitCodes = REGISTER_UNITS.flatMap((unit) => unit[2]);
		const cliCodes = CLI_CASES.flatMap((control) => control.codes);
		for (const code of [...unitCodes, ...cliCodes]) {
			expect(FINDINGS_RATCHET_CODES, code).toContain(code);
		}
		// The SC4 behaviours with a run against a real temp git repo: the rest are shown
		// by units only (a slug, a severity or a verdict shape is not a repository fact).
		for (const code of [
			"unknown-kind",
			"bad-disposition",
			"reject-unrecorded",
			"verdict-orphan",
			"verdict-rewritten",
			"entry-field",
			"stale",
			"added",
			"new-kind-unsealed",
		]) {
			expect(cliCodes, code).toContain(code);
		}
	});

	test("the register kinds are the closed list of D-27 and none is named a11y", () => {
		expect([...REGISTER_KINDS]).toEqual([
			"access-gap",
			"dead-end",
			"i18n-gap",
			"layout-gap",
			"silent-failure",
			"token-gap",
			"unrendered-outcome",
		]);
		expect(REGISTER_KINDS.some((kind) => kind.startsWith("a11y"))).toBe(false);
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
