import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, test } from "vitest";
import {
	WAIVER_CODES,
	loadGridInputs,
	validateWaivers,
	waiverContext,
} from "./grid.mjs";
import type { WaiverContext } from "./grid.mjs";
import { repoRoot } from "./temp_repo";
import { validateSubjects } from "./subjects.mjs";

const FIXTURES = path.join(repoRoot, ".storybook/catalog/fixtures");
const E2E_REF = "tests/e2e/app-launch.spec.ts";
const REASON = "The app-launch spec drives this state through the real window.";

function fixture(name: string): unknown {
	return JSON.parse(fs.readFileSync(path.join(FIXTURES, name), "utf8"));
}

function waiver(
	subject: unknown,
	stateClass: unknown,
	extra: Record<string, unknown> = {},
): Record<string, unknown> {
	return {
		subject,
		stateClass,
		basis: "e2e",
		ref: E2E_REF,
		reason: REASON,
		...extra,
	};
}

function documentOf(waivers: unknown[]): unknown {
	return { schemaVersion: 1, waivers };
}

let ctx: WaiverContext;
let chevronFile: string;

beforeAll(async () => {
	ctx = waiverContext(repoRoot, await loadGridInputs(repoRoot));
	const file = ctx.subjectFiles.get("ChevronIcon");
	if (file === undefined) throw new Error("ChevronIcon has no source file");
	chevronFile = file;
});

type Case = {
	name: string;
	build: () => unknown;
	expected: string[];
	context?: () => WaiverContext;
};

// Every case asserts the WHOLE problem list: one planted defect, one code.
const CASES: Case[] = [
	{
		name: "shown red: waiver_wildcard.json",
		build: () => fixture("waiver_wildcard.json"),
		expected: ["bad-subject"],
	},
	{
		name: "shown red: waiver_full_row.json",
		build: () => fixture("waiver_full_row.json"),
		expected: ["full-row"],
	},
	{
		name: "shown red: waiver_full_column.json",
		build: () => fixture("waiver_full_column.json"),
		expected: ["full-column"],
		// The fixture names every subject of the day; the context is limited to
		// those subjects so a later subject does not make the fixture stale. The
		// covered cells are emptied too: the fixture waives one state for every
		// subject, and a story landing in that state (ErrorExpansion|stale in
		// Phase 72) would add a waiver-shadowed problem that is not under test here.
		context: () => {
			const named = (
				fixture("waiver_full_column.json") as {
					waivers: Array<{ subject: string }>;
				}
			).waivers.map((entry) => entry.subject);
			return {
				...ctx,
				coveredCells: new Set<string>(),
				subjects: new Map(
					[...ctx.subjects].filter(([id]) => named.includes(id)),
				),
			};
		},
	},
	{
		name: "shown red: waiver_unresolved_ref.json",
		build: () => fixture("waiver_unresolved_ref.json"),
		expected: ["ref-unresolved"],
	},
	{
		name: "shown red: waiver_dangling_subject.json",
		build: () => fixture("waiver_dangling_subject.json"),
		expected: ["unknown-subject"],
	},
	{
		name: "shown red: an array subject",
		build: () => documentOf([waiver(["ChevronIcon", "GearIcon"], "huge")]),
		expected: ["bad-subject"],
	},
	{
		name: "shown red: a partial wildcard subject",
		build: () => documentOf([waiver("Chevron*", "huge")]),
		expected: ["bad-subject"],
	},
	{
		name: "shown red: a missing subject",
		build: () => {
			const { subject: _subject, ...rest } = waiver("ChevronIcon", "huge");
			return documentOf([rest]);
		},
		expected: ["missing-field"],
	},
	{
		name: "shown red: a missing stateClass",
		build: () => {
			const { stateClass: _state, ...rest } = waiver("ChevronIcon", "huge");
			return documentOf([rest]);
		},
		expected: ["missing-field"],
	},
	{
		name: "shown red: a stateClass outside the twelve",
		build: () => documentOf([waiver("ChevronIcon", "sad")]),
		expected: ["bad-state-class"],
	},
	{
		name: "shown red: a wildcard stateClass",
		build: () => documentOf([waiver("ChevronIcon", "*")]),
		expected: ["bad-state-class"],
	},
	{
		name: "shown red: a basis outside the closed set",
		build: () =>
			documentOf([waiver("ChevronIcon", "huge", { basis: "other" })]),
		expected: ["bad-basis"],
	},
	{
		name: "shown red: a 39 character reason",
		build: () =>
			documentOf([waiver("ChevronIcon", "huge", { reason: "x".repeat(39) })]),
		expected: ["reason-short"],
	},
	{
		name: "shown red: an unreachable ref to another subject's file",
		build: () =>
			documentOf([
				waiver("GearIcon", "huge", {
					basis: "unreachable",
					ref: `${chevronFile}#ChevronIcon`,
				}),
			]),
		expected: ["ref-unresolved"],
	},
	{
		name: "shown red: an unreachable ref whose symbol is not in the file",
		build: () =>
			documentOf([
				waiver("ChevronIcon", "huge", {
					basis: "unreachable",
					ref: `${chevronFile}#NoSuchSymbolAnywhere`,
				}),
			]),
		expected: ["ref-unresolved"],
	},
	{
		name: "shown red: an e2e ref outside tests/e2e",
		build: () =>
			documentOf([waiver("ChevronIcon", "huge", { ref: "package.json" })]),
		expected: ["ref-unresolved"],
	},
	{
		name: "shown red: a ref that climbs out of the root",
		build: () =>
			documentOf([waiver("ChevronIcon", "huge", { ref: "../../etc/passwd" })]),
		expected: ["ref-unresolved"],
	},
	{
		name: "shown red: two waivers for one cell",
		build: () =>
			documentOf([
				waiver("ChevronIcon", "huge"),
				waiver("ChevronIcon", "huge"),
			]),
		expected: ["waiver-duplicate"],
	},
	{
		name: "shown red: a waiver on the covered LanguageDropdown happy cell",
		build: () => documentOf([waiver("LanguageDropdown", "happy")]),
		expected: ["waiver-shadowed"],
	},
	{
		name: "shown red: a document that is not an object",
		build: () => [],
		expected: ["not-object"],
	},
	{
		name: "shown red: schemaVersion 2",
		build: () => ({ schemaVersion: 2, waivers: [] }),
		expected: ["schema-version"],
	},
	{
		name: "shown red: an unknown top-level key",
		build: () => ({ schemaVersion: 1, waivers: [], planted: true }),
		expected: ["unknown-field"],
	},
	{
		name: "shown red: a status field cannot mark a cell",
		build: () =>
			documentOf([waiver("ChevronIcon", "huge", { status: "waived" })]),
		expected: ["unknown-field"],
	},
];

