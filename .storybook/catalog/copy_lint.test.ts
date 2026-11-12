import { describe, expect, test } from "vitest";
import en from "../../.resources/locales/en.json";
import brandPin from "../../brand.pin.json";
import copyFindings from "./copy-findings.json";
import glossary from "./glossary.json";
import {
	RULE_CODES,
	buildRuleset,
	excusedTemplates,
	lintText,
	normalizeForLint,
	selfTestProblems,
	templatePattern,
	validateRules,
} from "./copy_lint.mjs";
import rules from "./copy_lint_rules.json";

const ruleset = buildRuleset(rules, glossary);

function ids(text: string): string[] {
	return lintText(text, ruleset).map((hit) => hit.ruleId);
}

// Anti-vacuity: an empty or truncated rules file changes this list.
const FILE_RULE_IDS = [
	"banned.just",
	"banned.simply",
	"banned.easy",
	"banned.scrub",
	"banned.wipe",
	"banned.nuke",
	"banned.destroy",
	"banned.secure",
	"banned.anonymous",
	"banned.100pct",
	"banned.guaranteed",
	"banned.error-code",
	"banned.exclamation",
	"banned.please",
	"banned.free-caps",
	"banned.fear",
	"name.spaced",
	"name.miscased",
	"name.abbrev",
	"name.verb",
];

// Derived from the glossary avoid lists, sorted by id by code unit. An avoid
// word that a banned or name rule already catches (scrub, wipe, nuke, destroy,
// secure, anonymous, untraceable, exif cleaner) has no derived rule.
const DERIVED_RULE_IDS = [
	"vocab|cleaned-copy|output",
	"vocab|fields|attribute",
	"vocab|fields|attributes",
	"vocab|fields|info",
	"vocab|fields|tag",
	"vocab|fields|tags",
	"vocab|metadata|exif data",
	"vocab|no-network-access|offline mode",
	"vocab|no-network-access|online mode",
	"vocab|open-source|free software",
	"vocab|open-source|free software project",
	"vocab|original|input",
	"vocab|original|source file",
	"vocab|save-as-copy|back up",
	"vocab|save-as-copy|backup",
	"vocab|save-as-copy|duplicate",
	"vocab|unchanged|untouched",
];

describe("the ruleset", () => {
	test("the ruleset ids equal the pinned list (file rules, then derived rules)", () => {
		expect(ruleset.rules.map((rule) => rule.id)).toEqual([
			...FILE_RULE_IDS,
			...DERIVED_RULE_IDS,
		]);
	});

	test("the real rules file is valid against the pinned brand commit", () => {
		expect(validateRules(rules, brandPin.commit)).toEqual([]);
	});

	test("shown red: every rule fires on its bad and not on its ok (self-test is empty)", () => {
		expect(selfTestProblems(ruleset)).toEqual([]);
	});

	test.each(ruleset.rules.map((rule) => [rule.id, rule.bad, rule.ok] as const))(
		"shown red: every rule fires on its bad and not on its ok: %s",
		(id, bad, ok) => {
			expect(ids(bad)).toContain(id);
			expect(ids(ok)).not.toContain(id);
		},
	);

	test("shown red: a bad that does not fire its rule, and an ok that does, are each reported", () => {
		const first = rules.rules[0];
		const second = rules.rules[1];
		if (first === undefined || second === undefined) throw new Error("rules");
		const mutated = buildRuleset(
			{
				...rules,
				rules: [
					{ ...first, bad: "Drop a file." },
					{ ...second, ok: "Simply drop a file." },
				],
			},
			{ terms: [] },
		);
		expect(selfTestProblems(mutated)).toEqual([
			{ ruleId: "banned.just", side: "bad" },
			{ ruleId: "banned.simply", side: "ok" },
		]);
	});

	test("banned messages name the glossary substitution (I-3)", () => {
		const byWord: Array<[string, string]> = [
			["banned.scrub", "scrub"],
			["banned.wipe", "wipe"],
			["banned.nuke", "nuke"],
			["banned.destroy", "destroy"],
			["banned.secure", "secure"],
			["banned.anonymous", "anonymous"],
		];
		for (const [ruleId, word] of byWord) {
			const term = glossary.terms.find((candidate) =>
				candidate.avoid.includes(word),
			);
			const rule = rules.rules.find((candidate) => candidate.id === ruleId);
			expect(term, `${word} is listed under avoid`).toBeDefined();
			expect(rule?.message).toContain(term?.ui_label);
		}
	});
});

