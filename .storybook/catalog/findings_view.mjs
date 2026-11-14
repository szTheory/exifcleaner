// FINDINGS.md: the generated, human-readable view of the findings register
// (FLW-02, D-30, R-3). Pure over two parsed documents, so a test can plant any
// input and the catalog CLI can compare the file byte for byte (wired in the
// plan that adds the data; this module only renders).
//
// What it prints
//   - Register entries (every kind that is not an axe kind), in full: the
//     fingerprint (which is the finding id), story, severity, disposition and
//     reason. Entries with disposition `reject` are listed in their own section.
//   - Contrast gaps (kind `contrast-gap`, when there are any): grouped by pair and
//     backdrop (the rule without its trailing theme) with the themes that fail, the
//     story and the disposition, and no reason column; the reasons stay in the JSON.
//   - Rejected findings: each reject entry with its verdict row (the maintainer's
//     recorded decision), because a rejected finding stays listed and quiet.
//   - Accessibility baseline: axe kinds (`a11y`, `a11y-pN`) summarised by kind,
//     rule and disposition with a count, never one row per entry (hundreds of
//     rows would bury the register). Their severity is derived: `major`.
//   - copy-findings.json as a cross-reference only (R-3): it is a separate
//     ratchet whose entries have no story id, so they cannot satisfy the story-id
//     rule and are listed by fingerprint and disposition.
//
// The axe-kind pattern is inlined (a copy of AXE_KIND in scripts/findings_ratchet.mjs):
// this module imports nothing from scripts/.

const AXE_KIND = /^a11y(-p\d+)?$/;

// The static contrast failures (Phase 74, D-24, D-25): one entry per pair, backdrop
// and theme, dozens at a time, so they print grouped in their own section instead of
// one full-reason row each in the register table.
const CONTRAST_KIND = "contrast-gap";
const THEME_SUFFIX = /-(light|dark)$/;

/**
 * Code-unit order, never locale collation.
 *
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function compareCodeUnits(a, b) {
	if (a < b) return -1;
	if (a > b) return 1;
	return 0;
}

/**
 * A table cell: no carriage return, no line break, pipes escaped so a row keeps
 * its columns (a fingerprint is `kind|story|rule`).
 *
 * @param {unknown} value
 * @returns {string}
 */
function cell(value) {
	return String(value ?? "")
		.replace(/[\r\n]+/g, " ")
		.replace(/\|/g, "\\|");
}

/**
 * @param {ReadonlyArray<ReadonlyArray<unknown>>} rows
 * @param {readonly string[]} header
 * @returns {string[]}
 */
function table(header, rows) {
	return [
		`| ${header.join(" | ")} |`,
		`| ${header.map(() => "---").join(" | ")} |`,
		...rows.map((row) => `| ${row.map(cell).join(" | ")} |`),
	];
}

/**
 * @param {object} inputs
 * @param {{ entries?: ReadonlyArray<any>, verdicts?: ReadonlyArray<any> }} inputs.baseline docs/evidence/known-findings.json
 * @param {{ entries?: ReadonlyArray<any> }} inputs.copyFindings .storybook/catalog/copy-findings.json
 * @returns {string}
 */
