import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { generatedFiles } from "./catalog.mjs";
import {
	GRID_JSON_PATH,
	GRID_MD_PATH,
	buildGrid,
	cellKey,
	gapRatchet,
	loadGrid,
	loadGridInputs,
	renderGridJson,
	renderGridMarkdown,
	zeroGapProblems,
} from "./grid.mjs";
import type { GridModel } from "./grid.mjs";
import { repoRoot } from "./temp_repo";
import { STATE_CLASSES } from "./vocab.mjs";

type GridDocument = {
	schemaVersion: number;
	counts: GridModel["counts"];
	rows: GridModel["rows"];
};

async function realModel(): Promise<GridModel> {
	const grid = await loadGrid(repoRoot);
	if (grid.model === null) {
		throw new Error(grid.problems.map((found) => found.message).join("; "));
	}
	return grid.model;
}

function asDocument(model: GridModel): GridDocument {
	return JSON.parse(renderGridJson(model)) as GridDocument;
}

function clone<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T;
}

function codes(problems: ReadonlyArray<{ code: string }>): string[] {
	return problems.map((found) => found.code);
}

function rowOf(doc: GridDocument, subject: string): GridModel["rows"][number] {
	const row = doc.rows.find((candidate) => candidate.subject === subject);
	if (row === undefined) throw new Error(`no row ${subject}`);
	return row;
}

describe("the committed coverage grid", () => {
	test("coverage-grid.json and COVERAGE-GRID.md equal a fresh render of the real inputs", async () => {
		const fresh = new Map(await generatedFiles(repoRoot));
		for (const relPath of [GRID_JSON_PATH, GRID_MD_PATH]) {
			expect(fresh.has(relPath), relPath).toBe(true);
			expect(
				fs.readFileSync(path.join(repoRoot, relPath), "utf8"),
				relPath,
			).toBe(fresh.get(relPath));
		}
	});

	test("counts are 21 subjects x 12 states = 252 cells, partitioned, with both Phase 70 seed cells covered", async () => {
		const model = await realModel();
		expect(model.counts.subjects).toBe(21);
		expect(model.counts.states).toBe(12);
		expect(model.counts.cells).toBe(252);
		// Phase 72 grows covered and waived and shrinks gaps; the partition stays whole.
		expect(model.counts.covered + model.counts.waived + model.counts.gaps).toBe(
			252,
		);
		expect(model.counts.covered).toBeGreaterThanOrEqual(2);
		const covered: string[] = [];
		for (const row of model.rows) {
			for (const [stateClass, cell] of Object.entries(row.cells)) {
				if (cell.status === "covered")
					covered.push(cellKey(row.subject, stateClass));
			}
		}
		expect(covered).toContain("LanguageDropdown|happy");
		expect(covered).toContain("LanguageDropdown|intl");
	});

	test("a gap is computed: no cell carries a hand-typed status in waivers.json", () => {
		const waivers = JSON.parse(
			fs.readFileSync(
				path.join(repoRoot, ".storybook/catalog/waivers.json"),
				"utf8",
			),
		) as { waivers: Array<Record<string, unknown>> };
		for (const waiver of waivers.waivers) {
			expect(Object.keys(waiver).sort()).toEqual([
				"basis",
				"reason",
				"ref",
				"stateClass",
				"subject",
			]);
		}
	});
});

describe("buildGrid", () => {
	const subjects = new Map([
		["Zed", "screen"],
		["Beta", "pattern"],
		["Alpha", "pattern"],
		["Dot", "primitive"],
	]);
	const stories = [
		{ id: "a--one", component: "Alpha" },
		{ id: "a--two", component: "Alpha" },
		{ id: "b--one", component: "Beta" },
	];

	test("rows sort by tier order then id, cells follow STATE_CLASSES, scenario lists are sorted", () => {
		const model = buildGrid({
			subjects,
			scenarios: [
				{ id: "alpha.zeta", stateClass: "happy", stories: ["a--one"] },
				{ id: "alpha.beta", stateClass: "happy", stories: ["a--two"] },
			],
			stories,
			waivers: [],
		});
		expect(model.rows.map((row) => row.subject)).toEqual([
			"Dot",
			"Alpha",
			"Beta",
			"Zed",
		]);
		for (const row of model.rows) {
			expect(Object.keys(row.cells)).toEqual([...STATE_CLASSES]);
		}
		expect(rowOf(asDocument(model), "Alpha").cells["happy"]).toEqual({
			status: "covered",
			scenarios: ["alpha.beta", "alpha.zeta"],
		});
	});

	test("a subject with no scenario renders 12 gap cells and a waiver renders waived", () => {
		const model = buildGrid({
			subjects,
			scenarios: [],
			stories,
			waivers: [
				{
					subject: "Dot",
					stateClass: "huge",
					basis: "e2e",
					ref: "tests/e2e/app-launch.spec.ts",
					reason: "a reason long enough to pass the forty character minimum",
				},
			],
		});
		const dot = rowOf(asDocument(model), "Dot");
		expect(dot.cells["huge"]?.status).toBe("waived");
		expect(
			Object.values(rowOf(asDocument(model), "Zed").cells).map(
				(cell) => cell.status,
			),
		).toEqual(Array.from({ length: 12 }, () => "gap"));
		expect(model.counts).toEqual({
			subjects: 4,
			states: 12,
			cells: 48,
			covered: 0,
			waived: 1,
			gaps: 47,
		});
	});

	test("two generations of the same inputs are byte-identical canonical tab JSON with a trailing newline", async () => {
		const inputs = await loadGridInputs(repoRoot);
		const build = () =>
			renderGridJson(
				buildGrid({
					subjects: inputs.subjects,
					scenarios: inputs.scenarios,
					stories: inputs.stories,
					waivers: [],
				}),
			);
		const first = build();
		expect(build()).toBe(first);
		expect(first.endsWith("}\n")).toBe(true);
		expect(first.startsWith('{\n\t"schemaVersion": 1')).toBe(true);
		expect(first).toBe(`${JSON.stringify(JSON.parse(first), null, "\t")}\n`);
	});

	test("the Markdown view names the due phase of each tier and the regenerate command", async () => {
		const text = renderGridMarkdown(await realModel());
		expect(text.split("\n")[0]).toContain("yarn catalog:write");
		const rows = text.split("\n").filter((line) => line.startsWith("| "));
		const due = (tier: string) =>
			rows.filter((line) => line.split(" | ")[1] === tier);
		for (const tier of ["primitive", "pattern"]) {
			expect(due(tier).length, tier).toBeGreaterThan(0);
			for (const line of due(tier))
				expect(line, line).toContain("| Phase 72 |");
		}
		for (const tier of ["area", "screen"]) {
			expect(due(tier).length, tier).toBeGreaterThan(0);
			for (const line of due(tier))
				expect(line, line).toContain("| Phase 73 |");
		}
	});
});

