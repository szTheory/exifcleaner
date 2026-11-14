import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { CHECK_INPUTS } from "./catalog.mjs";
import { repoRoot } from "./temp_repo";
import { STATE_CLASS_DEFS } from "./vocab.mjs";

// D-05 coupling (T-71-17, W-3): `catalog.mjs --check` runs as one step of the
// Storybook workflow, and that workflow starts only for the paths it lists. A
// path-filtered gate is silently skipped by a pull request that touches only a
// file the check reads but the filter does not list. This test makes that gap
// loud: every file the catalog anchors on, and every input the check reads, is
// either matched by the `pull_request` path list or named below with a reason.
//
// Inputs deliberately left outside the filter (veto word `gate-all-inputs` at
// the Phase 71 authority checkpoint records a follow-up that lists them).
export const UNGATED_INPUTS: Readonly<Record<string, string>> = {
	src: "--check reads anchored files inside it, each asserted by the anchor coupling above, and the token map scans src/renderer/** only (D-17 scope), which both the pull_request and the push path lists of storybook.yml cover",
	".resources/translation-glossary.json":
		"read by translation_glossary.test.ts only; a pull request touching only this file skips the Storybook job and the drift surfaces on the next Storybook-triggering pull request",
	"tests/e2e":
		"read for e2e waiver refs and for the e2e test titles the journeys name (journeys.mjs parses them, never runs them); a pull request touching only tests/e2e skips the Storybook job, so a renamed or skipped journey e2e title surfaces on the next Storybook-triggering pull request (P-11 residual); the waiver rule stays: valid only while waivers.json has no waiver with basis e2e, which this file asserts, so the first e2e waiver fails here until tests/e2e/** joins both path lists",
	"scripts/is_main_module.mjs":
		"imported by every catalog CLI; ci.yml runs its behaviour on every pull request through tests/scripts/is_main_module.test.ts and tests/scripts/entry_point_symlink.test.ts",
};

const WORKFLOW = path.join(repoRoot, ".github/workflows/storybook.yml");
const CATALOG_DIR = ".storybook/catalog";

function readJson(relPath: string): any {
	return JSON.parse(fs.readFileSync(path.join(repoRoot, relPath), "utf8"));
}

/** The `paths:` list of the `pull_request` event. */
export function pullRequestPaths(text: string): string[] {
	const lines = text.split("\n");
	const start = lines.indexOf("  pull_request:");
	if (start === -1) return [];
	const paths: string[] = [];
	let inPaths = false;
	for (const line of lines.slice(start + 1)) {
		if (/^ {0,2}\S/.test(line)) break;
		if (line === "    paths:") {
			inPaths = true;
			continue;
		}
		if (inPaths) {
			const match = /^ {6}- "(.+)"$/.exec(line);
			if (match === null || match[1] === undefined) {
				inPaths = false;
				continue;
			}
			paths.push(match[1]);
		}
	}
	return paths;
}

/** Equal, or under an entry that ends `/**`. */
function covered(entries: readonly string[], file: string): boolean {
	return entries.some(
		(entry) =>
			entry === file ||
			(entry.endsWith("/**") && file.startsWith(entry.slice(0, -2))),
	);
}

function pathPart(reference: string): string {
	const hash = reference.indexOf("#");
	return hash === -1 ? reference : reference.slice(0, hash);
}

type Registers = {
	findings: { entries: Array<{ ref: string }> };
	glossary: { terms: Array<{ surfaces: string[] }> };
	catalog: unknown;
	waivers: { waivers: Array<{ basis: string; ref: string }> };
};

