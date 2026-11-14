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
	type UiSpecAppSource,
	type UiSpecCell,
	type UiSpecContext,
	type UiSpecDocument,
	type UiSpecSources,
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

// The ids 74-03's token-map targets and v5.1 depend on. A rename or a deletion
// is a spec change, so the list is explicit rather than derived: the validator
// proves the shape, this list proves the content exists (SPEC-01, 74-02).
const REQUIRED_IDS: string[] = [
	"type.family.sans",
	"type.family.mono",
	"type.family.mono-bundled",
	"type.caption.size",
	"type.caption.line-height",
	"type.small.size",
	"type.small.line-height",
	"type.body.size",
	"type.body.line-height",
	"type.title.size",
	"type.title.line-height",
	"type.label.size",
	"type.label.line-height",
	"type.label.weight",
	"type.label.case",
	"type.label.tracking",
	"type.label.letter-spacing",
	"type.label.lang-scope",
	"type.data.size",
	"type.data.line-height",
	"type.data.weight",
	"type.data.weight-emphasis",
	"type.data.numerals",
	"type.data.column-unit",
	"type.weight.regular",
	"type.weight.semibold",
	"type.not-adopted",
	"radii.button",
	"radii.card",
	"radii.badge",
	"radii.segmented-container",
	"radii.segment",
	"radii.menu",
	"radii.icon-button",
	"radii.toggle-track",
	"radii.toggle-thumb",
	"radii.table-row",
	"radii.stray",
	"spacing.base",
	"spacing.space-1",
	"spacing.space-2",
	"spacing.space-3",
	"spacing.space-4",
	"spacing.space-6",
	"spacing.space-8",
	"spacing.space-12",
	"spacing.legacy-names",
	"spacing.target-min",
	"spacing.control-primary-min",
	"spacing.row-min",
	"spacing.text-container",
	"focus.ring.width",
	"focus.ring.style",
	"focus.ring.colour",
	"focus.ring.trigger",
	"focus.ring.offset-free",
	"focus.ring.offset-inset",
	"focus.ring.never-box-shadow",
	"focus.accent-boundary",
	"focus.dark-raised",
	"focus.reveal-button",
	"motion.reveal.duration",
	"motion.reveal.ease",
	"motion.reveal.bounce",
	"motion.settle.behaviour",
	"motion.settle.rise",
	"motion.settle.duration",
	"motion.stagger",
	"motion.state-feedback.duration",
	"motion.toggle.duration",
	"motion.drawer.duration",
	"motion.ease",
	"motion.ease-spring",
	"motion.counts",
	"motion.progress",
	"motion.reduced-motion",
	"motion.v5-2-dispositions",
];

describe("the real ui-spec content (74-02)", () => {
	const everyValue = valuesOf(real);
	const byId = new Map(everyValue.map((value) => [value.id, value]));
	const need = (id: string): UiSpecValue => {
		const found = byId.get(id);
		if (found === undefined) throw new Error(`missing required id ${id}`);
		return found;
	};

	test("every required id exists", () => {
		expect(REQUIRED_IDS.filter((id) => !byId.has(id))).toEqual([]);
	});

	test("the required list has no duplicate", () => {
		expect(new Set(REQUIRED_IDS).size).toBe(REQUIRED_IDS.length);
	});

	test("Label tracking is the brand's +6% and its CSS form is an app starting point", () => {
		const tracking = need("type.label.tracking");
		expect(tracking.value).toBe("+6%");
		expect(tracking.brand).toBeDefined();
		const css = need("type.label.letter-spacing");
		expect(css.app?.basis).toBe("brand-starting-point");
	});

	test("the brand-derived shapes, weights, counts and reveal cite BRAND.md", () => {
		for (const id of [
			"radii.button",
			"radii.card",
			"radii.badge",
			"type.label.weight",
			"type.data.weight",
			"motion.reveal.duration",
			"motion.counts",
		]) {
			expect(need(id).brand, id).toBeDefined();
		}
	});

	test("every app decision in type, radii, spacing, focus and motion says why", () => {
		for (const value of [
			...real.type,
			...real.radii,
			...real.spacing,
			...real.focus,
			...real.motion,
		]) {
			if (value.app === undefined) continue;
			expect(value.app.reason.length, value.id).toBeGreaterThanOrEqual(30);
		}
	});
});

