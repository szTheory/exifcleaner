// Brand copy-lint engine (Phase 71, LANG-02, D-09 as amended by A-1).
//
// Pure and browser-safe: no imports at all, every datum arrives as a
// parameter, and there is no module-level mutable state. preview.tsx, the unit
// tests and the ratchet CLIs import this one file. Rules live in
// copy_lint_rules.json; vocabulary rules are derived from the glossary avoid
// lists at build time, never written twice.

export const RULE_CATEGORIES = Object.freeze(["banned", "name", "structural"]);

export const RULE_BASES = Object.freeze(["rule", "example", "project"]);

// One code per way validateRules can fail; a test pins one mutant per code.
export const RULE_CODES = Object.freeze([
	"bad-basis",
	"bad-category",
	"bad-field",
	"bad-flags",
	"bad-id",
	"bad-pattern",
	"brand-pin",
	"duplicate-id",
	"id-category-mismatch",
	"missing-field",
	"not-object",
	"schema-version",
	"unknown-field",
]);

// A non-word character, so a masked placeholder never joins or splits a word
// for `\b` (a placeholder touching a word does not hide it).
const MASK = "￼";

const RULE_KEYS = [
	"id",
	"category",
	"pattern",
	"flags",
	"message",
	"source",
	"bad",
	"ok",
];
const RULE_OPTIONAL_KEYS = ["allow"];
const SOURCE_KEYS = ["section", "quote", "basis"];
const ID_PATTERN = /^(banned|name|structural)\.[a-z0-9-]+$/;

function isPlainObject(value) {
	return (
		typeof value === "object" &&
		value !== null &&
		!Array.isArray(value) &&
		Object.getPrototypeOf(value) === Object.prototype
	);
}

function isNonEmptyString(value) {
	return typeof value === "string" && value.trim() !== "";
}

function compareCodeUnits(a, b) {
	if (a < b) return -1;
	if (a > b) return 1;
	return 0;
}

function closedKeyProblems(obj, required, optional, where) {
	const found = [];
	const allowed = new Set([...required, ...optional]);
	for (const key of Object.keys(obj)) {
		if (!allowed.has(key)) {
			found.push({
				code: "unknown-field",
				message: `${where} has unknown key ${key}`,
			});
		}
	}
	for (const key of required) {
		if (!Object.hasOwn(obj, key)) {
			found.push({
				code: "missing-field",
				message: `${where} is missing ${key}`,
			});
		}
	}
	return found;
}

