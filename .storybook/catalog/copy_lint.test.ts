import { expect, test } from "vitest";
import brandPin from "../../brand.pin.json";
import glossary from "./glossary.json";
import {
	buildRuleset,
	normalizeForLint,
	selfTestProblems,
	validateRules,
} from "./copy_lint.mjs";
import rules from "./copy_lint_rules.json";

test("shown red: every rule fires on its bad and not on its ok", () => {
	expect(selfTestProblems(buildRuleset(rules, glossary))).toEqual([]);
});

test("the real rules file is valid against the pinned brand commit", () => {
	expect(validateRules(rules, brandPin.commit)).toEqual([]);
});

test("shown red: a leftover brace throws instead of matching nothing", () => {
	expect(() => normalizeForLint("unbalanced {x")).toThrow(
		/unbalanced placeholder brace/,
	);
});

test("shown red: an invalid pattern throws naming the rule id", () => {
	const broken = {
		...rules,
		rules: [{ ...rules.rules[0], id: "banned.broken", pattern: "(" }],
	};
	expect(() => buildRuleset(broken, glossary)).toThrow(/banned\.broken/);
});