/** Every repo path the catalog data anchors on, with where it came from. */
export function anchorPaths(registers: Registers): Map<string, string> {
	const found = new Map<string, string>();
	const note = (file: string, from: string) => {
		if (!found.has(file)) found.set(file, from);
	};
	for (const entry of registers.findings.entries) {
		if (entry.ref.startsWith("src:")) {
			note(pathPart(entry.ref.slice("src:".length)), "copy-findings.json ref");
		}
	}
	for (const term of registers.glossary.terms) {
		for (const surface of term.surfaces) {
			if (surface.startsWith("src:")) {
				note(pathPart(surface.slice("src:".length)), "glossary.json surface");
			}
		}
	}
	const walk = (value: unknown) => {
		if (Array.isArray(value)) {
			value.forEach(walk);
		} else if (typeof value === "object" && value !== null) {
			const source = (value as { source?: { kind?: string; refs?: unknown } })
				.source;
			if (source?.kind === "code" && Array.isArray(source.refs)) {
				for (const ref of source.refs) {
					if (typeof ref === "string") {
						note(
							pathPart(ref.replace(/^src:/, "")),
							"catalog.json code source",
						);
					}
				}
			}
			Object.values(value).forEach(walk);
		}
	};
	walk(registers.catalog);
	for (const waiver of registers.waivers.waivers) {
		if (waiver.basis === "unreachable") {
			note(pathPart(waiver.ref), "waivers.json ref");
		}
	}
	for (const [stateClass, definition] of Object.entries(STATE_CLASS_DEFS)) {
		for (const anchor of definition.anchors) {
			note(pathPart(anchor), `STATE_CLASS_DEFS ${stateClass} anchor`);
		}
	}
	return found;
}

/**
 * Relative imports of the catalog modules that resolve outside `.storybook/`,
 * as repo-relative paths.
 */
export function sharedImports(): string[] {
	const found = new Set<string>();
	const dir = path.join(repoRoot, CATALOG_DIR);
	for (const name of fs.readdirSync(dir).filter((f) => f.endsWith(".mjs"))) {
		const text = fs.readFileSync(path.join(dir, name), "utf8");
		for (const match of text.matchAll(
			/\b(?:from|import)\s+"(\.{1,2}\/[^"]+)"/g,
		)) {
			const resolved = path
				.relative(repoRoot, path.resolve(dir, match[1] ?? ""))
				.split(path.sep)
				.join("/");
			if (!resolved.startsWith(".storybook/")) found.add(resolved);
		}
	}
	return [...found].sort();
}

export function couplingProblems(input: {
	pullRequest: readonly string[];
	anchors: ReadonlyMap<string, string>;
	checkInputs: readonly string[];
	shared: readonly string[];
	ungated: Readonly<Record<string, string>>;
	e2eWaivers: number;
}): string[] {
	const problems: string[] = [];
	for (const [file, from] of input.anchors) {
		if (!covered(input.pullRequest, file)) {
			problems.push(
				`anchor ${file} (${from}) is outside the pull_request paths`,
			);
		}
	}
	const inputs = [...new Set([...input.checkInputs, ...input.shared])];
	for (const entry of inputs) {
		if (!covered(input.pullRequest, entry) && !(entry in input.ungated)) {
			problems.push(
				`input ${entry} is outside the pull_request paths and not in UNGATED_INPUTS`,
			);
		}
	}
	for (const key of Object.keys(input.ungated)) {
		if (!inputs.includes(key)) {
			problems.push(
				`UNGATED_INPUTS key ${key} is not a check input or shared import`,
			);
		} else if (covered(input.pullRequest, key)) {
			problems.push(
				`UNGATED_INPUTS key ${key} is already covered by a path entry`,
			);
		}
	}
	if (input.e2eWaivers > 0 && "tests/e2e" in input.ungated) {
		problems.push(
			"an e2e waiver exists while tests/e2e is exempt: add tests/e2e/** to both path lists and drop the exemption",
		);
	}
	return problems;
}

function realInput() {
	const waivers = readJson(`${CATALOG_DIR}/waivers.json`);
	return {
		registers: {
			findings: readJson(`${CATALOG_DIR}/copy-findings.json`),
			glossary: readJson(`${CATALOG_DIR}/glossary.json`),
			catalog: readJson(`${CATALOG_DIR}/catalog.json`),
			waivers,
		} as Registers,
		pullRequest: pullRequestPaths(fs.readFileSync(WORKFLOW, "utf8")),
		checkInputs: [...CHECK_INPUTS],
		shared: sharedImports(),
		ungated: UNGATED_INPUTS,
		e2eWaivers: (waivers.waivers as Array<{ basis: string }>).filter(
			(waiver) => waiver.basis === "e2e",
		).length,
	};
}

function realProblems(): string[] {
	const input = realInput();
	return couplingProblems({
		...input,
		anchors: anchorPaths(input.registers),
	});
}