describe("validateWaivers (D-25)", () => {
	test("the real waivers.json is valid, and an empty list is valid", () => {
		const real = JSON.parse(
			fs.readFileSync(
				path.join(repoRoot, ".storybook/catalog/waivers.json"),
				"utf8",
			),
		) as unknown;
		expect(validateWaivers(real, ctx)).toEqual([]);
		expect(validateWaivers(documentOf([]), ctx)).toEqual([]);
	});

	test("a reasoned waiver of each basis passes (the negative cases are not vacuous)", () => {
		const scenarioId = [...ctx.scenarioIds][0];
		expect(
			validateWaivers(
				documentOf([
					waiver("ChevronIcon", "huge"),
					waiver("ChevronIcon", "long", {
						basis: "unreachable",
						ref: `${chevronFile}#ChevronIcon`,
					}),
					waiver("ChevronIcon", "loading", {
						basis: "duplicate",
						ref: scenarioId,
					}),
					waiver("ChevronIcon", "denied", {
						reason: "x".repeat(40),
					}),
				]),
				ctx,
			),
		).toEqual([]);
	});

	test.each(CASES)("$name", ({ build, expected, context }) => {
		const problems = validateWaivers(build(), context?.() ?? ctx);
		expect(problems.map((found) => found.code)).toEqual(expected);
	});

	test("the cases exercise every code in WAIVER_CODES and no other", () => {
		const exercised = [...new Set(CASES.flatMap((entry) => entry.expected))];
		expect(exercised.sort()).toEqual([...WAIVER_CODES].sort());
	});
});

// The subject registry fixtures (D-27): one defect each, against a fixed scan so
// a component added later does not stale the fixture.
describe("subject registry fixtures", () => {
	test("shown red: subjects_scan_only.json (a scanned component has no row)", () => {
		expect(
			validateSubjects(fixture("subjects_scan_only.json"), {
				ids: ["Alpha", "Beta", "Gamma"],
				collisions: [],
			}).map((found) => found.code),
		).toEqual(["subject-unregistered"]);
	});

	test("shown red: subjects_registry_only.json (a row has no component file)", () => {
		expect(
			validateSubjects(fixture("subjects_registry_only.json"), {
				ids: ["Alpha", "Beta"],
				collisions: [],
			}).map((found) => found.code),
		).toEqual(["subject-stale"]);
	});

	test("both fixtures pass against a matching scan (the negative cases are not vacuous)", () => {
		expect(
			validateSubjects(fixture("subjects_scan_only.json"), {
				ids: ["Alpha", "Beta"],
				collisions: [],
			}),
		).toEqual([]);
		expect(
			validateSubjects(fixture("subjects_registry_only.json"), {
				ids: ["Alpha", "Beta", "Ghost"],
				collisions: [],
			}),
		).toEqual([]);
	});
});
