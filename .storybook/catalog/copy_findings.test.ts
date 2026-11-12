import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { assertDirEffect, snapshotDir } from "../../tests/helpers/dir_effect";
import en from "../../.resources/locales/en.json";
import { canonicalJson } from "./closed.mjs";
import {
	COPY_FINDINGS_CODES,
	COPY_FINDINGS_PATH,
	check,
	fingerprintFor,
	loadObservation,
	observationFrom,
	observeDeviations,
	prune,
	validateRegister,
} from "./copy_findings_ratchet.mjs";
import { buildRuleset } from "./copy_lint.mjs";
import rules from "./copy_lint_rules.json";
import glossary from "./glossary.json";
import { scanRenderer, uniquePairs } from "./hardcoded_scan.mjs";
import {
	git,
	makeCatalogRepo,
	realScript,
	repoRoot,
	runNode,
} from "./temp_repo";

const RATCHET = ".storybook/catalog/copy_findings_ratchet.mjs";
const REGISTER_TEXT = fs.readFileSync(
	path.join(repoRoot, COPY_FINDINGS_PATH),
	"utf8",
);
const REAL = JSON.parse(REGISTER_TEXT) as {
	schemaVersion: number;
	entries: Array<Record<string, string>>;
};
const RULESET = buildRuleset(rules, glossary);
const PAIRS = uniquePairs(scanRenderer(repoRoot));
const REAL_OBSERVATION = loadObservation(repoRoot);

function observationWith(
	dictionary: Record<string, string>,
	readText: (relPath: string) => string | null = REAL_OBSERVATION.readText,
) {
	return observationFrom({
		en: dictionary,
		ruleset: RULESET,
		pairs: PAIRS,
		readText,
	});
}

function codes(result: { problems: Array<{ code: string }> }): string[] {
	return result.problems.map((found) => found.code);
}

describe("the real register", () => {
	test("is valid, canonical and seeded", () => {
		expect(validateRegister(REAL)).toEqual([]);
		expect(REGISTER_TEXT).toBe(canonicalJson(REAL));
		const kinds = new Set(REAL.entries.map((entry) => entry["kind"]));
		expect([...kinds].sort()).toEqual(["hardcoded", "main", "manual", "vocab"]);
		expect(REAL.entries.filter((e) => e["kind"] === "hardcoded")).toHaveLength(
			18,
		);
	});

	test("passes against a missing merge-base copy (bootstrap) and reports it", () => {
		const result = check({
			head: REAL,
			base: null,
			observation: REAL_OBSERVATION,
		});
		expect(result.problems).toEqual([]);
		expect(result.ok).toBe(true);
		expect(result.notes).toEqual(["bootstrap"]);
	});

	test("observes every current deviation: 7 en lint hits and 18 hardcoded pairs", () => {
		const observed = observeDeviations({
			en,
			ruleset: RULESET,
			pairs: PAIRS,
		});
		expect(observed.filter((o) => o.surface === "en")).toHaveLength(7);
		expect(observed.filter((o) => o.kind === "hardcoded")).toHaveLength(18);
		const sorted = [...observed].sort((a, b) =>
			a.fingerprint < b.fingerprint ? -1 : 1,
		);
		expect(observed).toEqual(sorted);
	});
});

describe("fingerprints", () => {
	test("use the per-kind formats, never a line number", () => {
		expect(
			fingerprintFor("vocab", ["fields", "tags", "en:statusBar.tagsRemoved"]),
		).toBe("vocab|fields|tags|en:statusBar.tagsRemoved");
		expect(fingerprintFor("banned", ["banned.just", "en:x"])).toBe(
			"banned|banned.just|en:x",
		);
		expect(fingerprintFor("name", ["name.spaced", "en:x"])).toBe(
			"name|name.spaced|en:x",
		);
		expect(fingerprintFor("hardcoded", ["src:a.tsx", "Close"])).toBe(
			"hardcoded|src:a.tsx|Close",
		);
		expect(fingerprintFor("main", ["src:a.ts", "Reveal"])).toBe(
			"main|src:a.ts|Reveal",
		);
		expect(fingerprintFor("manual", ["apostrophe-mix"])).toBe(
			"manual|apostrophe-mix",
		);
	});

	test("an unknown kind or a wrong part count throws", () => {
		expect(() => fingerprintFor("nope", ["x"])).toThrow(/unknown finding kind/);
		expect(() => fingerprintFor("banned", ["only-one"])).toThrow(/2 parts/);
	});
});