describe("path-filter coupling for catalog anchors and inputs (D-05)", () => {
	test("every anchor and every check input is covered or named in UNGATED_INPUTS", () => {
		expect(realProblems()).toEqual([]);
	});

	test("the coupling reads real data (anti-vacuity)", () => {
		const input = realInput();
		expect(input.pullRequest.length).toBeGreaterThanOrEqual(20);
		const anchors = anchorPaths(input.registers);
		expect(anchors.size).toBeGreaterThanOrEqual(15);
		for (const expected of [
			"src/main/reveal_handlers.ts",
			"src/main/exif_handlers.ts",
			"src/application/queries/verify_generated_output_query.ts",
			"src/domain/exif/exif_errors.ts",
		]) {
			expect(anchors.has(expected), expected).toBe(true);
		}
		expect(input.shared).toEqual(["scripts/is_main_module.mjs"]);
		expect(input.checkInputs).toContain("brand.pin.json");
	});

	test("shown red: a cloned register naming src/main/other.ts is reported", () => {
		const input = realInput();
		const findings = structuredClone(input.registers.findings);
		findings.entries.push({ ref: "src:src/main/other.ts" });
		const problems = couplingProblems({
			...input,
			anchors: anchorPaths({ ...input.registers, findings }),
		});
		expect(problems).toEqual([
			"anchor src/main/other.ts (copy-findings.json ref) is outside the pull_request paths",
		]);
	});

	test("shown red: ungated input (a cloned CHECK_INPUTS with an extra docs/other.json is reported)", () => {
		const input = realInput();
		const problems = couplingProblems({
			...input,
			anchors: anchorPaths(input.registers),
			checkInputs: [...input.checkInputs, "docs/other.json"],
		});
		expect(problems).toEqual([
			"input docs/other.json is outside the pull_request paths and not in UNGATED_INPUTS",
		]);
	});

	test("shown red: an uncovered shared import is reported", () => {
		const input = realInput();
		const problems = couplingProblems({
			...input,
			anchors: anchorPaths(input.registers),
			shared: [...input.shared, "scripts/other_shared.mjs"],
		});
		expect(problems).toEqual([
			"input scripts/other_shared.mjs is outside the pull_request paths and not in UNGATED_INPUTS",
		]);
	});

	test("shown red: stale ungated entry (a key that a path entry already covers, and a key that is no input)", () => {
		const input = realInput();
		const covered = couplingProblems({
			...input,
			anchors: anchorPaths(input.registers),
			ungated: { ...UNGATED_INPUTS, "brand.pin.json": "now listed" },
		});
		expect(covered).toEqual([
			"UNGATED_INPUTS key brand.pin.json is already covered by a path entry",
		]);
		const unknown = couplingProblems({
			...input,
			anchors: anchorPaths(input.registers),
			ungated: { ...UNGATED_INPUTS, "docs/gone.json": "left behind" },
		});
		expect(unknown).toEqual([
			"UNGATED_INPUTS key docs/gone.json is not a check input or shared import",
		]);
	});

	test("shown red: e2e waiver without tests/e2e path (a cloned waivers document with one e2e waiver)", () => {
		const input = realInput();
		const waivers = {
			waivers: [{ basis: "e2e", ref: "tests/e2e/app-launch.spec.ts" }],
		};
		const problems = couplingProblems({
			...input,
			anchors: anchorPaths({ ...input.registers, waivers }),
			e2eWaivers: waivers.waivers.length,
		});
		expect(problems).toEqual([
			"an e2e waiver exists while tests/e2e is exempt: add tests/e2e/** to both path lists and drop the exemption",
		]);
	});

	test("the real waivers.json has no e2e waiver while tests/e2e is exempt", () => {
		expect(realInput().e2eWaivers).toBe(0);
		expect("tests/e2e" in UNGATED_INPUTS).toBe(true);
	});

	test("a path entry matches by equality or a /** prefix, never a substring", () => {
		expect(covered(["src/renderer/**"], "src/renderer/App.tsx")).toBe(true);
		expect(
			covered(["src/main/exif_handlers.ts"], "src/main/exif_handlers.ts"),
		).toBe(true);
		expect(
			covered(["src/main/exif_handlers.ts"], "src/main/exif_handlers.tsx"),
		).toBe(false);
		expect(covered(["src/renderer/**"], "src/renderer-other/App.tsx")).toBe(
			false,
		);
	});
});
