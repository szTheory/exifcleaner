import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { assertDirEffect, snapshotDir } from "../../tests/helpers/dir_effect";
import {
	UI_SPEC_CODES,
	UI_SPEC_MD_PATH,
	UI_SPEC_PATH,
	loadUiSpecContext,
	renderUiSpec,
	validateUiSpec,
	type UiSpecContext,
	type UiSpecDocument,
	type UiSpecValue,
} from "./ui_spec.mjs";
import { makeCatalogRepo, realScript, repoRoot, runNode } from "./temp_repo";
import { UI_SPEC_SECTIONS } from "./vocab.mjs";

const CATALOG = ".storybook/catalog/catalog.mjs";

const ctx: UiSpecContext = loadUiSpecContext(repoRoot);
const real = JSON.parse(
	fs.readFileSync(path.join(repoRoot, UI_SPEC_PATH), "utf8"),
) as UiSpecDocument;

function clone(): UiSpecDocument {
	return structuredClone(real);
}

function at<T>(items: readonly T[], index: number): T {
	const found = items[index];
	if (found === undefined) throw new Error(`no item at ${index}`);
	return found;
}

function codes(doc: unknown): string[] {
	return validateUiSpec(doc, ctx).map((found) => found.code);
}

function withRepo(body: (repo: string) => void): void {
	const repo = makeCatalogRepo();
	try {
		body(repo);
	} finally {
		fs.rmSync(repo, { recursive: true, force: true });
	}
}

function run(repo: string, args: string[]) {
	return runNode(realScript(CATALOG), args, repo);
}

// The section values, every section but states.
function valuesOf(doc: UiSpecDocument): UiSpecValue[] {
	return [
		...doc.type,
		...doc.radii,
		...doc.spacing,
		...doc.focus,
		...doc.darkRinse,
		...doc.motion,
		...doc.platformOwned,
	];
}

describe("the real ui-spec", () => {
	test("validates to no problems", () => {
		expect(validateUiSpec(real, ctx)).toEqual([]);
	});

	test("anti-vacuity: all eight sections, every one non-empty, every source kind used", () => {
		expect(Object.keys(real)).toEqual([
			"schemaVersion",
			"brandPin",
			...UI_SPEC_SECTIONS,
		]);
		for (const section of UI_SPEC_SECTIONS) {
			if (section === "states") continue;
			const values = real[section as keyof UiSpecDocument] as UiSpecValue[];
			expect(values.length, section).toBeGreaterThan(0);
		}
		expect(real.states.components.length).toBeGreaterThan(0);
		expect(real.states.cells.length).toBe(real.states.components.length * 10);
		const everyValue = [...valuesOf(real), ...real.states.cells];
		expect(everyValue.some((entry) => entry.tokens !== undefined)).toBe(true);
		expect(everyValue.some((entry) => entry.brand !== undefined)).toBe(true);
		expect(everyValue.some((entry) => entry.app !== undefined)).toBe(true);
		expect(real.states.cells.some((cell) => cell.na !== undefined)).toBe(true);
	});

	test("the generated view starts with the byte-exact header and counts the sources", () => {
		const view = renderUiSpec(real);
		expect(view.split("\n")[0]).toBe(
			"<!-- Generated from ui-spec.json by .storybook/catalog/catalog.mjs. Do not edit: edit ui-spec.json and run yarn catalog:write. -->",
		);
		expect(view).toMatch(
			/\nSources: \d+ values: tokens \d+, brand \d+, app \d+ \(brand-starting-point \d+, wcag-derived \d+, platform-default \d+, maintainer-decision \d+\);/,
		);
		expect(view.endsWith("\n")).toBe(true);
		expect(view.endsWith("\n\n")).toBe(false);
		expect(view).not.toContain("\r");
		// Rendering twice is byte-identical (no timestamps, no ordering noise).
		expect(renderUiSpec(clone())).toBe(view);
	});
});

interface Mutant {
	name: string;
	code: string;
	mutate: (doc: UiSpecDocument) => unknown;
}

const MUTANTS: Mutant[] = [
	{ name: "a non-object document", code: "not-object", mutate: () => [] },
	{
		name: "schemaVersion 2",
		code: "schema-version",
		mutate: (doc) => ({ ...doc, schemaVersion: 2 }),
	},
	{
		name: "an extra top-level key",
		code: "unknown-field",
		mutate: (doc) => ({ ...doc, extra: [] }),
	},
	{
		name: "a deleted section",
		code: "missing-field",
		mutate: (doc) => {
			const copy: Partial<UiSpecDocument> = doc;
			delete copy.radii;
			return copy;
		},
	},
	{
		name: "a brandPin that is not the brand.pin.json commit",
		code: "pin-mismatch",
		mutate: (doc) => ({ ...doc, brandPin: "0".repeat(40) }),
	},
	{
		name: "a value with no source key",
		code: "source-count",
		mutate: (doc) => {
			delete at(doc.type, 0).brand;
			return doc;
		},
	},
	{
		name: "a value with two source keys",
		code: "source-count",
		mutate: (doc) => {
			at(doc.type, 0).app = {
				basis: "wcag-derived",
				reason: "a second source",
			};
			return doc;
		},
	},
];

describe("every rule code is shown red by its own mutant", () => {
	test.each(MUTANTS)("shown red: $name -> $code", ({ code, mutate }) => {
		expect(codes(mutate(clone()))).toEqual([code]);
	});

	test("the mutant codes are exactly UI_SPEC_CODES", () => {
		expect([...new Set(MUTANTS.map((mutant) => mutant.code))].sort()).toEqual([
			...UI_SPEC_CODES,
		]);
	});

	test("UI_SPEC_CODES is frozen and sorted by code unit", () => {
		expect(Object.isFrozen(UI_SPEC_CODES)).toBe(true);
		expect([...UI_SPEC_CODES]).toEqual([...UI_SPEC_CODES].sort());
	});
});

describe("catalog.mjs against a temp git repo", () => {
	test("shown red: one changed byte in UI-SPEC.md fails --check and changes nothing", () => {
		withRepo((repo) => {
			// The unmutated temp repo passes first, so the failure below is the byte.
			const clean = run(repo, ["--check", "--base", "main"]);
			expect(clean.status, clean.stderr).toBe(0);
			expect(clean.stdout).toContain("7 generated files current");
			const file = path.join(repo, UI_SPEC_MD_PATH);
			fs.writeFileSync(file, `${fs.readFileSync(file, "utf8")}x`);
			const before = snapshotDir(repo);
			const result = run(repo, ["--check", "--base", "main"]);
			expect(result.status).toBe(1);
			expect(result.stderr).toContain("CATALOG CHECK FAILED");
			expect(result.stderr).toContain(
				"UI-SPEC.md is stale; run yarn catalog:write",
			);
			assertDirEffect(before, snapshotDir(repo), {});
		});
	});
});