// A tiny planted register for the structural cases.
const VOCAB_REF = "en:a.tags";
const HARD_REF = "src:src/renderer/components/ui/StatusIcon.tsx";
function entry(over: Record<string, string> = {}): Record<string, string> {
	return {
		fingerprint: fingerprintFor("hardcoded", [HARD_REF, "Pending"]),
		kind: "hardcoded",
		surface: "renderer",
		ref: HARD_REF,
		text: "Pending",
		disposition: "fix-v5.1",
		reason: "planted for a test",
		...over,
	};
}
const FIRST = entry();
const SECOND = entry({
	fingerprint: fingerprintFor("vocab", ["fields", "tags", VOCAB_REF]),
	kind: "vocab",
	surface: "en",
	ref: VOCAB_REF,
	text: "{count} tags removed",
});
function doc(entries: unknown[] = [FIRST, SECOND]): Record<string, unknown> {
	return { schemaVersion: 1, entries };
}
function without(source: Record<string, string>, key: string) {
	const copy: Record<string, string> = { ...source };
	Reflect.deleteProperty(copy, key);
	return copy;
}

describe("validateRegister", () => {
	test("a planted valid register is clean", () => {
		expect(validateRegister(doc())).toEqual([]);
	});

	const MALFORMED: ReadonlyArray<[string, unknown, string]> = [
		["shown red: a non-object yields exactly its code", [], "not-object"],
		[
			"shown red: schemaVersion 2 yields exactly its code",
			{ ...doc(), schemaVersion: 2 },
			"schema-version",
		],
		[
			"shown red: an unknown entry field yields exactly its code",
			doc([FIRST, { ...SECOND, extra: "x" }]),
			"unknown-field",
		],
		[
			"shown red: an entry without reason yields exactly its code",
			doc([FIRST, without(SECOND, "reason")]),
			"missing-field",
		],
		[
			"shown red: unclassified bad-kind yields exactly its code",
			doc([FIRST, { ...SECOND, kind: "nope" }]),
			"bad-kind",
		],
		[
			"shown red: unclassified bad-surface yields exactly its code",
			doc([FIRST, { ...SECOND, surface: "nowhere" }]),
			"bad-surface",
		],
		[
			"shown red: unclassified bad-disposition yields exactly its code",
			doc([FIRST, { ...SECOND, disposition: "later" }]),
			"bad-disposition",
		],
		[
			"shown red: unclassified empty-reason yields exactly its code",
			doc([FIRST, { ...SECOND, reason: "" }]),
			"empty-reason",
		],
		[
			"a fingerprint that does not match its kind, ref and text",
			doc([FIRST, { ...SECOND, fingerprint: `${SECOND["fingerprint"]}x` }]),
			"bad-fingerprint",
		],
		[
			"shown red: a duplicate yields exactly its code",
			doc([FIRST, SECOND, SECOND]),
			"duplicate",
		],
		[
			"shown red: an unsorted list yields exactly its code",
			doc([SECOND, FIRST]),
			"unsorted",
		],
	];

	test.each(MALFORMED)("%s", (_name, input, code) => {
		expect(validateRegister(input).map((found) => found.code)).toEqual([code]);
	});

	test("the mutant codes equal the validator's code set minus the check codes", () => {
		const checkCodes = ["base-invalid", "added", "unlisted", "stale"];
		expect(MALFORMED.map(([, , code]) => code).sort()).toEqual(
			COPY_FINDINGS_CODES.filter((code) => !checkCodes.includes(code)).sort(),
		);
	});

	test("a closed enum rejects an unknown kind (the Phase 70 WR-03 hole is not inherited)", () => {
		expect(
			validateRegister(doc([FIRST, { ...SECOND, kind: "a11y-new" }])).map(
				(found) => found.code,
			),
		).toEqual(["bad-kind"]);
	});
});