// Helpers for the mutants. Each mutant starts from a fresh clone of the real
// document and breaks exactly one rule.
function sourceOf<K extends "tokens" | "brand" | "app">(
	entry: UiSpecSources,
	key: K,
): NonNullable<UiSpecSources[K]> {
	const found = entry[key];
	if (found === undefined) throw new Error(`no ${key} source`);
	return found as NonNullable<UiSpecSources[K]>;
}

function cellKey(cell: UiSpecCell): string {
	return `${cell.component}|${cell.state}|${cell.theme}`;
}

function sortCells(doc: UiSpecDocument): UiSpecDocument {
	doc.states.cells.sort((a, b) => {
		const left = cellKey(a);
		const right = cellKey(b);
		return left < right ? -1 : left > right ? 1 : 0;
	});
	return doc;
}

function cellAt(doc: UiSpecDocument, state: string, theme: string): UiSpecCell {
	const found = doc.states.cells.find(
		(cell) => cell.state === state && cell.theme === theme,
	);
	if (found === undefined) throw new Error(`no ${state}/${theme} cell`);
	return found;
}

// An extra value cell that breaks one field, put back in sorted position so the
// only defect is the field.
function withExtraCell(
	doc: UiSpecDocument,
	change: Partial<UiSpecCell>,
): UiSpecDocument {
	doc.states.cells.push({
		...structuredClone(cellAt(doc, "hover", "light")),
		...change,
	});
	return sortCells(doc);
}

// A second component with a full set of ten cells, so the matrix stays complete.
function withComponent(doc: UiSpecDocument, name: string): UiSpecDocument {
	const copies = doc.states.cells.map((cell) => ({
		...structuredClone(cell),
		component: name,
	}));
	doc.states.cells.push(...copies);
	doc.states.components.push(name);
	return sortCells(doc);
}

function renameComponent(doc: UiSpecDocument, name: string): UiSpecDocument {
	doc.states.components = [name];
	for (const cell of doc.states.cells) cell.component = name;
	return sortCells(doc);
}

interface Mutant {
	name: string;
	code: string;
	mutate: (doc: UiSpecDocument) => unknown;
}

