import { describe, expect, test } from "vitest";
import { SUPPORTED_EXTENSIONS } from "../src/domain/files/file_types";
import {
	NEUTRAL,
	TYPE_PILL_FAMILIES,
} from "../src/renderer/story_support/type_pill_families";

// D-16: every supported extension is rendered by exactly one TypePill story, either
// in a named colour family (aliases included) or in the explicit neutral list that
// has no family styling. This gate covers membership and duplicates only. The class
// each extension maps to is asserted by the TypePill stories against the rendered
// pill, because `pillClass` is not exported from TypePill.tsx and product code is
// not edited for a story (W-10), so this file never re-implements it.
//
// The lists keep extensions without the leading dot (they are rendered as uppercase
// text); SUPPORTED_EXTENSIONS keeps the dot, so the comparison adds it.
export function typePillFamilyProblems(
	supported: Iterable<string>,
	families: Readonly<Record<string, readonly string[]>>,
	neutral: readonly string[],
): string[] {
	const homes = new Map<string, string[]>();
	const listed = (name: string, extensions: readonly string[]): void => {
		for (const extension of extensions) {
			const dotted = `.${extension}`;
			homes.set(dotted, [...(homes.get(dotted) ?? []), name]);
		}
	};
	for (const [name, extensions] of Object.entries(families)) {
		listed(name, extensions);
	}
	listed("NEUTRAL", neutral);
	const known = new Set(supported);
	const problems: string[] = [];
	for (const extension of known) {
		if (!homes.has(extension)) {
			problems.push(`${extension} is in no TypePill family and not in NEUTRAL`);
		}
	}
	for (const [extension, where] of homes) {
		if (where.length > 1) {
			problems.push(
				`${extension} is listed twice (${[...where].sort().join(" and ")})`,
			);
		} else if (!known.has(extension)) {
			problems.push(
				`${extension} is in ${where.join("")} but is not supported`,
			);
		}
	}
	return problems.sort();
}

describe("TypePill family lists cover the supported extensions (D-16)", () => {
	test("the real lists leave no supported extension out and list none twice", () => {
		expect(
			typePillFamilyProblems(SUPPORTED_EXTENSIONS, TYPE_PILL_FAMILIES, NEUTRAL),
		).toEqual([]);
	});

	test("the family members plus the neutral list number exactly the supported extensions", () => {
		const members =
			Object.values(TYPE_PILL_FAMILIES).reduce(
				(sum, extensions) => sum + extensions.length,
				0,
			) + NEUTRAL.length;
		expect(members).toBe(SUPPORTED_EXTENSIONS.size);
		// 23 family members and 7 neutral extensions at plan time.
		expect(members).toBeGreaterThan(0);
	});

	test("shown red: a planted .zzz extension is the only problem reported", () => {
		const planted = new Set([...SUPPORTED_EXTENSIONS, ".zzz"]);
		expect(
			typePillFamilyProblems(planted, TYPE_PILL_FAMILIES, NEUTRAL),
		).toEqual([".zzz is in no TypePill family and not in NEUTRAL"]);
	});

	test("shown red: an extension in two families is reported once, by name", () => {
		const doubled = {
			...TYPE_PILL_FAMILIES,
			png: [...TYPE_PILL_FAMILIES.png, "pdf"],
		};
		expect(
			typePillFamilyProblems(SUPPORTED_EXTENSIONS, doubled, NEUTRAL),
		).toEqual([".pdf is listed twice (pdf and png)"]);
	});

	test("shown red: an extension in a family and in NEUTRAL is reported once", () => {
		expect(
			typePillFamilyProblems(SUPPORTED_EXTENSIONS, TYPE_PILL_FAMILIES, [
				...NEUTRAL,
				"png",
			]),
		).toEqual([".png is listed twice (NEUTRAL and png)"]);
	});

	test("shown red: a listed extension that is not supported is reported", () => {
		expect(
			typePillFamilyProblems(SUPPORTED_EXTENSIONS, TYPE_PILL_FAMILIES, [
				...NEUTRAL,
				"zzz",
			]),
		).toEqual([".zzz is in NEUTRAL but is not supported"]);
	});
});