describe("check", () => {
	const PLANTED_EN = {
		"a.tags": "{count} tags removed",
		"b.ok": "Metadata, removed.",
	};
	const plantedObservation = observationFrom({
		en: PLANTED_EN,
		ruleset: RULESET,
		pairs: [
			{ path: "src/renderer/components/ui/StatusIcon.tsx", literal: "Pending" },
		],
		readText: () => null,
	});

	test("a planted register that lists exactly what is observed passes", () => {
		expect(
			check({ head: doc(), base: doc(), observation: plantedObservation }),
		).toEqual({ ok: true, problems: [], notes: [] });
	});

	test("shown red: added entry", () => {
		const result = check({
			head: doc(),
			base: doc([FIRST]),
			observation: plantedObservation,
		});
		expect(result.ok).toBe(false);
		expect(codes(result)).toEqual(["added"]);
		expect(result.problems[0]?.message).toContain(
			String(SECOND["fingerprint"]),
		);
	});

	test("shown red: unlisted deviation", () => {
		const result = check({
			head: REAL,
			base: null,
			observation: observationWith({ ...en, x: "Just clean it" }),
		});
		expect(codes(result)).toEqual(["unlisted"]);
		expect(result.problems[0]?.message).toContain("banned|banned.just|en:x");
	});

	test("shown red: stale lint entry", () => {
		const result = check({
			head: REAL,
			base: null,
			observation: observationWith({
				...en,
				"statusBar.tagsRemoved": "{count} fields removed",
			}),
		});
		expect(codes(result)).toEqual(["stale"]);
		expect(result.problems[0]?.message).toContain(
			"vocab|fields|tags|en:statusBar.tagsRemoved",
		);
	});

	test("shown red: stale main literal", () => {
		const real = REAL_OBSERVATION.readText;
		const result = check({
			head: REAL,
			base: null,
			observation: observationWith(en, (relPath) => {
				const text = real(relPath);
				return relPath === "src/main/reveal_handlers.ts" && text !== null
					? text.replaceAll("Reveal Original", "Reveal the original")
					: text;
			}),
		});
		expect(codes(result)).toEqual(["stale"]);
		expect(result.problems[0]?.message).toContain(
			"main|src:src/main/reveal_handlers.ts|Reveal Original",
		);
	});

	test("shown red: stale manual ref", () => {
		const trimmed: Record<string, string> = { ...en };
		Reflect.deleteProperty(trimmed, "metadata.field.preserved");
		const result = check({
			head: REAL,
			base: null,
			observation: observationWith(trimmed),
		});
		expect(codes(result)).toEqual(["stale"]);
		expect(result.problems[0]?.message).toContain(
			"manual|metadata-field-preserved",
		);
	});

	test("a malformed register stops the check with its validation problems only", () => {
		const result = check({
			head: doc([FIRST, { ...SECOND, reason: "" }]),
			base: null,
			observation: plantedObservation,
		});
		expect(codes(result)).toEqual(["empty-reason"]);
	});

	test("a malformed merge-base copy is reported as base-invalid", () => {
		const result = check({
			head: doc(),
			base: { schemaVersion: 2, entries: [] },
			observation: plantedObservation,
		});
		expect(codes(result)).toEqual(["base-invalid"]);
	});
});

describe("prune", () => {
	test("removes stale entries and nothing else", () => {
		const result = prune({
			head: REAL,
			base: null,
			observation: observationWith({
				...en,
				"statusBar.tagsRemoved": "{count} fields removed",
			}),
		});
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.doc.entries).toHaveLength(REAL.entries.length - 1);
		expect(
			result.doc.entries.some((e) =>
				e.fingerprint.includes("statusBar.tagsRemoved"),
			),
		).toBe(false);
	});

	test("refuses (no document) when an entry was added", () => {
		const result = prune({
			head: REAL,
			base: { schemaVersion: 1, entries: REAL.entries.slice(1) },
			observation: REAL_OBSERVATION,
		});
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.problems.map((found) => found.code)).toEqual(["added"]);
	});

	test("refuses when the register is malformed", () => {
		const result = prune({
			head: { ...REAL, schemaVersion: 2 },
			base: null,
			observation: REAL_OBSERVATION,
		});
		expect(result.ok).toBe(false);
	});
});