describe("matching", () => {
	test("two rules on one string: lintText('Just scrub it') ids equal exactly [banned.just, banned.scrub]", () => {
		expect(ids("Just scrub it")).toEqual(["banned.just", "banned.scrub"]);
	});

	test("banned.fear reports one hit per rule and quotes the brand's inclusive rule", () => {
		expect(ids("Protect yourself from hackers and stalkers")).toEqual([
			"banned.fear",
		]);
		expect(ids("if you have something to hide")).toContain("banned.fear");
		expect(ids("Metadata, removed.")).toEqual([]);
	});

	test("a derived rule is not generated for an avoid word a banned rule catches", () => {
		expect(ids("Scrub the file")).toEqual(["banned.scrub"]);
	});

	test("100% alone does not hit; 100% before a claim word does", () => {
		expect(ids("100% of 12 cleaned")).toEqual([]);
		expect(ids("100% secure")).toContain("banned.100pct");
	});

	test("information does not hit the info rule", () => {
		expect(ids("File information")).toEqual([]);
	});

	test("empty text is clean", () => {
		expect(lintText("", ruleset)).toEqual([]);
	});

	test("a curly-quoted or NBSP-spaced variant of a banned word still hits", () => {
		expect(ids("“Just” drop")).toContain("banned.just");
		expect(ids("Just drop")).toContain("banned.just");
		expect(ids("Remove exif data")).toContain("vocab|metadata|exif data");
	});

	test("matching is case-insensitive except the FREE rule and the name rules", () => {
		expect(ids("JUST drop")).toContain("banned.just");
		expect(ids("FREE download")).toContain("banned.free-caps");
		expect(ids("Free download")).toEqual([]);
		expect(ids("EXIFCleaner is open source.")).toContain("name.miscased");
		expect(ids("ExifCleaner is open source.")).toEqual([]);
	});

	test("normalizeForLint maps quotes, NBSP and whitespace runs", () => {
		expect(normalizeForLint("  ‘a’  “b”\n c ")).toBe(`'a' "b" c`);
	});

	test("shown red: a leftover brace throws instead of matching nothing", () => {
		expect(() => normalizeForLint("unbalanced {x")).toThrow(
			/unbalanced placeholder brace/,
		);
		expect(() => lintText("stray } brace", ruleset)).toThrow(
			/unbalanced placeholder brace/,
		);
	});

	test("shown red: an invalid pattern throws naming the rule id", () => {
		const first = rules.rules[0];
		if (first === undefined) throw new Error("rules");
		const broken = {
			...rules,
			rules: [{ ...first, id: "banned.broken", pattern: "(" }],
		};
		expect(() => buildRuleset(broken, glossary)).toThrow(/banned\.broken/);
	});
});

describe("the vocabulary masking contract", () => {
	test("a placeholder touching a word does not hide it", () => {
		expect(ids("{count} tags removed")).toContain("vocab|fields|tags");
		expect(ids("{count}tags")).toContain("vocab|fields|tags");
	});

	test("the OS-owned multi-word labels are masked, not reported", () => {
		const vocab = (text: string) =>
			ids(text).filter((id) => id.startsWith("vocab|"));
		expect(vocab("Remove macOS attributes")).toEqual([]);
		expect(
			vocab("Remove quarantine, download origin, and Finder tags"),
		).toEqual([]);
	});

	test("the real xattrFailedSummary is a finding, not masked", () => {
		expect(
			ids(
				"Metadata was removed, but macOS extended attributes could not be cleared.",
			),
		).toContain("vocab|fields|attributes");
	});

	test("a multi-word label adjacent to an avoid word is masked for its own span only", () => {
		expect(ids("Finder tags tags")).toEqual(["vocab|fields|tags"]);
		expect(ids("Finder tags")).toEqual([]);
	});

	test("a single-word label is never masked", () => {
		// "original" is a single-word label: it must not hide the avoid word beside it.
		expect(ids("original input")).toContain("vocab|original|input");
	});

	test("every glossary-derived rule fires on its avoid word and not on its label", () => {
		const derived = ruleset.rules.filter((rule) => rule.derived);
		expect(derived.map((rule) => rule.id)).toEqual(DERIVED_RULE_IDS);
		for (const rule of derived) {
			expect(ids(rule.bad), rule.id).toContain(rule.id);
			expect(ids(rule.ok), rule.id).not.toContain(rule.id);
		}
	});
});

