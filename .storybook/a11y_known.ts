import baseline from "../docs/evidence/known-findings.json";

// D-27: stories read the shrink-only baseline (docs/evidence/known-findings.json,
// kinds `a11y` and `a11y-<suffix>`) to disable exactly the axe rules a story is
// known to violate, and nothing else. With the Phase 70 baseline empty no story
// uses it yet. Spread the result into `parameters.a11y`:
//   parameters: { a11y: knownA11y("settings-toggleswitch--default") }
type BaselineLike = {
	entries: ReadonlyArray<{ kind: string; story: string; rule: string }>;
};

export type KnownA11y = {
	options?: { rules: Record<string, { enabled: false }> };
};

function isA11yKind(kind: string): boolean {
	return kind === "a11y" || kind.startsWith("a11y-");
}

export function knownA11yFrom(doc: BaselineLike, storyId: string): KnownA11y {
	const rules = doc.entries
		.filter((entry) => isA11yKind(entry.kind) && entry.story === storyId)
		.map((entry) => entry.rule);
	if (rules.length === 0) return {};
	return {
		options: {
			rules: Object.fromEntries(
				rules.map((rule) => [rule, { enabled: false }]),
			),
		},
	};
}

export function knownA11y(storyId: string): KnownA11y {
	return knownA11yFrom(baseline, storyId);
}