// D-31(1), the LANG-03 prohibition: the register ratchet alone allows removals,
// so the raw engine-message fall-through is pinned by fingerprint.
const ENGINE_FILE = "src:src/domain/exif/exif_errors.ts";
const ENGINE_FINGERPRINTS = [
	"main|src:src/domain/exif/exif_errors.ts|Could not start ExifTool at",
	"main|src:src/domain/exif/exif_errors.ts|ExifTool crashed unexpectedly. Restart the app to retry.",
	"main|src:src/domain/exif/exif_errors.ts|ExifTool error:",
	"main|src:src/domain/exif/exif_errors.ts|ExifTool is not running. Restart the app to retry.",
	"main|src:src/domain/exif/exif_errors.ts|ExifTool returned unreadable output. Try processing the file again.",
	"main|src:src/domain/exif/exif_errors.ts|ExifTool took too long to respond. Try processing the file again.",
	"main|src:src/domain/exif/exif_errors.ts|Metadata engine error:",
	"main|src:src/domain/exif/exif_errors.ts|Metadata engine error: native processing failed.",
	"main|src:src/domain/exif/exif_errors.ts|Metadata engine is not running. Restart the app to retry.",
];

function fallThroughProblems(register: {
	entries: Array<Record<string, string>>;
}): string[] {
	const mine = register.entries.filter(
		(entry) => entry["kind"] === "main" && entry["ref"] === ENGINE_FILE,
	);
	const problems: string[] = [];
	const listed = mine.map((entry) => entry["fingerprint"] ?? "").sort();
	if (
		JSON.stringify(listed) !== JSON.stringify([...ENGINE_FINGERPRINTS].sort())
	) {
		problems.push("the pinned engine-message entries changed");
	}
	for (const entry of mine) {
		if (entry["disposition"] !== "fix-v5.2") {
			problems.push(`${entry["fingerprint"]} is not fix-v5.2`);
		}
		if (!(entry["reason"] ?? "").includes("D-31(1)")) {
			problems.push(`${entry["fingerprint"]} lost D-31(1) from its reason`);
		}
	}
	return problems;
}

describe("engine fall-through stays listed", () => {
	test("engine fall-through stays listed: the real entries are pinned, fix-v5.2 and cite D-31(1)", () => {
		expect(fallThroughProblems(REAL)).toEqual([]);
	});

	test("shown red: a clone with one engine entry removed fails", () => {
		const clone = {
			entries: REAL.entries.filter(
				(entry) => entry["fingerprint"] !== ENGINE_FINGERPRINTS[0],
			),
		};
		expect(fallThroughProblems(clone)).toEqual([
			"the pinned engine-message entries changed",
		]);
	});

	test("shown red: a clone with one engine entry relabelled accept fails", () => {
		const clone = {
			entries: REAL.entries.map((entry) =>
				entry["fingerprint"] === ENGINE_FINGERPRINTS[0]
					? { ...entry, disposition: "accept" }
					: entry,
			),
		};
		expect(fallThroughProblems(clone)).toEqual([
			`${ENGINE_FINGERPRINTS[0]} is not fix-v5.2`,
		]);
	});
});

// CLI against a temp git repository: every test makes its own repository, so
// parallel workers share no files.
function withRepo(body: (repo: string) => void): void {
	const repo = makeCatalogRepo();
	try {
		body(repo);
	} finally {
		fs.rmSync(repo, { recursive: true, force: true });
	}
}

function run(repo: string, args: string[]) {
	return runNode(realScript(RATCHET), args, repo);
}

// Commits `mutate(register text)` on main, then restores the full register in
// the working tree, so the merge-base copy differs from the working copy.
function rewriteBase(
	repo: string,
	mutate: (text: string) => string | null,
): void {
	const file = path.join(repo, COPY_FINDINGS_PATH);
	const full = fs.readFileSync(file, "utf8");
	const next = mutate(full);
	if (next === null) {
		git(repo, ["rm", "-q", COPY_FINDINGS_PATH]);
	} else {
		fs.writeFileSync(file, next);
		git(repo, ["add", COPY_FINDINGS_PATH]);
	}
	git(repo, ["commit", "-q", "-m", "base differs"]);
	fs.writeFileSync(file, full);
}

function dropEntry(text: string, needle: string): string {
	const parsed = JSON.parse(text) as {
		entries: Array<{ fingerprint: string }>;
	};
	return canonicalJson({
		...parsed,
		entries: parsed.entries.filter((e) => !e.fingerprint.includes(needle)),
	});
}

