import en from "../../../.resources/locales/en.json";

// Copy-lint fixture text for FileRow's composite row label (D-15). FileRow's
// `aria-label` is `${name}. ${summary}` (FileRow.tsx, the row's aria-label), and the
// copy lint treats that whole string as one unit: a unit is excused only when it
// wholly matches a baselined template, so a seeded failure row would trip the lint
// although the same sentence is baselined. A story passes the returned array as
// `parameters.copyLint.fixtureText`; the copy-lint gate itself is not changed.
//
// Only the plain form of the label is built here (`name. summary`). FileRow appends
// `. <writtenToCopy>.` for a forced copy, which no failure row carries, so a story
// for a copy-mode row writes its own fixture text.
//
// Test support in the production source tree (V3): only *.stories.tsx files and
// story_support itself import it (.storybook/story_support_imports.test.ts).
export type RowSummaryKey =
	| "outcome.refusedRaf"
	| "verificationFailedSummary"
	| "cleanupFailedSummary"
	| "xattrFailedSummary"
	| "writeFailedSummary"
	| "commitFailedSummary"
	| "outcome.alreadyClean"
	| "outcome.unchanged"
	| "outcome.cleaned";

export function rowLabelFixture(
	name: string,
	summaryKey: RowSummaryKey,
): string[] {
	const summary: string | undefined = en[summaryKey];
	if (summary === undefined) {
		throw new Error(`en.json has no string for the row summary ${summaryKey}`);
	}
	return [`${name}. ${summary}`];
}