function escapeRegExp(text) {
	return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Closed-key and value validation of the rules document. Structure first,
 * values second; problems come back sorted by code, then message.
 *
 * @param {unknown} rulesDoc
 * @param {string} brandPin the commit in brand.pin.json
 * @returns {Array<{ code: string, message: string }>}
 */
export function validateRules(rulesDoc, brandPin) {
	if (!isPlainObject(rulesDoc)) {
		return [
			{ code: "not-object", message: "the rules document is not an object" },
		];
	}
	const found = closedKeyProblems(
		rulesDoc,
		["schemaVersion", "brandPin", "rules"],
		[],
		"rules document",
	);
	if (
		Object.hasOwn(rulesDoc, "schemaVersion") &&
		rulesDoc["schemaVersion"] !== 1
	) {
		found.push({ code: "schema-version", message: "schemaVersion must be 1" });
	}
	if (
		Object.hasOwn(rulesDoc, "brandPin") &&
		rulesDoc["brandPin"] !== brandPin
	) {
		found.push({
			code: "brand-pin",
			message: `brandPin ${String(rulesDoc["brandPin"])} is not the pinned brand commit ${brandPin}`,
		});
	}
	const rules = rulesDoc["rules"];
	if (Object.hasOwn(rulesDoc, "rules") && !Array.isArray(rules)) {
		found.push({ code: "bad-field", message: "rules must be a list" });
	}
	if (Array.isArray(rules)) {
		const seen = new Set();
		rules.forEach((rule, index) => {
			const where =
				isPlainObject(rule) && typeof rule["id"] === "string"
					? `rule ${rule["id"]}`
					: `rule #${index}`;
			if (!isPlainObject(rule)) {
				found.push({
					code: "not-object",
					message: `${where} is not an object`,
				});
				return;
			}
			found.push(
				...closedKeyProblems(rule, RULE_KEYS, RULE_OPTIONAL_KEYS, where),
			);
			for (const key of ["id", "category", "pattern", "message", "bad", "ok"]) {
				if (Object.hasOwn(rule, key) && !isNonEmptyString(rule[key])) {
					found.push({
						code: "bad-field",
						message: `${where}: ${key} must be a non-empty string`,
					});
				}
			}
			const id = rule["id"];
			if (typeof id === "string") {
				if (!ID_PATTERN.test(id)) {
					found.push({
						code: "bad-id",
						message: `${where}: id must look like banned.just`,
					});
				} else if (
					rule["category"] !== undefined &&
					RULE_CATEGORIES.includes(rule["category"]) &&
					id.split(".")[0] !== rule["category"]
				) {
					found.push({
						code: "id-category-mismatch",
						message: `${where}: id prefix must equal category ${rule["category"]}`,
					});
				}
				if (seen.has(id)) {
					found.push({
						code: "duplicate-id",
						message: `${where} appears twice`,
					});
				}
				seen.add(id);
			}
			if (
				typeof rule["category"] === "string" &&
				!RULE_CATEGORIES.includes(rule["category"])
			) {
				found.push({
					code: "bad-category",
					message: `${where}: category ${rule["category"]} is not one of ${RULE_CATEGORIES.join(", ")}`,
				});
			}
			if (
				Object.hasOwn(rule, "flags") &&
				rule["flags"] !== "" &&
				rule["flags"] !== "i"
			) {
				found.push({
					code: "bad-flags",
					message: `${where}: flags must be "" or "i"`,
				});
			}
			if (
				typeof rule["pattern"] === "string" &&
				typeof rule["flags"] === "string" &&
				(rule["flags"] === "" || rule["flags"] === "i")
			) {
				try {
					new RegExp(rule["pattern"], rule["flags"]);
				} catch (error) {
					found.push({
						code: "bad-pattern",
						message: `${where}: invalid pattern: ${error instanceof Error ? error.message : String(error)}`,
					});
				}
			}
			if (
				Object.hasOwn(rule, "allow") &&
				(!Array.isArray(rule["allow"]) ||
					rule["allow"].some((phrase) => !isNonEmptyString(phrase)))
			) {
				found.push({
					code: "bad-field",
					message: `${where}: allow must be a list of non-empty strings`,
				});
			}
			const source = rule["source"];
			if (Object.hasOwn(rule, "source")) {
				if (!isPlainObject(source)) {
					found.push({
						code: "bad-field",
						message: `${where}: source must be an object`,
					});
				} else {
					found.push(
						...closedKeyProblems(source, SOURCE_KEYS, [], `${where} source`),
					);
					for (const key of ["section", "quote"]) {
						if (Object.hasOwn(source, key) && !isNonEmptyString(source[key])) {
							found.push({
								code: "bad-field",
								message: `${where}: source.${key} must be a non-empty string`,
							});
						}
					}
					if (
						Object.hasOwn(source, "basis") &&
						!RULE_BASES.includes(source["basis"])
					) {
						found.push({
							code: "bad-basis",
							message: `${where}: source.basis must be one of ${RULE_BASES.join(", ")}`,
						});
					}
				}
			}
		});
	}
	return found.sort(
		(a, b) =>
			compareCodeUnits(a.code, b.code) ||
			compareCodeUnits(a.message, b.message),
	);
}

/**
 * Normalize text before matching: `{...}` placeholders become one masked
 * character, curly quotes become straight, NBSP becomes a space, whitespace
 * runs collapse. A brace left over afterwards fails closed.
 *
 * @param {string} text
 * @returns {string}
 */
export function normalizeForLint(text) {
	const masked = text.replace(/\{[^{}]*\}/g, MASK);
	if (/[{}]/.test(masked)) {
		throw new Error(`unbalanced placeholder brace in: ${text}`);
	}
	return masked
		.replace(/[‘’]/g, "'")
		.replace(/[“”]/g, '"')
		.replace(/ /g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function compileRule(rule, derived, maskers) {
	let regex;
	try {
		regex = new RegExp(rule.pattern, rule.flags);
	} catch (error) {
		throw new Error(
			`rule ${rule.id}: invalid pattern: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
	const allow = (rule.allow ?? []).map(
		(phrase) => new RegExp(escapeRegExp(phrase), "gi"),
	);
	// The regexes stay unfrozen: a global one needs a writable lastIndex.
	return Object.freeze({
		id: rule.id,
		category: rule.category,
		message: rule.message,
		bad: rule.bad,
		ok: rule.ok,
		derived,
		regex,
		masks: Object.freeze([...allow, ...maskers]),
	});
}

// An avoid word may span several words ("free software"): a run of spaces
// matches a run of whitespace.
function wordPattern(word) {
	return `\\b${escapeRegExp(word).replace(/ +/g, "\\s+")}\\b`;
}

function terms(glossaryDoc) {
	if (!isPlainObject(glossaryDoc) || !Array.isArray(glossaryDoc["terms"])) {
		throw new Error("the glossary document is malformed");
	}
	return glossaryDoc["terms"];
}

/**
 * Compile every rule once into a frozen ruleset: the file rules in file
 * order, then one derived rule per glossary avoid word, sorted by id.
 *
 * Derived rule `vocab|<termId>|<word>`: bad is the avoid word, ok the term's
 * label. Masking contract (RESEARCH Pitfall 3): before a derived rule runs,
 * every OTHER term's multi-word label ("Finder tags", "macOS attributes") is
 * masked, so the OS-owned names are not findings while "macOS extended
 * attributes" still is; single-word labels are never masked. An avoid word
 * that a banned or name rule already catches gets no derived rule, so one
 * string has one detector.
 *
 * @param {unknown} rulesDoc
 * @param {unknown} glossaryDoc
 */
export function buildRuleset(rulesDoc, glossaryDoc) {
	if (!isPlainObject(rulesDoc) || !Array.isArray(rulesDoc["rules"])) {
		throw new Error("the rules document is malformed");
	}
	const fileRules = rulesDoc["rules"].map((rule) =>
		compileRule(rule, false, []),
	);
	const covering = fileRules.filter(
		(rule) => rule.category === "banned" || rule.category === "name",
	);
	const glossaryTerms = terms(glossaryDoc);
	const derived = [];
	for (const term of glossaryTerms) {
		const maskers = glossaryTerms
			.filter(
				(other) =>
					other !== term &&
					typeof other["ui_label"] === "string" &&
					other["ui_label"].includes(" "),
			)
			.map((other) => new RegExp(wordPattern(other["ui_label"]), "gi"));
		for (const word of term["avoid"] ?? []) {
			const caught = covering.some((rule) =>
				rule.regex.test(normalizeForLint(word)),
			);
			if (caught) {
				continue;
			}
			derived.push(
				compileRule(
					{
						id: `vocab|${term["id"]}|${word}`,
						category: "vocab",
						pattern: wordPattern(word),
						flags: "i",
						message: `use "${term["ui_label"]}" instead of "${word}"`,
						bad: word,
						ok: term["ui_label"],
					},
					true,
					maskers,
				),
			);
		}
	}
	derived.sort((a, b) => compareCodeUnits(a.id, b.id));
	return Object.freeze({
		rules: Object.freeze([...fileRules, ...derived]),
	});
}

/**
 * One hit per rule that matches, in ruleset order.
 *
 * @param {string} text
 * @param {{ rules: ReadonlyArray<any> }} ruleset
 * @returns {Array<{ ruleId: string, match: string }>}
 */
export function lintText(text, ruleset) {
	const normalized = normalizeForLint(text);
	if (normalized === "") {
		return [];
	}
	const hits = [];
	for (const rule of ruleset.rules) {
		let subject = normalized;
		for (const mask of rule.masks) {
			subject = subject.replace(mask, MASK);
		}
		const found = rule.regex.exec(subject);
		if (found !== null) {
			hits.push({ ruleId: rule.id, match: found[0] });
		}
	}
	return hits;
}

/**
 * Rules whose own `bad` does not fire them, or whose `ok` does.
 *
 * @param {{ rules: ReadonlyArray<any> }} ruleset
 * @returns {Array<{ ruleId: string, side: "bad" | "ok" }>}
 */
export function selfTestProblems(ruleset) {
	const found = [];
	for (const rule of ruleset.rules) {
		if (!lintText(rule.bad, ruleset).some((hit) => hit.ruleId === rule.id)) {
			found.push({ ruleId: rule.id, side: "bad" });
		}
		if (lintText(rule.ok, ruleset).some((hit) => hit.ruleId === rule.id)) {
			found.push({ ruleId: rule.id, side: "ok" });
		}
	}
	return found;
}

/**
 * The pattern a rendered string must match, whole, to be the baselined en
 * string it came from: the normalized value with every `{...}` placeholder as
 * `.+?`, everything else literal, anchored, case-insensitive.
 *
 * @param {string} enValue
 * @returns {RegExp}
 */
export function templatePattern(enValue) {
	const body = escapeRegExp(normalizeForLint(enValue)).replaceAll(MASK, ".+?");
	return new RegExp(`^${body}$`, "i");
}

/**
 * Templates of the en strings the register baselines as a vocab, banned or
 * name finding (D-12): a rendered unit that is exactly such a string is
 * excused, because a story hit cannot itself be baselined (additions are
 * rejected) and a story of the status bar would otherwise fail at once on the
 * baselined "{count} tags removed". Anything but the exact template still
 * fails.
 *
 * @param {unknown} registerDoc
 * @param {Readonly<Record<string, string>>} en
 * @returns {RegExp[]}
 */
export function excusedTemplates(registerDoc, en) {
	if (!isPlainObject(registerDoc) || !Array.isArray(registerDoc["entries"])) {
		throw new Error("the register document is malformed");
	}
	const keys = new Set();
	for (const entry of registerDoc["entries"]) {
		if (
			isPlainObject(entry) &&
			["vocab", "banned", "name"].includes(entry["kind"]) &&
			typeof entry["ref"] === "string" &&
			entry["ref"].startsWith("en:")
		) {
			keys.add(entry["ref"].slice("en:".length));
		}
	}
	return [...keys]
		.sort(compareCodeUnits)
		.filter((key) => typeof en[key] === "string")
		.map((key) => templatePattern(en[key]));
}