describe("copy_findings_ratchet.mjs against a temp git repo", () => {
	test("--check passes in a fresh repo", () => {
		withRepo((repo) => {
			const result = run(repo, ["--check", "--base", "main"]);
			expect(result.status, result.stderr).toBe(0);
			expect(result.stdout).toContain("COPY FINDINGS RATCHET PASSED");
		});
	});

	test("shown red: added entry via CLI exits 1, says added and changes nothing", () => {
		withRepo((repo) => {
			rewriteBase(repo, (text) => dropEntry(text, "manual|apostrophe-mix"));
			const before = snapshotDir(repo);
			const result = run(repo, ["--check", "--base", "main"]);
			expect(result.status).toBe(1);
			expect(result.stderr).toContain("COPY FINDINGS RATCHET FAILED");
			expect(result.stderr).toContain("added");
			assertDirEffect(before, snapshotDir(repo), {});
			const write = run(repo, ["--write", "--base", "main"]);
			expect(write.status).toBe(1);
			expect(write.stderr).toContain("refusing to write");
			assertDirEffect(before, snapshotDir(repo), {});
		});
	});

	test("--write with only a stale entry removes it and modifies only the register", () => {
		withRepo((repo) => {
			const source = path.join(repo, "src/main/reveal_handlers.ts");
			fs.writeFileSync(
				source,
				fs
					.readFileSync(source, "utf8")
					.replaceAll("Reveal Original", "Reveal the original"),
			);
			const staleCheck = run(repo, ["--check", "--base", "main"]);
			expect(staleCheck.status).toBe(1);
			expect(staleCheck.stderr).toContain("stale");
			const before = snapshotDir(repo);
			const result = run(repo, ["--write", "--base", "main"]);
			expect(result.status, result.stderr).toBe(0);
			assertDirEffect(before, snapshotDir(repo), {
				modified: [COPY_FINDINGS_PATH],
			});
			expect(run(repo, ["--check", "--base", "main"]).status).toBe(0);
		});
	});

	test("a base without the register passes once as bootstrap", () => {
		withRepo((repo) => {
			rewriteBase(repo, () => null);
			const result = run(repo, ["--check", "--base", "main"]);
			expect(result.status, result.stderr).toBe(0);
			expect(result.stdout).toContain("bootstrap");
		});
	});

	test("shown red: truncated register fails the parse and changes nothing", () => {
		withRepo((repo) => {
			const file = path.join(repo, COPY_FINDINGS_PATH);
			const text = fs.readFileSync(file, "utf8");
			fs.writeFileSync(file, text.slice(0, Math.floor(text.length / 2)));
			const before = snapshotDir(repo);
			const result = run(repo, ["--check", "--base", "main"]);
			expect(result.status).toBe(1);
			expect(result.stderr).toContain("copy-findings.json");
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

	test("shown red: a missing base ref fails closed naming git fetch origin", () => {
		withRepo((repo) => {
			const result = run(repo, ["--check", "--base", "origin/nowhere"]);
			expect(result.status).toBe(1);
			expect(result.stderr).toContain("git fetch origin");
		});
	});
});

// WR-02 shape (tests/scripts/entry_point_symlink.test.ts): started through a
// symlink the CLI must still run and fail closed, never exit 0 silently.
describe("copy_findings_ratchet.mjs started through a symlink", () => {
	function withTmp(body: (tmp: string) => void): void {
		// realpath: os.tmpdir() is itself a symlink on macOS (/var -> /private/var).
		const tmp = fs.realpathSync(
			fs.mkdtempSync(path.join(os.tmpdir(), "copy-findings-symlink-")),
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
			const result = runNode(path.join(link, RATCHET), [], tmp);
			expect(result.status, result.stderr).toBe(1);
			expect(result.stderr).toContain("pass exactly one of --check or --write");
			assertDirEffect(before, snapshotDir(tmp), {});
		});
	});

	test("shown red: symlinked start through a symlink to the script file", () => {
		withTmp((tmp) => {
			const link = path.join(tmp, "ratchet-link.mjs");
			fs.symlinkSync(realScript(RATCHET), link);
			const before = snapshotDir(tmp);
			const result = runNode(link, [], tmp);
			expect(result.status, result.stderr).toBe(1);
			expect(result.stderr).toContain("pass exactly one of --check or --write");
			assertDirEffect(before, snapshotDir(tmp), {});
		});
	});
});