describe("validateRules", () => {
	function withFirst(patch: Record<string, unknown>): unknown {
		const [first, ...rest] = rules.rules;
		return { ...rules, rules: [{ ...first, ...patch }, ...rest] };
	}
	function without(key: string): unknown {
		const [first, ...rest] = rules.rules;
		const copy: Record<string, unknown> = { ...first };
		Reflect.deleteProperty(copy, key);
		return { ...rules, rules: [copy, ...rest] };
	}
	const first = rules.rules[0];
	const MALFORMED: ReadonlyArray<[string, unknown, string]> = [
		["a non-object document", [], "not-object"],
		["schemaVersion 2", { ...rules, schemaVersion: 2 }, "schema-version"],
		["an unknown top-level key", { ...rules, extra: 1 }, "unknown-field"],
		["a rule missing ok", without("ok"), "missing-field"],
		["an empty message", withFirst({ message: "" }), "bad-field"],
		["a bad id", withFirst({ id: "Banned.Just" }), "bad-id"],
		[
			"an id prefix that is not its category",
			withFirst({ id: "name.just" }),
			"id-category-mismatch",
		],
		[
			"a duplicate id",
			{ ...rules, rules: [...rules.rules, first] },
			"duplicate-id",
		],
		["an unknown category", withFirst({ category: "vocab" }), "bad-category"],
		["flags g", withFirst({ flags: "g" }), "bad-flags"],
		[
			"a pattern that does not compile",
			withFirst({ pattern: "(" }),
			"bad-pattern",
		],
		[
			"an unknown basis",
			withFirst({ source: { ...first?.source, basis: "invented" } }),
			"bad-basis",
		],
		[
			"a different brand pin",
			{ ...rules, brandPin: "0".repeat(40) },
			"brand-pin",
		],
	];

	test.each(MALFORMED)(
		"shown red: %s yields exactly its code",
		(_name, doc, code) => {
			const problems = validateRules(doc, brandPin.commit);
			expect(problems.map((found) => found.code)).toEqual([code]);
		},
	);

	test("the mutant codes equal the validator's code set", () => {
		expect(MALFORMED.map(([, , code]) => code).sort()).toEqual(
			[...RULE_CODES].sort(),
		);
	});

	test("a clone whose pin differs from brand.pin.json is rejected", () => {
		const problems = validateRules(
			{ ...rules, brandPin: "f".repeat(40) },
			brandPin.commit,
		);
		expect(problems).toHaveLength(1);
		expect(problems[0]?.code).toBe("brand-pin");
	});
});

describe("the real en.json", () => {
	test("the (key, ruleId) hits over every key equal the measured seed", () => {
		const hits: string[] = [];
		for (const [key, value] of Object.entries(en)) {
			for (const hit of lintText(value, ruleset)) {
				hits.push(`${key} ${hit.ruleId}`);
			}
		}
		expect(hits.sort()).toEqual(
			[
				"cleanupFailedSummary vocab|cleaned-copy|output",
				"intake.outputCopy vocab|unchanged|untouched",
				"settings.saveAsCopy.description vocab|unchanged|untouched",
				"statusBar.tagsRemoved vocab|fields|tags",
				"verificationFailedSummary vocab|cleaned-copy|output",
				"writeFailedSummary vocab|cleaned-copy|output",
				"xattrFailedSummary vocab|fields|attributes",
			].sort(),
		);
	});
});

describe("excused templates (D-12)", () => {
	test("a template matches its own string whole, with each placeholder as a run of text", () => {
		const template = templatePattern("{count} tags removed");
		expect(template.test("3 tags removed")).toBe(true);
		expect(template.test("12 TAGS REMOVED")).toBe(true);
		expect(template.test("3 tags remain")).toBe(false);
		expect(template.test("Done: 3 tags removed. Just now")).toBe(false);
	});

	test("regex characters in the en value stay literal", () => {
		const template = templatePattern("Copy (all) [now]?");
		expect(template.test("Copy (all) [now]?")).toBe(true);
		expect(template.test("Copy all now")).toBe(false);
	});

	test("one template per baselined vocab, banned or name en finding, none for the other kinds", () => {
		const templates = excusedTemplates(copyFindings, en);
		const baselined = new Set(
			copyFindings.entries
				.filter(
					(entry) =>
						["vocab", "banned", "name"].includes(entry.kind) &&
						entry.ref.startsWith("en:"),
				)
				.map((entry) => entry.ref),
		);
		expect(templates).toHaveLength(baselined.size);
		expect(baselined.size).toBe(7);
		expect(templates.some((t) => t.test("5 tags removed"))).toBe(true);
	});

	test("shown red: a register with no baselined en finding excuses nothing", () => {
		expect(excusedTemplates({ entries: [] }, en)).toEqual([]);
		expect(() => excusedTemplates({}, en)).toThrow(/malformed/);
	});
});