export function renderFindings({ baseline, copyFindings }) {
	const entries = [...(baseline.entries ?? [])].sort((a, b) =>
		compareCodeUnits(a.fingerprint, b.fingerprint),
	);
	const verdicts = new Map(
		(baseline.verdicts ?? []).map((row) => [row.fingerprint, row]),
	);
	const live = entries.filter((entry) => entry.disposition !== "reject");
	const kindsOutsideAxe = live.filter((entry) => !AXE_KIND.test(entry.kind));
	const contrast = kindsOutsideAxe.filter(
		(entry) => entry.kind === CONTRAST_KIND,
	);
	const register = kindsOutsideAxe.filter(
		(entry) => entry.kind !== CONTRAST_KIND,
	);
	const axe = live.filter((entry) => AXE_KIND.test(entry.kind));
	const rejected = entries.filter((entry) => entry.disposition === "reject");

	const lines = [
		"<!-- Generated from docs/evidence/known-findings.json and .storybook/catalog/copy-findings.json by .storybook/catalog/catalog.mjs. Do not edit: edit those files and run yarn catalog:write. -->",
		"",
		"# Findings register",
		"",
		"A finding is a defect or gap the catalog exposed and the product does not yet fix. The fingerprint (`kind|story|rule`) is the finding id. Severity is by whose trust or access is affected: critical, the person is told something false, or nothing, about a result or failure; major, the job completes but a group is impaired; minor, cosmetic, latent or hygiene. A finding leaves this list only when it is fixed or when the maintainer's decision is recorded as a verdict.",
		"",
		"## Register",
		"",
	];
	if (register.length === 0) {
		lines.push("none");
	} else {
		lines.push(
			...table(
				["Fingerprint", "Story", "Severity", "Disposition", "Reason"],
				register.map((entry) => [
					entry.fingerprint,
					entry.story,
					entry.severity ?? "",
					entry.disposition,
					entry.reason,
				]),
			),
		);
	}

	if (contrast.length > 0) {
		/** @type {Map<string, { themes: Set<string>, stories: Set<string>, dispositions: Set<string> }>} */
		const groups = new Map();
		for (const entry of contrast) {
			const rule = String(entry.rule);
			const key = rule.replace(THEME_SUFFIX, "");
			const group = groups.get(key) ?? {
				themes: new Set(),
				stories: new Set(),
				dispositions: new Set(),
			};
			const theme = THEME_SUFFIX.exec(rule)?.[1];
			if (theme !== undefined) group.themes.add(theme);
			group.stories.add(entry.story);
			group.dispositions.add(entry.disposition);
			groups.set(key, group);
		}
		const joined = (/** @type {Set<string>} */ values) =>
			[...values].sort(compareCodeUnits).join(", ");
		lines.push(
			"",
			"## Contrast gaps",
			"",
			"Static contrast failures from tests/renderer/contrast: a foreground and backdrop token pair below 4.5:1 (text) or 3:1 (non-text and focus) in a theme. One entry per pair, backdrop and theme is in docs/evidence/known-findings.json with its measured reason; this table groups them by pair and backdrop. Severity is major. v5.1 removes them with the palette change.",
			"",
			`${contrast.length} entries across ${groups.size} pairs`,
			"",
			...table(
				["Pair", "Themes", "Story", "Disposition"],
				[...groups.entries()]
					.sort((a, b) => compareCodeUnits(a[0], b[0]))
					.map(([key, group]) => [
						key,
						joined(group.themes),
						joined(group.stories),
						joined(group.dispositions),
					]),
			),
		);
	}

	lines.push("", "## Rejected (verdict log)", "");
	if (rejected.length === 0) {
		lines.push("none");
	} else {
		lines.push(
			...table(
				[
					"Fingerprint",
					"Story",
					"Severity",
					"Reason",
					"Decided",
					"By",
					"Reply",
				],
				rejected.map((entry) => {
					const row = verdicts.get(entry.fingerprint);
					return [
						entry.fingerprint,
						entry.story,
						entry.severity ?? (AXE_KIND.test(entry.kind) ? "major" : ""),
						entry.reason,
						row?.decidedAt ?? "no verdict row",
						row?.decidedBy ?? "",
						row?.reply ?? "",
					];
				}),
			),
		);
	}

	lines.push(
		"",
		"## Accessibility baseline (summary)",
		"",
		"Axe findings from the stories, summarised by kind, rule and disposition; the entries are in docs/evidence/known-findings.json. Severity is derived: major (a WCAG failure impairs a group).",
		"",
	);
	/** @type {Map<string, { kind: string, rule: string, disposition: string, count: number }>} */
	const groups = new Map();
	for (const entry of axe) {
		const key = JSON.stringify([entry.kind, entry.rule, entry.disposition]);
		const group = groups.get(key) ?? {
			kind: entry.kind,
			rule: entry.rule,
			disposition: entry.disposition,
			count: 0,
		};
		group.count += 1;
		groups.set(key, group);
	}
	const summary = [...groups.values()].sort(
		(a, b) =>
			compareCodeUnits(a.kind, b.kind) ||
			compareCodeUnits(a.rule, b.rule) ||
			compareCodeUnits(a.disposition, b.disposition),
	);
	if (summary.length === 0) {
		lines.push("none");
	} else {
		lines.push(
			...table(
				["Kind", "Rule", "Disposition", "Severity", "Count"],
				summary.map((group) => [
					group.kind,
					group.rule,
					group.disposition,
					"major",
					group.count,
				]),
			),
		);
	}

	const copy = [...(copyFindings.entries ?? [])].sort((a, b) =>
		compareCodeUnits(a.fingerprint, b.fingerprint),
	);
	lines.push(
		"",
		"## Copy findings (cross-reference)",
		"",
		"Copy findings (hardcoded strings, copy-lint hits) are a separate ratchet in .storybook/catalog/copy-findings.json. Their entries have no story id (they name a source reference), so they cannot satisfy the story-id rule and are listed here by fingerprint and disposition only.",
		"",
	);
	if (copy.length === 0) {
		lines.push("none");
	} else {
		lines.push(
			...table(
				["Fingerprint", "Disposition"],
				copy.map((entry) => [entry.fingerprint, entry.disposition]),
			),
		);
	}
	return `${lines.join("\n")}\n`;
}