const MUTANTS: Mutant[] = [
	// Top level and structure.
	{ name: "a non-object document", code: "not-object", mutate: () => [] },
	{
		name: "a section value that is not an object",
		code: "not-object",
		mutate: (doc) => {
			doc.type.push(5 as unknown as UiSpecValue);
			return doc;
		},
	},
	{
		name: "a states cell that is not an object",
		code: "not-object",
		mutate: (doc) => {
			doc.states.cells.push(5 as unknown as UiSpecCell);
			return doc;
		},
	},
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
		name: "an extra key on a value",
		code: "unknown-field",
		mutate: (doc) => ({ ...doc, type: [{ ...at(doc.type, 0), extra: 1 }] }),
	},
	{
		name: "an extra key on the states section",
		code: "unknown-field",
		mutate: (doc) => ({ ...doc, states: { ...doc.states, extra: 1 } }),
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
		name: "a value without an id",
		code: "missing-field",
		mutate: (doc) => {
			const value: Partial<UiSpecValue> = at(doc.type, 0);
			delete value.id;
			return doc;
		},
	},
	{
		name: "a section that is an object, not an array",
		code: "bad-type",
		mutate: (doc) => ({ ...doc, radii: {} }),
	},
	{
		name: "states components that is a string, not an array",
		code: "bad-type",
		mutate: (doc) => ({
			...doc,
			states: { ...doc.states, components: "primary-button" },
		}),
	},
	{
		name: "a states cell whose component is a number",
		code: "bad-type",
		mutate: (doc) => {
			doc.states.cells.push({
				...structuredClone(cellAt(doc, "hover", "light")),
				component: 5 as unknown as string,
			});
			return doc;
		},
	},
	{
		name: "a section emptied to []",
		code: "empty-section",
		mutate: (doc) => ({ ...doc, focus: [] }),
	},
	{
		name: "states with no components and no cells",
		code: "empty-section",
		mutate: (doc) => ({ ...doc, states: { components: [], cells: [] } }),
	},
	{
		name: "a brandPin that is not the brand.pin.json commit",
		code: "pin-mismatch",
		mutate: (doc) => ({ ...doc, brandPin: "0".repeat(40) }),
	},

	// Ids and order.
	{
		name: "an id with a capital",
		code: "bad-id",
		mutate: (doc) => {
			at(doc.type, 0).id = "type.Label.weight";
			return doc;
		},
	},
	{
		name: "an id with another section's prefix",
		code: "bad-id",
		mutate: (doc) => {
			at(doc.radii, 0).id = "type.button";
			return doc;
		},
	},
	{
		name: "a component name that is not a kebab slug",
		code: "bad-id",
		mutate: (doc) => renameComponent(doc, "Primary Button"),
	},
	{
		name: "a value copied with the same id",
		code: "duplicate-id",
		mutate: (doc) => {
			doc.spacing.splice(1, 0, structuredClone(at(doc.spacing, 0)));
			return doc;
		},
	},
	{
		name: "a component listed twice",
		code: "duplicate-id",
		mutate: (doc) => {
			doc.states.components.push("primary-button");
			return doc;
		},
	},
	{
		name: "two values out of id order",
		code: "unsorted",
		mutate: (doc) => {
			doc.type.push({ ...structuredClone(at(doc.type, 0)), id: "type.a" });
			return doc;
		},
	},
	{
		name: "two states cells swapped",
		code: "unsorted",
		mutate: (doc) => {
			const first = at(doc.states.cells, 0);
			doc.states.cells[0] = at(doc.states.cells, 1);
			doc.states.cells[1] = first;
			return doc;
		},
	},
	{
		name: "two components out of order",
		code: "unsorted",
		mutate: (doc) => withComponent(doc, "a-button"),
	},

	// Sources.
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
	{
		name: "a states cell with a value and no source",
		code: "source-count",
		mutate: (doc) => {
			delete cellAt(doc, "hover", "light").app;
			return doc;
		},
	},
	{
		name: "an app basis outside the closed four",
		code: "bad-basis",
		mutate: (doc) => {
			sourceOf(at(doc.spacing, 0), "app").basis = "guess";
			return doc;
		},
	},
	{
		name: "an empty brand quote",
		code: "bad-source",
		mutate: (doc) => {
			sourceOf(at(doc.type, 0), "brand").quote = "";
			return doc;
		},
	},
	{
		name: "an app source without its reason",
		code: "bad-source",
		mutate: (doc) => {
			const app: Partial<UiSpecAppSource> = sourceOf(at(doc.spacing, 0), "app");
			delete app.reason;
			return doc;
		},
	},
	{
		name: "a tokens source with an extra key",
		code: "bad-source",
		mutate: (doc) => {
			Object.assign(sourceOf(at(doc.darkRinse, 0), "tokens"), { extra: 1 });
			return doc;
		},
	},
	{
		name: "a source that is not an object",
		code: "bad-source",
		mutate: (doc) => {
			at(doc.spacing, 0).app = "guess" as unknown as UiSpecAppSource;
			return doc;
		},
	},

	// Values.
	{
		name: "an empty value",
		code: "empty-value",
		mutate: (doc) => {
			at(doc.spacing, 0).value = "";
			return doc;
		},
	},
	{
		name: "the value TBD",
		code: "placeholder-value",
		mutate: (doc) => {
			at(doc.spacing, 0).value = "TBD";
			return doc;
		},
	},
	{
		name: "a value with the word TODO in it",
		code: "placeholder-value",
		mutate: (doc) => {
			at(doc.spacing, 0).value = "4px, todo";
			return doc;
		},
	},
	{
		name: "a brand value whose text is not in its quote",
		code: "quote-missing-value",
		mutate: (doc) => {
			at(doc.radii, 0).value = "9 px";
			return doc;
		},
	},
	{
		name: "a tokens path that is not a colour",
		code: "tokens-not-colour",
		mutate: (doc) => {
			sourceOf(at(doc.darkRinse, 0), "tokens").path = "font.mono";
			return doc;
		},
	},
	{
		name: "a tokens value that is not an uppercase #RRGGBB",
		code: "tokens-not-colour",
		mutate: (doc) => {
			const value = at(doc.darkRinse, 0);
			value.value = "#12403c";
			sourceOf(value, "tokens").value = "#12403c";
			return doc;
		},
	},
	{
		name: "a tokens value that differs from the value",
		code: "tokens-value-mismatch",
		mutate: (doc) => {
			sourceOf(at(doc.darkRinse, 0), "tokens").value = "#000000";
			return doc;
		},
	},

	// The states matrix.
	{
		name: "a cell removed from the matrix",
		code: "missing-cell",
		mutate: (doc) => {
			doc.states.cells.pop();
			return doc;
		},
	},
	{
		name: "a cell duplicated",
		code: "duplicate-cell",
		mutate: (doc) => {
			doc.states.cells.splice(1, 0, structuredClone(at(doc.states.cells, 0)));
			return doc;
		},
	},
	{
		name: "a cell with both a value and na",
		code: "bad-cell",
		mutate: (doc) => {
			cellAt(doc, "hover", "light").na = "also not applicable";
			return doc;
		},
	},
	{
		name: "a cell with an empty na reason",
		code: "bad-cell",
		mutate: (doc) => {
			cellAt(doc, "selected", "light").na = "";
			return doc;
		},
	},
	{
		name: "a cell with neither a value nor na",
		code: "bad-cell",
		mutate: (doc) => {
			delete cellAt(doc, "selected", "light").na;
			return doc;
		},
	},
	{
		name: "an extra cell with the state focus",
		code: "bad-state",
		mutate: (doc) => withExtraCell(doc, { state: "focus" }),
	},
	{
		name: "an extra cell with the theme hc",
		code: "bad-theme",
		mutate: (doc) => withExtraCell(doc, { theme: "hc" }),
	},
	{
		name: "an extra cell for a component that is not listed",
		code: "unknown-component",
		mutate: (doc) => withExtraCell(doc, { component: "ghost-button" }),
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

	test("UI_SPEC_CODES is 24 frozen codes sorted by code unit", () => {
		expect(UI_SPEC_CODES).toHaveLength(24);
		expect(Object.isFrozen(UI_SPEC_CODES)).toBe(true);
		expect([...UI_SPEC_CODES]).toEqual([...UI_SPEC_CODES].sort());
	});
});