describe("gapRatchet and zeroGapProblems", () => {
	test("shown red: gap added to an existing row (a scenario removed at head)", async () => {
		const base = asDocument(await realModel());
		const head = clone(base);
		const cell = rowOf(head, "LanguageDropdown").cells["happy"];
		if (cell === undefined) throw new Error("no cell");
		rowOf(head, "LanguageDropdown").cells["happy"] = { status: "gap" };
		const result = gapRatchet({ base, head });
		expect(codes(result.problems)).toEqual(["gap-added"]);
		expect(result.problems[0]?.cell).toBe("LanguageDropdown|happy");
	});

	test("shown red: waiver deleted at head leaves a gap that was waived at base", async () => {
		const head = asDocument(await realModel());
		const base = clone(head);
		rowOf(base, "ChevronIcon").cells["huge"] = {
			status: "waived",
			waiver: {
				basis: "e2e",
				ref: "tests/e2e/app-launch.spec.ts",
				reason: "x",
			},
		};
		expect(codes(gapRatchet({ base, head }).problems)).toEqual(["gap-added"]);
	});

	test("shown red: new row with a gap is new-row-gap", async () => {
		const base = asDocument(await realModel());
		const head = clone(base);
		head.rows.push({
			subject: "Brand",
			tier: "pattern",
			cells: Object.fromEntries(
				STATE_CLASSES.map((stateClass) => [
					stateClass,
					stateClass === "happy"
						? { status: "covered" as const, scenarios: ["brand.one"] }
						: { status: "gap" as const },
				]),
			),
		});
		const result = gapRatchet({ base, head });
		expect(codes(result.problems)).toEqual(["new-row-gap"]);
		expect(result.problems[0]?.cell).toBe("Brand");
	});

	test("a removed row and a gap closed at head are fine, and the real grid ratchets against itself", async () => {
		const base = asDocument(await realModel());
		const removed = clone(base);
		removed.rows = removed.rows.filter((row) => row.subject !== "Toast");
		expect(gapRatchet({ base, head: removed }).problems).toEqual([]);
		const closed = clone(base);
		rowOf(closed, "Toast").cells["happy"] = {
			status: "covered",
			scenarios: ["toast.happy"],
		};
		expect(gapRatchet({ base, head: closed }).problems).toEqual([]);
		expect(gapRatchet({ base, head: base }).problems).toEqual([]);
	});

	test("an absent base grid is admitted once as bootstrap, even for a head with gaps", async () => {
		const head = asDocument(await realModel());
		expect(gapRatchet({ base: null, head })).toEqual({
			problems: [],
			notes: ["bootstrap"],
		});
	});

	test("zeroGapProblems of a model without gaps is empty and of the real model with tier screen lists the 12 App cells", async () => {
		const model = await realModel();
		const full = clone(model);
		for (const row of full.rows) {
			for (const stateClass of STATE_CLASSES) {
				row.cells[stateClass] = { status: "covered", scenarios: ["x.y"] };
			}
		}
		expect(zeroGapProblems(full)).toEqual([]);
		const screen = zeroGapProblems(model, ["screen"]);
		expect(screen.map((found) => found.message)).toEqual(
			STATE_CLASSES.map((stateClass) => `gap|App|${stateClass}`),
		);
		expect(codes(screen)).toEqual(Array.from({ length: 12 }, () => "gap"));
		expect(zeroGapProblems(model).length).toBe(model.counts.gaps);
	});
});

describe("generated text byte stability (D-30(k))", () => {
	test("byte stability: every generated file has no carriage return and ends with exactly one newline", async () => {
		const files = await generatedFiles(repoRoot);
		expect(files.length).toBeGreaterThanOrEqual(4);
		for (const [relPath, text] of files) {
			expect(text.includes("\r"), `${relPath} has a carriage return`).toBe(
				false,
			);
			expect(text.endsWith("\n"), `${relPath} lacks a final newline`).toBe(
				true,
			);
			expect(text.endsWith("\n\n"), `${relPath} ends with a blank line`).toBe(
				false,
			);
		}
	});
});