describe("catalog.mjs against a temp git repo", () => {
	test("the default check passes in a temp repo that has no .brand-cache", () => {
		withRepo((repo) => {
			// makeCatalogRepo copies CHECK_INPUTS only, so a pass here proves the
			// default check reads no brand cache (D-18).
			expect(fs.existsSync(path.join(repo, ".brand-cache"))).toBe(false);
			const result = run(repo, ["--check", "--base", "main"]);
			expect(result.status, result.stderr).toBe(0);
			expect(result.stdout).toContain("CATALOG CHECK PASSED");
			expect(result.stdout).toContain("7 generated files current");
		});
	});

	test("shown red: one changed byte in UI-SPEC.md fails --check and changes nothing", () => {
		withRepo((repo) => {
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

	test("shown red: a brandPin that is not the brand.pin.json commit fails --check with pin-mismatch and changes nothing", () => {
		withRepo((repo) => {
			const file = path.join(repo, UI_SPEC_PATH);
			const original = fs.readFileSync(file, "utf8");
			fs.writeFileSync(
				file,
				original.replace(
					/"brandPin": "[0-9a-f]{40}"/,
					`"brandPin": "${"0".repeat(40)}"`,
				),
			);
			// Anti-vacuity: the planted edit changed the temp file.
			expect(fs.readFileSync(file, "utf8")).not.toBe(original);
			const before = snapshotDir(repo);
			const result = run(repo, ["--check", "--base", "main"]);
			expect(result.status).toBe(1);
			expect(result.stderr).toContain("CATALOG CHECK FAILED");
			expect(result.stderr).toContain("pin-mismatch");
			assertDirEffect(before, snapshotDir(repo), {});
		});
	});
});
